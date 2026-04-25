"""SQLite engine, session factory, and schema bootstrap.

Single source of truth for the app's persistent state. Location:
    code/.house/house.db

Usage:
    from data import get_session, init_db

    init_db()                       # idempotent; creates tables if missing
    with get_session() as s:
        s.add(SomeModel(...))
        s.commit()
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.schema import CreateColumn

log = logging.getLogger(__name__)


# ── Paths ───────────────────────────────────────────────────────────────
# data/db.py → data/ → core/ → code/
CODE_DIR = Path(__file__).resolve().parents[2]
HOUSE_DIR = CODE_DIR / ".house"
DB_PATH = HOUSE_DIR / "house.db"


# ── SQLAlchemy base ─────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Shared declarative base. All model classes inherit from this.
    Tables are declared in sibling modules (to be added)."""
    pass


# ── Engine + session factory ────────────────────────────────────────────
# Honour DATABASE_URL if present (tests, prod) — otherwise fall back to the
# sqlite file used by dev/TUI. The default sqlite directory is created on
# demand; for custom URLs we assume the caller handles provisioning.
_url = os.getenv("DATABASE_URL")
if _url:
    engine: Engine = create_engine(
        _url,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False} if _url.startswith("sqlite") else {},
    )
else:
    HOUSE_DIR.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
    )

# Enforce FK constraints (SQLite default: off) and enable WAL for concurrent
# readers (TUI polling + CLI writing at once).
@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


# ── Public helpers ──────────────────────────────────────────────────────
def _add_missing_columns() -> list[str]:
    """For every existing table, ALTER TABLE ADD COLUMN any model column that
    isn't on disk. Returns list of ``table.column`` strings that were added.

    SQLite-only (no-op on other backends — we'd use Alembic for real). Safe
    for the hackathon: data is preserved, schema catches up.
    """
    added: list[str] = []
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in live_tables:
                continue
            live_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in live_cols:
                    continue
                # Render `<name> <TYPE> [constraints]` the way SQLAlchemy would
                # for a CREATE TABLE and splice into ALTER TABLE ADD COLUMN.
                column_ddl = str(CreateColumn(col).compile(dialect=engine.dialect))
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {column_ddl}'))
                added.append(f"{table.name}.{col.name}")
    return added


def _recreate_all() -> None:
    """Last resort: drop every table and re-create from the models.

    Only used when ``_add_missing_columns`` can't heal the mismatch (e.g. a
    column's type changed or something was renamed). Loses DB data, but
    sandbox users + house are re-seeded from disk on next boot.
    """
    from . import models  # noqa: F401
    log.warning("recreating all tables — existing data will be dropped")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def _schema_matches() -> bool:
    """True if every model column is present on disk (names only, not types)."""
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in live_tables:
            return False
        live_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name not in live_cols:
                return False
    return True


def init_db() -> None:
    """Create tables + self-heal additive schema changes. Idempotent.

    Order of operations:
      1. create_all    — no-op on existing tables, builds new ones
      2. ALTER ADD     — backfill any newly-added model columns
      3. drop+recreate — last resort if schema still mismatches
    """
    from . import models  # noqa: F401
    Base.metadata.create_all(engine)
    try:
        added = _add_missing_columns()
        if added:
            log.info("auto-migrated columns: %s", ", ".join(added))
    except Exception as e:
        log.warning("auto-migrate failed (%s) — recreating schema", e)
        _recreate_all()
        return
    if not _schema_matches():
        _recreate_all()


@contextmanager
def get_session() -> Iterator[Session]:
    """Context-managed session with auto-rollback on exceptions."""
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
