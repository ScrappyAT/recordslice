# recordslice — Documentation

Assessment 4: The Records and Access Slice. Records are invoices; the domain carries no
business rules. What matters, per the brief, is ownership, correct access control, and
efficient data access.

# Section 1: What This Is

This is an invoice slice, not an invoicing application. A signed-in user can create, list, view and delete their own invoices, and the point of the whole thing is that no user can ever reach another user's data. I reused the authentication system from my Assessment 1 repository rather than rebuilding it — sign-up, sign-in, email verification, sessions and password reset all come from there. Every invoice route sits behind a valid, verified session, and more importantly I never fetch an invoice and then check who owns it: the authenticated user's ID is part of the database query itself, so the database cannot return someone else's row in the first place.

The scope is deliberately small. There is no editing, search, tags, sharing, collaboration, landing page, dashboard widgets, pagination, filtering or sorting. These were not forgotten — they were left out because they add surface area around the two things I wanted to get right, which are access control and query efficiency. What I concentrated on instead was the two-identifier design of a server-only primary key alongside a separate public identifier, the transaction that performs a deletion and writes its audit record together, and getting 401, 403 and 404 to mean three distinct things.

## Section 2: How To Run It

**Install:**
- Node.js (no minimum is pinned in `package.json`; developed and measured against
  v24.16.0)
- Docker Desktop (or any Docker Compose v2 — the `docker compose` command, not the
  legacy hyphenated `docker-compose` CLI)

**Steps, from a fresh clone:**

1. Clone the repository:
   ```
   git clone https://github.com/ScrappyAT/recordslice.git
   cd recordslice
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start Postgres:
   ```
   docker compose up -d
   ```
   This runs a `postgres:17` container named `recordslice-db`, publishing Postgres on
   host port **5435** (not the default 5432, to avoid colliding with any other local
   Postgres container), with database `recordslice` and user `recordslice`
   (`docker-compose.yml`).
4. Create your own `.env` from the template (never commit `.env` — it's `.gitignore`d):
   ```
   cp .env.example .env
   ```
   One variable, by name:
   - **`DATABASE_URL`** — the Postgres connection string. With the default
     `docker-compose.yml` credentials, the value already in `.env.example` works as-is
     once the container from step 3 is running: `postgresql://recordslice:localdevpassword@localhost:5435/recordslice?schema=public`.
5. Apply the database migrations (also generates the Prisma client):
   ```
   npx prisma migrate dev
   ```
6. Start the app:
   ```
   npm run dev
   ```
7. Open **http://localhost:3000**. There is no landing page and no seed data — sign up
   at `/signup`, then verify using the six-digit code printed to the terminal running
   `npm run dev` (this project's dev email sender, inherited from Assessment 1,
   `lib/email.ts`, prints instead of sending — no real inbox is involved). From there,
   `/invoices` is the signed-in shell's list view.

To measure against a production build instead (what every number in this documentation
was actually measured under):
```
npm run build
npm run start
```

## Section 3: The Flow, Step By Step

**Signing in.** A signed-out request to anything under `/invoices` is caught by
`app/invoices/layout.tsx`, which calls `requireSession()`
(`lib/auth/session.ts:92-98`) — a database lookup against the `Session` table, not a
cookie-presence check. With no valid session it redirects to `/signin`; with a valid
session whose `emailVerifiedAt` is `null` it calls `forbidden()`
(`app/invoices/layout.tsx:21-22`), rendering `app/forbidden.tsx` with a genuine 403. Only
past both does the layout render its nav and `{children}`.

**Creating an invoice.** At `/invoices/new` (`app/invoices/new/page.tsx`), a Client
Component form collects `invoiceNumber`, `clientName`, an `amount` typed as a plain
major-unit string ("12.34"), `currency`, `issueDate`, and a `status` selector limited to
`draft`/`sent`/`paid`. On submit, the same `invoiceCreateSchema`
(`lib/validation/schemas.ts`) that the server uses validates the input client-side first,
for instant feedback; the browser then sends a `fetch` `POST` to `/api/invoices` as JSON.
The Route Handler (`app/api/invoices/route.ts`) calls `requireApiUser()`
(`lib/auth/api.ts`) for 401/403, re-validates the same schema server-side (never trusting
the client copy), converts the amount to minor units via `lib/money.ts`'s
`toMinorUnits()`, generates a `publicId` (`lib/ids.ts`), and inserts the row with
`userId` taken only from the session (`app/api/invoices/route.ts:48`) — never from the
request body. On success (`201`) the browser redirects to `/invoices`.

**Viewing the list.** `GET /invoices` (`app/invoices/page.tsx`) runs
`prisma.invoice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })`
(`app/invoices/page.tsx:18-21`) and renders either a genuine empty state or a table, each
row linking to `/invoices/{publicId}` — never `id`.

**Viewing one invoice.** `GET /invoices/:publicId`
(`app/invoices/[publicId]/page.tsx`) runs
`prisma.invoice.findFirst({ where: { publicId, userId: user.id } })`
(`app/invoices/[publicId]/page.tsx:25-27`) and calls `notFound()` if nothing matches —
whether the `publicId` belongs to someone else or was never issued.

**Deleting an invoice.** `GET /invoices/:publicId/delete`
(`app/invoices/[publicId]/delete/page.tsx`) is a read-only confirmation naming the
invoice's number, client, and amount. Clicking "Confirm delete" (a Client Component,
`DeleteConfirmButton.tsx`) sends `DELETE /api/invoices/:publicId`. The Route Handler
(`app/api/invoices/[publicId]/route.ts:39-83`) runs one `prisma.$transaction`: reads the
invoice scoped by `{ publicId, userId }`, deletes it with the same scoping, and inserts
an `InvoiceDeletion` audit row built from the values just read — all three, or none, per
commit. On success the browser redirects to `/invoices`.

## Section 4: The Data Model

| Table | Holds |
|---|---|
| `User`, `Session`, `VerificationCode`, `PasswordResetToken`, `RateLimitHit` | Imported unchanged from Assessment 1 — accounts, sessions, email verification, password reset, and rate-limit bookkeeping. |
| `Invoice` | One invoice per row: number, amount, currency, client, issue date, status, and its owner. |
| `InvoiceDeletion` | One row per deletion: a denormalised snapshot of what was deleted, who deleted it, and when. |

**`Invoice` columns and the decision behind each:**

- `id String @id @default(cuid())` — the primary key. Never leaves the server.
- `publicId String @unique` — the only identifier any client ever sees. Generated in
  application code (`lib/ids.ts`, 16 random bytes, hex-encoded — not base64url, which
  can produce a leading `-` that curl and most shells read as a flag), once, never a
  database default, never regenerated.
- `userId String` — the owner, with a `Restrict` foreign key to `User.id` (see below).
- `invoiceNumber String` — not nullable; every invoice in this domain has one.
- `amountMinor Int` — integer minor units, never a float or a decimal type, so no
  rounding step exists between what a user typed and what's stored.
- `currency String @db.Char(3)` — fixed-width, matching ISO 4217's shape.
- `clientName String` — not nullable.
- `issueDate DateTime @db.Date` — a calendar date, not a timestamp; `@db.Date` avoids
  the timezone ambiguity a full timestamp would introduce for a field that means "the
  14th," not a specific moment.
- `status String` — restricted to `draft`/`sent`/`paid` by a raw-SQL `CHECK` constraint
  (below), not a Prisma-native enum — chosen so the one mechanism (`CHECK`) covers both
  this and the amount constraint, and is a plain `ALTER TABLE` to widen later, unlike a
  Postgres enum type.
- `createdAt DateTime @default(now())` — drives list ordering.

**`InvoiceDeletion` columns:** `invoicePublicId`, `invoiceNumber`, `amountMinor`,
`currency`, `clientName`, `userId` (the deleter), `deletedAt` — every one denormalised
from the invoice at the moment of deletion, because by the time this row is written the
invoice is gone. No foreign key to `Invoice` — see Section 5, Audit Logging, for why that
absence is deliberate and load-bearing rather than an oversight.

**Which constraints make an invalid state impossible?**

- `publicId @unique` — two invoices can never share a public identifier.
- `@@unique([userId, invoiceNumber])` — one user can never hold two invoices with the
  same number. Two *different* users can, deliberately: a global unique constraint would
  leak the total invoice count across all users and forbid two accounts both using
  `INV-001`.
- The `Invoice.userId → User.id` foreign key, **`onDelete: Restrict`** (not the
  `Cascade` every other `User`-owned table in this schema uses) — an invoice can never
  reference a nonexistent user, and, more importantly, a user delete cannot silently
  remove that user's invoices without ever running the code path that writes an
  `InvoiceDeletion` row. A cascade executes inside Postgres, outside any transaction
  application code controls; `Restrict` turns "invoices vanish unaudited" into a loud
  foreign-key error a future user-deletion feature would have to actually handle, rather
  than a silent gap. Nothing in this slice deletes users today, so this costs nothing
  now and forecloses a silent gap later.
- `CHECK ("amountMinor" >= 0)` — a negative amount is impossible at the database level,
  confirmed live: attempting one raises Postgres error `23514`, not merely rejected by a
  form.
- `CHECK ("status" IN ('draft', 'sent', 'paid'))` — any other status value is impossible
  to store, regardless of what application code attempts to insert.
- `NOT NULL` on every column listed above, on both tables — a half-formed invoice, or an
  audit row that can't fully say what was deleted, cannot exist as a row at all.
- The **absence** of a foreign key from `InvoiceDeletion` to `Invoice` is not a gap in
  this list — it's what makes writing the audit row possible at all, in the same
  transaction as a delete that, by the time the insert runs, has already made the
  invoice row gone.

## Section 5: The Concepts

### Authentication versus authorisation

**What it is.** Authentication answers "who is this requester" — proving control of an
account. Authorisation answers "is this requester allowed to do this" — a separate
question that assumes authentication already succeeded.

**Why it is needed.** Conflating the two means "signed in" quietly becomes "allowed,"
which is false the moment any action has a permission narrower than "has an account" —
here, a verified email, and ownership of the specific record being acted on.

**How I implemented it.** Authentication is `lib/auth/session.ts` — `getSession()`
validates the session cookie's hash against the `Session` table and its expiry, imported
from Assessment 1 unchanged in logic. Authorisation is layered on top of a valid
session, in two independent ways: the `emailVerifiedAt` check (403 if unverified — a
property of the *account*), and per-query ownership scoping (404 if the resource isn't
the requester's — a property of the *resource*). A request can be authenticated and
still fail either authorisation check.

**What I chose against and why.** A single combined "isAllowed" check per route,
collapsing both into one boolean — rejected because they answer different questions with
different correct status codes (403 vs. 404), and AGENTS.MD is explicit that conflating
them is exactly the mistake to avoid (never 403 for an ownership failure).

### Scoping the query versus checking after the fetch

**What it is.** Putting the ownership condition inside the database query itself
(`where: { publicId, userId }`) versus fetching a row by `publicId` alone and then
comparing `row.userId` to the session in application code afterward.

**Why it is needed.** The argument is structural versus procedural. A scoped query
cannot leak another user's row because that row is never retrieved from the database in
the first place — there is nothing in memory to accidentally return. A post-fetch check
works today and is a matter of *when*, not *whether*, someone adds a new route later and
forgets to write it.

**How I implemented it.** Every invoice query in this codebase carries `userId` in its
own `where` clause: the list (`app/invoices/page.tsx:19`), the detail view
(`app/invoices/[publicId]/page.tsx:26`), the delete confirmation
(`app/invoices/[publicId]/delete/page.tsx:23`), and both statements in the delete
transaction (`app/api/invoices/[publicId]/route.ts:46`, `:61`).

**What I chose against and why.** Fetching by `publicId` alone (a real option — it's
already unique) and checking `invoice.userId === session.user.id` afterward — rejected
explicitly, per `AGENTS.MD`'s Identifiers rule: lookups are always
`where: { publicId, userId }`, never `publicId` alone, even when the surrounding code
looks like it would catch the mismatch.

### Insecure direct object references (IDOR)

**What it is.** When an identifier in a URL or request directly names a database object
with no check that the requester may reference it — so editing the identifier exposes
another user's object.

**Why it is needed.** Without a defence, changing `/invoices/A` to `/invoices/B` in the
address bar would trivially expose any user's invoices to any other signed-in user; this
is the single most direct attack this slice has to survive.

**How I implemented it.** Two defences stack, not one. First, `publicId` is a 128-bit
random token (`lib/ids.ts`), not sequential or guessable. Second — the one that actually
matters, since obscurity alone is not access control — every lookup is scoped (previous
concept), so even a correctly guessed `publicId` belonging to another user returns
nothing. Proven, not asserted: in the access control audit
(`DOC/access-control-audit.md`), user B requesting user A's `publicId` returns `404`,
and that response is byte-identical (once each response's own already-known `publicId`
is factored out) to requesting a `publicId` that was never issued at all. The first
attempt at this exact comparison, run against the dev server, appeared to differ — the
dead end was assuming that difference was a leak; it was Next's dev-mode HMR hydration
id, unrelated to which case occurred. Re-run under a production build, the bodies matched
exactly (Section 6, problem 2).

**What I chose against and why.** Returning `403` for "the row exists, but it isn't
yours" — rejected per `AGENTS.MD`: confirming existence to an unauthorised requester is
itself the leak an IDOR attack is fishing for. `404` for both "doesn't exist" and "not
yours" removes that signal entirely, and the scoped query means the server genuinely has
no separate code path that could distinguish them even if asked to.

### Why raw database identifiers are not exposed

**What it is.** The database's own primary key (`Invoice.id`, a cuid) never appears
anywhere a client can see it — not a URL, not a JSON response, not a `data-` attribute,
not a React key that reaches the DOM.

**Why it is needed.** The instinctive fix — "use an unguessable UUID as the primary
key" — misses the actual requirement. The argument here is about coupling, not
guessability: a cuid is already unguessable, but exposing it as the URL identifier still
means the URL and the storage layer cannot change independently of each other.

**How I implemented it.** Two identifiers per invoice with different jobs
(`prisma/schema.prisma:73,78`): `id`, server-only, and `publicId`
(`lib/ids.ts`), the only one that reaches a client. Every route param, `Link` href, and
React `key` in this codebase uses `publicId` (e.g. `app/invoices/page.tsx:58`, where the
table row's `key` is `invoice.publicId`, not `invoice.id`).

**What I chose against and why.** A single primary key, exposed directly, relying on its
unguessability alone — rejected: an unguessable primary key is still the database's own
key. Exposing it means a future change to how rows are identified internally (a
migration, a different id scheme, a different database) becomes a breaking URL change
for every client that ever saw one. The two-identifier split makes "what identifies a
row to Postgres" and "what identifies a resource to the world" independently
changeable.

### Audit logging

**What it is.** A persistent record of who deleted what and when, that survives the
deletion itself.

**Why it is needed.** A hard-deleted row is genuinely gone. If writing the audit record
isn't guaranteed to happen together with the delete — not before, not after — either a
delete can succeed with no record it happened, or a record can exist for a delete that
never actually committed.

**How I implemented it.** One `prisma.$transaction`
(`app/api/invoices/[publicId]/route.ts:39-83`) wraps the scoped read, the scoped delete,
and the `InvoiceDeletion` insert. The audit row's values come from the read *inside*
that same transaction (`:45-47`) — never from the request (a `DELETE` here carries no
body) and never from the URL segment taken on faith. `InvoiceDeletion` has **no** foreign
key to `Invoice`; that absence is load-bearing, not an omission — by the moment the
insert runs, the delete in the same transaction has already made the invoice row gone,
so a foreign key here would make the insert impossible to satisfy. Proven by fault
injection, not just reasoned about: temporarily forced the audit insert to fail (an
`INSERT` into a nonexistent table, reverted before committing) and confirmed the invoice
row survived and no audit row existed — the transaction rolled back cleanly (step 8).

**What I chose against and why.** Writing the audit row as a separate statement
immediately after the delete, outside a transaction — rejected explicitly by
`AGENTS.MD`: a crash between the two statements would delete a row with no record it
happened. Also rejected: a soft delete (marking the row deleted instead of removing it)
as the "history" mechanism — a soft-deleted row is still reachable by any query that
forgets to filter it out, the identical failure mode as an unscoped ownership query.

### Page architecture: conditional rendering with URL state

**What it is.** Two things that have to work together. Conditional rendering: each
route decides what to actually show based on data (a genuine empty state versus a table;
a found invoice versus `notFound()`). URL state: each of those views has its own real,
independently addressable URL, and moving between them updates the address bar via
client-side navigation rather than a full page reload.

**Why both matter.** URL state alone, with no conditional logic, would mean every route
always renders the same shape regardless of what the database actually holds — no
genuine empty state, no distinction between an invoice found and one that isn't.
Conditional rendering alone, inside one single route with client-side state deciding
what to show, would mean nothing is shareable, bookmarkable, or safe to open cold in a
new tab — the exact thing the brief requires.

**How I implemented it.** Four real routes: `app/invoices/page.tsx`,
`app/invoices/new/page.tsx`, `app/invoices/[publicId]/page.tsx`, and
`app/invoices/[publicId]/delete/page.tsx`, each independently server-rendered on a cold
`GET`. `next/link` provides soft client-side navigation between them (e.g.
`app/invoices/page.tsx:38`). Within each route, real conditional logic: the list renders
either an empty state or a table depending on `invoices.length`
(`app/invoices/page.tsx:23-32`); the detail and delete-confirmation routes render either
the invoice or call `notFound()` depending on whether the scoped query matched anything.

**What I chose against and why.** A single route with in-memory state toggling between
"list," "detail," and "create" views — rejected, because `AGENTS.MD` requires a view
reached by a shared URL to render the same thing as one reached by navigation; a
state-toggle design would have to reconstruct that state from the URL to satisfy this
anyway, at which point it's reimplementing the routing Next.js's App Router already
provides for free.

### Status codes: 401 versus 403

**What it is.** `401` — the requester has not proven who they are (no valid session).
`403` — the requester has proven who they are, and the answer is still no (here,
specifically: a session with `emailVerifiedAt` still `null`).

**Why it is needed.** The two codes tell a client different things. `401` says "prove
who you are"; `403` says "I already know, and it doesn't help you." Collapsing them
(or, worse, using `403` for an ownership failure, which `AGENTS.MD` explicitly forbids)
either confirms information that should stay hidden or gives a client the wrong
instruction for what to do next.

**How I implemented it.** `401`: `requireSession()`
(`lib/auth/session.ts:92-98`) redirects browser page requests to `/signin`; API requests
get JSON `401` via `requireApiUser()` (`lib/auth/api.ts:16-19`). `403`: the shell layout
checks `emailVerifiedAt` and calls `forbidden()`
(`app/invoices/layout.tsx:21-22`) for page routes; the same check lives in
`requireApiUser()` (`lib/auth/api.ts:21-23`) for the two API routes.

**What I decided not to use and why:**

Leaving the verified-email check only in the page layout.

That was my first implementation, and it looked sufficient: every page under
`/invoices` is wrapped by `app/invoices/layout.tsx`, so every page was covered. What it
missed is that Route Handlers under `app/api` are not wrapped by that layout at all.

I found this by deliberately constructing a session with `emailVerifiedAt: null`, since
the normal flow cannot produce one — sign-in refuses unverified accounts and
verification sets the field in the same request. That session posted to `/api/invoices`
and got back a `201` with a real invoice row written.

So the check I had described as unreachable was not unreachable; it was simply absent
from the half of the application that needed it most. The fix was `requireApiUser()` in
`lib/auth/api.ts`, called by both handlers, so the rule lives in one place rather than
depending on which part of the framework happens to wrap a route.

### Database indexing

**What it is.** A separate on-disk structure Postgres can use to find matching rows
without scanning the whole table.

**Why it is needed.** Without one, every list query is a sequential scan — negligible at
a handful of rows, expensive as a table grows; an index trades write cost and disk space
for read speed on the columns actually filtered and sorted on.

**How I implemented it.** Two indexes on `Invoice`: a unique index on `publicId`
(backs every detail/delete lookup), and a composite index on `(userId, createdAt)`
(`prisma/schema.prisma:114`), justified specifically by the list query's
`where: { userId } orderBy: { createdAt: desc }`. Neither is speculative — no index
exists on this table without a named query behind it.

**What I chose against and why — this is the one where the fourth question isn't "what
alternative did I build instead," it's "why I kept an index the planner ignores."**
Checked with `EXPLAIN (ANALYZE, BUFFERS)`, both at the real row count and at a synthetic
50,000-row scale (200 users, 250 invoices each, seeded and deleted for this test only).
At both scales the planner chose a *different* index —
`Invoice_userId_invoiceNumber_key`, the uniqueness constraint's own index — via a bitmap
scan, then sorted explicitly:

```
Sort  (cost=578.92..579.54 rows=250 width=109) (actual time=1.363..1.373 ...)
  Sort Key: "createdAt" DESC
  ->  Bitmap Heap Scan on "Invoice"  (cost=10.35..568.96 ...)
        ->  Bitmap Index Scan on "Invoice_userId_invoiceNumber_key"  (cost=0.00..10.29 ...)
```

Forcing `SET enable_bitmapscan = off` (reset immediately after) switched the plan to the
composite index, order-preserving, with no separate sort step at all:

```
Index Scan Backward using "Invoice_userId_createdAt_idx" on "Invoice"  (cost=0.41..892.77 ...)
```

This proves the composite index is structurally correct and does exactly what it was
built for. The planner's default choice not to use it is a genuine, measured cost
decision, not a broken index: this query has no `LIMIT` (pagination is out of the
brief), so an unbounded `ORDER BY` gets no early-exit benefit from reading the index in
order — the forced plan's own estimated cost (892.77) is higher than the bitmap-plus-sort
plan's (579.54) at this selectivity. I kept the index anyway: it's justified by the exact
query it exists for, the forced-plan test proves it isn't broken, and "unused by the
planner at this table size" is a completely different failure mode from "doesn't work" —
removing it would leave nothing for the planner to prefer once the query's shape changes
(a future `LIMIT`, a larger or differently skewed dataset).

**What I decided not to use and why:**

Dropping the composite index once I saw the planner ignoring it.

It would have been the tidier-looking decision — an index nothing chooses looks like
dead weight. But the plan I forced with `enable_bitmapscan = off` showed the index does
exactly what it was designed to do: it eliminates the sort entirely. The planner's
preference is a cost judgement about this table at this size with this query shape, not
a verdict on the index. The moment a `LIMIT` is introduced, or the row distribution
changes, the ordered index scan becomes the cheaper plan.

I also chose against adding a `LIMIT` purely to make the planner pick the index I
wanted. That would have been optimising the evidence rather than the query, and
pagination is outside this brief.

### Query count as a cost

**What it is.** Treating the number of database round trips one request makes as a
real, measured cost, not an abstraction — and specifically, counting the statements a
running app actually sends, not estimating them.

**Why it is needed.** Without measuring it, "this route feels slow" has no diagnosis.
With it, a specific, named cause can be found, fixed, and the fix verified by
re-measuring under identical conditions — or found and deliberately left, with the
reasoning recorded rather than silently absorbed as "just how it is."

**How I implemented it.** Instrumented `lib/prisma.ts` temporarily with
`log: ["query"]`, ran one real request per action against a production build, counted
statements, then reverted the instrumentation before every commit (confirmed via
`git diff --stat`, so it never shipped). **Before → after, per action** (full breakdown
in `DOC/query-counts.md`):

| Action | Before | After |
|---|---|---|
| List (`GET /invoices`) | 5 | 3 |
| Detail (`GET /invoices/:publicId`) | 5 | 3 |
| Create — page load (`GET /invoices/new`) | 2 | 2 |
| Create — the write (`POST /api/invoices`) | 3 | 3 |

The single change was wrapping `getSession()` in React's `cache()`
(`lib/auth/session.ts:52-72`) — reused verbatim from the identical
duplicate-session-lookup fix in a previous assessment's Prisma app, not something new
built for this one. It accounts for **100%** of the reduction (list and detail, 5→3, a
40% cut each), because the shell layout and each page were independently calling
`requireSession()` — two identical database round trips per request for what, within one
request, is always the same answer. It correctly accounts for **0%** of the create
numbers, on both requests, because neither had that duplication to begin with: the
create page is a Client Component with no server-side session call of its own to dedupe
against the layout's, and the create `POST` is a Route Handler — never wrapped by the
page layout that was causing the duplication in the first place.

**What I chose against and why.** `getSession()`'s own `include: { user: true }` is
still two statements (a `Session` lookup, then a separate `User` lookup — not a SQL
join), on every remaining call. Investigated collapsing it two ways: Prisma's
`relationLoadStrategy: "join"` (rejected outright without the `relationJoins` preview
feature enabled — not worth enabling this close to a deadline for a generator-level
change affecting every relational query the client can make), and querying `User`
directly through the relation (confirmed this compiles to one statement, but it changes
`getSession()`'s return shape — a change to imported Assessment 1 code's public
contract, for a saving of one query per session resolution, already down to one
resolution per request after the `cache()` fix). Declined; documented in
`DOC/query-counts.md` rather than attempted.

## Section 6: What Went Wrong

**1. An unverified session could create an invoice.**
*Symptom:* `POST /api/invoices` returned `201` and wrote a real invoice row for a
session whose email was never verified.
*Investigation:* the normal sign-in/verify flow can never produce this state — sign-in
refuses an unverified account, and verification sets `emailVerifiedAt` in the same
request that creates a session — so the only way to test the `403` path at all was to
build it directly: a real `User` row with `emailVerifiedAt: null`, a real `Session` row
pointing at it, constructed by hand rather than through any form. Ran the request
against that session on a live app before assuming the check was in place.
*Cause:* the `403` check lived only in `app/invoices/layout.tsx`, a page-router layout.
Route Handlers under `app/api/*` are never wrapped by a page layout — they're a separate
part of Next's routing tree entirely — so both invoice API routes enforced `401` and
nothing else.
*Fix:* `lib/auth/api.ts`, `requireApiUser()` — one function, called from both
`app/api/invoices/route.ts` and `app/api/invoices/[publicId]/route.ts`, so the check
lives once instead of being re-implemented (or missed) per handler.

**2. The not-found and not-yours responses were not byte-identical, on the first
comparison.**
*Symptom:* diffing the response for "another user's `publicId`" against "a `publicId`
that never existed" showed real differences in the response bodies.
*Investigation, dead end included:* the first comparison ran against the Next.js dev
server. The initial read was wrong — that the difference was an information leak,
something in the response distinguishing the two cases. Diffing the actual bytes showed
the real cause: a per-response random hydration id Next's dev-mode HMR injects into
every page, unrelated to which case occurred, plus the requester's own `publicId`
echoed into the router's client-state payload — not leaked data, the URL the requester
already typed.
*Cause:* dev-mode-only rendering noise in the comparison method, not a real difference
in server behaviour.
*Fix:* re-ran the identical comparison under a production build
(`next build` && `next start`). Headers matched (excluding `Date`); bodies matched
exactly once each response's own already-known `publicId` was factored out.

**3. The composite index was not being used by the planner.**
*Symptom:* `EXPLAIN` on the list query showed Postgres using a different index than the
one built for it.
*Investigation, dead end included:* first checked at the real, current row count — two
rows. The planner picked the other index. This proved nothing (any plan is near-free at
two rows) and was treated as a dead end rather than reported as the finding. Seeded a
synthetic 50,000-row dataset (200 users, deleted immediately after) and re-ran — the
planner still chose the other index, with a bitmap scan plus an explicit sort.
*Cause:* the list query has no `LIMIT` (pagination is out of the brief), so an unbounded
`ORDER BY` gets no benefit from reading the composite index in pre-sorted order — a
bitmap-plus-sort plan is measurably cheaper at that selectivity. Confirmed by forcing
`SET enable_bitmapscan = off`: the planner switched to an order-preserving index scan on
the composite index with no separate sort step, proving the index itself is structurally
correct.
*Fix:* not a fix — a documented planner decision. The index is kept; it's the right
index for this query, unused today by the choice of a cost-based planner, not because it
doesn't work.

**4. The `.gitignore` inherited from the auth-slice repository would have silently
excluded this repository's own `AGENTS.MD`.**
*Symptom:* none observed directly — found by inspection while setting up the project
scaffold in step 1, before it could cause one.
*Investigation:* the `.gitignore` copied over from the Assessment 1 `auth-slice`
repository carried three leftover lines specific to that repository, including a bare
`AGENTS.md` pattern.
*Cause:* Git's `core.ignorecase` default on Windows is `true`, so a pattern matching
`AGENTS.md` also matches this repository's own `AGENTS.MD` — the file would have been
silently excluded from every commit, including the one this project is graded against.
*Fix:* removed the three inherited, irrelevant lines (`docs/`, a garbled
`NOTES.mdAGENTS.md`, and `AGENTS.md`) from `.gitignore` before the first commit, and
confirmed `AGENTS.MD` was actually tracked.

## Section 7: What This Slice Does Not Handle

**Outside the brief, not a time constraint** — each named explicitly in the brief's "Do
not build" list:
- Editing, search, tags, sharing, collaboration.
- Pagination, filtering, and sorting controls on the list view.
- A landing page, dashboard widgets.

**Investigated and deliberately declined, not something that ran out of time** — every
item below was a reasoned trade-off, made with time remaining, not an incomplete effort:
- **Auth is imported by hand from Assessment 1**, stated plainly rather than presented
  as built for this slice. Its internal shape — including the query cost noted below —
  reflects decisions made in a different project.
- **`getSession()`'s `include: { user: true }` is two SQL statements, not a SQL join.**
  Fixing it cleanly needs either Prisma's `relationJoins` preview feature (not enabled)
  or a change to the imported auth code's public return shape. Declined this close to a
  deadline, in favour of the `cache()` fix that already removed the *duplicate* call —
  see Section 5, Query Count.
- **The `405` on a `GET` to the delete API path has an empty body**, deliberately — the
  reasoning is written directly into `app/api/invoices/[publicId]/route.ts` and
  `app/api/invoices/route.ts`, not only here.
- **Page routes render for any HTTP verb** (`POST`, `PUT`, …) because Next.js App
  Router pages have no verb-specific handler — confirmed harmless in the access control
  audit, since nothing on a page route mutates state regardless of which verb reaches
  it, but worth naming as a real characteristic of this system rather than an assumption.
- **`InvoiceDeletion` has no index**, because no code queries it — adding one would be
  exactly the speculative index `AGENTS.MD` forbids.

**What breaks at scale:**
- The list query fetches every one of a user's invoices, unbounded — fine at brief
  scale, not for an account with thousands of rows. This is the same absence (no
  `LIMIT`) that explains why the composite index isn't chosen by the planner today
  (Section 5, Database Indexing) — the two are the same underlying gap, not two separate
  problems.
- Invoice creation has no rate limit, unlike the imported auth routes (signup, sign-in,
  password reset all do). A verified user could create an unbounded number of invoices.

**What would be needed before real users:**
- Real email delivery — `lib/email.ts` prints to the console; no provider is wired up.
- Pagination or a result cap on the list view.
- Rate limiting on invoice creation.
- A deployment target with HTTPS and real secret management — this project was only
  ever run locally; the session cookie's `secure` flag is already environment-aware
  (`lib/auth/session.ts:33`), but nothing here has been deployed or tested beyond
  `localhost`.

# Section 8: If I Built This Again

The one thing I would change is how the session is resolved. I reused the session logic from Assessment 1, which looks up the `Session` row and uses an `include` to attach the `User` — and that `include` does not compile to a join. It runs as two separate statements on every authenticated request, one to find the session and another to fetch the user by the ID it just got back. I used React's `cache()` to stop this slice resolving the same session twice within a single request, which took the list and detail views from five queries to three, but memoising a two-query lookup still leaves it a two-query lookup. If I had written the session layer myself rather than inheriting it, I would have made it a single query selecting only the fields the application actually reads, and the reduction I am documenting would have been larger and simpler to explain. Everything else held up: the two-identifier design, putting the user's ID inside every invoice query rather than checking ownership afterwards, and writing the deletion and its audit record in one transaction are all decisions I would make again.

---

# Evidence Index

| Brief requirement | Evidence |
| --- | --- |
| Access control audit table showing method, path, attempted action, result and pass/fail | `DOC/access-control-audit.md` |
| Query count comparison before and after, including the classification of each query | `DOC/query-counts.md` |
| Screenshot of the audit log after an invoice was deleted | `evidence/recordslice-audit-log.png` |
| Screenshot showing the public identifier in the invoice URL rather than the database ID | `evidence/recordslice-detail-url.png` |
| Database row showing the same invoice's `id` and `publicId` for comparison | `evidence/recordslice-db-row.png` |

The URL and database screenshots are a pair: the URL screenshot shows the public identifier in the address bar, and the database screenshot shows the same invoice's `id` and `publicId` side by side, so the two values can be compared directly. The database screenshots were captured from Prisma Studio.
