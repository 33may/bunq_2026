from __future__ import annotations

import base64
import json
import uuid
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

SANDBOX_BASE = "https://public-api.sandbox.bunq.com/v1"
SECRETS_DIR = Path(__file__).resolve().parents[1] / ".secrets"


class BunqClient:
    def __init__(self, base_url: str = SANDBOX_BASE, secrets_dir: Path = SECRETS_DIR):
        self.base_url = base_url
        self.secrets_dir = secrets_dir
        self.secrets_dir.mkdir(parents=True, exist_ok=True)
        self._http = httpx.Client(timeout=30)
        self._private_key: RSAPrivateKey | None = None

    # ── Stage 1: sandbox user ───────────────────────────────────────────
    def create_sandbox_user(self, label: str) -> dict:
        """No auth, no signing. API key lives at Response[0].ApiKey.api_key."""
        r = self._http.post(
            f"{self.base_url}/sandbox-user-person",
            headers={"Cache-Control": "no-cache"},
        )
        r.raise_for_status()
        data = r.json()
        (self.secrets_dir / f"sandbox-{label}.json").write_text(json.dumps(data, indent=2))
        return data

    @staticmethod
    def load_api_key(secrets_dir: Path, label: str) -> str:
        data = json.loads((secrets_dir / f"sandbox-{label}.json").read_text())
        return data["Response"][0]["ApiKey"]["api_key"]

    @staticmethod
    def list_local_users(secrets_dir: Path = SECRETS_DIR) -> list[tuple[str, str]]:
        users = []
        for path in sorted(secrets_dir.glob("sandbox-*.json")):
            label = path.stem[len("sandbox-"):]
            users.append((label, BunqClient.load_api_key(secrets_dir, label)))
        return users

    # ── Keypair ─────────────────────────────────────────────────────────
    @property
    def private_key_path(self) -> Path:
        return self.secrets_dir / "private.pem"

    @property
    def public_key_path(self) -> Path:
        return self.secrets_dir / "public.pem"

    def ensure_keypair(self) -> RSAPrivateKey:
        """Load keypair from disk, generating one if missing. RSA-2048."""
        if self._private_key is not None:
            return self._private_key

        if self.private_key_path.exists():
            self._private_key = serialization.load_pem_private_key(
                self.private_key_path.read_bytes(), password=None
            )
            return self._private_key

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private_key_path.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        self.public_key_path.write_bytes(
            key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )
        self._private_key = key
        return key

    def public_key_pem(self) -> str:
        self.ensure_keypair()
        return self.public_key_path.read_text()

    # ── Stage 2: installation ───────────────────────────────────────────
    def register_installation(self) -> dict:
        """POST /installation with our public key. No auth, no signing.

        Persists the response to installation.json. Idempotent-ish: calling
        twice just overwrites the saved token with a fresh one.
        """
        body = {"client_public_key": self.public_key_pem()}
        r = self._http.post(
            f"{self.base_url}/installation",
            json=body,
            headers={"Cache-Control": "no-cache"},
        )
        r.raise_for_status()
        data = r.json()
        (self.secrets_dir / "installation.json").write_text(json.dumps(data, indent=2))
        return data

    def installation_token(self) -> str:
        data = json.loads((self.secrets_dir / "installation.json").read_text())
        for item in data["Response"]:
            if "Token" in item:
                return item["Token"]["token"]
        raise RuntimeError("no Token in installation.json — re-run install")

    # ── Signing ─────────────────────────────────────────────────────────
    def _sign(self, body: str) -> str:
        """Sign the exact body bytes with our private key. Empty body -> sign ""."""
        key = self.ensure_keypair()
        sig = key.sign(body.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
        return base64.b64encode(sig).decode("ascii")

    def _default_headers(self, auth_token: str, body: str) -> dict:
        return {
            "Content-Type": "application/json",
            "X-Bunq-Client-Authentication": auth_token,
            "X-Bunq-Client-Signature": self._sign(body),
            "X-Bunq-Client-Request-Id": str(uuid.uuid4()),
            "X-Bunq-Geolocation": "0 0 0 0 NL",
            "X-Bunq-Language": "en_US",
            "X-Bunq-Region": "nl_NL",
            "User-Agent": "house-brain/0.1",
        }

    # ── Stage 3: device-server ──────────────────────────────────────────
    def register_device(self, label: str, description: str = "house-brain-dev") -> dict:
        """Bind an api_key to this device. Only ONE device-server per installation;
        subsequent sessions for other users still go through this same device."""
        api_key = BunqClient.load_api_key(self.secrets_dir, label)
        body_str = json.dumps(
            {"description": description, "secret": api_key, "permitted_ips": ["*"]},
            separators=(",", ":"),
        )
        headers = self._default_headers(self.installation_token(), body_str)
        r = self._http.post(f"{self.base_url}/device-server", content=body_str, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f"bunq {r.status_code}: {r.text}")
        data = r.json()
        (self.secrets_dir / "device.json").write_text(json.dumps(data, indent=2))
        return data

    # ── Stage 4: session-server ─────────────────────────────────────────
    def open_session(self, label: str) -> tuple[str, int]:
        """Open a session for the given user. Returns (session_token, user_id).
        Rate-limited to 1 req / 30 s — cache aggressively."""
        api_key = BunqClient.load_api_key(self.secrets_dir, label)
        body_str = json.dumps({"secret": api_key}, separators=(",", ":"))
        headers = self._default_headers(self.installation_token(), body_str)
        r = self._http.post(f"{self.base_url}/session-server", content=body_str, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f"bunq {r.status_code}: {r.text}")
        data = r.json()
        (self.secrets_dir / f"session-{label}.json").write_text(json.dumps(data, indent=2))
        return self._extract_session(data)

    def _extract_session(self, data: dict) -> tuple[str, int]:
        token = None
        user_id = None
        for item in data["Response"]:
            if "Token" in item:
                token = item["Token"]["token"]
            for key in ("UserPerson", "UserCompany", "UserApiKey"):
                if key in item:
                    user_id = item[key]["id"]
        if token is None or user_id is None:
            raise RuntimeError(f"could not parse session response: {data}")
        return token, user_id

    def load_session(self, label: str) -> tuple[str, int] | None:
        path = self.secrets_dir / f"session-{label}.json"
        if not path.exists():
            return None
        try:
            return self._extract_session(json.loads(path.read_text()))
        except Exception:
            return None

    def session(self, label: str) -> tuple[str, int]:
        """Return cached session if present, otherwise open a fresh one."""
        cached = self.load_session(label)
        if cached is not None:
            return cached
        return self.open_session(label)

    # ── Generic signed call (with one-shot 401 retry) ───────────────────
    def call(self, label: str, method: str, path: str, body: dict | None = None) -> dict:
        body_str = json.dumps(body, separators=(",", ":")) if body is not None else ""
        for attempt in (1, 2):
            token, _user_id = self.session(label)
            headers = self._default_headers(token, body_str)
            r = self._http.request(
                method, f"{self.base_url}{path}", content=body_str or None, headers=headers
            )
            if r.status_code == 401 and attempt == 1:
                # stale session — drop cache and retry once
                (self.secrets_dir / f"session-{label}.json").unlink(missing_ok=True)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"bunq {r.status_code}: {r.text}")
            return r.json()
        raise RuntimeError("unreachable")

    # ── Reads ───────────────────────────────────────────────────────────
    def list_accounts(self, label: str) -> list[dict]:
        _token, user_id = self.session(label)
        res = self.call(label, "GET", f"/user/{user_id}/monetary-account")
        return res["Response"]

    def primary_account_id(self, label: str) -> int:
        """First MonetaryAccountBank for the user."""
        for wrapper in self.list_accounts(label):
            if "MonetaryAccountBank" in wrapper:
                return wrapper["MonetaryAccountBank"]["id"]
        raise RuntimeError(f"no MonetaryAccountBank for '{label}'")

    def get_aliases(self, label: str) -> list[dict]:
        """Read aliases (email, phone, iban) from the saved sandbox user file.
        Shape: Response[0].ApiKey.user.{UserPerson|UserCompany}.alias[]"""
        data = json.loads((self.secrets_dir / f"sandbox-{label}.json").read_text())
        user_wrapper = data["Response"][0]["ApiKey"]["user"]
        for key in ("UserPerson", "UserCompany"):
            if key in user_wrapper:
                return user_wrapper[key].get("alias", [])
        return []

    def get_email_alias(self, label: str) -> str:
        for a in self.get_aliases(label):
            if a.get("type") == "EMAIL":
                return a["value"]
        raise RuntimeError(f"no EMAIL alias for '{label}'")

    # ── Sandbox-only: top up fake money ─────────────────────────────────
    def load_sandbox_funds(self, label: str, amount_eur: float = 500.0) -> dict:
        """Sandbox trick: send a payment-request to sugardaddy@bunq.com.
        He auto-approves up to €500 per request. No dedicated endpoint exists."""
        if amount_eur > 500:
            raise ValueError("sugardaddy auto-approves at most €500 per request")
        return self.send_payment_request(
            from_label=label,
            to_email="sugardaddy@bunq.com",
            amount_eur=amount_eur,
            description="sandbox top-up",
        )

    # ── Payment request (workhorse) ─────────────────────────────────────
    def send_payment_request(
        self,
        from_label: str,
        to_email: str,
        amount_eur: float,
        description: str,
    ) -> dict:
        _token, user_id = self.session(from_label)
        account_id = self.primary_account_id(from_label)
        body = {
            "amount_inquired": {"value": f"{amount_eur:.2f}", "currency": "EUR"},
            "counterparty_alias": {"type": "EMAIL", "value": to_email},
            "description": description,
            "allow_bunqme": True,
        }
        return self.call(
            from_label, "POST",
            f"/user/{user_id}/monetary-account/{account_id}/request-inquiry",
            body,
        )

    # ── Direct payment (real money move; no request round-trip) ─────────
    def send_payment(
        self,
        from_label: str,
        to_email: str,
        amount_eur: float,
        description: str,
    ) -> dict:
        """Push money from `from_label`'s primary account to `to_email`.
        Returns the bunq /payment Response. In sandbox the funds move
        instantly; the recipient sees a positive Payment in their feed."""
        _token, user_id = self.session(from_label)
        account_id = self.primary_account_id(from_label)
        body = {
            "amount": {"value": f"{amount_eur:.2f}", "currency": "EUR"},
            "counterparty_alias": {"type": "EMAIL", "value": to_email},
            "description": description,
        }
        return self.call(
            from_label, "POST",
            f"/user/{user_id}/monetary-account/{account_id}/payment",
            body,
        )

    # ── Request inspection + approval ───────────────────────────────────
    def list_outgoing_requests(self, label: str) -> list[dict]:
        """Requests this user has SENT (request-inquiry)."""
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        res = self.call(label, "GET", f"/user/{user_id}/monetary-account/{account_id}/request-inquiry")
        return res["Response"]

    def list_incoming_requests(self, label: str) -> list[dict]:
        """Requests this user has RECEIVED (request-response)."""
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        res = self.call(label, "GET", f"/user/{user_id}/monetary-account/{account_id}/request-response")
        return res["Response"]

    # ── bunq.me links (public payment URLs) ─────────────────────────────
    def create_bunqme_link(
        self,
        label: str,
        amount_eur: float,
        description: str,
        redirect_url: str | None = None,
    ) -> tuple[int, str]:
        """Create a shareable bunq.me payment link. Returns (tab_id, share_url)."""
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        entry = {
            "amount_inquired": {"value": f"{amount_eur:.2f}", "currency": "EUR"},
            "description": description,
        }
        if redirect_url:
            entry["redirect_url"] = redirect_url
        body = {"bunqme_tab_entry": entry}
        res = self.call(
            label, "POST",
            f"/user/{user_id}/monetary-account/{account_id}/bunqme-tab",
            body,
        )
        tab_id = res["Response"][0]["Id"]["id"]
        # POST response lacks share URL; fetch it.
        detail = self.call(
            label, "GET",
            f"/user/{user_id}/monetary-account/{account_id}/bunqme-tab/{tab_id}",
        )
        tab = detail["Response"][0]["BunqMeTab"]
        share_url = tab.get("bunqme_tab_share_url") or tab.get("share_url") or ""
        return tab_id, share_url

    def list_bunqme_links(self, label: str) -> list[dict]:
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        res = self.call(
            label, "GET",
            f"/user/{user_id}/monetary-account/{account_id}/bunqme-tab",
        )
        return res["Response"]

    def cancel_bunqme_link(self, label: str, tab_id: int) -> dict:
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        return self.call(
            label, "PUT",
            f"/user/{user_id}/monetary-account/{account_id}/bunqme-tab/{tab_id}",
            {"status": "CANCELLED"},
        )

    def list_payments(self, label: str, count: int = 50) -> list[dict]:
        """Actual money movements on this account (signed amounts)."""
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        res = self.call(
            label, "GET",
            f"/user/{user_id}/monetary-account/{account_id}/payment?count={count}",
        )
        return res["Response"]

    def respond_to_request(self, label: str, request_response_id: int, accept: bool) -> dict:
        """Accept or reject an incoming request-response by id."""
        _token, user_id = self.session(label)
        account_id = self.primary_account_id(label)
        body = {"status": "ACCEPTED" if accept else "REJECTED"}
        return self.call(
            label, "PUT",
            f"/user/{user_id}/monetary-account/{account_id}/request-response/{request_response_id}",
            body,
        )

    # ── Bootstrap + cleanup ─────────────────────────────────────────────
    def bootstrap(self, labels: list[str]) -> None:
        """Idempotent full setup: users, keypair, installation, device per user."""
        self.ensure_keypair()
        if not (self.secrets_dir / "installation.json").exists():
            print("  → registering installation")
            self.register_installation()
        else:
            print("  → installation already registered (skipped)")

        for label in labels:
            user_path = self.secrets_dir / f"sandbox-{label}.json"
            if not user_path.exists():
                print(f"  → creating sandbox user '{label}'")
                self.create_sandbox_user(label)
            else:
                print(f"  → user '{label}' already exists (skipped)")

        device_path = self.secrets_dir / "device.json"
        if not device_path.exists():
            print(f"  → registering device (using '{labels[0]}'s key)")
            self.register_device(labels[0])
        else:
            print("  → device already registered (skipped)")

        for label in labels:
            session_path = self.secrets_dir / f"session-{label}.json"
            if not session_path.exists():
                print(f"  → opening session for '{label}'")
                self.open_session(label)
            else:
                print(f"  → session for '{label}' already open (skipped)")

    def delete_user(self, label: str) -> list[Path]:
        """Remove local state for a user. bunq has no sandbox-user delete endpoint,
        so this just forgets the user locally (sandbox-<label>.json + device-<label>.json
        + session-<label>.json if present)."""
        removed = []
        for name in (f"sandbox-{label}.json", f"session-{label}.json"):
            p = self.secrets_dir / name
            if p.exists():
                p.unlink()
                removed.append(p)
        return removed
