"""Tiny CLI wrapper around BunqClient. Grows as we implement more stages."""
from __future__ import annotations

import argparse

from bunq_client import BunqClient, SECRETS_DIR


def cmd_create_user(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.create_sandbox_user(args.label)
    api_key = BunqClient.load_api_key(SECRETS_DIR, args.label)
    print(f"created sandbox user '{args.label}'")
    print(f"  api_key: {api_key[:12]}…{api_key[-4:]}")
    print(f"  saved to: {SECRETS_DIR / f'sandbox-{args.label}.json'}")


def cmd_install(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.ensure_keypair()
    print(f"keypair: {client.private_key_path}")
    client.register_installation()
    token = client.installation_token()
    print(f"installation registered")
    print(f"  install_token: {token[:12]}…{token[-4:]}")
    print(f"  saved to: {SECRETS_DIR / 'installation.json'}")


def cmd_list_users(args: argparse.Namespace) -> None:
    users = BunqClient.list_local_users()
    if not users:
        print("no sandbox users yet — run: python cli.py create-user <label>")
        return
    for label, api_key in users:
        print(f"  {label:<12} {api_key[:12]}…{api_key[-4:]}")


def cmd_register_device(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.register_device(args.label)
    print(f"device registered for '{args.label}'")


def cmd_open_session(args: argparse.Namespace) -> None:
    client = BunqClient()
    token, user_id = client.open_session(args.label)
    print(f"session open for '{args.label}'")
    print(f"  user_id: {user_id}")
    print(f"  token: …{token[-8:]}")


def cmd_list_accounts(args: argparse.Namespace) -> None:
    client = BunqClient()
    accounts = client.list_accounts(args.label)
    if not accounts:
        print("(no accounts)")
        return
    for wrapper in accounts:
        for kind, acc in wrapper.items():
            balance = acc.get("balance", {})
            print(
                f"  [{acc['id']}] {kind:<24} "
                f"{acc.get('description', ''):<30} "
                f"{balance.get('value', '?')} {balance.get('currency', '')}"
            )


def cmd_show_aliases(args: argparse.Namespace) -> None:
    client = BunqClient()
    for a in client.get_aliases(args.label):
        print(f"  {a.get('type','?'):<14} {a.get('value','')}")


def cmd_load_funds(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.load_sandbox_funds(args.label, args.amount)
    print(f"credited {args.amount:.2f} EUR to '{args.label}'")


def cmd_request_payment(args: argparse.Namespace) -> None:
    client = BunqClient()
    to_email = args.to_email or client.get_email_alias(args.to_label)
    res = client.send_payment_request(args.from_label, to_email, args.amount, args.description)
    rid = res["Response"][0]["Id"]["id"]
    print(f"request #{rid}: {args.from_label} -> {to_email}  €{args.amount:.2f}  '{args.description}'")


def cmd_bunqme_create(args: argparse.Namespace) -> None:
    client = BunqClient()
    tab_id, url = client.create_bunqme_link(args.label, args.amount, args.description, args.redirect_url)
    print(f"bunq.me tab #{tab_id} created")
    print(f"  share:    {url}")
    print(f"  for:      €{args.amount:.2f}  '{args.description}'")


def cmd_bunqme_list(args: argparse.Namespace) -> None:
    client = BunqClient()
    rows = client.list_bunqme_links(args.label)
    if not rows:
        print("(no bunq.me tabs)")
        return
    for w in rows:
        t = w["BunqMeTab"]
        entry = t.get("bunqme_tab_entry", {})
        amount = entry.get("amount_inquired", {})
        print(
            f"  #{t['id']:<8} {t.get('status','?'):<10} "
            f"{amount.get('value','?'):>8} {amount.get('currency','')}  "
            f"'{entry.get('description','')}'  "
            f"{t.get('bunqme_tab_share_url','')}"
        )


def cmd_bunqme_cancel(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.cancel_bunqme_link(args.label, args.tab_id)
    print(f"cancelled bunq.me tab #{args.tab_id}")


def cmd_list_payments(args: argparse.Namespace) -> None:
    client = BunqClient()
    rows = client.list_payments(args.label, count=args.count)
    if not rows:
        print("(no payments)")
        return
    for w in rows:
        p = w["Payment"]
        amount = p["amount"]
        when = (p.get("created") or "")[:19]
        cp = p.get("counterparty_alias", {})
        who = cp.get("display_name") or (cp.get("pointer") or {}).get("value") or "?"
        kind = p.get("sub_type") or p.get("type") or ""
        sign = " " if (amount["value"].startswith("-") or amount["value"].startswith("+")) else "+"
        print(
            f"  {when}  {sign}{amount['value']:>10} {amount['currency']}  "
            f"{who:<30}  {kind:<16}  '{p.get('description','')}'"
        )


def _print_request_row(prefix: str, r: dict) -> None:
    rid = r["id"]
    amount = r["amount_inquired"]
    status = r.get("status", "?")
    desc = r.get("description", "")
    cp = r.get("counterparty_alias", {})
    who = cp.get("display_name") or (cp.get("pointer") or {}).get("value") or "?"
    print(f"  {prefix}#{rid:<9} {status:<12} {amount['value']:>8} {amount['currency']}  {who:<40}  '{desc}'")


def _filter_status(rows: list[dict], inner_key: str, pending_only: bool) -> list[dict]:
    if not pending_only:
        return rows
    return [w for w in rows if w[inner_key].get("status") == "PENDING"]


def cmd_incoming(args: argparse.Namespace) -> None:
    client = BunqClient()
    rows = _filter_status(client.list_incoming_requests(args.label), "RequestResponse", args.pending)
    if not rows:
        print("(no incoming requests)")
        return
    for w in rows:
        _print_request_row("in  ", w["RequestResponse"])


def cmd_outgoing(args: argparse.Namespace) -> None:
    client = BunqClient()
    rows = _filter_status(client.list_outgoing_requests(args.label), "RequestInquiry", args.pending)
    if not rows:
        print("(no outgoing requests)")
        return
    for w in rows:
        _print_request_row("out ", w["RequestInquiry"])


def cmd_approve(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.respond_to_request(args.label, args.request_id, accept=True)
    print(f"accepted request #{args.request_id} as '{args.label}'")


def cmd_reject(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.respond_to_request(args.label, args.request_id, accept=False)
    print(f"rejected request #{args.request_id} as '{args.label}'")


def cmd_tui(args: argparse.Namespace) -> None:
    import tui
    tui.run(args.label)


def cmd_bootstrap(args: argparse.Namespace) -> None:
    client = BunqClient()
    client.bootstrap(args.labels)
    print("bootstrap done.")


def cmd_delete_user(args: argparse.Namespace) -> None:
    client = BunqClient()
    removed = client.delete_user(args.label)
    if not removed:
        print(f"no local state for '{args.label}'")
        return
    print(f"forgot '{args.label}' locally:")
    for p in removed:
        print(f"  removed {p.name}")
    print("note: bunq has no sandbox-user delete endpoint; the user still exists server-side.")


def main() -> None:
    p = argparse.ArgumentParser(prog="bunq")
    sub = p.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("create-user", help="create a sandbox user (stage 1)")
    pc.add_argument("label", help="local name, e.g. lena / marco / alex")
    pc.set_defaults(func=cmd_create_user)

    pl = sub.add_parser("list-users", help="list sandbox users saved locally")
    pl.set_defaults(func=cmd_list_users)

    pi = sub.add_parser("install", help="generate keypair + register installation (stage 2)")
    pi.set_defaults(func=cmd_install)

    pd = sub.add_parser("register-device", help="register device for a user (stage 3)")
    pd.add_argument("label")
    pd.set_defaults(func=cmd_register_device)

    ps = sub.add_parser("open-session", help="open a session for a user (stage 4)")
    ps.add_argument("label")
    ps.set_defaults(func=cmd_open_session)

    pa = sub.add_parser("list-accounts", help="list monetary accounts for a user")
    pa.add_argument("label")
    pa.set_defaults(func=cmd_list_accounts)

    px = sub.add_parser("show-aliases", help="show a user's aliases (email/phone/iban)")
    px.add_argument("label")
    px.set_defaults(func=cmd_show_aliases)

    pf = sub.add_parser("load-funds", help="sandbox-only: credit fake EUR to a user's main account")
    pf.add_argument("label")
    pf.add_argument("--amount", type=float, default=500.0)
    pf.set_defaults(func=cmd_load_funds)

    pr = sub.add_parser("request-payment", help="send a payment-request from one user to another")
    pr.add_argument("from_label")
    pr.add_argument("amount", type=float)
    pr.add_argument("description")
    group = pr.add_mutually_exclusive_group(required=True)
    group.add_argument("--to-label", help="local label; resolves to their email alias")
    group.add_argument("--to-email", help="raw email address")
    pr.set_defaults(func=cmd_request_payment)

    pin = sub.add_parser("incoming", help="list incoming payment requests for a user")
    pin.add_argument("label")
    pin.add_argument("--pending", action="store_true", help="only PENDING")
    pin.set_defaults(func=cmd_incoming)

    pout = sub.add_parser("outgoing", help="list outgoing payment requests for a user")
    pout.add_argument("label")
    pout.add_argument("--pending", action="store_true", help="only PENDING")
    pout.set_defaults(func=cmd_outgoing)

    pbm = sub.add_parser("bunqme-create", help="create a public bunq.me payment link")
    pbm.add_argument("label")
    pbm.add_argument("amount", type=float)
    pbm.add_argument("description")
    pbm.add_argument("--redirect-url", default=None)
    pbm.set_defaults(func=cmd_bunqme_create)

    pbl = sub.add_parser("bunqme-list", help="list bunq.me tabs for a user")
    pbl.add_argument("label")
    pbl.set_defaults(func=cmd_bunqme_list)

    pbc = sub.add_parser("bunqme-cancel", help="cancel a bunq.me tab")
    pbc.add_argument("label")
    pbc.add_argument("tab_id", type=int)
    pbc.set_defaults(func=cmd_bunqme_cancel)

    pp = sub.add_parser("list-payments", help="list actual money movements (ledger)")
    pp.add_argument("label")
    pp.add_argument("--count", type=int, default=50)
    pp.set_defaults(func=cmd_list_payments)

    pap = sub.add_parser("approve", help="accept an incoming request by id")
    pap.add_argument("label")
    pap.add_argument("request_id", type=int)
    pap.set_defaults(func=cmd_approve)

    prj = sub.add_parser("reject", help="reject an incoming request by id")
    prj.add_argument("label")
    prj.add_argument("request_id", type=int)
    prj.set_defaults(func=cmd_reject)

    pt = sub.add_parser("tui", help="interactive dashboard for one user")
    pt.add_argument("label")
    pt.set_defaults(func=cmd_tui)

    pb = sub.add_parser("bootstrap", help="idempotent full setup for one or more users")
    pb.add_argument("labels", nargs="+", help="e.g. lena marco alex")
    pb.set_defaults(func=cmd_bootstrap)

    pdel = sub.add_parser("delete-user", help="forget a user locally (bunq has no server-side delete)")
    pdel.add_argument("label")
    pdel.set_defaults(func=cmd_delete_user)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
