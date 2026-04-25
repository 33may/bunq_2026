"""FastAPI entry point — mounts routers, CORS, and seeds the dev user/house.

Run via:
    cd code && uvicorn core.api.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..config import settings
from ..data import SessionLocal, init_db
from ..data.models import House, HouseMember, Split, User
from ..services.splits import create_split
from . import auth as auth_mod
from . import bunq_me as bunq_me_mod
from . import chats as chats_mod
from . import house as house_mod
from . import regulars as regulars_mod
from . import scans as scans_mod
from . import settle as settle_mod
from . import splits as splits_mod
from . import transcribe as transcribe_mod
from . import posts as posts_mod
from . import profile as profile_mod
from . import ai as ai_mod
from . import notifications as notifications_mod
from ..services import regulars as regulars_svc

log = logging.getLogger(__name__)

# Make sure the ai-agent logger surfaces alongside uvicorn output.
# Uvicorn configures its own loggers but `bunq.ai` doesn't propagate to a
# uvicorn handler by default — give it an explicit stream handler so
# DEBUG/INFO calls land on stderr regardless of how the server is started.
_ai_log = logging.getLogger("bunq.ai")
if not _ai_log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%H:%M:%S",
    ))
    _ai_log.addHandler(_h)
_ai_log.setLevel(logging.DEBUG)
_ai_log.propagate = False

# Deterministic colors so avatars stay consistent across sessions.
LABEL_COLORS = {
    "anton": "#00D26A",
    "alex":  "#6CB8FF",
    "lena":  "#FFD66B",
    "marco": "#FF7A8A",
}
_DEFAULT_COLOR = "#B8F04A"

SECRETS_DIR = Path(__file__).resolve().parents[2] / ".secrets"


def _extract_sandbox_person(sandbox_json: dict) -> tuple[int, str | None]:
    """Pull (UserPerson.id, first EMAIL alias) out of a sandbox-*.json payload."""
    wrapper = sandbox_json["Response"][0]["ApiKey"]["user"]
    person = wrapper.get("UserPerson") or wrapper.get("UserCompany") or {}
    user_id = person["id"]
    email = None
    for a in person.get("alias", []):
        if a.get("type") == "EMAIL":
            email = a.get("value")
            break
    return user_id, email


def _seed_bunq_users() -> None:
    """Upsert one User per `sandbox-<label>.json` on disk; put them all in one house.

    Idempotent: reruns only fill in missing fields or create missing memberships.
    No sandbox JSONs? Log a warning and leave the DB empty — the /users endpoint
    will return [] and the frontend Landing screen will surface that.
    """
    init_db()
    sandbox_files = sorted(SECRETS_DIR.glob("sandbox-*.json"))
    if not sandbox_files:
        log.warning("no sandbox-*.json files in %s — skipping seed", SECRETS_DIR)
        return

    db = SessionLocal()
    try:
        house = db.query(House).first()
        if house is None:
            house = House(
                name="De Regent 242",
                address="De Regent 242",
                city="Eindhoven",
                country="NL",
            )
            db.add(house)
            db.flush()
        else:
            # Force-rename existing rows so the demo always shows the
            # canonical name; backfill address fields for older seeds.
            house.name = "De Regent 242"
            house.address = "De Regent 242"
            house.city = "Eindhoven"
            house.country = "NL"

        for path in sandbox_files:
            label = path.stem[len("sandbox-"):]
            try:
                data = json.loads(path.read_text())
                bunq_user_id, email = _extract_sandbox_person(data)
            except Exception as e:
                log.warning("skip %s: %s", path.name, e)
                continue

            user = db.query(User).filter_by(bunq_label=label).first()
            if user is None:
                user = User(
                    name=label,
                    color=LABEL_COLORS.get(label, _DEFAULT_COLOR),
                    bunq_label=label,
                    bunq_user_id=bunq_user_id,
                    email=email,
                )
                db.add(user)
                db.flush()
            else:
                # Backfill cached bunq fields if the JSON was updated.
                user.bunq_user_id = bunq_user_id
                if email:
                    user.email = email

            membership = (
                db.query(HouseMember)
                .filter_by(house_id=house.id, user_id=user.id)
                .first()
            )
            if membership is None:
                db.add(HouseMember(house_id=house.id, user_id=user.id))

        db.commit()
    finally:
        db.close()


def _seed_demo_splits() -> None:
    """Seed a few cross-user splits so the home Requests section has live
    data on a fresh DB. Idempotent: only fires when zero splits exist.

    These fire REAL bunq request-inquiries (one per debtor per split — 9
    total) so accepting in the UI moves real sandbox money. Adds ~3-5s to
    first startup; subsequent starts are instant.
    """
    db = SessionLocal()
    try:
        if db.query(Split).first() is not None:
            return
        house = db.query(House).first()
        if house is None:
            return

        users = {u.bunq_label: u for u in db.query(User).all() if u.bunq_label}
        # Need all 4 sandbox users to make the demo splits
        if not all(label in users for label in ("anton", "alex", "lena", "marco")):
            log.info("demo splits skipped — not all 4 sandbox users present")
            return

        from decimal import Decimal

        demo = [
            {
                "payer": "anton", "title": "pizza night",
                "note": "four seasons · split 3 ways",
                "total": Decimal("36.00"),
                "shares": {"lena": "12.00", "alex": "12.00", "marco": "12.00"},
            },
            {
                "payer": "lena", "title": "cleaning supplies",
                "note": "dm, mop + spray",
                "total": Decimal("24.00"),
                "shares": {"anton": "8.00", "alex": "8.00", "marco": "8.00"},
            },
            {
                "payer": "alex", "title": "weekly groceries",
                "note": "albert heijn, tue eve",
                "total": Decimal("52.10"),
                "shares": {"anton": "17.37", "lena": "17.37", "marco": "17.36"},
            },
        ]
        for s in demo:
            payer = users[s["payer"]]
            participants = [users[lbl] for lbl in s["shares"]]
            shares = {users[lbl].id: Decimal(amt) for lbl, amt in s["shares"].items()}
            create_split(
                db,
                house_id=house.id,
                payer=payer,
                participants=participants,
                total=s["total"],
                title=s["title"],
                description=s["note"],
                shares=shares,
            )
        log.info("seeded %d demo splits (real bunq inquiries fired)", len(demo))
    finally:
        db.close()


def _seed_regulars() -> None:
    """Insert the canonical 6 household regulars (rent, gas, water,
    electricity, internet, netflix) into the first house if it has none.
    Idempotent."""
    db = SessionLocal()
    try:
        house = db.query(House).first()
        if house is None:
            return
        n = regulars_svc.seed_defaults(db, house=house)
        if n:
            log.info("seeded %d regulars", n)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _seed_bunq_users()
    _seed_demo_splits()
    _seed_regulars()
    yield


app = FastAPI(title="bunq flatmate api", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_mod.router)
app.include_router(house_mod.router)
app.include_router(bunq_me_mod.router)
app.include_router(splits_mod.router)
app.include_router(scans_mod.router)
app.include_router(scans_mod.hm_router)
app.include_router(transcribe_mod.router)
app.include_router(posts_mod.router)
app.include_router(profile_mod.router)
app.include_router(ai_mod.router)
app.include_router(chats_mod.router)
app.include_router(settle_mod.router)
app.include_router(regulars_mod.router)
app.include_router(notifications_mod.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"ok": True}
