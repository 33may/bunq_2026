"""Textual TUI — Claude Code / Ink aesthetic.

Launch: python cli.py tui <label>
"""
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, DataTable, Footer, Input, Label, Static

from bunq_client import BunqClient


class BunqTUI(App):
    CSS = """
    Screen {
        background: #0e0e10;
        color: #e6e6e6;
        layout: vertical;
    }

    #topbar {
        height: 5;
        padding: 1 3;
        background: #151518;
        border-bottom: heavy #2a2a30;
    }

    #brand {
        color: #e89a4c;
        text-style: bold;
    }

    #balance {
        color: #8de58d;
        text-style: bold;
    }

    #subtle {
        color: #6a6a70;
    }

    #body {
        padding: 1 2;
        height: 1fr;
        layout: vertical;
    }

    #requests_row {
        height: 40%;
    }

    #payments_row {
        height: 1fr;
    }

    .panel {
        border: round #2a2a30;
        padding: 1 2;
        margin: 0 1;
        height: 1fr;
        background: #131316;
    }

    .panel:focus-within {
        border: round #e89a4c;
    }

    .panel-title {
        color: #e89a4c;
        text-style: bold;
        margin-bottom: 1;
    }

    DataTable {
        background: transparent;
        height: 1fr;
    }

    DataTable > .datatable--header {
        background: #1a1a1f;
        color: #8a8a92;
        text-style: bold;
    }

    Footer {
        background: #151518;
        color: #8a8a92;
    }

    Footer > .footer--key {
        background: #e89a4c;
        color: #151518;
        text-style: bold;
    }

    Toast {
        background: #1a1a1f;
        border: round #e89a4c;
    }

    #request_dialog {
        width: 60;
        height: auto;
        padding: 2 3;
        background: #151518;
        border: round #e89a4c;
    }

    #request_dialog Label {
        color: #8a8a92;
        margin-top: 1;
    }

    #request_dialog Label.title {
        color: #e89a4c;
        text-style: bold;
        margin-top: 0;
        margin-bottom: 1;
    }

    #request_dialog Input {
        background: #0e0e10;
        border: round #2a2a30;
    }

    #request_dialog Input:focus {
        border: round #e89a4c;
    }

    #request_buttons {
        height: 3;
        margin-top: 2;
        align-horizontal: right;
    }

    #request_buttons Button {
        margin-left: 1;
    }
    """

    BINDINGS = [
        Binding("n", "new_request", "New request"),
        Binding("a", "approve", "Approve"),
        Binding("r", "reject", "Reject"),
        Binding("shift+r", "refresh", "Refresh"),
        Binding("tab", "focus_next", "Switch panel", show=False),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, label: str) -> None:
        super().__init__()
        self.label = label
        self.client = BunqClient()

    # ── Layout ────────────────────────────────────────────────────────
    def compose(self) -> ComposeResult:
        with Vertical(id="topbar"):
            yield Static("", id="brand")
            yield Static("", id="balance")
            yield Static("", id="subtle")

        with Vertical(id="body"):
            with Horizontal(id="requests_row"):
                with Vertical(classes="panel", id="incoming_panel"):
                    yield Static("  PENDING · INCOMING", classes="panel-title")
                    t_in = DataTable(id="incoming", cursor_type="row", zebra_stripes=True)
                    t_in.add_columns("id", "amount", "from", "description")
                    yield t_in

                with Vertical(classes="panel", id="outgoing_panel"):
                    yield Static("  PENDING · OUTGOING", classes="panel-title")
                    t_out = DataTable(id="outgoing", cursor_type="row", zebra_stripes=True)
                    t_out.add_columns("id", "amount", "to", "description")
                    yield t_out

            with Vertical(id="payments_row"):
                with Vertical(classes="panel", id="payments_panel"):
                    yield Static("  PAYMENTS", classes="panel-title")
                    t_pay = DataTable(id="payments", cursor_type="row", zebra_stripes=True)
                    t_pay.add_columns("when", "amount", "counterparty", "type", "description")
                    yield t_pay

        yield Footer()

    def on_mount(self) -> None:
        self.title = f"bunq · {self.label}"
        self.query_one("#brand", Static).update(f"[b]⬢  bunq[/b]   [dim]·[/dim]   {self.label}")
        self.refresh_data()
        self.set_interval(5.0, self.refresh_data)
        self.query_one("#incoming", DataTable).focus()

    # ── Data refresh ──────────────────────────────────────────────────
    def refresh_data(self) -> None:
        try:
            accounts = self.client.list_accounts(self.label)
            bal_text, sub_text = self._format_balance(accounts)
            self.query_one("#balance", Static).update(bal_text)
            self.query_one("#subtle", Static).update(sub_text)
        except Exception as e:
            self.query_one("#balance", Static).update(f"[red]balance error[/red]")
            self.query_one("#subtle", Static).update(f"[dim]{e}[/dim]")

        self._refresh_table("#incoming", self._load_incoming)
        self._refresh_table("#outgoing", self._load_outgoing)
        self._refresh_table("#payments", self._load_payments)

    def _format_balance(self, accounts: list[dict]) -> tuple[str, str]:
        # Pick the primary (first) account for the big display
        primary = None
        for wrapper in accounts:
            if "MonetaryAccountBank" in wrapper:
                primary = wrapper["MonetaryAccountBank"]
                break
        if primary is None:
            return ("[dim]no account[/dim]", "")
        bal = primary.get("balance", {})
        big = f"€ {bal.get('value', '?')}  [dim]{bal.get('currency', '')}[/dim]"
        sub = f"[dim]account #{primary['id']} · {primary.get('description','')}[/dim]"
        return big, sub

    def _refresh_table(self, selector: str, loader) -> None:
        table: DataTable = self.query_one(selector, DataTable)
        current_row = table.cursor_row
        table.clear()
        try:
            for row in loader():
                table.add_row(*row)
        except Exception as e:
            table.add_row("-", "err", "-", "-", str(e))
        if current_row is not None and table.row_count > current_row:
            try:
                table.move_cursor(row=current_row)
            except Exception:
                pass

    def _load_incoming(self) -> list[tuple]:
        rows = []
        for w in self.client.list_incoming_requests(self.label):
            r = w["RequestResponse"]
            if r.get("status") != "PENDING":
                continue
            rows.append(self._request_row(r))
        return rows

    def _load_outgoing(self) -> list[tuple]:
        rows = []
        for w in self.client.list_outgoing_requests(self.label):
            r = w["RequestInquiry"]
            if r.get("status") != "PENDING":
                continue
            rows.append(self._request_row(r))
        return rows

    def _request_row(self, r: dict) -> tuple:
        amount = r["amount_inquired"]
        cp = r.get("counterparty_alias", {})
        who = cp.get("display_name") or (cp.get("pointer") or {}).get("value") or "?"
        return (
            f"[dim]#[/]{r['id']}",
            f"[b]{amount['value']}[/] [dim]{amount['currency']}[/]",
            who,
            r.get("description", ""),
        )

    def _load_payments(self) -> list[tuple]:
        rows = []
        for w in self.client.list_payments(self.label, count=50):
            p = w["Payment"]
            amount = p["amount"]
            value = amount["value"]
            try:
                is_credit = float(value) >= 0
            except ValueError:
                is_credit = True
            amount_styled = (
                f"[#8de58d]+{value}[/] [dim]{amount['currency']}[/]"
                if is_credit
                else f"[#e86c6c]{value}[/] [dim]{amount['currency']}[/]"
            )
            cp = p.get("counterparty_alias", {})
            who = cp.get("display_name") or (cp.get("pointer") or {}).get("value") or "?"
            when = (p.get("created") or "")[:19]
            kind = p.get("sub_type") or p.get("type") or ""
            rows.append((when, amount_styled, who, kind, p.get("description", "")))
        return rows

    # ── Actions ───────────────────────────────────────────────────────
    def _selected_incoming_id(self) -> int | None:
        import re
        table: DataTable = self.query_one("#incoming", DataTable)
        if table.row_count == 0:
            return None
        row = table.cursor_row if table.cursor_row is not None else 0
        cell = table.get_cell_at((row, 0))
        # Cell may be a Rich Text/markup; strip everything but digits
        text = getattr(cell, "plain", str(cell))
        m = re.search(r"\d+", text)
        return int(m.group(0)) if m else None

    def action_approve(self) -> None:
        self.query_one("#incoming", DataTable).focus()
        rid = self._selected_incoming_id()
        if rid is None:
            self.notify("no incoming requests", severity="warning")
            return
        try:
            self.client.respond_to_request(self.label, rid, accept=True)
            self.notify(f"approved #{rid}", severity="information")
        except Exception as e:
            self.notify(f"approve failed: {e}", severity="error")
        self.refresh_data()

    def action_reject(self) -> None:
        self.query_one("#incoming", DataTable).focus()
        rid = self._selected_incoming_id()
        if rid is None:
            self.notify("no incoming requests", severity="warning")
            return
        try:
            self.client.respond_to_request(self.label, rid, accept=False)
            self.notify(f"rejected #{rid}")
        except Exception as e:
            self.notify(f"reject failed: {e}", severity="error")
        self.refresh_data()

    def action_refresh(self) -> None:
        self.refresh_data()
        self.notify("refreshed")

    def action_new_request(self) -> None:
        other_labels = [
            lbl for lbl, _ in BunqClient.list_local_users() if lbl != self.label
        ]

        def after(result: tuple[str, float, str] | None) -> None:
            if result is None:
                return
            to_label, amount, desc = result
            try:
                to_email = self.client.get_email_alias(to_label)
                self.client.send_payment_request(self.label, to_email, amount, desc)
                self.notify(f"requested €{amount:.2f} from {to_label}")
            except Exception as e:
                self.notify(f"request failed: {e}", severity="error")
            self.refresh_data()

        self.push_screen(RequestDialog(other_labels), after)


class RequestDialog(ModalScreen[tuple[str, float, str] | None]):
    def __init__(self, known_labels: list[str]) -> None:
        super().__init__()
        self.known_labels = known_labels

    def compose(self) -> ComposeResult:
        hint = ", ".join(self.known_labels) if self.known_labels else "—"
        with Vertical(id="request_dialog"):
            yield Label("NEW REQUEST", classes="title")
            yield Label(f"to (label)   [dim]known: {hint}[/dim]")
            yield Input(placeholder="e.g. marco", id="to_label")
            yield Label("amount (EUR)")
            yield Input(placeholder="12.80", id="amount")
            yield Label("description")
            yield Input(placeholder="groceries — your share", id="description")
            with Horizontal(id="request_buttons"):
                yield Button("Cancel", id="cancel", variant="default")
                yield Button("Send", id="send", variant="primary")

    def on_mount(self) -> None:
        self.query_one("#to_label", Input).focus()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "send":
            self._submit()
        else:
            self.dismiss(None)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        inputs = self.query(Input)
        idx = next((i for i, w in enumerate(inputs) if w.id == event.input.id), -1)
        if idx == -1:
            return
        if idx + 1 < len(inputs):
            inputs[idx + 1].focus()
        else:
            self._submit()

    def _submit(self) -> None:
        to_label = self.query_one("#to_label", Input).value.strip()
        amount_str = self.query_one("#amount", Input).value.strip()
        desc = self.query_one("#description", Input).value.strip() or "request"
        if not to_label:
            self.app.notify("to-label required", severity="warning")
            return
        try:
            amount = float(amount_str)
        except ValueError:
            self.app.notify("amount must be a number", severity="warning")
            return
        self.dismiss((to_label, amount, desc))


def run(label: str) -> None:
    BunqTUI(label).run()
