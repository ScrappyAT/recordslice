# Query counts — before (naive baseline)

Measured, not estimated, per `AGENTS.MD`'s Query counts section. This is the "before"
column for Section 5 of `DOCUMENTATION.md`; step 7 re-measures after the index pass and
records the "after" column in this same file.

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

## List — `GET /invoices`

**5 queries.**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" WHERE tokenHash = $1 AND expiresAt > $2` | The shell layout's `requireSession()`, gating the route | Auth infra |
| 2 | `SELECT ... FROM "User" WHERE id IN ($1)` | Same call's `include: { user: true }` — a second statement, not a join | Auth infra |
| 3 | `SELECT ... FROM "Session" WHERE tokenHash = $1 AND expiresAt > $2` | The page's *own*, independent `requireSession()` call | Auth infra (duplicate of #1) |
| 4 | `SELECT ... FROM "User" WHERE id IN ($1)` | Same split, again | Auth infra (duplicate of #2) |
| 5 | `SELECT ... FROM "Invoice" WHERE userId = $1 ORDER BY createdAt DESC` | The list itself | Action's own data query |

## Detail — `GET /invoices/:publicId`

**5 queries.** Identical shape to list; the only difference is query #5.

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | Layout's `requireSession()` | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |
| 3 | `SELECT ... FROM "Session" ...` | Page's own `requireSession()` | Auth infra (duplicate) |
| 4 | `SELECT ... FROM "User" ...` | Same split, again | Auth infra (duplicate) |
| 5 | `SELECT ... FROM "Invoice" WHERE publicId = $1 AND userId = $2 LIMIT $3` | The one row, scoped | Action's own data query |

Same count and shape regardless of outcome (own invoice, another user's `publicId`, a
`publicId` that doesn't exist) — confirmed in step 5.

## Create

Two requests make up this action: loading the form, then submitting it. Reported
separately below; **the POST is what this repository counts as "the create action"** for
the documentation table, since it's the one that actually writes — the GET is page-load
cost every route under the shell pays, already covered by the list/detail numbers above.

### `GET /invoices/new` (loading the form) — **2 queries**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | Layout's `requireSession()` | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |

No third/fourth query here, unlike list and detail: the form page itself is a Client
Component with no server-side data fetch of its own, so there's nothing for it to
duplicate.

### `POST /api/invoices` (the write) — **3 queries**

| # | Query | What it's doing | Classification |
|---|---|---|---|
| 1 | `SELECT ... FROM "Session" ...` | The route handler's own `getSession()` (not `requireSession()` — a Route Handler isn't wrapped by the shell layout at all) | Auth infra |
| 2 | `SELECT ... FROM "User" ...` | Same call's include | Auth infra |
| 3 | `INSERT INTO "Invoice" (...) VALUES (...) RETURNING ...` | The write itself | Action's own data query |

No duplicate session check here — a Route Handler under `app/api/*` isn't nested inside
`app/invoices/layout.tsx`, so there's only ever the one `getSession()` call, not two.

## Summary

| Action | Request | Count | Auth infra | Action's own data |
|---|---|---|---|---|
| List | `GET /invoices` | 5 | 4 | 1 |
| Detail | `GET /invoices/:publicId` | 5 | 4 | 1 |
| Create (page load) | `GET /invoices/new` | 2 | 2 | 0 |
| Create (write) | `POST /api/invoices` | 3 | 2 | 1 |

Every one of these routes ever does exactly **one** query that's actually about
invoices. Everything else is the session/user lookup — doubled on list and detail
because both the layout and the page resolve it independently, not doubled on the
create POST because that route never passes through the layout at all. Left exactly as
measured; step 7 is where this gets reduced.
