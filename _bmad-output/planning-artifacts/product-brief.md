---
title: "Product Brief: Field Task Manager"
status: draft
created: 2026-06-09
updated: 2026-06-09
author: Mary (Business Analyst)
project: field-task-manager
---

# Product Brief: Field Task Manager

## Executive Summary

Field Task Manager is a web system that closes the loop between the people who dispatch field work and the people who execute it. An Admin pins a task to a precise point on a map, assigns it to a Worker, and sets a deadline; the Worker sees only their own queue, advances each task through a defined status flow, and logs progress through comments. The Admin retains the final word: every completed task must be verified before it is considered closed, or it is returned to work.

The core problem is that field work coordination commonly degrades into phone calls, message threads, and spreadsheets where location is described in prose and accountability is ambiguous. Field Task Manager replaces that with a single source of truth: a map-anchored task list with an enforced status workflow and an auditable comment trail. Location is a draggable marker, not a paragraph; status is a state machine, not an opinion; closure is an explicit verification step, not an assumption.

This brief scopes a deliberately small, fully working first version, constrained to an eight-hour build with an AI agent as the primary tool. The technology stack is fixed (ASP.NET Core on .NET 10, Entity Framework Core with SQLite, JWT auth, and an Angular SPA with Leaflet/OpenStreetMap) and is chosen specifically to satisfy the hardest non-functional requirement: the entire system must run with a single `dotnet run` after a fresh git clone, with zero manual setup and no Docker. The product's value and its credibility both hinge on that frictionless start.

## The Problem

**Who feels it.** Two roles sit on opposite ends of a coordination gap. A dispatcher or supervisor (the Admin) is accountable for work that happens somewhere they are not standing. A field technician (the Worker) is accountable for executing that work and reporting back.

**The pain today.** Without a shared system, field tasks are coordinated through whatever is at hand — phone calls, chat threads, paper, or general-purpose spreadsheets. This produces four recurring failures:

- **Location is lossy.** "The pump near the north gate" is not an address and is not coordinates. Workers waste time finding the site; Admins cannot see at a glance where their open work is concentrated.
- **Status is opinion, not fact.** "Done" from a Worker and "done" from an Admin can mean different things. Nothing forces a task through a consistent lifecycle, so completion is asserted rather than verified.
- **Accountability evaporates.** When the record lives in chat, there is no durable answer to "who was assigned this, when did they touch it, and what did they say about it?"
- **Visibility is asymmetric and wrong.** Admins often cannot see the whole board at once, while Workers are distracted by tasks that are not theirs.

**The cost of the status quo.** Rework from misread locations, disputes over what "complete" means, missed deadlines no one noticed until too late, and supervisory time spent reconstructing state instead of directing work. These are not catastrophic individually; collectively they are a steady tax on every field operation that lacks a purpose-built tool.

## The Solution

Field Task Manager gives each role exactly the view and the verbs it needs, anchored to a shared map and a shared state machine.

**For the Admin** — a full operational picture. The Admin creates a task with a title, description, assignee, deadline, and a location placed by clicking the map. All tasks for all Workers appear as map markers, color-coded by status, so the state of the field is legible in one glance. The Admin can reassign, edit, and correct a location simply by dragging its marker. Critically, the Admin owns closure: when a Worker marks a task Done, the Admin either confirms it (Verified) or returns it to work.

**For the Worker** — a focused queue. The Worker logs in and sees only their own assigned tasks, on the map and in a list. They advance status (Created -> In Progress -> Done) and add comments to record what happened. They are never shown work that is not theirs, and they cannot self-certify final closure.

**The shared spine** is the status workflow, enforced by the system rather than by convention:

```
Created  ->  In Progress  ->  Done  ->  Verified
                              ^           |
                              |           v
                              +-- (Admin reopens) --+
```

A task moves forward through the Worker's actions up to Done. Only the Admin can set Verified, and only the Admin can reopen a Done (or Verified) task back to In Progress. Every status change and every comment is stamped with who and when, producing an audit trail as a natural byproduct of normal use.

## What Makes This Different

This is an internal-build product under a hard time constraint, so the honest differentiators are about fit and friction, not a defensible market moat:

- **Map-first, not form-first.** Location is a first-class, manipulable object (click to place, drag to correct), not a free-text field bolted onto a ticket. For field work, where the task *is* is half the task.
- **Closure is enforced, not assumed.** The Admin-verifies / Admin-reopens gate is the product's spine. Generic task trackers let anyone mark anything done; this system separates "the Worker believes it is done" from "the Admin confirms it is done."
- **Zero-friction start is a feature, not an afterthought.** A single `dotnet run` after clone — backend that auto-builds the Angular SPA, auto-creates and migrates a SQLite file database, and auto-seeds the Admin — removes the most common reason internal tools die: nobody can get them running. No Docker, no external services, no manual steps.
- **No external dependencies or keys.** SQLite as a file database (no server) and OpenStreetMap tiles via Leaflet (no API key) mean the system has no runtime entanglements to provision, pay for, or rotate.

Where there is no moat, this brief does not invent one. The advantage here is appropriate scope executed cleanly and runnable on first try.

## Who This Serves

**Admin (Dispatcher / Supervisor) — primary.** Accountable for field work they do not personally perform. Needs to create and assign tasks fast, see the entire field at a glance, correct mistakes (location, assignment) without friction, and hold the gate on what counts as truly finished. Success for the Admin is a map where green means done-and-verified and nothing slips through unverified. Exactly one Admin account is auto-created on first run; this version assumes a single dispatcher.

**Worker (Field Executor) — primary.** Performs assigned tasks in the field. Needs an unambiguous, uncluttered list of *their* work, a clear place to find the location, a simple way to advance status, and a way to record what happened via comments. Success for the Worker is never wondering "is this mine?" or "where exactly is this?" Workers are created by self-registration; every self-registered account receives the Worker role automatically.

**Out of audience for v1.** Customers/requesters who might submit tasks, multi-team or multi-tenant organizations, and external stakeholders. The role model is intentionally binary (Admin, Worker) for this build.

## Success Criteria

**The build succeeds if (acceptance-level):**

- A reviewer can `git clone` the repository and run the entire system with a single command (`dotnet run` on the backend), with no manual dependency installation, no Docker, and no external services. This is the headline criterion.
- On first run, the SQLite database is auto-created/migrated and an Admin user is auto-seeded with credentials documented in the README.
- Authentication works: a user can register (receiving the Worker role) and log in; the Admin signs in with seeded credentials. JWT-based auth gates the API; passwords are hashed (BCrypt).
- An Admin can create a task with title, description, map location, assignee, and deadline; it appears as a status-colored marker on the map.
- An Admin sees all tasks; a Worker sees only tasks assigned to them. This boundary is enforced server-side, not just hidden in the UI.
- Status transitions follow the defined workflow, including Admin-only Verify and Admin-only reopen.
- A location can be edited by dragging its marker, and the new coordinates persist.
- Comments can be added to a task and display who authored them and when.
- Tasks can be filtered/searched.
- A README documents what the project does, how to run it, the technologies used, and the default Admin credentials.

**The product is working (usage-level signal, post-build):** an Admin can reconstruct the full history of any task — assignment, status changes, comments — without leaving the system, and can answer "where is all my open work?" from the map alone.

## Scope

**In scope (v1):**

- Basic registration and login; auto-seeded Admin on first run; self-registration yields Worker role.
- Two roles with enforced authorization: Admin (create/edit tasks, assign, see all, verify/reopen) and Worker (see own, change status, comment).
- Task creation and editing: title, description, location, assignee, deadline.
- Interactive map with status-colored markers; place location by clicking, edit by dragging.
- Status workflow (Created -> In Progress -> Done -> Verified) with Admin-only Verify and reopen.
- Comments with author and timestamp.
- Task filtering and search.
- Persistent storage (SQLite, auto-migrated at startup).
- Single-command run; README.

**Explicitly out of scope (v1):**

- Multiple Admins, teams, organizations, or tenancy.
- Customer/requester self-service task submission.
- File or photo attachments on tasks or comments.
- Notifications (email, push, SMS) and real-time updates between clients.
- Route optimization, scheduling automation, or recurring tasks.
- Mobile-native apps (the web SPA is the only client) and offline mode.
- Reporting dashboards, exports, or analytics beyond filter/search.
- Password reset, email verification, SSO, or refresh-token rotation beyond what basic JWT auth requires.

This list is a boundary, not a backlog. Anything not in the "in scope" list is out for v1.

## Technical Approach (Fixed)

The stack is decided and is not a subject for trade-off in this brief; it is recorded here because it directly shapes scope and the single hardest requirement.

- **Backend:** ASP.NET Core Web API on .NET 10 (target `net10.0`, SDK 10.0.300), Entity Framework Core, **SQLite** as a file database (no external DB server, because Docker is unavailable). **JWT bearer** authentication; **BCrypt** password hashing.
- **Frontend:** Angular (latest, standalone components) SPA, with **Leaflet + OpenStreetMap** tiles (no API key) for the map.
- **One-command run:** `dotnet run` on the backend, which auto-builds the Angular app into the backend `wwwroot` via an MSBuild target invoking npm, then serves the SPA static files and the API on a **single port** with SPA fallback routing. SQLite is auto-created/migrated at startup; the Admin user is auto-seeded with credentials documented in the README.
- **No Docker, no external services, no manual steps.** Node.js 22 is available for the Angular build. Cross-platform where easy; primary dev OS is Windows.
- **Source control & delivery:** repository hosted in GitLab; README covers purpose, how to run, and technologies.

The single-command, zero-setup constraint is the load-bearing non-functional requirement and should be treated as a primary acceptance test, not a nicety.

## Constraints & Assumptions

- **Time:** total build budget is up to 8 hours, with an AI agent as the primary implementation tool. This is the dominant reason scope is held tight.
- **Single Admin assumption:** v1 assumes one dispatcher; the auto-seeded Admin is the operational owner. Multi-admin is explicitly deferred.
- **Authorization is server-enforced:** the Worker's "see only my tasks" rule and the Admin-only transitions must be enforced in the API, with the UI reflecting (not substituting for) those rules.
- **No connectivity guarantees beyond a browser and internet for map tiles:** OpenStreetMap tiles require internet at runtime; there is no offline map mode in v1.
- **Security posture is "basic" by stated intent:** JWT + BCrypt meet the requirement; advanced account lifecycle features (reset, verification, SSO) are out of scope.

## Vision

If this v1 proves its value, the natural growth path is to deepen accountability and reach without abandoning the map-first, enforced-closure spine:

- **Richer evidence at closure** — photo/file attachments on completion, so verification is grounded in proof, not just a status change.
- **Notifications and live updates** — assignment alerts, deadline warnings, and real-time marker updates so the Admin's map is live rather than refreshed.
- **Scale of the org** — multiple Admins/supervisors, teams, and eventually multi-tenant deployments, with role granularity beyond the binary Admin/Worker.
- **Field-grade clients** — a mobile experience and offline capture, since the Worker's real environment is outdoors and intermittently connected.
- **Insight from the trail** — because every status change and comment is already timestamped and attributed, reporting on throughput, cycle time, and overdue work becomes a small step, not a rebuild.

The destination is a dependable operational backbone for distributed field work: anyone with the link can be running it in one command, the map always tells the truth about where work stands, and nothing is "closed" until the person accountable says so.
