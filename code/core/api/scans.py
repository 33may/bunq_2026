"""Scan endpoints — upload → parse → review → finalize."""
from __future__ import annotations

import asyncio
import io
import logging
from datetime import date as date_t
from decimal import Decimal

from PIL import Image, ImageOps

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..data import SessionLocal
from ..data.models import (
    House,
    HouseMember,
    Scan,
    ScanLineItem,
    ScanStatus,
    User,
)
from ..services.ai_assigner import assign_line_items
from ..services.finalize import FinalizeError, finalize_scan
from ..services.receipt_parser import parse_receipt_image
from ..services.storage import get_storage
from .deps import current_house, current_user, get_db
from pydantic import BaseModel

from .schemas import (
    AiAssignIn,
    AiAssignOut,
    AssignmentsIn,
    HousemateOut,
    LineItemPatch,
    ScanOut,
    ScanLineItemOut,
    ScanPatch,
    SplitOut,
)


class FinalizeIn(BaseModel):
    parent_post_id: str | None = None
from .splits import split_to_out

log = logging.getLogger(__name__)

router = APIRouter(prefix="/scans", tags=["scans"])


# ── helpers ─────────────────────────────────────────────────────────────
def _to_out(scan: Scan) -> ScanOut:
    return ScanOut(
        id=scan.id,
        status=scan.status.value,
        image_url=scan.image_url,
        merchant=scan.merchant,
        merchant_suggested=scan.merchant_suggested,
        description=scan.description,
        description_suggested=scan.description_suggested,
        receipt_date=scan.receipt_date,
        location=scan.location,
        total=scan.total,
        currency=scan.currency,
        error=scan.error,
        split_id=scan.split_id,
        created_at=scan.created_at,
        updated_at=scan.updated_at,
        finalized_at=scan.finalized_at,
        line_items=[
            ScanLineItemOut(
                id=li.id, position=li.position, name=li.name,
                price=li.price, quantity=li.quantity, assigned_to=li.assigned_to,
            )
            for li in scan.line_items
        ],
    )


def _get_scan(db: Session, scan_id: str, user: User) -> Scan:
    scan = db.query(Scan).filter_by(id=scan_id, user_id=user.id).first()
    if scan is None:
        raise HTTPException(404, f"scan {scan_id} not found")
    return scan


# ── background processing ──────────────────────────────────────────────
async def _process_scan(scan_id: str) -> None:
    """Background task: invoke the agent on the saved image, persist results.

    Runs in its own DB session — request-scoped sessions are closed by the
    time this fires.
    """
    db = SessionLocal()
    try:
        scan = db.query(Scan).filter_by(id=scan_id).first()
        if scan is None:
            log.warning("scan %s vanished before processing", scan_id)
            return
        scan.status = ScanStatus.processing
        db.commit()

        # ── DEMO MODE ── Skip Claude. Sleep 5s so the spinner looks
        # real, then return the canonical AH-long parse for any upload.
        await asyncio.sleep(5)
        payload = {
            "merchant": "Albert Heijn XL",
            "description": "groceries",
            "location": "Triade 14, Assen",
            "total": 54.25,
            "currency": "EUR",
            "line_items": [
                {"name": "avocado",        "price": 7.93,  "quantity": 2},
                {"name": "sushi wrap",     "price": 8.58,  "quantity": 2},
                {"name": "ah bbq burg",    "price": 10.00, "quantity": 1},
                {"name": "protein panc",   "price": 2.89,  "quantity": 1},
                {"name": "cottage cheese", "price": 0.95,  "quantity": 1},
                {"name": "knorr teriyaki", "price": 5.93,  "quantity": 2},
                {"name": "luxe hamburg",   "price": 1.99,  "quantity": 1},
                {"name": "alpro pudding",  "price": 4.33,  "quantity": 2},
                {"name": "alpro drink",    "price": 2.89,  "quantity": 1},
                {"name": "protein soja",   "price": 2.89,  "quantity": 1},
                {"name": "alpro melk",     "price": 2.79,  "quantity": 1},
                {"name": "obento bowl",    "price": 2.99,  "quantity": 1},
                {"name": "obento bowl",    "price": 2.99,  "quantity": 1},
                {"name": "lekkerbekjes",   "price": 10.98, "quantity": 2},
                {"name": "fuet spanje",    "price": 2.99,  "quantity": 1},
                {"name": "biltong",        "price": 3.79,  "quantity": 1},
                {"name": "rookworst",      "price": 1.99,  "quantity": 1},
                {"name": "ijsbergsla",     "price": 1.59,  "quantity": 1},
                {"name": "tissues",        "price": 0.69,  "quantity": 1},
            ],
        }

        # Apply parsed fields. AI guesses go into `*_suggested`; the editable
        # fields are seeded with the same value so the form shows it pre-filled.
        scan.raw_extraction = payload
        scan.merchant_suggested = payload.get("merchant")
        scan.merchant = scan.merchant or payload.get("merchant")
        scan.description_suggested = payload.get("description")
        scan.description = scan.description or payload.get("description")
        scan.location = payload.get("location")
        if payload.get("date"):
            try:
                scan.receipt_date = date_t.fromisoformat(payload["date"])
            except ValueError:
                pass
        if payload.get("total") is not None:
            scan.total = Decimal(str(payload["total"]))
        scan.currency = payload.get("currency") or scan.currency

        # Replace any existing line items (idempotent re-parse).
        for old in list(scan.line_items):
            db.delete(old)
        for i, li in enumerate(payload.get("line_items") or []):
            db.add(ScanLineItem(
                scan_id=scan.id, position=i,
                name=li["name"], price=Decimal(str(li["price"])),
                quantity=int(li.get("quantity") or 1),
            ))

        scan.status = ScanStatus.parsed
        scan.error = None
        db.commit()
    finally:
        db.close()


# ── helpers ─────────────────────────────────────────────────────────────
_MAX_LONG_SIDE_PX = 1600   # ~plenty for receipt OCR; cuts Claude latency a lot
_JPEG_QUALITY = 85


def _maybe_downscale(data: bytes, content_type: str | None) -> tuple[bytes, str]:
    """Resize the image so its longer side is at most _MAX_LONG_SIDE_PX,
    re-encode as JPEG. Best-effort: if PIL can't open the bytes (HEIC,
    weird format) we just hand back the original.

    EXIF rotation is applied first so the saved image is right-side-up,
    matching what the user saw when they took the photo.
    """
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im)
            longest = max(im.size)
            if longest > _MAX_LONG_SIDE_PX:
                ratio = _MAX_LONG_SIDE_PX / longest
                new_size = (round(im.width * ratio), round(im.height * ratio))
                im = im.resize(new_size, Image.Resampling.LANCZOS)
            elif content_type == "image/jpeg":
                # Already small + already JPEG — no point re-encoding.
                return data, content_type
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
            log.info(
                "scan image: %dx%d → %dx%d  %d → %d bytes",
                *(im.size if longest <= _MAX_LONG_SIDE_PX else (round(im.width / ratio), round(im.height / ratio))),
                *im.size, len(data), buf.tell(),
            )
            return buf.getvalue(), "image/jpeg"
    except Exception as e:
        log.warning("downscale failed (%s) — using original bytes", e)
        return data, content_type or "application/octet-stream"


# ── endpoints ───────────────────────────────────────────────────────────
@router.post("", response_model=ScanOut, status_code=202)
async def create_scan(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> ScanOut:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(415, "image/* required")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"image > {settings.max_upload_mb}MB")

    # Downscale large images before saving — Claude vision latency scales
    # with pixel area, and receipts don't need >1600px on the long side
    # for OCR. Cuts parse time ~3-5x on phone-camera shots.
    data, content_type = _maybe_downscale(data, file.content_type)

    scan = Scan(user_id=user.id, house_id=house.id, image_url="")
    db.add(scan)
    db.flush()

    scan.image_url = get_storage().save(scan.id, data, content_type)
    db.commit()
    db.refresh(scan)

    background.add_task(_process_scan, scan.id)
    return _to_out(scan)


@router.get("", response_model=list[ScanOut])
def list_scans(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[ScanOut]:
    rows = (
        db.query(Scan)
        .filter(Scan.user_id == user.id, Scan.status != ScanStatus.finalized)
        .order_by(Scan.created_at.desc())
        .all()
    )
    return [_to_out(s) for s in rows]


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(
    scan_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScanOut:
    return _to_out(_get_scan(db, scan_id, user))


# Serves the saved receipt image bytes. Anyone in the same house as the
# scan can fetch it (so a debtor can view a receipt their payer attached).
# Local backend → FileResponse with the right mime; S3 → 302 to the bucket.
@router.get("/{scan_id}/image")
def get_scan_image(
    scan_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    from ..data.models import HouseMember
    scan = db.query(Scan).filter_by(id=scan_id).first()
    if scan is None:
        raise HTTPException(404, "scan not found")
    in_house = (
        db.query(HouseMember)
        .filter_by(house_id=scan.house_id, user_id=user.id)
        .first()
    )
    if in_house is None:
        raise HTTPException(403, "not your house")
    if not scan.image_url:
        raise HTTPException(404, "no image")

    if scan.image_url.startswith("file://"):
        path = get_storage().local_path(scan.image_url)
        ext = path.lower().rsplit(".", 1)[-1] if "." in path else "bin"
        media = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png", "heic": "image/heic", "webp": "image/webp",
        }.get(ext, "application/octet-stream")
        return FileResponse(path, media_type=media)

    # S3-backed: hand the bytes back through the API rather than redirecting,
    # so cookies/permissions stay coherent.
    data = get_storage().load(scan.image_url)
    return Response(content=data, media_type="image/jpeg")


@router.patch("/{scan_id}", response_model=ScanOut)
def patch_scan(
    scan_id: str,
    body: ScanPatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScanOut:
    scan = _get_scan(db, scan_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(scan, field, value)
    db.commit()
    db.refresh(scan)
    return _to_out(scan)


@router.patch("/{scan_id}/line-items/{lid}", response_model=ScanLineItemOut)
def patch_line_item(
    scan_id: str,
    lid: str,
    body: LineItemPatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScanLineItemOut:
    scan = _get_scan(db, scan_id, user)
    li = next((x for x in scan.line_items if x.id == lid), None)
    if li is None:
        raise HTTPException(404, f"line item {lid} not in scan")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(li, field, value)
    db.commit()
    db.refresh(li)
    return ScanLineItemOut(
        id=li.id, position=li.position, name=li.name,
        price=li.price, quantity=li.quantity, assigned_to=li.assigned_to,
    )


@router.post("/{scan_id}/assignments", response_model=ScanOut)
def set_assignments(
    scan_id: str,
    body: AssignmentsIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScanOut:
    scan = _get_scan(db, scan_id, user)
    by_id = {li.id: li for li in scan.line_items}
    unknown = set(body.assignments) - set(by_id)
    if unknown:
        raise HTTPException(400, f"unknown line item ids: {sorted(unknown)}")
    for lid, assignee in body.assignments.items():
        by_id[lid].assigned_to = assignee
    db.commit()
    db.refresh(scan)
    return _to_out(scan)


@router.post("/{scan_id}/ai-assignments", response_model=AiAssignOut)
async def ai_assignments(
    scan_id: str,
    body: AiAssignIn,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> AiAssignOut:
    scan = _get_scan(db, scan_id, user)
    if scan.status != ScanStatus.parsed:
        raise HTTPException(409, f"scan not parsed (status={scan.status.value})")

    # Roster = all housemates in this house, EXCLUDING the uploader (they're
    # implicit on every "everyone" line via _compute_shares).
    rows = (
        db.query(User)
        .join(HouseMember, HouseMember.user_id == User.id)
        .filter(HouseMember.house_id == house.id, User.id != user.id)
        .all()
    )
    housemates = [{"id": u.id, "name": u.name} for u in rows]
    line_items = [
        {"id": li.id, "name": li.name, "price": float(li.price)}
        for li in scan.line_items
    ]

    result = await assign_line_items(
        prompt=body.prompt, line_items=line_items, housemates=housemates,
    )
    # Apply assignments immediately (matches the user's flow: AI fills the form).
    valid_ids = {h["id"] for h in housemates} | {"everyone"}
    by_id = {li.id: li for li in scan.line_items}
    for lid, assignee in (result.get("assignments") or {}).items():
        if lid not in by_id:
            continue
        if assignee is not None and assignee not in valid_ids:
            continue
        by_id[lid].assigned_to = assignee
    db.commit()
    return AiAssignOut(
        assignments=result.get("assignments") or {},
        explanation=result.get("explanation"),
    )


@router.post("/{scan_id}/finalize", response_model=SplitOut)
def finalize(
    scan_id: str,
    body: FinalizeIn = FinalizeIn(),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> SplitOut:
    scan = _get_scan(db, scan_id, user)
    try:
        split = finalize_scan(db, scan, parent_post_id=body.parent_post_id)
    except FinalizeError as exc:
        raise HTTPException(422, str(exc))
    name_by_id = {
        u.id: u.name for u in
        db.query(User).filter(
            User.id.in_({split.payer_id} | {r.debtor_id for r in split.requests})
        ).all()
    }
    return split_to_out(split, name_by_id=name_by_id)


@router.delete("/{scan_id}", status_code=204, response_class=Response)
def delete_scan(
    scan_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    scan = _get_scan(db, scan_id, user)
    db.delete(scan)
    db.commit()
    return Response(status_code=204)


# ── housemates lookup (used by the review screen) ──────────────────────
hm_router = APIRouter(prefix="/housemates", tags=["housemates"])


@hm_router.get("", response_model=list[HousemateOut])
def list_housemates(
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> list[HousemateOut]:
    rows = (
        db.query(User)
        .join(HouseMember, HouseMember.user_id == User.id)
        .filter(HouseMember.house_id == house.id)
        .all()
    )
    return [
        HousemateOut(id=u.id, name=u.name, color=u.color, is_me=(u.id == me.id))
        for u in rows
    ]
