# RecordSlice

A secure invoice management application built with **Next.js, TypeScript, Prisma and PostgreSQL**, focused on record-level authorization, data ownership, audit logging and database query optimization.

The project explores an important problem in multi-user applications: authentication tells the system **who the user is**, but authorization must ensure that users can only access and modify **records they actually own**.

## Key Engineering Features

- Secure user authentication and session management
- Email verification before protected invoice operations
- User-scoped invoice queries
- Record-level authorization
- Protection against cross-user record access
- Public IDs instead of exposing internal database IDs
- Transactional invoice deletion
- Audit logging for deleted records
- Consistent unauthorized/not-found behaviour
- Database query-count measurement
- Request-level session-query deduplication
- PostgreSQL indexing analysis
- Query-plan investigation using `EXPLAIN`
- Input validation with Zod

## The Problem

Consider two users:

```text
User A
└── Invoice A

User B
└── Invoice B
```

Authentication alone prevents anonymous users from accessing the application.

But it does not automatically prevent User B from attempting something like:

```text
/invoices/<user-a-invoice-id>
```

A secure application must enforce ownership at the data-access layer rather than trusting the UI or checking ownership only after retrieving a record.

RecordSlice was built to explore that boundary.

## Authorization Strategy

Invoice queries include the authenticated user's ID as part of the database condition.

Conceptually:

```text
Find invoice where:

publicId = requested invoice
AND
userId = authenticated user
```

Instead of:

```text
Find invoice by publicId
        ↓
Retrieve record
        ↓
Check whether user owns it
```

the ownership requirement is part of the query itself.

This means another user's invoice and an invoice that does not exist both fail to match the scoped query.

That reduces the risk of accidental cross-user data exposure and keeps the authorization rule close to the database operation it protects.

## Public IDs

Invoices are addressed externally using public identifiers rather than exposing internal database IDs.

For example:

```text
/invoices/<publicId>
```

The internal database identifier remains an implementation detail.

This separates public resource addressing from the database's internal primary-key structure.

## Protected Invoice Flow

A simplified request flow looks like:

```text
Request
   ↓
Validate Session
   ↓
Verify Email
   ↓
Identify Current User
   ↓
Perform User-Scoped Query
   ↓
Return Authorized Record
```

Invoice pages and API operations require a valid authenticated user before protected data is returned or modified.

## Invoice Management

The application supports invoice operations including:

- Creating invoices
- Listing the current user's invoices
- Viewing an individual invoice
- Deleting an invoice
- Recording deletion audit information

Each operation is designed around the authenticated user's ownership boundary.

## Secure Record Lookup

A detail request does not retrieve an invoice globally and then determine whether the current user owns it.

The query is scoped directly:

```text
publicId + userId
```

This means:

```text
User A requests User A invoice
→ Match
→ Invoice returned
```

while:

```text
User B requests User A invoice
→ No match
→ Not found
```

The application therefore avoids revealing whether an inaccessible record belongs to another user.

## Transactional Deletion

Deleting an invoice involves more than removing a row.

The application also records an audit entry containing information about the deleted invoice.

These operations belong together:

```text
Begin Transaction
      ↓
Find User-Owned Invoice
      ↓
Delete Invoice
      ↓
Create Audit Record
      ↓
Commit
```

If the audit operation fails, the transaction can roll back rather than leaving the application in a state where the invoice was deleted without its corresponding audit record.

This preserves consistency between the business action and its audit trail.

## Audit Logging

Successful deletion records information about the removed invoice.

The audit data includes information such as:

- Invoice public ID
- Invoice number
- Amount
- Currency
- Client name
- User responsible for the deletion
- Deletion timestamp

This preserves important information even though the original invoice no longer exists.

## Failure Verification

The deletion flow was tested beyond the successful path.

Scenarios included:

```text
Unauthenticated request
→ Rejected
```

```text
User B attempts to delete User A invoice
→ Not found
→ Invoice remains intact
```

```text
Nonexistent public ID
→ Not found
```

```text
Delete already-deleted invoice
→ Not found
→ No duplicate audit entry
```

The transaction was also tested by deliberately forcing the audit operation to fail during development.

The invoice remained intact, confirming that the transaction rolled back instead of partially completing the operation.

## Query Measurement

Database performance work began by measuring the queries generated by real application requests rather than optimizing based only on assumptions.

Query counts were documented for operations including:

- Invoice list
- Invoice detail
- Invoice creation

The measurements were taken against a running application.

The supporting analysis is documented in:

```text
DOC/query-counts.md
```

## Session Query Deduplication

One source of unnecessary queries came from session resolution occurring more than once during the same request.

For example, both a layout and a page could independently require the authenticated session.

The session lookup was wrapped using React's request-level `cache()` behaviour so repeated session resolution during the same request could reuse the result.

For the measured list and detail requests, this reduced the query count from:

```text
5 queries
```

to:

```text
3 queries
```

without changing the existing session API used throughout the application.

## Database Indexing

The project also investigates how PostgreSQL chooses query plans.

A composite index was evaluated for the invoice access pattern.

Instead of assuming that the existence of an index meant PostgreSQL would always use it, the query was examined at different data sizes.

Testing included a synthetic dataset of approximately:

```text
50,000 rows
```

The planner sometimes preferred a bitmap scan plus explicit sort rather than the composite index.

Further investigation showed that the index itself was valid: when the planner was made to use the relevant index path, it could eliminate the explicit sort through an index scan.

The result demonstrated an important database principle:

> Creating an index does not guarantee that the query planner will choose it.

The planner makes a cost-based decision based on the shape and size of the data.

## Access-Control Audit

The repository includes a dedicated review of the application's authorization boundaries:

```text
DOC/access-control-audit.md
```

This documents how protected records are accessed and where ownership checks are enforced.

## Tech Stack

- Next.js
- TypeScript
- React
- PostgreSQL
- Prisma
- Zod
- bcrypt
- Tailwind CSS
- Docker Compose

## Project Structure

```text
app/
├── (auth)/
│   ├── signup/
│   ├── signin/
│   ├── verify/
│   ├── forgot-password/
│   └── reset-password/
│
├── api/
│   ├── auth/
│   └── invoices/
│
└── invoices/
    ├── new/
    └── [publicId]/

components/
lib/
prisma/

DOC/
├── access-control-audit.md
├── assessment-4-brief.md
└── query-counts.md
```

The application keeps authentication, invoice operations and supporting engineering documentation separated into clear areas.

## Authentication

RecordSlice builds on an authentication system that includes:

- Account registration
- Password hashing
- Email verification
- Sign in and sign out
- Database-backed sessions
- Password reset
- Request validation

The invoice system then adds authorization rules on top of authentication.

This distinction is important:

```text
Authentication
"Who are you?"

Authorization
"Are you allowed to access this record?"
```

RecordSlice primarily focuses on the second question.

## Environment Variables

The repository includes:

```text
.env.example
```

as a template for local configuration.

Copy it to create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Real credentials and secrets should remain in `.env` and should not be committed.

## Running Locally

Clone the repository:

```bash
git clone https://github.com/ScrappyAT/recordslice.git
cd recordslice
```

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Configure the PostgreSQL connection and other required environment variables.

Then run the application:

```bash
npm run dev
```

Open the local development URL shown by Next.js.

## Engineering Documentation

More detailed implementation and assessment notes are available in:

```text
DOCUMENTATION.md
```

Additional focused engineering analysis is available under:

```text
DOC/
```

These files contain deeper evidence and reasoning behind the implementation without making the main README unnecessarily long.

## What I Learned

This project reinforced that securing a multi-user application requires more than checking whether someone is logged in.

The data-access layer must consistently enforce ownership.

Some of the main lessons were:

- Authentication and authorization solve different problems.
- Ownership constraints are safer when included directly in database queries.
- Internal database IDs do not need to become public resource identifiers.
- Transactions are important when multiple database operations represent one business action.
- Audit logs can preserve important information after the original record is deleted.
- Query optimization should begin with measurement rather than assumptions.
- Redundant authentication queries can become a measurable performance cost.
- An index existing does not mean PostgreSQL will always choose it.
- Query plans need to be evaluated using realistic data sizes.
- Security behaviour should be tested with multiple real users, not only the happy path.

The project helped me think about application security as a combination of authentication, authorization, database design and consistent data-access rules.

## Project Context

This project was built as part of my **Product Design & Engineering** training.

It focuses on secure record access, authorization boundaries, transactional data operations and database performance.

It builds on my earlier authentication work by moving from:

```text
Can this user sign in securely?
```

to:

```text
Once signed in, what data should this user actually be allowed to access?
```

## License

This project is licensed under the MIT License.
