# Project Context

## What this repository is

A single records and access slice, built for Assessment 4 of a product engineering
bootcamp. The full brief is at `DOC/assessment-4-brief.md`. Read it before starting any
task.

This is **not** an application. It is one flow, built properly, with nothing around it.
Anything outside the brief is a liability, not a bonus.

The records are **invoices**. The domain does not matter and carries no business rules.
An invoice is a number, an amount, a currency, a client name, an issue date and a status.
Nothing computes VAT, nothing emails anyone, nothing generates a PDF.

## Stack

- Next.js (App Router), Prisma, PostgreSQL, TypeScript
- Auth reused from Assessment 1, imported by hand and committed as such

Do not introduce new frameworks or ORMs.

## Hard rules

1. **Never create, write to, or modify `.env`.** I write secrets by hand. You may edit
   `.env.example` with commented placeholders only.
2. **Never put a secret, key or credential in a source file**, including in a test, a
   comment, or an example.
3. **Do not build anything in the "Do not build" list.** No landing page, no editing,
   no search, no tags, no sharing, no collaboration, no dashboard widgets. Create, list,
   view, delete. That is all.
4. **One step at a time.** Complete the single step I asked for, then stop and explain
   what you did. Do not proceed unprompted.
5. **Small commits.** Each step is its own commit.
6. **No placeholder or fake data anywhere.** Empty states must be genuine. Do not seed
   demo invoices. Every invoice in the database was created through the real form by a
   real account of mine.
7. **No raw database identifier ever leaves the server.** Not in a URL, not in a form
   field, not in a JSON response, not in a `data-` attribute, not in a React key that
   ends up in the DOM.

## Architectural decisions — do not change these without asking

### Identifiers

- **Two identifiers per invoice, with different jobs.** `id` is the primary key and
  never leaves the server. `publicId` is a random, unguessable, URL-safe string, unique
  and indexed, and is the only identifier any client ever sees.

- **A cuid primary key exposed in a URL is still a raw database identifier.** It is
  unguessable, which is a different property from not being the database's own key.
  Obscurity is not access control, and the brief's requirement is about coupling, not
  guessability: exposing the primary key means the URL and the storage layer can no
  longer change independently.

- **`publicId` is generated in application code, not by a database default.** It is
  generated once at creation and never regenerated. Lookups are always
  `where: { publicId, userId }` — never `where: { publicId }` alone.

### Access control

- **Every query is scoped to the authenticated user inside the query itself.** The
  `userId` condition goes in the `where` clause of the Prisma call. There is no
  fetch-then-check anywhere in this codebase. If a query can return a row belonging to
  another user, the query is wrong, even if a later line would have rejected it.

- **Scoping is structural, post-fetch checking is procedural.** A scoped query cannot
  leak because the row is never retrieved. A post-fetch check works until someone adds
  a route and forgets the check, which is a matter of when rather than whether.

- **The session user id is read from the session on the server, every request.** It is
  never taken from a request body, a query parameter, a header or a hidden form field,
  even when the value would be correct.

### Status codes

Three distinct meanings, and I have to defend the distinction:

- **401 — no valid session.** The requester has not proven who they are. Browser
  requests redirect to sign in; API requests return 401 as JSON.

- **403 — valid session, but not permitted.** The shell checks `emailVerifiedAt` on
  every request and returns 403 when it is null: the requester has proven who they are
  and still may not act.

  Under the auth slice's current flow this is unreachable, because sign-in refuses an
  unverified account and verification sets `emailVerifiedAt` in the same request, so a
  session for an unverified user cannot exist. I check anyway. The invariant that makes
  it unreachable lives in the sign-in route, and the code depending on it lives in the
  shell — one new session-creating path in a future change breaks the link silently,
  and a check that costs three lines is cheaper than the audit that would find it.
  Section 5 must say this plainly rather than implying the state occurs in normal use.

- **404 — the record is not in your scope.** Another user's invoice returns 404, not
  403. Returning 403 would confirm that the record exists, which tells an attacker
  editing identifiers in a URL that they found a real one. 404 tells them nothing, and
  the scoped query means the server genuinely cannot distinguish "does not exist" from
  "not yours" without a second unscoped lookup — which I deliberately do not perform,
  because performing it would create exactly the leak I am avoiding.

- **Do not use 403 for ownership failures anywhere in this slice.**

### Deletion and audit

- **The audit row is written in the same database transaction as the delete.** Not
  before as a separate statement, not after. If the delete fails the audit row must not
  exist; if the audit write fails the delete must not happen.

- **The audit row does not have a foreign key to the invoice**, because the invoice is
  gone. It stores the values it needs denormalised: `invoicePublicId`, `invoiceNumber`,
  `amountMinor`, `currency`, `clientName`, the `userId` of the deleter, and
  `deletedAt`. An audit record that cannot say what was deleted is not an audit record.

- **Deletion is a hard delete of the invoice row.** A soft delete would leave the row
  reachable by any query that forgets the filter, which is the same class of bug as
  post-fetch checking. The audit table is the history.

- **Deletion requires a confirmation step** and the confirmation names the invoice.

### Money

- **Amounts are integers in minor units with the currency stored alongside**, same rule
  as Assessment 2. Never a float, never a decimal type. This is not required by this
  brief, but the two repositories will be read by the same person and contradicting
  myself would be worse than the small extra effort.

### Views and URLs

- **Every view is addressable.** The list, the detail view and the create form each
  have a real URL that can be shared, bookmarked and opened cold in a new tab.

- **Navigation between them does not cause a full page load.** Next.js App Router soft
  navigation via `Link` provides this; if it does not in practice, say so rather than
  claiming it.

- **A view reached by a shared URL must render the same thing as a view reached by
  navigation.** If a detail page only works when you arrive from the list, it is broken.

### Query counts

- **The naive version is built first and measured before anything is optimised.** I
  need a real "before" number for the documentation, and it cannot be reconstructed
  after the fact. Do not pre-optimise a query and then invent a worse version to
  compare it against.

- **Counts are measured, not estimated.** Use Prisma's query event logging and count
  actual statements for one request of each of: list, detail, create. Record the number
  and what each query was doing.

- **Indexes go on the columns actually filtered and sorted on**, and each one is
  justified by a query that uses it. A composite index on `(userId, createdAt)` for the
  list ordering, and a unique index on `publicId`. Do not add indexes speculatively.

## Build order

Work through these in sequence. Do not skip ahead.

1. Project scaffold, `.env.example`, auth imported from Assessment 1, signed-in shell
2. Prisma schema and initial migration: `Invoice`, `InvoiceDeletion`, with constraints
3. The create flow: form, server-side validation, scoped write
4. The list view, built naively, with a genuine empty state
5. The detail view, scoped by `publicId` and `userId`
6. **Measure query counts for list, detail and create. Record the numbers.**
7. Index pass and query reduction. Re-measure. Record both numbers.
8. Deletion with confirmation and the audit row, in one transaction
9. Status code pass: 401, 403 and 404 applied per the rules above
10. **The access control audit.** Two accounts, every route, documented attempts
11. `DOCUMENTATION.md`
12. LinkedIn post

**Evidence is captured at the step that produces it, not at the end.** Keep a running
scratch file of every wrong turn as it happens — Section 6 needs three real problems
with the dead ends included.

## The access control audit — step 10

This is what the assessment is actually graded on. It is not a formality.

Two real accounts. For every route in the slice, attempt to reach account one's data as
account two. One row per route: method, path, what was attempted, what happened, pass or
fail.

The attempts must include, at minimum:
- Editing the `publicId` in a URL to another user's value
- Calling every API route directly with `curl` and a valid session cookie for the wrong
  user
- Replaying a request captured as one user while signed in as the other
- Hitting every route with no session at all
- Hitting every route with a session whose email is unverified
- Deleting another user's invoice by `publicId`

Every row must read pass by submission. The table must show what was tried, not only the
outcome. A table with five rows and no failures reads as a table that was not really
attempted.

## How to help me

I have to defend every line of this out loud, and answer questions like "show me a query
and tell me what happens if I remove the user condition from it." So:

- Explain the reasoning behind what you write, briefly, as you write it.
- When there was a real alternative, name it and say why you did not take it.
- If I ask you to do something that contradicts the brief, say so instead of complying.
- Do not add error handling, abstraction, or features I did not ask for.
- Test the unhappy paths, not just the happy one. A wrong-user identifier, a missing
  session, an unverified email, a deleted record fetched again, a create with invalid
  input.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
