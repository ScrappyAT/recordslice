# Query counts — before and after

Measured, not estimated, per `AGENTS.MD`'s Query counts section. The "before" numbers are
step 6's naive baseline; step 7 below fixes one thing, declines to fix another with
reasons given, and re-measures under identical conditions.

## How this was measured

- **Instrumentation:** `lib/prisma.ts` was temporarily changed to
  `new PrismaClient({ log: ["query"] })`, which prints every SQL statement Prisma sends
  to Postgres. The change was made, the requests below were run against it, then the
  file was reverted before committing — `git diff --stat` showed no changes to
  `lib/prisma.ts` at commit time. A permanent query log would be a change to Section 2's
  fresh-clone behaviour nobody asked for, so it isn't in this repository.
- **Build:** a production build (`next build` then `next start`), not the dev server —
  no Turbopack HMR overhead or dev-only instrumentation to account for.
- **Requests:** made with `curl`, using a real session cookie for a real, database-
  persisted user created immediately beforehand (not the browser, not reasoning about
  the code).
- **Cold vs warm:** the server process was freshly started for the very first request
  measured (`GET /invoices/new`, below) — that request shows exactly the same two
  statements as a repeated ("warm") request. Prisma's engine also logged a bare
  `SELECT 1` before some later requests in this run, at no fixed position and not on
  every request. This is an internal connection-pool statement the engine issues on its
  own, not something any `prisma.*` call in this codebase asked for — it is not counted
  below, because the counts here are what our own code's Prisma calls generate to serve
  the request, not engine-internal plumbing.
- **Data present:** a single freshly created, email-verified user with no existing
  invoices at the start of each action's measurement, so the counts reflect the shape of
  the queries, not the size of any result set (row count doesn't change how many
  *statements* are sent, only how much each returns).

## Step 7 — what changed

**Fixed: the duplicated session resolution.** `lib/auth/session.ts`'s `getSession()` is
now wrapped in React's `cache()`. Every call within one request — the shell layout's
`requireSession()` and a page's own independent `requireSession()` call — now converges
on a single underlying execution instead of two. Nothing else changed: the layout and
every page still call `requireSession()` exactly where they did before, with no props
threaded between them.

`cache()` was chosen over the other candidate (the layout resolving the session once and
passing the user down to the page) because Next.js App Router genuinely has no supported
way to do the latter: a layout and the page it wraps are independently rendered segments,
joined only through the opaque `children` slot, not a parent handing props to a specific
child component. Making that work would mean restructuring the route tree itself.
`cache()` requires no such restructuring — it fixes the duplication at its source (the
lookup itself) rather than at every call site, so any future file added under this shell
that also needs the session (a `loading.tsx`, a `generateMetadata`) gets the same
deduping for free without being wired up by hand.

What was given up by not passing the user down explicitly: visibility. A reader looking
only at `app/invoices/page.tsx` sees `await requireSession()` and has no way to tell,
from that file alone, whether it's a fresh query or a memoized one — the deduping is a
property of `lib/auth/session.ts`, invisible at the call site. Explicit prop-passing
would have made the data flow readable from the page's own signature; `cache()` trades
that legibility for not touching the route structure. This is the same fix used for the
same duplicate-session-lookup problem in a previous assessment's Prisma app — reused
here, not reinvented.

**Declined: the `include: { user: true }` split into two statements.** Investigated two
ways to collapse `getSession()`'s Session-then-User lookup into one query, and rejected
both:

1. *Prisma's `relationLoadStrategy: "join"`.* Tried it directly against the current
   schema — Prisma rejects it outright: `Unknown argument relationLoadStrategy`. It only
   exists behind the `relationJoins` preview feature, which is not enabled (and enabling
   a preview feature this close to a deadline, for a generator-level change that affects
   every relational query the client can make, is exactly the kind of risk not worth
   taking for one query).
2. *Querying `User` directly through the relation instead of `Session` with an include.*
   Confirmed this compiles to one statement (`SELECT ... FROM "User" WHERE EXISTS
   (SELECT ... FROM "Session" ...)`), verified against the running database. But it
   changes what `getSession()` returns — from a `Session` row with `.user` attached, to
   a bare `User` row — which is a change to the imported auth slice's public contract,
   not a query hint. Every caller (`requireSession()`, and the direct `getSession()` call
   in `app/api/invoices/route.ts`) would need to change with it, for a saving of exactly
   one query per session resolution (already down to one resolution per request after the
   `cache()` fix above).

Both routes to fixing this touch either a Prisma preview feature or the shape of code
imported from Assessment 1, for one fewer query per request. Left alone; documented here
rather than attempted.

## List — `GET /invoices`

**Before: 5 queries. After: 3.**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" WHERE tokenHash = $1 AND expiresAt > $2` | The shell layout's `requireSession()`, gating the route | Auth infra |
| 2 | `SELECT ... FROM "User" WHERE id IN ($1)` | Same call's `include: { user: true }` — a second statement, not a join | Auth infra |
| ~~3~~ | ~~`SELECT ... FROM "Session" ...`~~ | ~~The page's own, independent `requireSession()` call~~ | Removed — `cache()` now dedupes this to the same execution as #1/#2 |
| ~~4~~ | ~~`SELECT ... FROM "User" ...`~~ | ~~Same split, again~~ | Removed, same reason |
| 3 | `SELECT ... FROM "Invoice" WHERE userId = $1 ORDER BY createdAt DESC` | The list itself | Action's own data query |

## Detail — `GET /invoices/:publicId`

**Before: 5 queries. After: 3.** Same fix, same shape as list.

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | Layout's `requireSession()` | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |
| ~~3~~ | ~~`SELECT ... FROM "Session" ...`~~ | ~~Page's own `requireSession()`~~ | Removed — deduped by `cache()` |
| ~~4~~ | ~~`SELECT ... FROM "User" ...`~~ | ~~Same split, again~~ | Removed, same reason |
| 3 | `SELECT ... FROM "Invoice" WHERE publicId = $1 AND userId = $2 LIMIT $3` | The one row, scoped | Action's own data query |

Same count and shape regardless of outcome (own invoice, another user's `publicId`, a
`publicId` that doesn't exist) — confirmed in step 5, re-confirmed after the fix.

## Create

Two requests make up this action: loading the form, then submitting it. Reported
separately below; **the POST is what this repository counts as "the create action"** for
the documentation table, since it's the one that actually writes — the GET is page-load
cost every route under the shell pays, already covered by the list/detail numbers above.

### `GET /invoices/new` (loading the form) — **before: 2 queries. After: 2. Unchanged.**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | Layout's `requireSession()` | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |

No third/fourth query here, before or after: the form page itself is a Client Component
with no server-side data fetch of its own, so there was never anything for the `cache()`
fix to dedupe here — this route had only one `requireSession()` call to begin with.

### `POST /api/invoices` (the write) — **before: 3 queries. After: 3. Unchanged, and this is expected, not a failed optimisation.**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | The route handler's own `getSession()` (not `requireSession()` — a Route Handler isn't wrapped by the shell layout at all) | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |
| 3 | `INSERT INTO "Invoice" (...) VALUES (...) RETURNING ...` | The write itself | Action's own data query |

This route was never duplicated in the first place — a Route Handler under `app/api/*`
isn't nested inside `app/invoices/layout.tsx` at all, so there was only ever one
`getSession()` call here, not two. The `cache()` fix removes a *second* call within the
same request; a route that only ever made one call has nothing for it to remove. Measured
again after the fix specifically to confirm this stayed at 3, not to see it drop.

## Summary

| Action | Request | Before | After | Reduction |
|---|---|---|---|---|
| List | `GET /invoices` | 5 | 3 | 2 fewer (40%) |
| Detail | `GET /invoices/:publicId` | 5 | 3 | 2 fewer (40%) |
| Create (page load) | `GET /invoices/new` | 2 | 2 | none — never duplicated |
| Create (write, "the create action") | `POST /api/invoices` | 3 | 3 | none — never duplicated |

**The single change that accounted for the reduction is the `cache()` wrap on
`getSession()`** — it's the only change made in step 7. It cut list and detail by 2
queries each (40%) and, correctly, changed nothing on either create request, because
neither one had the duplication `cache()` removes: the create page has no page-level
session call to dedupe against the layout's, and the create POST never goes through the
layout at all. The `include: { user: true }` split (still 2 statements instead of 1, on
every remaining `getSession()` call) was investigated and deliberately left alone — see
"What changed" above for why.

Every route still does exactly **one** query that's actually about invoices; after this
step, every route also does exactly **one** session resolution per request, at the cost
of the 2 statements that resolution itself still takes.

Re-measured under the same conditions as the before numbers: production build
(`next build` + `next start`), a freshly created, email-verified user with no prior
invoices, requests made with `curl` against real session cookies, `lib/prisma.ts`'s
`log: ["query"]` added only for the measurement and reverted before committing (`git
diff --stat` confirmed no changes to that file at commit time). The same non-deterministic
`SELECT 1` Prisma-internal statement was observed again on some requests and excluded
from the counts, for the same reason as before.

## Index verification (EXPLAIN)

The list query's `where: { userId } orderBy: { createdAt: desc }` was designed in step 2
around the composite index `@@index([userId, createdAt])`. Checked whether Postgres
actually uses it, with `EXPLAIN (ANALYZE, BUFFERS)`, at two scales:

**At the real, current scale (2 rows):** the planner picked `Invoice_userId_invoiceNumber_key`
(the *other* index on this table, not the one built for this query) via a bitmap scan,
then sorted the 2 rows explicitly. With 2 rows, every plan costs a fraction of a
millisecond — this is expected, not a bug. A planner choosing between two near-free
options on a near-empty table is not evidence either index is wrong.

**At a synthetic 50,000-row scale** (200 synthetic users, 250 invoices each — seeded for
this test only, deleted immediately after, never part of the committed schema or app
data): the planner *still* chose `Invoice_userId_invoiceNumber_key` with a bitmap scan
plus an explicit sort, not `Invoice_userId_createdAt_idx`:

```
Sort  (cost=578.92..579.54 rows=250 width=109) (actual time=1.363..1.373 rows=250 loops=1)
  Sort Key: "createdAt" DESC
  Sort Method: quicksort  Memory: 58kB
  Buffers: shared hit=257
  ->  Bitmap Heap Scan on "Invoice"  (cost=10.35..568.96 rows=250 width=109) (actual time=0.084..1.297 rows=250 loops=1)
        Recheck Cond: ("userId" = 'synthuser42'::text)
        Heap Blocks: exact=250
        Buffers: shared hit=254
        ->  Bitmap Index Scan on "Invoice_userId_invoiceNumber_key"  (cost=0.00..10.29 rows=250 width=0) (actual time=0.057..0.057 rows=250 loops=1)
              Index Cond: ("userId" = 'synthuser42'::text)
              Buffers: shared hit=4
Planning Time: 0.664 ms
Execution Time: 1.421 ms
```

This is not the index being ignored by mistake — it's a real cost decision. A **Bitmap
Heap Scan does not preserve index order** regardless of which index drives it, so even a
bitmap scan through `Invoice_userId_createdAt_idx` would still need the same explicit
`Sort` node afterward; at this selectivity (250 of 50,000 rows), Postgres's cost model
rates that plan slightly cheaper than the alternative. The composite index only pays off
if the planner uses it via a plain, order-preserving **Index Scan** instead of a bitmap
one — confirmed directly by temporarily disabling bitmap plans (`SET enable_bitmapscan =
off`, reset immediately after, verified back to `on` on a fresh connection) and
re-running the same query:

```
Index Scan Backward using "Invoice_userId_createdAt_idx" on "Invoice"  (cost=0.41..892.77 rows=250 width=109) (actual time=0.111..1.990 rows=250 loops=1)
  Index Cond: ("userId" = 'synthuser42'::text)
  Buffers: shared hit=258
Planning Time: 1.275 ms
Execution Time: 2.073 ms
```

`Index Scan Backward` walks the ascending `(userId, createdAt)` index in reverse to
produce `createdAt DESC` order directly — no separate `Sort` node at all. This confirms
the index is structurally correct and does exactly what step 2 justified it for; the
planner's default choice not to use that path here is a legitimate cost-based decision
(the forced plan's own estimated cost, 892.77, is higher than the bitmap-plus-sort plan's,
579.54, at this row count and selectivity) rather than a broken index. This distinction —
planner ignoring an available index at low selectivity/row count versus an index that
doesn't work — belongs in Section 5 as written here, not glossed over as "the index
works."

No `LIMIT` is present on this query (pagination is out of the brief, per `AGENTS.MD`),
which is part of why the bitmap-plus-sort plan wins: an unbounded ORDER BY over a
filtered set gives the planner no early-exit benefit from reading the composite index in
order, only the cost of reading every matching row either way. All synthetic data
(200 users, 50,000 invoices) was deleted immediately after this test — confirmed by row
count back to the real pre-test state before the database was touched again.
