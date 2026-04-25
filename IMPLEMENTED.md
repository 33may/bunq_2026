# Implementation tracker

Mirrors design exports from Claude Design (claude.ai/design) into the React app at `code/ui`.
Update this file every time we port a new screen or component so design ↔ code stay aligned.

## Stack

- Vite + React 19 (no extra deps), entry `code/ui/src/App.jsx`, mounted by `src/main.jsx`
- Started as a single-file port of the `<script type="text/babel">` block from the design HTML.
  Now factoring shared primitives into `src/tokens.js` and `src/components.jsx`.
- `index.html` has the dark radial-gradient page bg from the design.

### Shared modules

- `src/tokens.js` — `BF_COLORS`, `SF`, `SFR`. Pure constants, no React.
- `src/components.jsx` — reusable primitives (also re-exports tokens):
  - `Avatar`, `Euro`, `Chip` (atoms)
  - `Card` — dark rounded container, optional left accent stripe, optional onClick
  - `List` + `ListRow` — grouped container that auto-injects dividers between rows;
    rows take `leading` / `title` / `titleAfter` / `sub` / `trailing` slots
  - `AIBadge` — lime-gradient sparkle tile (size + radius props)
  - `AIPlan` — full AI-authored block: badge + headline + sub + primary/secondary action.
    `bare` prop renders without its own `Card` wrapper (for nesting inside e.g. `PostCard`)
  - `ChatBar` — glassy input pill (arrow-up + text + mic) with `placeholder`;
    default tap dispatches the global `bunq:ai-open` event so the app root can
    open `AIWindow` without prop-drilling through screens
  - `timeLabel(offsetDays)` — relative day label helper (today / tomorrow / in N days / 22 apr)
- `src/ItemPage.jsx` — full item-detail sheet ported from `bunq item.html`.
  `<ItemPage item open onClose />`. Switches content by `item.type`: `planned`,
  `request`, `bill`, `subscription`, `completed`. Includes `ItemHero`, `ItemActions`,
  `ItemSection`, `Placeholder`, `StatusRow`, `TYPE_META`, plus per-type Content
  components. Currently fed from Planned / Completed / Requests row data on Home.
- `src/AIWindow.jsx` — slide-up sheet (95% of device, 5% peek above) with
  rounded top corners. AI greeting + suggestion chips + transcript + composer
  (input + arrow-up send button, no camera/mic in-conversation). Mocked replies.
  Triggered by `bunq:ai-open` event from any `ChatBar`.

When adding new screens, lean on these instead of redefining the same boxes inline.

## Run

```
cd code/ui
npm install
npm run dev      # http://localhost:5173
```

## Source of truth

- Design bundle URL: https://api.anthropic.com/v1/design/h/0F6GIcRNXsbsRk4fxkAb7w
- Local extracted copy: `/tmp/bunq-design/bunq-house/` (re-extract from any new bundle)
- Primary file ported: `bunq flatmate v2.html`

## Implemented

### From `bunq flatmate v2.html` (initial)

- iOS chrome: `IOSDevice`, `IOSStatusBar`, `IOSNavBar`, `IOSGlassPill`, `IOSList`,
  `IOSListRow`, `IOSKeyboard`, dynamic island, home indicator
- Tokens: `BF_COLORS`, `SF`, `SFR`
- Atoms: `Avatar`, `Euro`, `Chip`
- Feed screen pieces (defined but `HomeScreen` is what mounts): `MembersStrip`, `PostCard`,
  `InsightPost`, `BillPost`, `SubPost`, `RequestPost`, `Feed`, `TopBar`, `FeedScreen`
- Home screen (default tab, mounted): `HomeGreeting`, `BalanceHero`, `QuickActions` /
  `QuickActionsWired`, `Planned` (with `timeLabel`), `SpendSummary`, `Completed`,
  `Requests`, `ChatBar`, `TabBar`, `Dock`
- Scan flow: `ScanPhase`, `CameraScreen`, `ProcessingScreen`, `AssignPill`,
  `PeopleStrip`, `AddPersonSheet`, `AssignPicker`, `EditableText`, `ReviewScreen`
  (list / card / bill layouts), `SendingScreen`, `ScanFlow`
- Tweaks panel + postMessage protocol (`TweaksPanel`) — defaults: camera=minimal,
  review=card, AI=invisible
- Mock data: `MEMBERS`, `MOCK_RECEIPT_ITEMS`, `MOCK_RECEIPT_TOTAL`,
  `MOCK_RECEIPT_META`, `ME_PERSON`, `HOUSEMATES_POOL`, `EXT_COLORS`, `RECEIPT_LINES`
- Root: `BunqFlatmateApp` mounts `HomeScreen` + scan-flow overlay

### From `bunq item.html`

- `TYPE_META`, `ItemSection`, `Placeholder`, `StatusRow`, `ItemContent`,
  `ItemActions`, `ItemHero`, `ItemPageHeader`, `ItemPage`
- Per-type content: `PlannedContent`, `RequestContent`, `BillContent`
  (placeholder), `SubscriptionContent` (placeholder), `CompletedContent`
- Planned / Completed / Requests row data extended with `id`, `type`, `emoji`,
  `description`, `hasReceipt`, `myItems`, `message`, `total`
- `Planned`, `Completed`, `Requests`, `HomeScreen` accept `onOpen` and tap-open
  the row's item in the shared sheet. `BunqFlatmateApp` owns `selectedItem` /
  `itemOpen` state with the same open/close animation timing as the design.

### Custom (not from a design export)

- `AIWindow` (`src/AIWindow.jsx`) — sheet at 95% device height, 5% peek above,
  rounded top corners. Chat composer with arrow-up send. Mocked AI replies.
  Triggered by tapping any `ChatBar`.

## Known design files NOT yet pulled in

These exist in the bundle but aren't wired up yet:

- `bunq flatmate.html` (v1 / feed-first variant) — `FeedScreen` is in our App.jsx as dead code
- `bunq feed.html` (chat 3 — feed redesign with AI everywhere)
- `House Brain.html`
- `feed-screen.jsx`, `home-minimal.jsx`, `home-screen.jsx`, `home-tab.jsx`,
  `ios-frame.jsx`, `scan-flow.jsx` (all source for the prototypes above)

## Conventions when adding more

- Keep the design-faithful inline-style approach. Don't refactor to CSS modules / Tailwind
  unless we agree on it — the design exports are inline-styled and we want diffs to be obvious.
- New screens go into `src/App.jsx` for now. Reuse `Card` / `List` / `ListRow` /
  `AIPlan` / `AIBadge` / `ChatBar` from `./components` instead of pasting raw inline boxes.
- When a new design export lands, prefer pasting new component bodies in alongside the
  existing ones rather than rewriting from scratch — easy to spot drift.
- Update this file's "Implemented" / "NOT yet pulled in" lists in the same change.

## Change log

- 2026-04-24 — initial port of `bunq flatmate v2.html` (Home + scan flow + tweaks).
- 2026-04-24 — `Dock` lifted to app root (absolute, z 250) so it stays put across
  Home / AIWindow / ItemPage. `ChatBar` `aiOpen` flips arrow-up → chevron-down via
  CSS rotation; tap dispatches `bunq:ai-toggle`. AIWindow no longer has its own
  composer (root Dock owns it) and ends above the dock so the dock is fully
  visible. Underlying scroll is frozen (`overflow:hidden` wrapper) when AIWindow
  or ItemPage is open. Replaced `bunq:ai-open` event with `bunq:ai-toggle`.
- 2026-04-24 — `AIWindow` height → 90%; sheet bg → `cardElev` so it separates
  from page black; added a soft lime radial glow at the top to signal AI surface.
- 2026-04-24 — `AIWindow` height 95% → 85%; removed header close button;
  the top grab handle is now the close affordance.
- 2026-04-24 — ported `bunq item.html`: `ItemPage` + per-type content lives in
  `src/ItemPage.jsx`; Home rows are tappable. Added `AIWindow` (95% sheet, chat
  composer with arrow-up send) wired to a global `bunq:ai-open` event so any
  `ChatBar` opens it. Added `paddingLeft: 6` between ChatBar arrow-up and text.
- 2026-04-24 — `ChatBar` leading icon swapped from camera to arrow-up.
- 2026-04-24 — extracted shared primitives into `src/tokens.js` + `src/components.jsx`
  (`Avatar`, `Euro`, `Chip`, `Card`, `List`, `ListRow`, `AIBadge`, `AIPlan`, `ChatBar`);
  refactored `PostCard`, `InsightPost`, `Planned`, `Completed`, `Requests` to use them.
  Bumped Review dock padding (18/36) and ChatBar↔CTA gap to 14.
- 2026-04-24 — `ChatBar` now takes a `placeholder` prop; rendered above the Review
  sticky CTA so the AI bar follows the user across screens. Context-aware placeholder
  text. Bumped Review scroll padding to 190 to clear the dock.
- 2026-04-24 — scan flow now replaces `HomeScreen` instead of overlaying it
  (`BunqFlatmateApp` render), so the underlying page can't be scrolled / peeked through.

### AI agent integration (2026-04-25)

- Backend: `code/core/services/ai_agent/` — `runner.py` (per-turn SSE generator
  over `claude-agent-sdk`), `tools.py` (in-process `@tool` MCP server with
  read tools + `emit_action` / `apply_page_patch` emitters), `prompts.py`
  (system prompt + user-msg renderer with inline page context), `validators.py`
  (action / page_patch payload schemas), `events.py` (typed SSE events),
  `reads.py` (read accessors over splits / housemates / balance / requests),
  `translator.py` (SDK message → SSE event mapper), `logging.py`.
- New endpoint: `POST /ai/chat` (SSE) wired through existing `current_user` /
  `current_house` deps.
- `POST /splits` and `POST /scans/{id}/finalize` now accept optional
  `parent_post_id` so splits created from a feed-post-driven scan link back.
- Frontend: `code/ui/src/ai/` — `aiClient.js` (SSE async iterator),
  `pageContextRegistry.js` (per-page register / snapshot / hash-dedupe),
  `pagePatchBus.js` (pub/sub for page patches), `log.js` (`[ai]`-tagged
  console debug, `localStorage.ai_debug` toggle).
- `BunqFlatmateApp` send handler replaced: real streaming agent with
  `text_delta` / `tool_use` / `action` / `page_patch` / `done` events.
  Action card kinds: `request`, `split`, `pay_request`, `scan` — each opens
  the existing pre-filled page when tapped. Patch kinds: `receipt_assignments`
  (in receipt review), `request_form_fill` (in `RequestSplitForm`).
- Per-page registration: `HomeScreen`, `MatePage`, `ItemPage`, `ThreadPage`,
  `ReviewScreen` (receipt review), `RequestSplitForm`. Snapshot is hash-deduped
  across turns so unchanged pages don't re-send context.
- Feed → camera → review thread: `ThreadPage` "scan a receipt for this"
  button → `BunqFlatmateApp.scanPostContext` → `ScanFlow` → attaches to scan
  → `ReviewScreen` exposes `post_context` to the agent → finalize forwards
  `parent_post_id`.
- Tests: 64 backend tests (validators, reads, events, prompts, tools,
  translator, runner, `/ai/chat` integration, `parent_post_id` round-trip).
  Live-model smoke (`-m live`) gated.
- Spec: `docs/superpowers/specs/2026-04-25-bunq-ai-agent-design.md`.
- Plan: `docs/superpowers/plans/2026-04-25-bunq-ai-agent.md`.
