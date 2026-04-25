# bunq flatmate — AI agent design

Status: design approved, pending implementation plan.
Date: 2026-04-25.

## Goal

An invisible, in-app AI copilot that lives behind the existing `ChatBar` /
`AIWindow`. It supports three classes of user scenarios:

1. **Read queries** — "check what we have with lena" → agent calls read tools,
   answers in text.
2. **Action proposals** — "settle up with lena", "request 40 from alex" →
   agent prepares an action; the chat shows a card with a button; tapping the
   button opens an existing app page (request/split form, item detail, camera)
   already pre-filled with the agent's payload. The user reviews and submits
   on that page; the AI flow never mutates directly.
3. **Page writes** — when the user is already on a screen with a write-back
   contract (receipt review, request/split form), the agent mutates the
   screen's local state in place via a typed patch.

Plain text streams as text deltas. Mutations only happen by user action on an
existing page — there is no bespoke approval modal in the AI flow.

The agent must always know who the current user is, and must thread parent
post linkage (`parent_post_id`) through receipt-from-post flows so created
splits remain anchored to their feed post.

## Non-goals (v1)

- No proactive / ambient triggers — the agent only acts on a user message.
- No persistent server-side session — every turn is a one-shot agent call
  with conversation history sent in.
- No transcribe-drive — speech-to-text already happens on the client before
  the message reaches the agent.
- No agent-driven nudges of pending requests, no multi-step plans
  ("settle up with everyone at once"), no feed-originated `scan` emission.
- No multi-tab session sync — each tab is its own conversation thread.
- The legacy `aiMockReply` mock and its `nudge` / `settle` action kinds go away.

## Architecture

```
┌────────────────────── Frontend (React, code/ui/src) ─────────────────────┐
│                                                                           │
│  ChatBar ──► dispatch 'bunq:ai-send' { text }                             │
│                       │                                                   │
│                       ▼                                                   │
│  AIController (in App.jsx, replacing the aiMockReply path)                │
│   • snapshot = pageContextRegistry.snapshot()                             │
│   • if hash(snapshot) === lastSentHash → omit page_context (server reads  │
│     "unchanged from last turn")                                           │
│   • POST /ai/chat (SSE) with { message, history, page_context?,           │
│                                client_turn_id }                           │
│   • streams events back, applies them:                                    │
│       - text_delta  → updates aiTail + aiMessages                         │
│       - tool_use    → tail status line ("checking splits…")               │
│       - action      → appends to message as AIActionCard                  │
│       - page_patch  → pagePatchBus.emit(kind, payload)                    │
│       - error       → red tail                                            │
│       - done        → finalize message                                    │
│                                                                           │
│  pageContextRegistry: { register(pageId, getContext), unregister(pageId), │
│                         snapshot() }                                      │
│  pagePatchBus:        { on(kind, handler), emit(kind, payload) }          │
│                                                                           │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │ POST /ai/chat (SSE)
                                     ▼
┌────────────────────── Backend (FastAPI, code/core) ──────────────────────┐
│                                                                           │
│  POST /ai/chat                                                            │
│   deps: current_user, current_house, get_db                               │
│   body: { message, history[], page_context?, client_turn_id }             │
│                                                                           │
│   ▼                                                                       │
│  AgentRunner.run(...)  (services/ai_agent/runner.py)                      │
│   • build per-request mcp server with @tool functions closed over         │
│     (user, house, db, turn_id, sse_queue)                                 │
│   • call claude_agent_sdk.query(...) once                                 │
│   • async-iterate messages, translate → typed SSE events                  │
│                                                                           │
│   read tools (no side effects):                                           │
│     list_splits, get_split, list_housemates, get_housemate,               │
│     get_balance_with, list_requests_with, list_recent_payments            │
│                                                                           │
│   emitter tools (produce SSE events, never mutate):                       │
│     emit_action(kind, payload, summary)                                   │
│     apply_page_patch(kind, payload)                                       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

Key properties:

- One agent invocation per user turn. History sent in. Stateless server.
- Anthropic prompt caching on system prompt + tool definitions + history
  prefix — re-rendered system prompt is identical across turns for the same
  user, so the cache hit is automatic.
- Mutations only happen when the user taps an action card (which opens an
  existing page) or submits an existing form. Emitter tools never write.
- The agent cannot impersonate another user: tools close over the resolved
  `(user, house, db)` and never accept a user id as an argument.

## Backend

### File layout

```
code/core/services/ai_agent/
  __init__.py
  runner.py        # AgentRunner.run(...) async generator
  tools.py         # @tool definitions + create_sdk_mcp_server factory
  prompts.py       # SYSTEM_PROMPT template + page-context renderer
  events.py        # typed SSE event dataclasses + serializer
  validators.py    # action / page_patch payload validation per kind
  logging.py       # turn_id helpers, structured emitters
code/core/api/
  ai.py            # POST /ai/chat (SSE), wires deps → AgentRunner
```

### Endpoint

```
POST /ai/chat
  Content-Type: application/json
  Response:     text/event-stream

  Request body:
    {
      "message": str,
      "history": [{"role": "user"|"ai", "text": str}, ...],
      "page_context": {"page_id": str, "data": dict} | null,
      "client_turn_id": str
    }
```

The route registers in `code/core/api/main.py` next to the other routers.

### AgentRunner

```python
async def run(*, message, history, page_context, user, house, db) -> AsyncIterator[Event]:
    turn_id = uuid4().hex[:8]
    log.info("turn.start", extra={
        "turn_id": turn_id, "user_id": user.id, "user_name": user.name,
        "page_id": (page_context or {}).get("page_id"),
        "msg_chars": len(message), "history_n": len(history),
    })

    sse_queue: asyncio.Queue[Event] = asyncio.Queue()
    mcp = build_mcp_server(user=user, house=house, db=db,
                           turn_id=turn_id, sse_queue=sse_queue)

    options = ClaudeAgentOptions(
        system_prompt=render_system_prompt(user=user, house=house),
        model=settings.anthropic_model,
        mcp_servers={"bunq": mcp},
        allowed_tools=ALL_TOOL_NAMES,
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=8,
        env={"ANTHROPIC_API_KEY": settings.anthropic_api_key},
    )

    user_msg = render_user_msg(message=message, page_context=page_context, history=history)
    # `render_user_msg` inlines `page_context` (when provided) into the user
    # message body as JSON-tagged text, e.g.:
    #     [page: receipt_review]
    #     {...page data json...}
    #
    #     <message>
    # Because page_context is part of the user message, prior turns' contexts
    # remain in conversation history naturally. When this turn's page_context
    # is null (frontend suppressed it because the hash matched), the agent
    # still has the most recent context from the prior user message in history.

    try:
        async for msg in query(prompt=user_msg, options=options):
            for ev in translate_sdk_message(msg, turn_id):
                log.debug("event.sent", extra={"turn_id": turn_id, **ev.log_dict()})
                yield ev
            # drain any side-effect events emitted by tools during this step
            while not sse_queue.empty():
                ev = sse_queue.get_nowait()
                log.debug("event.sent", extra={"turn_id": turn_id, **ev.log_dict()})
                yield ev
    except Exception:
        log.exception("turn.error", extra={"turn_id": turn_id})
        yield ErrorEvent(message="agent failed")
    finally:
        log.info("turn.end", extra={"turn_id": turn_id})
        yield DoneEvent(turn_id=turn_id)
```

### Tools

All tools are in-process Python functions registered as `@tool` and exposed
via `create_sdk_mcp_server`. Each tool body is wrapped in `try/except` →
returns `{"error": "<msg>", ...}` to the agent on failure. Tracebacks logged
at `ERROR`. Validation failures logged at `WARN` with the offending payload.

#### Read tools (no side effects)

| Tool | Args | Returns |
|---|---|---|
| `list_splits` | `mine_only: bool = True` | `[{id, title, payer:{id,name}, total, currency, requests:[{id, debtor:{id,name}, amount, status}], settled, created_at}]` |
| `get_split` | `split_id: str` | one split detail (same shape) |
| `list_housemates` | — | `[{id, name, bunq_label}]` |
| `get_housemate` | `name_or_id: str` | one housemate (fuzzy by name; exact by id) or `{error: "not found"}` |
| `get_balance_with` | `name_or_id: str` | `{counterparty:{id,name}, net_amount, currency, breakdown:[{split_id, title, amount, direction}]}` (positive = they owe me) |
| `list_requests_with` | `name_or_id: str, status: 'pending'|'all' = 'pending'` | `[{request_id, split_id, split_title, direction:'incoming'|'outgoing', counterparty:{id,name}, amount, currency, status, settled, created_at}]` |
| `list_recent_payments` | `count: int = 20` | from `bunq_client` |

#### Emitter tools (never mutate)

```
emit_action(kind, payload, summary)
  Forwards a typed SSE 'action' event. Returns "action_emitted" to the agent.
  Validates `payload` against the schema for `kind` before forwarding;
  returns {"error": "...", "details": ...} if invalid.

  Supported kinds:
    request:     {to_user_id, amount, currency?='EUR', title?, description?}
    split:       {payer_user_id, participant_user_ids:[...],
                  total, currency?='EUR',
                  parent_post_id?,           ← NEW: links the split to a feed post
                  title?, description?}
    pay_request: {request_id}                ← settle ONE specific pending request
    scan:        {}                           ← opens camera

apply_page_patch(kind, payload)
  Forwards a typed SSE 'page_patch' event. Returns "patch_emitted" to the
  agent. Validates `payload` against the schema for `kind` and the current
  page's known structure before forwarding.

  Supported kinds:
    receipt_assignments  (only valid when current page_id == 'receipt_review')
      {assignments: { [line_id]: assignee_id | "everyone" | null }}

    request_form_fill    (only valid when current page_id == 'request_form')
      {mode?, payer_id?, debtors?:[{id, amount?}],
       total?, title?, description?}    ← sparse merge (only listed fields change)
```

`emit_action(pay_request)` validates that `request_id` exists, belongs to the
current user's house, and is `pending` — otherwise returns `{error}` to the
agent so it doesn't render a dead card.

`apply_page_patch(receipt_assignments)` validates every `line_id` against the
current page's `data.line_items` and every assignee value against
`data.roster ∪ {"everyone", null}`. The validator is shared with — and lifted
from — `services/ai_assigner.py:_schema()`.

**Validation when `page_context` is null this turn (hash-suppressed):** the
validator does structural-only checks (the payload's shape matches the kind's
schema) and skips cross-checks against page data. The agent has the prior
turn's context in conversation history (because it was inlined into that
user message), so the patch is still grounded — we just can't second-guess
ids server-side. A patch the page can't apply is a silent no-op on the
client; it is not a correctness hazard.

### System prompt

`render_system_prompt(user, house)` produces (concrete final text TBD during
implementation; load-bearing rules below):

```
You are the bunq flatmate copilot — an in-app AI agent inside a house-finance
app for housemates splitting expenses via bunq RequestInquiries.

Voice: short, casual lowercase. No emojis. Match the app tone.

Current user: <user.name> (id: <user.id>, bunq_label: <user.bunq_label>)
This is the person typing to you. "I", "me", "my" in the user's messages
refer to this person. The read tools you call are already scoped to this user
and their house — you cannot and need not pass a user id or house id to them.

Current house: <house.name>

You may receive PAGE CONTEXT describing what the user currently sees. Use it
ONLY if the user's message references the screen. Do not narrate the page
unprompted. If page_context is absent, treat it as "unchanged from the last
turn" — refer to your prior context if needed.

You have read tools (cheap — call as needed) and TWO emitter tools that
produce UI side-effects:

  emit_action(kind, payload, summary):
    Renders a card in chat with a button. Tapping the card opens an existing
    page already pre-filled with `payload`. Use this when the user is NOT
    already on the matching form. `summary` is a one-line label rendered on
    the card (e.g. "settle €80,20 with lena").

    Kinds:
      - request:     {to_user_id, amount, ...}
      - split:       {payer_user_id, participant_user_ids:[...], total,
                      parent_post_id?, ...}
      - pay_request: {request_id}    ← settle ONE specific pending request
      - scan:        {}

  apply_page_patch(kind, payload):
    Mutates the screen the user is already on. Use this only when
    page_context indicates the matching page is open.

    Kinds:
      - receipt_assignments  (page_id == 'receipt_review')
      - request_form_fill    (page_id == 'request_form')

Decision rules:
- Settling: compute net via get_balance_with. If user is owed → emit_action
  'request'. If user owes → emit_action 'pay_request' with the specific
  request_id from list_requests_with. For "settle the X for Y" prefer
  pay_request with that specific request_id.
- Receipt-from-post matching: when receipt_review page context contains
  post_context, use the post text + comments to match line items to
  commenters before falling back to "everyone" or null.
- When you create a `split` action and the page context is `feed_post_detail`
  or `receipt_review.post_context` is present, include `parent_post_id` so
  the resulting split links back to the post.
- Never invent ids or amounts — only use values returned by tools or present
  in page context.
- After emit_action or apply_page_patch, stop. One short text line is fine;
  do not restate the payload — the card / page does that.
- If a tool errors, surface the error briefly and stop. Do not retry blindly.
```

### SSE event types

```
event: text_delta      data: {"text": "drafting…"}
event: tool_use        data: {"tool": "list_splits", "args": {...}}
event: tool_result     data: {"tool": "list_splits", "ok": true, "ms": 12}
event: action          data: {"kind": "request", "summary": "...", "payload": {...}}
event: page_patch      data: {"kind": "receipt_assignments", "payload": {...}}
event: error           data: {"message": "..."}
event: done            data: {"turn_id": "...", "stop_reason": "end_turn"}
```

`event.sent` is logged at DEBUG for every event. `done` is the last event the
client sees; the server closes the stream after sending it.

**Keepalive.** The runner sends an SSE comment (`: ping\n\n`) every 15 seconds
while the agent is mid-tool-call to prevent intermediate proxies from idling
the connection during long-running tool work (e.g. bunq round-trips).

### Auth

- `POST /ai/chat` uses existing FastAPI deps: `current_user`, `current_house`,
  `get_db`, `get_bunq_client`. Anonymous → 401, same as every other route.
- Tools close over `(user, house, db)` and do not accept a user id or house
  id as input — there is no way for the agent to read another user's data.
- Bunq operations scoped to `user.bunq_label` only.

### Logging contract

Logger: `bunq.ai`. Structured fields with `turn_id` per turn.

| Event | Level | Fields |
|---|---|---|
| `turn.start` | INFO | `turn_id, user_id, user_name, page_id, msg_chars, history_n` |
| `tool.call` | DEBUG | `turn_id, tool, args` |
| `tool.result` | DEBUG | `turn_id, tool, ok, ms, summary` |
| `tool.error` | ERROR | `turn_id, tool, args` + traceback |
| `event.sent` | DEBUG | `turn_id, type, ...payload` |
| `turn.aborted` | INFO | `turn_id` |
| `turn.error` | ERROR | `turn_id` + traceback |
| `turn.end` | INFO | `turn_id, duration_ms, n_events` |

Tracebacks via `log.exception(...)` on any caught exception.

## Frontend

### Page-context contract

Each screen, on mount, calls `pageContextRegistry.register(pageId, getContext)`.
On unmount, deregister. The registry holds one active page at a time (the
topmost-open one); `snapshot()` returns `{ page_id, data }` or `null`.

| `page_id` | `data` shape (read) | Accepted `page_patch` kinds |
|---|---|---|
| `home` | `{balance, pending_in_count, pending_out_count, unsettled_total, top_counterparty?}` | — |
| `mate_detail` | `{mate:{id,name}, net_balance, recent_items:[{id, kind, title, amount}]}` | — |
| `item_detail` | `{split:{id, title, payer:{id,name}, total, currency, requests:[{id, debtor:{id,name}, amount, status}], settled}}` | — |
| `feed_post_detail` | `{post_id, post_text, author:{id,name}, comments:[{author:{id,name}, text}]}` | — |
| `receipt_review` | `{scan_id, total, currency, line_items:[{id, name, price, assignee_id\|null}], roster:[{id,name}], uploader_id, post_context?:{post_id, post_text, author, comments}}` | `receipt_assignments` |
| `request_form` | `{mode:'request'\|'split', draft:{payer_id, debtors:[{id, amount?}], total?, title?, description?}}` | `request_form_fill` |

`post_context` on `receipt_review` is populated when the scan flow was
entered from a feed post. Frontend implementation thread:
`ThreadPage` "scan for this post" → camera state carries `parent_post_id` +
post snapshot → receipt review screen reads it from scan state and includes
it in its registered context getter.

### Snapshot suppression

Frontend hashes the snapshot via stable JSON-stringify. On send, if
`hash === lastSentHash`, the request body omits `page_context` entirely.
Backend treats absent `page_context` as "unchanged from last turn".

### New frontend modules

```
code/ui/src/ai/
  aiClient.js              # chat({message, history, page_context, signal}) → async iterator of typed events
  pageContextRegistry.js   # register / unregister / snapshot / lastHash
  pagePatchBus.js          # on(kind, handler) / emit(kind, payload)
  log.js                   # tagged debug logger ('[ai] ...')
```

`aiClient.js` opens `POST /ai/chat`, parses SSE frames, yields typed event
objects. Cancel via `AbortSignal`. Logs every event via `log.event(...)`.

### Send handler (in `BunqFlatmateApp`)

Replaces the `aiMockReply` block:

```js
const onSend = async (e) => {
  const text = e?.detail?.text?.trim();
  if (!text) return;
  setAiMessages(m => [...m, { role: 'me', text }]);
  setAiPreviewHidden(false);
  setAiTail({ kind: 'thinking' });

  const turnId = crypto.randomUUID();
  const snap = pageContextRegistry.snapshot();
  const hash = snap ? stableHash(snap) : null;
  const sendCtx = hash !== lastCtxHashRef.current;
  lastCtxHashRef.current = hash;

  log.send(turnId, text, snap?.page_id, sendCtx);

  let textBuf = '', pending = null;
  try {
    for await (const ev of aiClient.chat({
      message: text,
      history: aiMessages.slice(-20),
      page_context: sendCtx ? snap : null,
      client_turn_id: turnId,
    })) {
      log.event(turnId, ev);
      switch (ev.type) {
        case 'text_delta':  textBuf += ev.text; setAiTail({ kind: 'streaming', text: textBuf }); break;
        case 'tool_use':    setAiTail(t => ({ ...t, status: friendlyStatus(ev.tool) })); break;
        case 'tool_result': /* clear status */ break;
        case 'action':      pending = ev; break;
        case 'page_patch':  pagePatchBus.emit(ev.kind, ev.payload); break;
        case 'error':       setAiTail({ kind: 'error', text: ev.message }); break;
        case 'done': {
          const wired = pending ? wireAction(pending, handleAiAction) : null;
          setAiMessages(m => [...m, { role: 'ai', text: textBuf, action: wired }]);
          setAiTail({ kind: 'done', text: textBuf, action: wired });
          break;
        }
      }
    }
  } catch (err) {
    log.error(turnId, err);
    setAiTail({ kind: 'error', text: 'agent failed — try again' });
  }
};
```

### Action dispatch

```js
const handleAiAction = (a) => {
  log.actionTap(a);
  switch (a.kind) {
    case 'request':     openForm('request', { prefill: a.payload }); break;
    case 'split':       openForm('split',   { prefill: a.payload }); break;
    case 'pay_request': openItemForRequest(a.payload.request_id); break;
    case 'scan':        setScanPhase('camera'); break;
    default:            setAiOpen(true);
  }
};
```

`openForm` is extended to accept a `prefill` object;
`RequestSplitForm` reads `prefill` once on open and hydrates draft state.
`openItemForRequest(rid)` looks up the parent split locally and opens
`ItemPage` scrolled to the matching child request.

### AIActionCard kinds

`AIActionCard` (existing in `components.jsx`) is extended to render preview
kinds: `request`, `split`, `pay_request`, `scan`. The legacy `settle` and
`nudge` kinds and the `aiMockReply` function are removed.

| Kind | Card preview |
|---|---|
| `request` | avatar(to_user) + amount + title |
| `split` | "split €N · M people" + first 3 avatars |
| `pay_request` | resolved locally: split title + counterparty + amount |
| `scan` | "open camera" |

### Per-page wiring

| Page | On mount | Patch handler |
|---|---|---|
| `HomeScreen` | `register('home', () => ({...}))` | — |
| `MatePage` | `register('mate_detail', ...)` while open | — |
| `ItemPage` | `register('item_detail', ...)` while open | — |
| `ThreadPage` (feed post detail) | `register('feed_post_detail', ...)` while open | — |
| Receipt review (in `ScanFlow`) | `register('receipt_review', ...)` while review phase | `bus.on('receipt_assignments', applyAssignments)` |
| `RequestSplitForm` | `register('request_form', ...)` while open | `bus.on('request_form_fill', applyDraftPatch)` |

### Frontend logging contract

- `[ai] send turn=… page=… ctx=sent|skipped`
- `[ai] event turn=… type=… …`
- `[ai] action.tap kind=… payload=…`
- `[ai] page_patch.apply kind=… page=… ok=…`
- `[ai] error turn=… …`

Toggleable via `localStorage.setItem('ai_debug', '1')` (default on for now).

## End-to-end flow examples

### A. "check what we have with lena" (read query)

1. User on Home types "check what we have with lena".
2. Snapshot = `{page_id: 'home', data: {...}}`. Sent (first turn).
3. Backend: `turn.start`. Agent calls `get_housemate("lena")`, then
   `list_requests_with("usr_lena", "pending")`, then `get_balance_with("usr_lena")`.
4. SSE: `text_delta` ("you have 2 open with lena…"), `done`.
5. No action card (it's a read query). User sees the answer in the tail.

### B. "settle up with lena" (action proposal)

1. User on Home types "settle up with lena".
2. Agent calls `get_balance_with("lena")` → net `+€80.20` (lena owes me).
3. Agent calls `emit_action("request", {to_user_id, amount: 80.20, title: "settle up"}, "settle €80,20 with lena")`.
4. SSE: `text_delta` ("drafted…"), `action`, `done`.
5. Frontend renders `AIActionCard` with the request preview. User taps.
6. `handleAiAction` → `openForm('request', { prefill: payload })`.
7. `RequestSplitForm` opens pre-filled. User reviews and submits via the
   existing form CTA. The actual `POST /requests` fires from the form
   submit handler — same as it does today.

### C. "pay alex back the €12 for pizza" (specific pay)

1. Agent calls `get_housemate("alex")` and `list_requests_with("alex", "pending")`.
2. Sees a pending outgoing of €12 titled "pizza night".
3. Agent calls `emit_action("pay_request", {request_id}, "pay €12 for pizza")`.
4. User taps card → `openItemForRequest(request_id)` → `ItemPage` opens for
   that split, scrolled to the alex request line. User taps the existing
   pay action there.

### D. "split everything 4 ways, beer is mine" (page write — receipt)

1. User on receipt review (post-scan, items parsed, roster present).
2. Snapshot = `{page_id: 'receipt_review', data: {scan_id, line_items[…with current assignments…], roster, uploader_id, post_context?}}`. Sent.
3. Agent reads context, makes no read tool calls, calls
   `apply_page_patch("receipt_assignments", {assignments: {…}})`.
4. Tool body validates line_ids and assignee values; forwards SSE.
5. `pagePatchBus.emit('receipt_assignments', payload)` → review screen
   shallow-merges into local `assignments` state. UI updates instantly.
6. Agent emits one short text confirmation, stops.
7. User reviews and taps existing finalize CTA.

### E. Receipt-from-post matching

1. Feed post: alex posts "going to AH". Comments: lena "milk", marco "bananas + chocolate", anton "no thanks".
2. Alex taps "scan for this post" → camera flow opens with `parent_post_id`
   threaded through state.
3. After parse, receipt review opens. Its `getContext()` includes
   `post_context: {post_id, post_text, author: alex, comments}`.
4. Alex types: "split per the comments".
5. Agent reads context, matches "milk" line → lena, "bananas" + "chocolate"
   → marco, leaves alex's own items unassigned (they're the uploader / payer),
   `apply_page_patch('receipt_assignments', …)`.
6. On finalize, the split is created with `parent_post_id` set.

## Error handling

| Failure | Where caught | What user sees | Log |
|---|---|---|---|
| Tool raises | tool wrapper returns `{error}` to agent | depends on agent's reply | `tool.error` ERROR + traceback |
| Emitter validation fails | tool returns `{error, details}` to agent | agent text only | WARN with payload |
| Anthropic 429 / timeout / network | runner catches → SSE `error` event, closes stream | red tail "agent failed — try again" | `turn.error` ERROR |
| Bunq API down | bunq tool returns `{error}` | agent text | ERROR |
| Frontend disconnect | `AbortController` on the next send; backend logs `turn.aborted` | (already gone) | INFO |
| SSE parse error on client | client logs, surfaces error tail | red tail | `[ai] error` |

The runner is exception-safe by construction: `try/finally` around
`async for msg in query(...)` ensures SSE always closes and `turn.end` always
logs.

## Testing

### Backend

- Unit tests for each tool against a seeded test DB — happy path, unknown id,
  empty result, scoping isolation (cannot read a different house).
- Unit tests for `validators.py` per `kind` (action and page_patch).
- Runner integration test with `claude_agent_sdk.query` monkey-patched to
  yield a canned message stream — asserts SSE event sequence is what we
  expect for: read query, action emit, page patch, error.
- One smoke e2e test that hits a live model with fixed seed-data and asserts
  an `action` SSE event fires; gated behind an env var so it does not run on
  CI by default.

### Frontend

- Unit tests for the SSE parser in `aiClient.js`.
- Unit tests for `pageContextRegistry` (register/unregister, snapshot,
  hash-dedupe).
- Unit tests for `pagePatchBus`.
- Manual checklist for the canonical prompts ("check what we have with lena",
  "settle up with lena", "request 40 from alex", "split everything 4 ways,
  beer is mine") on the relevant page.

## Open questions for implementation

These are intentionally deferred to the implementation plan; the design above
does not depend on resolving them.

- Exact stable-hash function (likely `JSON.stringify` with sorted keys).
- Whether to keep `POST /scans/{id}/ai-assignments` (the "Ask AI" button
  shortcut) alongside the new agent path or deprecate it. Both work today;
  consolidation is non-blocking.
- `friendlyStatus(tool)` mapping table (e.g. `list_splits` → "checking
  splits…").
- Trim policy for `history` beyond the last 20 turns.

## Out of scope

The following are explicitly excluded from v1 and noted so they don't drift in:

- Proactive notifications, ambient triggers.
- Persistent server-side agent session.
- Voice transcription wiring inside the agent (already handled before send).
- Feed/post-aware emission of `scan` actions from `feed_post_detail`.
- Agent-driven nudges of pending requests.
- Multi-step plans ("settle with everyone at once").
- Multi-tab session sync.
