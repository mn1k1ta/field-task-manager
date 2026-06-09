---
title: "PRD: Field Task Manager"
status: draft
created: 2026-06-09
updated: 2026-06-09
author: John (Product Manager)
project: field-task-manager
---

# PRD: Field Task Manager

## 0. Document Purpose

This PRD is the build contract for Field Task Manager v1. Its audience is the implementing engineer (in this build, an AI agent operating under an 8-hour budget), the reviewer who will accept the deliverable, and any downstream UX/architecture work. It builds directly on the approved Product Brief (`_bmad-output/planning-artifacts/product-brief.md`) and does not re-argue scope already settled there. The structure is Glossary-anchored: every domain noun is defined once in §3 and used verbatim everywhere else. Features are grouped in §6 with globally numbered, individually testable Functional Requirements (FR-1..FR-n) nested under them; cross-cutting Non-Functional Requirements live in §7; and §10 decomposes the whole into Epics with user stories and acceptance criteria that trace back to every FR. The technology stack is fixed by the brief and is treated here as a hard constraint (§8), not an open design question.

## 1. Goals

**Product goal.** Replace ad-hoc field-work coordination (calls, chat, spreadsheets) with a single source of truth: a map-anchored task list governed by an enforced status workflow and an auditable comment trail. Location is a draggable marker, not prose; status is a state machine, not an opinion; closure is an explicit Admin verification, not an assumption.

**Build goals (what this release must achieve):**

- **G1 — Frictionless start.** A reviewer can `git clone` the repository and run the entire system with a single command (`dotnet run` on the backend), with zero manual dependency installation, no Docker, and no external services. This is the headline goal and the primary acceptance test.
- **G2 — Enforced accountability.** Every task moves through `Created -> In Progress -> Done -> Verified`, with closure (Verified) and reopen reserved to the Admin, enforced server-side.
- **G3 — Map-first situational awareness.** The Admin sees all tasks as status-colored markers and can correct any location by dragging its marker; the Worker sees only their own work.
- **G4 — Auditability by default.** Every status change and comment is attributed (who) and timestamped (when) as a natural byproduct of normal use.
- **G5 — Self-documenting delivery.** A README explains what the system does, how to run it, the technologies used, and the seeded Admin credentials.

**Non-goal of the goals section:** this is an internal build under a hard time cap. We optimize for a clean, complete, runnable v1 — not for a market moat, scale, or feature breadth beyond the scope in §9.

## 2. Context and Background

Field work is coordinated by people who are not standing where the work happens. Without a purpose-built tool, location degrades into lossy prose ("the pump near the north gate"), "done" means different things to the Worker and the Admin, accountability evaporates into chat history, and visibility is asymmetric — Admins cannot see the whole board while Workers are distracted by tasks that are not theirs. The cumulative cost is rework, disputes over completion, silently missed deadlines, and supervisory time spent reconstructing state.

Field Task Manager addresses this with a deliberately small v1: two roles (Admin, Worker), tasks pinned to a map, an enforced four-state workflow with an Admin-owned closure gate, and an attributed comment trail. The build is constrained to ~8 hours with an AI agent as the primary implementer, which is the dominant reason scope is held tight and the stack is fixed. The single hardest requirement is operational, not functional: the system must start with one command after a fresh clone. That constraint shapes every technical choice (SQLite file DB, no Docker, OpenStreetMap tiles with no API key, Angular auto-built into the backend `wwwroot`).

## 3. Glossary

Downstream readers and FRs must use these terms exactly. No synonyms anywhere else in this PRD.

- **User** — an authenticated account in the system. Has exactly one Role. Created by self-registration or by auto-seed.
- **Role** — the authorization level of a User. Exactly one of **Admin** or **Worker**.
- **Admin** — the dispatcher/supervisor Role. Can create/edit/delete Tasks, assign Assignees, see all Tasks, comment, and perform the Verify and Reopen transitions. Exactly one Admin account is auto-seeded on first run (v1 assumes a single dispatcher).
- **Worker** — the field-executor Role. Can see only Tasks where they are the Assignee, advance those Tasks through the Worker transitions, and add Comments. The Role granted to every self-registered User.
- **Task** — the unit of field work. Has: title, description, Location, Assignee, Deadline, Status, creation timestamp, and an ordered set of Comments. Created and owned by the Admin.
- **Assignee** — the single Worker responsible for a Task. A Task has exactly one Assignee at a time (set at creation, changeable by the Admin).
- **Location** — a geographic point (latitude, longitude) attached to a Task, placed by clicking the Map and editable by dragging the Task's Marker.
- **Map** — the interactive Leaflet + OpenStreetMap view that renders Tasks as Markers.
- **Marker** — the visual representation of a Task's Location on the Map. Its color encodes the Task's Status.
- **Status** — the lifecycle state of a Task. Exactly one of **Created**, **In Progress**, **Done**, **Verified**.
- **Status Workflow** — the permitted Status transitions: `Created -> In Progress -> Done` (Worker-driven), `Done -> Verified` (Admin-only, "Verify"), and `Done -> In Progress` / `Verified -> In Progress` (Admin-only, "Reopen").
- **Comment** — a free-text note attached to a Task, recording author (the User) and timestamp. Immutable once posted in v1.
- **Verify** — the Admin-only transition `Done -> Verified` confirming closure.
- **Reopen** — the Admin-only transition returning a `Done` or `Verified` Task to `In Progress`.
- **Deadline** — a date/time by which a Task is expected to be completed. Used for display and filtering; does not by itself change Status.

## 4. Personas

### 4.1 Admin (Dispatcher / Supervisor) — primary

- **Who.** A supervisor accountable for field work they do not personally perform. In v1 there is exactly one Admin, auto-seeded on first run.
- **Jobs to be done.** Create and assign Tasks quickly; see the entire field at a glance; correct mistakes (Location, Assignee, Deadline) without friction; hold the gate on what counts as truly finished.
- **Needs.** A whole-board Map where color tells the truth about Status; fast Task creation with map-click Location placement; the exclusive power to Verify or Reopen; the ability to reconstruct any Task's full history.
- **Success looks like.** Green means done-and-verified; nothing slips through unverified; "where is all my open work?" is answerable from the Map alone.
- **Frustrations to avoid.** Re-entering data, hunting for which Task a comment refers to, ambiguity about whether a Worker's "done" is final.

### 4.2 Worker (Field Executor) — primary

- **Who.** A field technician who performs assigned Tasks. Created by self-registration; every self-registered User is a Worker.
- **Jobs to be done.** Know exactly which Tasks are mine; find each Task's Location unambiguously; advance Status as work progresses; record what happened via Comments.
- **Needs.** An uncluttered list and Map showing only my Tasks; a clear place to read the Location; one-tap Status advancement up to Done; a place to leave attributed notes.
- **Success looks like.** Never wondering "is this mine?" or "where exactly is this?"; able to report progress without a phone call.
- **Frustrations to avoid.** Seeing other people's work; being able (or expected) to self-certify final closure; losing the record of what was said.

## 5. UX Goals

- **UXG1 — Map-first, not form-first.** Location is a manipulable object (click to place, drag to correct), not a free-text field. The Map is the primary surface for situational awareness.
- **UXG2 — Role-appropriate views by default.** The Admin lands on the all-Tasks board; the Worker lands on their own filtered queue. The UI never shows a User affordances their Role cannot use, and never relies on the UI alone for that boundary (server enforces it — see NFR-2).
- **UXG3 — Status is legible at a glance.** Marker color maps consistently to Status, with the mapping documented in the UI legend: Created, In Progress, Done, Verified each have a distinct, consistent color used identically on Markers and in the list.
- **UXG4 — Low-friction task entry.** Creating a Task is a single dialog: title, description, click-the-map Location, Assignee dropdown, Deadline. No multi-step wizard.
- **UXG5 — Honest state on errors.** Failed actions (auth expiry, forbidden transition, network error) produce a clear, non-silent message; the UI never shows success it did not achieve.
- **UXG6 — Responsive, browser-only.** A modern desktop browser is the primary target; layout remains usable on a narrow viewport (tablet/large phone). No native app, no offline mode in v1.
- **UXG7 — Discoverability of the gate.** Verify and Reopen are visibly available to the Admin only, on Tasks in the appropriate Status, with clear labels so the closure gate is obvious rather than hidden.

## 6. Features and Functional Requirements

FRs are globally numbered and individually testable. Each lists testable consequences. Actor terms are Glossary terms.

### 6.1 Authentication, Roles, and Account Bootstrap

**Description.** The system supports self-registration and login with basic credentials. The first time the system starts against an empty database, exactly one Admin account is auto-seeded with documented credentials. Every self-registered User is assigned the Worker Role automatically; there is no UI or API path for a self-registering User to choose or escalate to Admin. Authentication is JWT-bearer; passwords are stored only as BCrypt hashes. Authorization (which Role may do what) is enforced server-side on every protected endpoint.

**Functional Requirements:**

#### FR-1: Self-registration as Worker
A visitor can register a new account by providing a unique identifier (username or email) and a password.
**Consequences (testable):**
- A successful registration creates a User with Role = Worker — never Admin — regardless of any role value supplied in the request body.
- The stored password is a BCrypt hash; the plaintext is never persisted or returned.
- Registering with an identifier that already exists is rejected with a clear error (HTTP 409 or 400) and creates no User.
- Immediately after registering, the User can log in (FR-3).

#### FR-2: Auto-seed Admin on first run
On startup, if no Admin exists in the database, the system creates exactly one Admin account using credentials defined in configuration and documented in the README.
**Consequences (testable):**
- Starting the system against an empty database yields exactly one Admin User; starting it again does not create a second Admin (idempotent seed).
- The seeded Admin's password is stored as a BCrypt hash.
- The seeded Admin can log in (FR-3) with the documented credentials and immediately exercise Admin-only capabilities.

#### FR-3: Login and token issuance
A registered User can log in with their identifier and password and receive a JWT.
**Consequences (testable):**
- Valid credentials return a signed JWT whose claims include the User's identity and Role.
- Invalid credentials return an authentication error (HTTP 401) and no token.
- The token is required to call any protected endpoint; absent/invalid/expired tokens are rejected with HTTP 401.

#### FR-4: Role-based authorization enforced server-side
Every protected endpoint authorizes the caller by Role and (where relevant) by Task ownership, independent of the client UI.
**Consequences (testable):**
- A Worker calling an Admin-only endpoint (e.g., create Task, Verify, Reopen, list-all-Tasks) receives HTTP 403 and the operation has no effect.
- A Worker requesting a Task they are not the Assignee of receives HTTP 403/404 and cannot read it.
- Removing or tampering with the JWT does not grant access; the boundary holds even if the UI is bypassed (e.g., via direct API call).

### 6.2 Task Management (CRUD)

**Description.** The Admin creates and maintains Tasks. A Task carries a title, description, Location, Assignee, Deadline, and Status. The Admin can edit any field of any Task and delete Tasks. Workers cannot create, reassign, or delete Tasks; they interact with assigned Tasks via Status transitions (§6.4) and Comments (§6.5). Realizes the Admin's "create and assign fast / correct without friction" jobs.

**Functional Requirements:**

#### FR-5: Create Task
An Admin can create a Task by supplying title, description, Location (latitude/longitude placed via the Map), Assignee (a Worker), and Deadline.
**Consequences (testable):**
- A created Task is persisted with Status = Created, a creation timestamp, and the supplied fields.
- Title is required and non-empty; a create attempt missing a required field (title, Location, Assignee, Deadline) is rejected (HTTP 400) and persists nothing.
- The Assignee must be an existing Worker; assigning to a non-existent or non-Worker User is rejected.
- Immediately after creation the Task appears as a Marker on the Map (FR-9) and in the Admin's list.

#### FR-6: Edit Task fields
An Admin can edit a Task's title, description, Assignee, and Deadline.
**Consequences (testable):**
- Edits persist and are reflected in subsequent reads, the list, and the Map.
- Reassigning a Task changes its Assignee; the previous Assignee can no longer see it and the new Assignee can (boundary per FR-4/FR-7).
- An edit that violates a field rule (e.g., empty title, non-Worker Assignee) is rejected (HTTP 400) and leaves the Task unchanged.

#### FR-7: Read Tasks scoped by Role
A User can read Tasks according to their Role: an Admin reads all Tasks; a Worker reads only Tasks where they are the Assignee.
**Consequences (testable):**
- An Admin list/read returns Tasks for all Assignees.
- A Worker list/read returns only their own Tasks; another Worker's Task is never present in the response.
- This scoping is enforced server-side (per FR-4), not merely hidden in the UI.

#### FR-8: Delete Task
An Admin can delete a Task.
**Consequences (testable):**
- A deleted Task no longer appears in any list, on the Map, or via direct read (HTTP 404).
- Associated Comments are removed with the Task (no orphaned Comments).
- A Worker attempting to delete a Task receives HTTP 403 and the Task persists.

### 6.3 Map and Location

**Description.** Tasks are rendered as Markers on a Leaflet Map using OpenStreetMap tiles (no API key). Marker color encodes Status. The Admin places a Location by clicking the Map during creation and corrects it by dragging the Marker; the new coordinates persist. The Admin's Map shows all Tasks; the Worker's Map shows only their own. Realizes UXG1, UXG3.

**Functional Requirements:**

#### FR-9: Render Tasks as status-colored Markers
The system renders each visible Task as a Marker at its Location, colored by Status.
**Consequences (testable):**
- Each of the four Statuses (Created, In Progress, Done, Verified) renders with a distinct, consistent Marker color, matching the UI legend (UXG3).
- The set of Markers respects Role scoping (FR-7): the Admin sees all; the Worker sees only their own.
- When a Task's Status changes (§6.4), its Marker color updates to match on the next render/refresh.

#### FR-10: Place Location by clicking the Map
During Task creation/edit, the Admin sets the Location by clicking a point on the Map.
**Consequences (testable):**
- Clicking the Map captures latitude/longitude and binds them to the Task being created/edited.
- The captured coordinates are what get persisted on save (FR-5/FR-6).

#### FR-11: Edit Location by dragging the Marker
An Admin can change a Task's Location by dragging its Marker to a new point.
**Consequences (testable):**
- Dragging a Marker and saving updates the Task's stored latitude/longitude to the drop point.
- After reload, the Marker appears at the new coordinates (the change persisted).
- A Worker cannot drag-edit a Task's Location (no edit affordance; server rejects an attempt per FR-4).

### 6.4 Status Workflow

**Description.** The Status Workflow is enforced by the system, not by convention. A Worker can advance their own Task `Created -> In Progress -> Done`. Only the Admin can Verify (`Done -> Verified`) or Reopen (`Done -> In Progress` or `Verified -> In Progress`). No other transitions are permitted (e.g., a Worker cannot set Verified; no jump from Created straight to Done; no backward move by a Worker). Realizes G2, UXG7.

**Functional Requirements:**

#### FR-12: Worker advances own Task forward
The Assignee can transition their Task `Created -> In Progress` and `In Progress -> Done`.
**Consequences (testable):**
- A Worker can perform exactly these two forward transitions on a Task they are the Assignee of.
- A Worker attempting any other transition (e.g., `Created -> Done`, `Done -> Verified`, any backward move) is rejected (HTTP 403/400) and the Status is unchanged.
- A Worker attempting a transition on a Task they are not assigned to is rejected (FR-4/FR-7).
- Each accepted transition is recorded with actor and timestamp (NFR/§6.4 audit; supports FR-15).

#### FR-13: Admin verifies a Done Task
An Admin can Verify a Task, transitioning `Done -> Verified`.
**Consequences (testable):**
- Verify succeeds only when the Task's current Status is Done; from any other Status it is rejected (HTTP 400).
- After Verify, Status = Verified and the Marker color updates accordingly (FR-9).
- A Worker cannot Verify (HTTP 403).

#### FR-14: Admin reopens a Task
An Admin can Reopen a Task, transitioning `Done -> In Progress` or `Verified -> In Progress`.
**Consequences (testable):**
- Reopen succeeds only when current Status is Done or Verified; from Created or In Progress it is rejected (HTTP 400).
- After Reopen, Status = In Progress and the Assignee can again advance it (FR-12).
- A Worker cannot Reopen (HTTP 403).

### 6.5 Comments

**Description.** Any User who can see a Task can add Comments to it. Each Comment records its author (the User) and the time it was posted. Comments are displayed in chronological order with author and timestamp, forming the Task's audit trail together with Status changes. Realizes G4.

**Functional Requirements:**

#### FR-15: Add a Comment
A User who can access a Task (Admin for any Task; Worker for their own) can post a Comment with free text.
**Consequences (testable):**
- A posted Comment persists with the author's identity and a server-assigned timestamp.
- A Worker cannot comment on a Task they are not the Assignee of (HTTP 403/404).
- Empty/whitespace-only Comment text is rejected (HTTP 400).

#### FR-16: View Comments with author and time
A User viewing an accessible Task sees its Comments in chronological order, each showing who authored it and when.
**Consequences (testable):**
- Comments render oldest-to-newest (or clearly time-ordered) with author identity and timestamp visible.
- The displayed author and timestamp match what was persisted at post time and are not editable in v1.

### 6.6 Filtering and Search

**Description.** Users can narrow the Task list to find relevant work. Filtering by Status and searching by text (title/description) are supported. Filtering/search operate within the User's authorized scope: a Worker only ever filters/searches across their own Tasks (FR-7). Realizes the "find my work / find open work" jobs.

**Functional Requirements:**

#### FR-17: Filter Tasks by Status
A User can filter the Task list to one or more Statuses.
**Consequences (testable):**
- Filtering to a Status returns only Tasks in that Status, within the User's authorized scope.
- Clearing the filter returns the full authorized set.

#### FR-18: Search Tasks by text
A User can search Tasks by a text query matching title and/or description.
**Consequences (testable):**
- A query returns only authorized Tasks whose title or description matches the query (case-insensitive substring is acceptable).
- An empty query returns the full authorized set; a non-matching query returns an empty result without error.
- Search respects Role scope: a Worker's results never include another Worker's Tasks.

### 6.7 Persistence

**Description.** All data (Users, Tasks, Locations, Statuses, Comments) is stored in a SQLite file database via Entity Framework Core. The database is created and migrated automatically at startup with no manual step. Realizes G1.

**Functional Requirements:**

#### FR-19: Durable persistence in SQLite
The system stores all entities in a SQLite file database; data survives process restart.
**Consequences (testable):**
- Data created in one run (Users, Tasks, Comments, Status, Location) is present after stopping and restarting the process.
- Relationships are intact after restart (a Task's Assignee, Comments, and coordinates resolve correctly).

#### FR-20: Auto-create and migrate at startup
On startup the system ensures the database schema exists and is up to date, creating/migrating it automatically.
**Consequences (testable):**
- Running against a non-existent database file creates it and applies the schema with no manual command.
- Running against an existing up-to-date database starts cleanly without re-applying or erroring.
- Seed (FR-2) runs after the schema is ready.

### 6.8 One-Command Run and README

**Description.** The headline operational requirement: after `git clone`, a single command (`dotnet run` on the backend) builds and serves the whole system. An MSBuild target invokes npm to build the Angular SPA into the backend `wwwroot`; the backend then serves the SPA static files and the API on a single port with SPA fallback routing. No Docker, no external services, no manual steps. A README documents purpose, run instructions, technologies, and the seeded Admin credentials. Realizes G1, G5.

**Functional Requirements:**

#### FR-21: Single-command start from a clean clone
After a fresh `git clone`, running the documented single command (`dotnet run` on the backend) builds the Angular SPA and starts the system without any manual dependency installation, Docker, or external service.
**Consequences (testable):**
- On a machine with the documented prerequisites (.NET 10 SDK, Node.js 22), the single command produces a running system reachable in a browser, with no additional manual steps.
- The Angular build is triggered automatically by the backend build (MSBuild target invoking npm); the developer does not run npm manually.
- A second run reuses the build appropriately and still results in a running system.

#### FR-22: Single-port SPA + API serving with fallback routing
The backend serves the SPA static files and the API on one port; client-side routes resolve via SPA fallback.
**Consequences (testable):**
- The application UI and the API are reachable on the same single port.
- Navigating directly to a client-side route (deep link) returns the SPA shell rather than a 404 (SPA fallback).
- API routes are reachable and not shadowed by the SPA fallback.

#### FR-23: README completeness
The repository includes a README documenting what the project does, how to run it (the single command and prerequisites), the technologies used, and the seeded Admin credentials.
**Consequences (testable):**
- The README states purpose, prerequisites, the single run command, the technology stack, and the default Admin credentials (matching FR-2).
- A reviewer following only the README can start the system on first try.

## 7. Non-Functional Requirements (Cross-Cutting)

- **NFR-1 — Single-command, zero-setup start (load-bearing).** The system MUST run from a fresh clone with one command (`dotnet run` on the backend), no Docker, no external services, no manual dependency steps. Treated as a primary acceptance test, not a nicety. (Anchors FR-21, FR-22.)
- **NFR-2 — Server-enforced authorization.** All Role/ownership rules (Worker sees only own Tasks; Admin-only Verify/Reopen/create/delete) MUST be enforced in the API and hold even when the client UI is bypassed. The UI reflects, never substitutes for, these rules. (Anchors FR-4, FR-7, FR-12..FR-14.)
- **NFR-3 — Authentication and password security.** Authentication MUST use JWT bearer tokens; passwords MUST be stored only as BCrypt hashes and never logged or returned. Tokens MUST be required on all protected endpoints. (Anchors FR-1..FR-4.)
- **NFR-4 — Data durability and integrity.** All data MUST persist in the SQLite file database and survive restarts with referential integrity intact; schema MUST be auto-migrated at startup. (Anchors FR-19, FR-20.)
- **NFR-5 — Auditability.** Every Status transition and every Comment MUST be attributable (which User) and timestamped (when). (Anchors FR-12..FR-16.)
- **NFR-6 — Performance (proportional).** For the expected v1 scale (single dispatcher, low hundreds of Tasks), common reads (list/map/filter/search) SHOULD return within roughly 1 second on typical developer hardware. No formal SLA in v1.
- **NFR-7 — Usability and responsiveness.** The SPA MUST be usable in a current desktop browser and remain usable on a narrow viewport (tablet/large phone). Failed actions MUST surface a clear message (UXG5). No offline mode.
- **NFR-8 — No external runtime dependencies/keys.** The runtime MUST NOT require provisioned external services or API keys; map tiles use OpenStreetMap (no key) and require internet at runtime only for tiles. (Anchors G1.)
- **NFR-9 — Cross-platform where easy.** Primary dev OS is Windows; the build/run path SHOULD work cross-platform where it is low-cost to do so, but Windows is the supported target for acceptance.
- **NFR-10 — Maintainability/delivery.** Source is hosted in GitLab; the codebase builds cleanly via the documented path; configuration (e.g., seeded Admin credentials, JWT signing key) is read from configuration, not hard-coded secrets in source where avoidable.

## 8. Technical Constraints (Fixed)

The stack is decided by the brief and is not open for trade-off in this PRD. It is recorded as a constraint because it shapes scope and the load-bearing NFR-1.

- **Backend:** ASP.NET Core Web API on .NET 10 (target `net10.0`, SDK 10.0.300), Entity Framework Core, SQLite file database (no external DB server; Docker unavailable), JWT bearer authentication, BCrypt password hashing.
- **Frontend:** Angular (latest, standalone components) SPA; Leaflet + OpenStreetMap tiles (no API key) for the Map.
- **One-command run:** `dotnet run` on the backend; an MSBuild target invokes npm to build the Angular app into the backend `wwwroot`; the backend serves the SPA static files and the API on a single port with SPA fallback routing. SQLite auto-created/migrated at startup; Admin auto-seeded with documented credentials.
- **Environment:** Node.js 22 available for the Angular build; no Docker, no external services, no manual steps. Cross-platform where easy; primary dev OS Windows.
- **Delivery:** repository hosted in GitLab; README covers purpose, how to run, and technologies.

## 9. Scope

### 9.1 In Scope (v1)

- Basic registration and login; auto-seeded Admin on first run; self-registration yields Worker.
- Two Roles with server-enforced authorization: Admin (create/edit/delete Tasks, assign, see all, Verify/Reopen, comment) and Worker (see own, advance Status to Done, comment).
- Task CRUD: title, description, Location, Assignee, Deadline.
- Interactive Map with status-colored Markers; place Location by clicking; edit Location by dragging.
- Status Workflow `Created -> In Progress -> Done -> Verified` with Admin-only Verify and Reopen.
- Comments with author and timestamp.
- Task filtering (by Status) and text search (title/description).
- Persistent storage (SQLite, auto-migrated at startup).
- Single-command run; README.

### 9.2 Out of Scope for v1 (Non-Goals)

- Multiple Admins, teams, organizations, or tenancy — v1 assumes a single dispatcher.
- Customer/requester self-service Task submission.
- File or photo attachments on Tasks or Comments. `[NOTE FOR PM]` emotionally load-bearing for "evidence at closure" — revisit in v2 if it surfaces.
- Notifications (email/push/SMS) and real-time updates between clients.
- Route optimization, scheduling automation, recurring Tasks.
- Mobile-native apps and offline mode (the web SPA is the only client).
- Reporting dashboards, exports, analytics beyond filter/search.
- Password reset, email verification, SSO, refresh-token rotation beyond what basic JWT auth requires.
- Editing/deleting Comments (immutable in v1).

## 10. Epics, User Stories, and Acceptance Criteria

Epics decompose the build into shippable slices. Every FR is covered by at least one story; acceptance criteria are testable and reference the FRs they satisfy. Stories use the form *As a [persona], I want [capability], so that [value]*.

### Epic 1 — Foundation, Authentication, and Roles
*Covers FR-1, FR-2, FR-3, FR-4, NFR-2, NFR-3. Goal: a runnable skeleton with secure auth and the Admin/Worker boundary in place.*

**Story 1.1 — Self-register as a Worker.**
As a visitor, I want to register an account, so that I can log in and see my assigned work.
*Acceptance:*
- Submitting a unique identifier + password creates a User with Role = Worker, even if the request tries to specify a different role (FR-1).
- The password is stored as a BCrypt hash; plaintext is never persisted or returned (FR-1, NFR-3).
- A duplicate identifier is rejected (HTTP 409/400) with no User created (FR-1).
- After registering, I can immediately log in (FR-3).

**Story 1.2 — Admin auto-seeded on first run.**
As the system owner, I want an Admin account created automatically on first startup, so that there is always a dispatcher without manual setup.
*Acceptance:*
- First start against an empty database creates exactly one Admin; restarting does not create a second (idempotent) (FR-2).
- The seeded Admin's password is BCrypt-hashed (FR-2, NFR-3).
- The seeded Admin can log in with the README-documented credentials and use Admin-only capabilities (FR-2, FR-3, FR-23).

**Story 1.3 — Log in and receive a token.**
As a registered User, I want to log in and receive a JWT, so that I can call protected endpoints.
*Acceptance:*
- Valid credentials return a signed JWT containing identity and Role claims (FR-3).
- Invalid credentials return HTTP 401 with no token (FR-3).
- Protected endpoints reject absent/invalid/expired tokens with HTTP 401 (FR-3, NFR-3).

**Story 1.4 — Server-enforced Role boundary.**
As the system owner, I want authorization enforced in the API, so that the Admin/Worker boundary holds even if the UI is bypassed.
*Acceptance:*
- A Worker calling an Admin-only endpoint gets HTTP 403 with no effect (FR-4, NFR-2).
- A Worker requesting another Worker's Task gets HTTP 403/404 (FR-4, FR-7).
- Tampering with/removing the JWT does not grant access (FR-4, NFR-3).

### Epic 2 — Task CRUD and Assignment
*Covers FR-5, FR-6, FR-7, FR-8. Goal: the Admin can fully manage Tasks; Workers see only their own.*

**Story 2.1 — Create a Task.**
As an Admin, I want to create a Task with title, description, Location, Assignee, and Deadline, so that a Worker has a clear, located job.
*Acceptance:*
- A created Task persists with Status = Created, a creation timestamp, and all supplied fields (FR-5).
- Missing a required field (title, Location, Assignee, Deadline) is rejected (HTTP 400) and persists nothing (FR-5).
- Assignee must be an existing Worker; otherwise rejected (FR-5).
- The new Task appears immediately as a Marker on the Map and in the Admin list (FR-5, FR-9).

**Story 2.2 — Edit a Task.**
As an Admin, I want to edit a Task's title, description, Assignee, and Deadline, so that I can correct mistakes and reassign work.
*Acceptance:*
- Edits persist and reflect in list, read, and Map (FR-6).
- Reassigning changes the Assignee: the old Assignee loses visibility, the new one gains it (FR-6, FR-7).
- Invalid edits (empty title, non-Worker Assignee) are rejected and leave the Task unchanged (FR-6).

**Story 2.3 — Role-scoped Task reads.**
As a Worker, I want to see only my assigned Tasks, so that I'm not distracted by work that isn't mine.
*Acceptance:*
- Admin read/list returns all Tasks; Worker read/list returns only their own (FR-7).
- Another Worker's Task is never present in a Worker's response (FR-7, NFR-2).

**Story 2.4 — Delete a Task.**
As an Admin, I want to delete a Task, so that obsolete work disappears from the board.
*Acceptance:*
- A deleted Task is gone from lists, Map, and direct read (HTTP 404) (FR-8).
- Its Comments are removed (no orphans) (FR-8).
- A Worker attempting delete gets HTTP 403 and the Task persists (FR-8, NFR-2).

### Epic 3 — Map and Location
*Covers FR-9, FR-10, FR-11, UXG1, UXG3. Goal: tasks are visible and editable on the Map with status-colored markers.*

**Story 3.1 — See Tasks as status-colored Markers.**
As an Admin, I want all Tasks shown as color-coded Markers, so that I can read the state of the field at a glance.
*Acceptance:*
- Each Status (Created, In Progress, Done, Verified) renders a distinct, consistent Marker color matching the legend (FR-9, UXG3).
- Marker set respects Role scope: Admin sees all, Worker sees only own (FR-9, FR-7).
- A Status change updates the Marker color on next render (FR-9).

**Story 3.2 — Place a Location by clicking the Map.**
As an Admin, I want to set a Task's Location by clicking the Map, so that location is precise, not prose.
*Acceptance:*
- Clicking the Map captures lat/long and binds it to the Task being created/edited (FR-10).
- The captured coordinates are what get saved (FR-10, FR-5/FR-6).

**Story 3.3 — Correct a Location by dragging the Marker.**
As an Admin, I want to drag a Marker to fix a Location, so that I can correct mistakes without re-entering data.
*Acceptance:*
- Dragging and saving updates the stored coordinates to the drop point (FR-11).
- After reload the Marker is at the new coordinates (persisted) (FR-11).
- A Worker has no drag-edit affordance and a server attempt is rejected (FR-11, NFR-2).

### Epic 4 — Status Workflow and Closure Gate
*Covers FR-12, FR-13, FR-14, NFR-5, UXG7. Goal: the enforced state machine with Admin-only Verify/Reopen.*

**Story 4.1 — Worker advances own Task.**
As a Worker, I want to move my Task `Created -> In Progress -> Done`, so that I can report progress.
*Acceptance:*
- A Worker can perform exactly these two forward transitions on their own Task (FR-12).
- Any other transition by a Worker (e.g., `Created -> Done`, set Verified, backward) is rejected and Status is unchanged (FR-12).
- Each accepted transition records actor + timestamp (FR-12, NFR-5).

**Story 4.2 — Admin verifies closure.**
As an Admin, I want to Verify a Done Task, so that closure is confirmed, not assumed.
*Acceptance:*
- Verify succeeds only from Done; otherwise rejected (HTTP 400) (FR-13).
- After Verify, Status = Verified and Marker color updates (FR-13, FR-9).
- A Worker cannot Verify (HTTP 403) (FR-13, NFR-2).
- The Verify action is visibly available to the Admin only, on Done Tasks (UXG7).

**Story 4.3 — Admin reopens a Task.**
As an Admin, I want to Reopen a Done or Verified Task to In Progress, so that incomplete work goes back to the Worker.
*Acceptance:*
- Reopen succeeds only from Done or Verified; otherwise rejected (HTTP 400) (FR-14).
- After Reopen, Status = In Progress and the Assignee can advance it again (FR-14, FR-12).
- A Worker cannot Reopen (HTTP 403) (FR-14, NFR-2).

### Epic 5 — Comments and Audit Trail
*Covers FR-15, FR-16, NFR-5, G4. Goal: attributed, timestamped comments forming an audit trail.*

**Story 5.1 — Add a Comment.**
As a User, I want to comment on a Task I can access, so that I can record what happened.
*Acceptance:*
- A Comment persists with author identity and server-assigned timestamp (FR-15, NFR-5).
- A Worker cannot comment on a Task that isn't theirs (HTTP 403/404) (FR-15, NFR-2).
- Empty/whitespace Comments are rejected (HTTP 400) (FR-15).

**Story 5.2 — View Comments with author and time.**
As a User, I want to see a Task's Comments with who said what and when, so that history is reconstructable without leaving the system.
*Acceptance:*
- Comments render time-ordered, each with author and timestamp visible (FR-16).
- Displayed author/timestamp match what was persisted and are not editable in v1 (FR-16).

### Epic 6 — Filtering and Search
*Covers FR-17, FR-18. Goal: find the relevant Tasks within authorized scope.*

**Story 6.1 — Filter by Status.**
As a User, I want to filter Tasks by Status, so that I can focus (e.g., Admin sees all unverified Done work).
*Acceptance:*
- Filtering to a Status returns only Tasks in that Status within my authorized scope (FR-17, FR-7).
- Clearing the filter restores the full authorized set (FR-17).

**Story 6.2 — Search by text.**
As a User, I want to search Tasks by title/description, so that I can find a specific job fast.
*Acceptance:*
- A query returns only authorized Tasks matching title or description (case-insensitive substring acceptable) (FR-18).
- Empty query returns the full authorized set; non-matching query returns empty without error (FR-18).
- A Worker's results never include another Worker's Tasks (FR-18, FR-7, NFR-2).

### Epic 7 — Persistence, One-Command Run, and README
*Covers FR-19, FR-20, FR-21, FR-22, FR-23, NFR-1, NFR-4, NFR-8. Goal: the system runs from a clean clone with one command and is documented. This epic carries the headline acceptance test.*

**Story 7.1 — Durable SQLite persistence.**
As the system owner, I want all data stored in SQLite, so that nothing is lost on restart.
*Acceptance:*
- Data created in one run is present after restart with relationships intact (FR-19, NFR-4).

**Story 7.2 — Auto-create and migrate the database.**
As the system owner, I want the schema created/migrated automatically at startup, so that there is no manual DB step.
*Acceptance:*
- Running against a missing DB file creates and schemas it with no manual command; running against an up-to-date DB starts cleanly (FR-20, NFR-4).
- Seed (Story 1.2) runs after the schema is ready (FR-20, FR-2).

**Story 7.3 — One-command start from a clean clone.**
As a reviewer, I want to clone and run with a single command, so that I can evaluate the system without setup friction.
*Acceptance:*
- On a machine with .NET 10 SDK and Node.js 22, the single documented command (`dotnet run` on the backend) yields a running, browser-reachable system with no manual dependency install, no Docker, no external service (FR-21, NFR-1, NFR-8).
- The Angular build is triggered automatically by the backend build (MSBuild target invoking npm); npm is not run manually (FR-21).

**Story 7.4 — Single-port SPA + API with fallback routing.**
As a reviewer, I want the UI and API served on one port with deep links working, so that the app behaves like a normal SPA.
*Acceptance:*
- UI and API are reachable on the same single port (FR-22).
- A direct navigation to a client-side route returns the SPA shell, not a 404 (FR-22).
- API routes are reachable and not shadowed by the SPA fallback (FR-22).

**Story 7.5 — README that gets a reviewer running.**
As a reviewer, I want a README covering purpose, run steps, tech, and Admin credentials, so that I can start on first try.
*Acceptance:*
- README states purpose, prerequisites, the single run command, the technology stack, and the default Admin credentials matching the seed (FR-23, FR-2).
- Following only the README starts the system on first try (FR-23, NFR-1).

## 11. Success Metrics

*Internal build under a hard time cap — metrics are acceptance-level, not market KPIs. Each cross-references the FR(s)/goal it validates.*

**Primary**
- **SM-1 — One-command start works.** A reviewer clones and runs the single command and reaches a working app with zero manual steps. Target: pass on first try. Validates FR-21, FR-22, FR-23, NFR-1, G1.
- **SM-2 — Role boundary holds server-side.** Direct API attempts that bypass the UI cannot cross the Admin/Worker or ownership boundary. Target: 100% of probed forbidden actions return 403/404 with no effect. Validates FR-4, FR-7, FR-12..FR-14, NFR-2.
- **SM-3 — Closure gate enforced.** Verified can only be reached via Admin Verify from Done; Reopen only from Done/Verified. Target: all illegal transitions rejected. Validates FR-12..FR-14, G2.

**Secondary**
- **SM-4 — Map truth.** For any Task, the Marker color matches its current Status, and the Admin can answer "where is my open work?" from the Map alone. Validates FR-9, FR-11, G3.
- **SM-5 — Reconstructable history.** For any Task, an Admin can reconstruct assignment, Status changes, and Comments (with who/when) without leaving the system. Validates FR-12..FR-16, NFR-5, G4.

**Counter-metrics (do not optimize)**
- **SM-C1 — Don't trade start-friction for features.** Adding capability that reintroduces a manual setup step (extra install, Docker, external service, env-juggling) is a regression even if the feature is nice. Counterbalances feature-driven scope creep against SM-1. Do not optimize feature count at the cost of the one-command start.
- **SM-C2 — Don't security-theater the UI.** Hiding an action in the UI without enforcing it server-side must not be counted as "done." Counterbalances SM-2: enforcement, not concealment, is the metric.

## 12. Open Questions

1. **JWT lifetime / expiry handling.** What token lifetime is acceptable, and how does the SPA handle expiry (silent re-login prompt vs. hard logout)? Default assumption: a fixed, modest lifetime with re-login on expiry; no refresh tokens in v1.
2. **Initial Map view.** What default center/zoom should the Map open at when there are no Tasks? Assumption: a sensible fixed default; not load-bearing for acceptance.
3. **Deadline timezone semantics.** Are Deadlines stored/displayed in UTC or local time? Assumption: store UTC, display local; confirm if it affects acceptance.
4. **Worker self-comment vs. read-only on Verified.** After Verify, may a Worker still comment on their (now Verified) Task? Assumption: yes, accessible Tasks remain commentable; flag if the closure gate should also freeze comments.

## 13. Assumptions Index

- §1/§6.8 — "Documented prerequisites" for the single-command run are .NET 10 SDK (10.0.300) and Node.js 22, per the fixed stack.
- §6.6 (FR-18) — Text search uses case-insensitive substring matching on title/description; no full-text engine.
- §6.6 (FR-17) — Status filter may accept one or more Statuses; single-select is acceptable for v1.
- §6.5 (FR-15/FR-16) — Comments are immutable in v1 (no edit/delete).
- §6.4 — A Task has exactly one Assignee at a time; reassignment replaces it (no multi-assignee).
- §7 (NFR-6) — Performance target (~1s common reads) is a soft guideline for v1 scale, not an SLA.
- §11 — Success is measured at acceptance level (reviewer can run, boundaries hold, gate enforced), not via post-launch usage analytics.
- §12.3 — Deadlines stored UTC, displayed local (pending confirmation).
