# Assessment 4 — The Records and Access Slice

Time budget: 14 to 18 hours.
Deadline: Wednesday 17 September 2026.

## Deliverables

1. A GitHub repository containing the working slice
2. A `DOCUMENTATION.md` at the repository root, eight sections, same structure as the
   other assessments
3. A LinkedIn post about what was built and the concepts behind it

The documentation carries as much weight as the code.

## What to build

A flow where users create, view, and delete records that belong to them, built so that no
user can ever reach another user's data.

The records can be anything: projects, notes, invoices, bookings. The domain does not
matter. What matters is ownership, correct access control, and efficient data access.

### Screens

- A list of the signed-in user's records, with a true empty state
- A create action
- A detail view for one record
- A delete action with confirmation

### Behaviour

- A user sees only their own records, everywhere, without exception
- Views change without full page loads, but the URL still updates so any view can be
  shared or bookmarked
- Deletion is recorded for audit before the record disappears
- Nothing in the URL or the interface exposes a raw database identifier

## Do not build

No landing page. No editing, search, tags, sharing, or collaboration. No dashboard
widgets. Create, list, view, delete. That is all.

## Engineering requirements

- Every query scoped to the authenticated user in the query itself, not checked after
  fetching
- No raw database identifiers exposed in URLs or in the interface
- An audit record written for every deletion, capturing who deleted what and when,
  persisted before or as part of the delete
- Conditional views with URL state, so navigation is fast but every view is addressable
- Correct status codes throughout, with 401 and 403 used for their distinct meanings
- A measured query count for each of the three main actions, documented, with a stated
  reduction from the first working version
- Indexes on the columns filtered and sorted on
- Genuine empty states, with no placeholder or fake data anywhere

## Concepts to document in Section 5

- Authentication versus authorisation
- Scoping the query versus checking after the fetch, and why the first makes a leak
  structurally impossible
- Insecure direct object references, meaning what happens when a user edits an identifier
  in a URL
- Why raw database identifiers are not exposed
- Audit logging and why deletions are recorded
- Page architecture, meaning conditional rendering with URL state and why both matter
- Status codes, specifically 401 against 403
- Database indexing
- Query count as a cost, with before and after numbers

## Prove it works

This assessment is graded largely on evidence of attack and measurement.

- **An access control audit table.** Create two users. For every route, attempt to reach
  user one's data as user two, by editing identifiers, replaying requests, and calling
  endpoints directly with curl. One row per route: method, path, what was attempted, what
  happened, pass or fail. Every row must say pass by the time you submit, and the table
  must show what you tried, not only the outcome.
- **A query count table**, showing each of the three main actions before and after the
  reduction, with the classification of what each query was doing.
- A screenshot of the audit log after a deletion.
- A screenshot of a URL showing an identifier that is not the database identifier.

## Grading bands

**Pass:** ownership enforced everywhere, audit table complete with every row passing,
deletions logged, URLs update with view changes, no raw identifiers exposed.

**Excellent:**
- Every ownership rule is enforced by query scoping rather than by post-fetch checks
- The query count reduction is meaningful and the classification is accurate
- Section 5 identifies the single change that would have prevented the most audit
  failures

## Traps

- Hiding the identifier and believing the record is now protected. Obscurity is not
  access control; the ownership check is.
- Adding a check after fetching, which works today and will be forgotten by whoever
  writes the next route.
- Logging the deletion after the row is gone, so the audit record cannot reference what
  was deleted.
- Building conditional views and forgetting the URL, so nothing can be shared.
- Testing access control with one user account, which tests nothing.

## Defence questions

These will be asked exactly as written.

1. Show me a query and tell me what happens if I remove the user condition from it.
2. I change the identifier in this URL to a value I guessed. Walk me through every layer
   that stops me.
3. Your query count went from a higher number to a lower one. Which single change did the
   most, and why?
4. Why is this a 403 and not a 404, or the other way round?

---

# The Documentation Template

Same eight sections as the other assessments.

**Section 1: What This Is** — two paragraphs. What the slice does, and what is
deliberately excluded and why.

**Section 2: How To Run It** — numbered steps from fresh clone to working local instance.
What to install. Environment variables listed by name with where each comes from.
Database setup and migration command. Start command. URL. Include `.env.example`, never
commit real keys. A reviewer who cannot run the project in under ten minutes will assume
it does not run.

**Section 3: The Flow, Step By Step** — narrative, not a list of endpoints. For each step:
what the user does, what the frontend sends, what the server does with it, and the actual
route or file where it lives.

**Section 4: The Data Model** — every table, one line on what it holds, and the decision
behind each column that carries one. Why that type, why that constraint, why nullable or
not. Then answer explicitly: which constraints make an invalid state impossible?

**Section 5: The Concepts** — the most heavily graded section. Each concept gets its own
subheading and four questions in order: what it is, why it is needed, how I implemented
it, what I chose against and why. No skipping the fourth. Code excerpts are ten lines
maximum; if the point needs more, explain it in prose.

**Section 6: What Went Wrong** — minimum three problems, each with symptom, investigation
including the dead ends, cause, and fix. Do not sanitise.

**Section 7: What This Slice Does Not Handle** — honest limitations. What breaks at scale.
What would be needed before real users. Distinguish what was left out because it was
outside the brief from what was left out because time ran out.

**Section 8: If I Built This Again** — one paragraph, one thing, chosen deliberately.

---

# The LinkedIn Post

200 to 400 words. Open with the problem or the surprise, not a progress update. Name what
was built in one sentence. Teach one concept properly in three or four sentences. Include
a real detail with a number or a specific behaviour. Link the repository.

Avoid: progress updates, lists of technologies, pretending it was easy or hard.

Test: would someone who does not know you learn something from this post?

---

# Submission Checklist

**Repository**
- [ ] Runs from a fresh clone using only the steps in Section 2
- [ ] `.env` is not committed — confirm in a private browser window
- [ ] `.env.example` present with commented placeholders
- [ ] Commit history shows incremental work, not one commit
- [ ] Nothing outside the brief was built

**Documentation**
- [ ] `DOCUMENTATION.md` at repository root
- [ ] All eight sections present, in order
- [ ] Every required concept has its own subheading in Section 5
- [ ] Every concept answers all four questions, including the fourth
- [ ] Section 6 contains at least three real problems with real investigations
- [ ] All required evidence screenshots included and readable

**LinkedIn**
- [ ] Posted, with the repository linked
- [ ] Teaches one concept properly rather than announcing completion
- [ ] Contains at least one specific number or behaviour
- [ ] Passes the test: a stranger learns something from it

**Yourself**
- [ ] You can open any file in the repository and explain why it exists
- [ ] You have read the defence questions and answered each one out loud
