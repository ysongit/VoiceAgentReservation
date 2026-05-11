# Voice Agent Reservation — Backend

Node 20 + TypeScript + Express backend that serves as the tool-execution layer for a Vapi voice agent handling restaurant reservations. Stores tokens and reservations in Supabase; reads/writes Google Calendar events as the source of truth for availability. Single-restaurant v1.

## Stack

- Node 20+, TypeScript (strict, ESM), Express 4
- pnpm
- `@supabase/supabase-js` (service role on server)
- `googleapis` (Calendar v3)
- `zod` validation, `date-fns` + `date-fns-tz` for timezone-correct datetimes
- `pino` logging

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Supabase

Create a project at <https://supabase.com>. In the SQL editor, paste and run [`supabase/schema.sql`](supabase/schema.sql). Then grab:

- Project URL → `SUPABASE_URL`
- `service_role` key (Settings → API) → `SUPABASE_SERVICE_ROLE_KEY`

> The service role key bypasses RLS. Keep it server-side only.

### 3. Google Cloud OAuth

1. Go to <https://console.cloud.google.com/> → create / pick a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen**: External, fill required fields, add your Google account as a test user (until you publish). Scope: `https://www.googleapis.com/auth/calendar`.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback` (and your production URL when deploying).
5. Copy client ID/secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redirect URI goes in `GOOGLE_REDIRECT_URI`.

### 4. Environment

```bash
cp .env.example .env
# fill in values
```

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `PUBLIC_BASE_URL` | Public URL the server is reachable at (used in logs / future links) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase connection |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth client |
| `RESTAURANT_ID` | Logical id; primary key in `oauth_tokens`. Anything stable. |
| `RESTAURANT_NAME` / `RESTAURANT_TIMEZONE` | Display name + IANA tz like `America/New_York` |
| `RESTAURANT_MAX_PARTY_SIZE` | Hard cap, larger parties get rejected |
| `RESTAURANT_OPEN_HOUR` / `RESTAURANT_CLOSE_HOUR` | Local hours; `CLOSE_HOUR` is the latest *start time* allowed (last seating) |
| `RESERVATION_DURATION_MINUTES` | Length of one reservation; freebusy window |
| `VAPI_WEBHOOK_SECRET` | Optional. If set, webhook requires `x-vapi-secret` header matching this value. |

### 5. Run

```bash
pnpm dev      # tsx watch
# or
pnpm build && pnpm start
```

### 6. Connect Google Calendar

Open <http://localhost:3000/auth/google> in a browser. Approve. The callback page should confirm tokens stored. Behind the scenes a row appears in `oauth_tokens` with `restaurant_id = RESTAURANT_ID`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | `{ ok: true }` |
| `GET` | `/auth/google` | Redirect to Google consent |
| `GET` | `/auth/google/callback` | Token exchange + storage |
| `POST` | `/vapi/tools` | Vapi tool webhook (5 tools) |
| `GET` | `/admin/reservations?from=&to=` | List reservations (no auth — local only) |
| `GET` | `/admin/reservations/:code` | Single reservation |

## Vapi webhook

`POST /vapi/tools`. Request shape (Vapi current):

```json
{
  "message": {
    "type": "tool-calls",
    "toolCallList": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "check_availability",
          "arguments": { "date": "2026-05-15", "time": "19:00", "party_size": 4 }
        }
      }
    ]
  }
}
```

`arguments` may arrive as a JSON object OR a JSON-encoded string — both handled.

Response:

```json
{
  "results": [
    { "toolCallId": "call_abc123", "result": "Yes, 7:00 PM on Friday, May 15 is available for 4 people." }
  ]
}
```

`result` is always a plain string — the LLM reads it directly.

### Tool definitions

See [`vapi/tools.json`](vapi/tools.json). Tool names match the dispatcher in [`src/routes/tools.ts`](src/routes/tools.ts).

### Sample curl

```bash
# check_availability
curl -s -X POST http://localhost:3000/vapi/tools \
  -H 'content-type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "test1",
        "type": "function",
        "function": {
          "name": "check_availability",
          "arguments": { "date": "2026-05-15", "time": "19:00", "party_size": 4 }
        }
      }]
    }
  }'

# create_reservation
curl -s -X POST http://localhost:3000/vapi/tools \
  -H 'content-type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [{
        "id": "test2",
        "type": "function",
        "function": {
          "name": "create_reservation",
          "arguments": {
            "customer_name": "Jane Doe",
            "party_size": 4,
            "date": "2026-05-15",
            "time": "19:00",
            "phone": "+15551234567"
          }
        }
      }]
    }
  }'
```

If `VAPI_WEBHOOK_SECRET` is set, add `-H 'x-vapi-secret: <value>'`.

## Verification

1. `pnpm install`
2. Run [`supabase/schema.sql`](supabase/schema.sql) in Supabase
3. `cp .env.example .env` and fill in values
4. `pnpm dev`
5. `curl http://localhost:3000/healthz` → `{"ok":true}`
6. Browser to `http://localhost:3000/auth/google` → complete OAuth → see success page
7. Curl `check_availability` (above) → JSON `result` string
8. Curl `create_reservation` (above) → confirmation code; verify event appears in your Google Calendar
9. `curl http://localhost:3000/admin/reservations` → returns the new reservation

## Design decisions

- **Single-calendar capacity**: any `freebusy` hit inside `[start, start + duration)` marks the slot unavailable. This is v1 — one party at a time. Slot/table-based capacity is the next iteration.
- **`CLOSE_HOUR` semantics**: treated as the latest allowed *start* hour (last seating). With `CLOSE_HOUR=22` and `DURATION=90`, a 22:00 booking is valid and ends at 23:30.
- **Confirmation codes**: 6 characters from a 32-char alphabet (excludes `0/O/1/I` for voice clarity). Insert retries on the rare unique-constraint collision (up to 5 times).
- **Booking transactionality**: the reservation row is inserted *before* the calendar event is created. If event creation fails, you'll see a DB row with `calendar_event_id=NULL` — easier to detect and reconcile than orphaned calendar events. A v2 outbox would close this gap.
- **Confirmation code lookup is case-insensitive**: voice transcripts arrive in arbitrary case; we uppercase server-side.
- **Cancellation is idempotent**: deleting an already-deleted calendar event (404/410) is treated as success; a reservation already marked `cancelled` returns a friendly message instead of erroring.
- **Webhook never 500s on tool errors**: every per-call error returns a natural-language `result` string so the agent can recover and apologize rather than the call dropping.
- **No auth on `/admin/*`**: local-only for v1. TODO at the top of [`src/routes/admin.ts`](src/routes/admin.ts).
- **Phone matching is exact**: no normalization in v1. Voice transcripts may include spaces / `+` differently; normalize on the way in before storing if this matters.

## Not built (deferred)

- Email / SMS notifications
- Admin UI / widget host page (backend only)
- Tests
- Docker, CI
- Rate limiting (TODO)
- Multi-restaurant
- Restaurant address — hardcoded `123 Main St` placeholder in [`src/tools/get-restaurant-info.ts`](src/tools/get-restaurant-info.ts)

## Project layout

```
src/
├── index.ts                # Express bootstrap
├── config.ts               # zod-validated env
├── lib/
│   ├── supabase.ts         # service-role client singleton
│   ├── logger.ts           # pino
│   └── datetime.ts         # tz-aware helpers
├── services/
│   ├── google-auth.ts      # OAuth client, token refresh
│   └── google-calendar.ts  # freebusy + events CRUD
├── routes/
│   ├── auth.ts             # /auth/google, /auth/google/callback
│   ├── tools.ts            # POST /vapi/tools webhook
│   └── admin.ts            # GET /admin/reservations
└── tools/
    ├── context.ts
    ├── check-availability.ts
    ├── create-reservation.ts
    ├── lookup-reservation.ts
    ├── cancel-reservation.ts
    └── get-restaurant-info.ts

supabase/schema.sql         # paste into Supabase SQL editor
vapi/tools.json             # tool defs for Vapi dashboard
```
