---
title: "Epics & Stories: Field Task Manager"
status: draft
created: 2026-06-09
updated: 2026-06-09
author: John (Product Manager)
project: field-task-manager
stepsCompleted: ["validate-prerequisites", "design-epics", "create-stories", "final-validation"]
inputDocuments:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-spec.md
---

# Field Task Manager - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Field Task Manager v1, decomposing the requirements from the PRD (FR-1..FR-23, NFR-1..NFR-10, UXG1..UXG7), the UX/UI Specification (S1..S6, the §5 design system), and the Architecture Decision Document (the pinned stack, the data model in §5, the REST contract in §9, the transition matrix in §8, and the one-command run wiring in §6.3) into implementable stories.

Epics are ordered in **build order** so that each epic stands alone and enables the next without depending on a future epic to function:

- **E1 — Foundation & Scaffolding:** the runnable single-process skeleton (solution, projects, EF Core + SQLite migrate-at-startup, single-port SPA serving with fallback, the MSBuild Angular build target, the bootstrapped Angular shell). Nothing else can be built or run until this exists.
- **E2 — Authentication, Roles & Seeding:** secure JWT auth, BCrypt passwords, self-registration as Worker, idempotent Admin seed, and the server-enforced Admin/Worker boundary. Everything downstream is gated by identity and role.
- **E3 — Task CRUD & Map:** the Admin manages Tasks; Workers see only their own; Tasks render as status-colored Markers; Location is placed by clicking and corrected by dragging.
- **E4 — Status Workflow & Comments:** the enforced state machine with Admin-only Verify/Reopen, and the attributed, timestamped comment trail (including status-audit comments).
- **E5 — Filtering/Search & UX Polish:** scoped status filter and text search, plus the loading/empty/error states, optimistic transitions with rollback, the status legend, and responsive layout.
- **E6 — One-command Run & README/Docs:** harden and document the headline acceptance test — a fresh clone runs with one command — and the README that gets a reviewer running.

Every FR is covered by at least one story; every NFR and UX requirement is carried by the epic(s) that realize it. Acceptance criteria are testable and cite the FRs, endpoints, files, and components they touch, per the Architecture.

> **A note on file growth across epics (the "file churn" principle).** Several backend files (`Program.cs`, `AppDbContext.cs`, `TasksController.cs`, `TaskService.cs`) and several frontend files (`app.routes.ts`, `dashboard.component.ts`, `task-detail.component.ts`) are touched by more than one epic. This is deliberate and dependency-ordered: each epic adds only the slice it owns (E1 wires the host and DbContext shape; E2 adds auth middleware and the `User` entity behavior; E3 adds the `FieldTask`/`Comment` entities, task routes, and the map; E4 adds the transition/comment routes and action buttons; E5 adds query params and polish). No epic requires a later epic to function.

## Requirements Inventory

### Functional Requirements

- **FR-1 — Self-registration as Worker.** A visitor registers with a unique identifier + password; the created User is always Role = Worker (never Admin, regardless of request body); password stored as BCrypt hash; duplicate identifier rejected (409/400); can log in immediately after.
- **FR-2 — Auto-seed Admin on first run.** On startup, if no Admin exists, create exactly one Admin from configuration; idempotent (no second Admin on restart); BCrypt-hashed password; documented credentials; can log in and exercise Admin capabilities.
- **FR-3 — Login and token issuance.** Valid credentials return a signed JWT with identity + Role claims; invalid credentials → 401, no token; protected endpoints reject absent/invalid/expired tokens with 401.
- **FR-4 — Role-based authorization enforced server-side.** Worker calling an Admin-only endpoint → 403, no effect; Worker requesting a non-owned Task → 403/404; boundary holds when the UI is bypassed.
- **FR-5 — Create Task.** Admin creates a Task (title, description, Location, Assignee, Deadline); persisted with Status = Created and a creation timestamp; missing required field → 400, nothing persisted; Assignee must be an existing Worker; appears immediately on Map and in the Admin list.
- **FR-6 — Edit Task fields.** Admin edits title, description, Assignee, Deadline; edits persist and reflect in list/read/Map; reassignment moves visibility; invalid edit → 400, Task unchanged.
- **FR-7 — Read Tasks scoped by Role.** Admin reads all; Worker reads only own; another Worker's Task is never in a Worker's response; scoping enforced server-side.
- **FR-8 — Delete Task.** Admin deletes; gone from lists/Map/read (404); Comments cascade-deleted (no orphans); Worker delete attempt → 403, Task persists.
- **FR-9 — Render Tasks as status-colored Markers.** Each Status renders a distinct, consistent Marker color matching the legend; Marker set respects Role scope; color updates when Status changes.
- **FR-10 — Place Location by clicking the Map.** Clicking the Map captures lat/lng and binds to the Task being created/edited; captured coordinates are what get persisted.
- **FR-11 — Edit Location by dragging the Marker.** Admin drags a Marker and saves to update stored coordinates; persists across reload; Worker cannot drag-edit (no affordance; server rejects).
- **FR-12 — Worker advances own Task forward.** Assignee can do `Created → In Progress` and `In Progress → Done`; any other transition rejected (403/400), Status unchanged; transition on a non-owned Task rejected; each accepted transition recorded with actor + timestamp.
- **FR-13 — Admin verifies a Done Task.** Verify succeeds only from Done (else 400); after Verify Status = Verified and Marker recolors; Worker cannot Verify (403).
- **FR-14 — Admin reopens a Task.** Reopen succeeds only from Done or Verified (else 400); after Reopen Status = In Progress and the Assignee can advance again; Worker cannot Reopen (403).
- **FR-15 — Add a Comment.** A User who can access a Task posts free text; persists with author identity + server timestamp; Worker cannot comment on a non-owned Task (403/404); empty/whitespace body → 400.
- **FR-16 — View Comments with author and time.** Comments render chronologically with author + timestamp visible; displayed values match what was persisted; not editable in v1.
- **FR-17 — Filter Tasks by Status.** Filter to a Status returns only Tasks in that Status within authorized scope; clearing returns the full authorized set.
- **FR-18 — Search Tasks by text.** Query returns only authorized Tasks whose title/description matches (case-insensitive substring); empty query returns full authorized set; non-matching query returns empty without error; Worker results never include another Worker's Tasks.
- **FR-19 — Durable persistence in SQLite.** All entities stored in a SQLite file DB; data survives restart with relationships intact.
- **FR-20 — Auto-create and migrate at startup.** Missing DB file → created and schema applied with no manual command; existing up-to-date DB → starts cleanly; seed runs after schema is ready.
- **FR-21 — Single-command start from a clean clone.** After `git clone`, `dotnet run` on the backend builds the Angular SPA (MSBuild target invoking npm) and starts the system with no manual dependency install, Docker, or external service.
- **FR-22 — Single-port SPA + API serving with fallback routing.** UI and API on one port; client-side deep links resolve via SPA fallback (`index.html`); API routes not shadowed by the fallback.
- **FR-23 — README completeness.** README states purpose, prerequisites, the single run command, the technology stack, and the seeded Admin credentials; a reviewer following only the README starts the system on first try.

### NonFunctional Requirements

- **NFR-1 — Single-command, zero-setup start (load-bearing).** Fresh clone → one command, no Docker, no external services, no manual dependency steps. Primary acceptance test. (Anchors FR-21, FR-22.)
- **NFR-2 — Server-enforced authorization.** All role/ownership rules enforced in the API and hold even when the client UI is bypassed. (Anchors FR-4, FR-7, FR-12..FR-14.)
- **NFR-3 — Authentication and password security.** JWT bearer tokens; passwords stored only as BCrypt hashes, never logged or returned; tokens required on all protected endpoints. (Anchors FR-1..FR-4.)
- **NFR-4 — Data durability and integrity.** Data persists in SQLite, survives restart with referential integrity; schema auto-migrated at startup. (Anchors FR-19, FR-20.)
- **NFR-5 — Auditability.** Every Status transition and every Comment attributable (which User) and timestamped (when). (Anchors FR-12..FR-16.)
- **NFR-6 — Performance (proportional).** Common reads (list/map/filter/search) within ~1s at v1 scale; soft guideline, no SLA.
- **NFR-7 — Usability and responsiveness.** Usable in a current desktop browser and on a narrow viewport; failed actions surface a clear message; no offline mode.
- **NFR-8 — No external runtime dependencies/keys.** No provisioned external services or API keys; OSM tiles need no key; internet at runtime only for tiles. (Anchors G1.)
- **NFR-9 — Cross-platform where easy.** Windows is the supported acceptance target; cross-platform where low-cost.
- **NFR-10 — Maintainability/delivery.** Hosted in GitLab; builds cleanly via the documented path; secrets (seed creds, JWT key) read from configuration, not hard-coded.

### Additional Requirements

Pinned technical constraints from Architecture §2 (treated as build inputs, not open questions):

- **Backend:** ASP.NET Core Web API on **.NET 10** (`net10.0`, SDK 10.0.300), **EF Core 10** + **SQLite** file DB, **JWT bearer** auth, **BCrypt.Net-Next 4.0.3**, Swashbuckle (dev-only Swagger). Controllers (not Minimal API). Layering: Controller → Service → `AppDbContext`. Domain exceptions mapped to `ProblemDetails`. Enums on the wire as **integers**. Timestamps stored **UTC**.
- **Frontend:** **Angular 20** (standalone components, no NgModules), `provideRouter` + functional guards, `provideHttpClient(withInterceptors([...]))`, signal-based services, **Leaflet 1.9** (raw, with `@types/leaflet`) + OpenStreetMap tiles, TypeScript strict mode. **No UI framework** (plain CSS custom properties per UX §5).
- **One deployable:** `src/FieldTaskManager.Api` serves the SPA from `wwwroot` and the API on a single port (**5080**). Angular source lives in a sibling `clientapp/`; `angular.json` `outputPath` flattens to `../src/FieldTaskManager.Api/wwwroot` (`"browser": ""`). An MSBuild target (`EnsureNpmInstall` + `BuildSpa`) runs `npm ci`/`npm run build` on backend build. `Program.cs` calls `db.Database.Migrate()` then `DbInitializer.SeedAdmin(...)` before serving, and maps `MapControllers()` before `MapFallbackToFile("index.html")`.
- **Config (`appsettings.json`):** `ConnectionStrings:Default = "Data Source=fieldtasks.db"`; `Jwt` (Issuer/Audience/SigningKey/AccessTokenMinutes=480); `SeedAdmin` (Username `admin`, Password `Admin#12345`, DisplayName `Administrator`); Kestrel HTTP endpoint `http://localhost:5080`. Dev CORS allows `http://localhost:4200`.

### UX Design Requirements

From the UX/UI Specification. These are carried primarily by E3 (map/layout) and E5 (polish), with auth screens in E2.

- **UX-DR-1 — Map-first surface (UXG1, P1).** Location is a manipulable object (click to place, drag to correct); never typed. The Dashboard (S3) puts the Leaflet map as the flex-fill left pane, the task list (380–420px) on the right.
- **UX-DR-2 — Role-appropriate views (UXG2, P2).** Admin lands on the all-Tasks board; Worker on their own scoped queue. The UI never renders an affordance a Role cannot use (e.g., no "+ New Task" for Workers; no Edit/Verify/Reopen for Workers); the server remains the real boundary.
- **UX-DR-3 — Status legible at a glance (UXG3, P3).** One color per Status (Created `#64748B`, In Progress `#F59E0B`, Done `#22C55E`, Verified `#0F766E`), used identically on marker, list-row dot, detail badge, and filter pill; color is always paired with a **label and icon** (accessibility floor). A single `StatusMeta`/`status.util.ts` source feeds them all; a Legend popover in the shell (S6).
- **UX-DR-4 — Low-friction task entry (UXG4, P4).** Create is a single drawer panel (S5): title, description, click-the-map Location, Assignee dropdown (Workers only), Deadline (`datetime-local`). No wizard.
- **UX-DR-5 — Honest state (UXG5, P5).** Every async surface declares explicit loading, empty, and error states (UX §6). Optimistic status transitions roll back on server rejection; 403/404 trigger a resync to server truth.
- **UX-DR-6 — Responsive, browser-only (UXG6, NFR-7).** Desktop primary; ≥1024 side-by-side; 768–1023 narrowed list; <768 single column with a Map/List toggle and full-screen sheets. The map never disappears.
- **UX-DR-7 — Discoverable closure gate (UXG7, P7).** Verify/Reopen appear only for the Admin, only on Tasks in the eligible Status, with explicit labels; the conditional action area in S4 follows the Role × Status matrix (UX §4.3).
- **UX-DR-8 — Single drawer + map persistence.** S4 (detail) and S5 (create/edit) share one drawer slot over the Dashboard so the Leaflet map stays mounted (avoids costly re-init). `Esc`/scrim closes; unsaved-edit confirm in create/edit.
- **UX-DR-9 — Accessibility floor.** Color never the only signal; AA contrast; full keyboard operability; `role="dialog"` focus-trapped drawer; `aria-live` for transition/post results and errors; ≥36px hit targets; honor `prefers-reduced-motion`.

### FR Coverage Map

- **FR-1** → E2 (Story 2.2) — self-register as Worker.
- **FR-2** → E2 (Story 2.1) — idempotent Admin seed at startup.
- **FR-3** → E2 (Story 2.3) — login + JWT issuance and validation.
- **FR-4** → E2 (Story 2.4) — server-enforced role boundary (declarative `[Authorize]` + service re-checks).
- **FR-5** → E3 (Story 3.1) — create Task.
- **FR-6** → E3 (Story 3.2) — edit Task fields / reassign.
- **FR-7** → E3 (Story 3.3) — role-scoped reads.
- **FR-8** → E3 (Story 3.4) — delete Task (cascade comments).
- **FR-9** → E3 (Story 3.6) — status-colored Markers.
- **FR-10** → E3 (Story 3.7) — place Location by clicking.
- **FR-11** → E3 (Story 3.8) — edit Location by dragging.
- **FR-12** → E4 (Story 4.1) — Worker forward transitions.
- **FR-13** → E4 (Story 4.2) — Admin Verify.
- **FR-14** → E4 (Story 4.3) — Admin Reopen.
- **FR-15** → E4 (Story 4.5) — add Comment.
- **FR-16** → E4 (Story 4.6) — view Comments with author + time.
- **FR-17** → E5 (Story 5.1) — filter by Status.
- **FR-18** → E5 (Story 5.2) — search by text.
- **FR-19** → E1 (Story 1.3) — durable SQLite persistence; verified in E5/E6.
- **FR-20** → E1 (Story 1.3) — auto-create/migrate at startup.
- **FR-21** → E1 (Story 1.4) — MSBuild Angular build target; hardened/verified in E6 (Story 6.1).
- **FR-22** → E1 (Story 1.2) — single-port SPA + API with fallback; verified in E6 (Story 6.2).
- **FR-23** → E6 (Story 6.3) — README completeness.

NFR coverage: NFR-1 → E1/E6; NFR-2 → E2/E3/E4; NFR-3 → E2; NFR-4 → E1; NFR-5 → E4; NFR-6 → E1 (indexes) + E5; NFR-7 → E5; NFR-8 → E3 (OSM tiles) + E1; NFR-9 → E6; NFR-10 → E1/E6.

## Epic List

### Epic 1: Foundation & Scaffolding
A runnable single-process skeleton: the .NET solution and API project, the Angular `clientapp/` bootstrapped to the shell, EF Core + SQLite created and migrated automatically at startup, the single-port serving model with SPA fallback, and the MSBuild target that builds Angular into `wwwroot`. After this epic, `dotnet run` from a clean working tree builds the SPA, creates the database, and serves a blank-but-live app on `http://localhost:5080` with deep links resolving — the foundation every later epic builds on.
**FRs covered:** FR-19, FR-20, FR-21 (scaffold), FR-22.

### Epic 2: Authentication, Roles & Seeding
Secure identity and the Admin/Worker boundary: JWT bearer auth with BCrypt-hashed passwords, the `User` entity, an idempotent Admin auto-seed from configuration, self-registration that always yields a Worker, login/token issuance, the `/api/auth/me` claim echo, and server-enforced role authorization (declarative `[Authorize]` plus the `CurrentUser`/service pattern). Angular gains login/register screens, the auth signal service, the bearer interceptor, and functional `authGuard`/`adminGuard`. After this epic, the system has accounts, sessions, and a boundary that holds even when the UI is bypassed.
**FRs covered:** FR-1, FR-2, FR-3, FR-4.

### Epic 3: Task CRUD & Map
The Admin can fully manage Tasks (create, edit, reassign, delete) while Workers see only their own; Tasks render as status-colored Markers on a Leaflet/OSM map; Location is placed by clicking the map and corrected by dragging the marker (Admin only). Introduces the `FieldTask` and `Comment` entities (Comment defined here so cascade delete is real in Story 3.4), the `TasksController`/`TaskService`, the `UsersController` assignee list, the Dashboard (map + list), and the Task Create/Edit drawer with the Leaflet picker. After this epic the board is alive: located, assigned, role-scoped work, visible at a glance.
**FRs covered:** FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11.

### Epic 4: Status Workflow & Comments
The enforced state machine and the audit trail: a single `StatusTransitionService` authority decides legality of every `(role, from, to)` transition; Workers advance their own Task forward; the Admin holds the closure gate with Verify and Reopen; the Task Detail drawer renders the Role × Status action matrix; and any User who can see a Task can post immutable, attributed, timestamped Comments — with each accepted status change appended as an audit comment. After this epic, accountability and reconstructable history are real.
**FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-16.

### Epic 5: Filtering/Search & UX Polish
Find the relevant work and make the whole thing feel finished: scoped status filtering and case-insensitive text search (server query params honoring role scope), plus the cross-cutting UX commitments — loading/empty/error states on every async surface, optimistic transitions with rollback, the canonical status legend wired from a single source, debounced search, the single-drawer interaction model, the responsive collapse, and the accessibility floor. After this epic, the product matches the UX spec's quality bar.
**FRs covered:** FR-17, FR-18 (plus NFR-7 and UXG1..UXG7 hardening).

### Epic 6: One-command Run & README/Docs
Harden and prove the headline acceptance test, then document it. Verify a fresh clone runs with the single documented command (no manual npm, no Docker, no external service), confirm single-port serving with SPA deep-link fallback and no API shadowing, confirm durability across restart and the idempotent seed, and write the README that lets a reviewer start on the first try (purpose, prerequisites, the one command, the stack, the seeded Admin credentials). After this epic, SM-1 passes.
**FRs covered:** FR-21 (harden/verify), FR-22 (verify), FR-23, plus restart verification of FR-19/FR-20/FR-2.

---

## Epic 1: Foundation & Scaffolding

A runnable single-process skeleton that every later epic depends on. By the end of this epic, `dotnet run` from a clean working tree builds the Angular SPA into `wwwroot`, creates and migrates the SQLite database, and serves a live (if feature-empty) application on `http://localhost:5080`, with client-side deep links resolving via SPA fallback and API routes not shadowed. No business features yet — this is the chassis. Realizes FR-19, FR-20, the scaffold half of FR-21, and FR-22; anchors NFR-1, NFR-4, NFR-10.

### Story 1.1: Solution and project scaffolding (backend + Angular shell)

As a developer,
I want the solution, the API project, and the Angular client scaffolded to the architecture's layout,
So that there is one place to build, run, and extend the system.

**Acceptance Criteria:**

**Given** an empty repository
**When** the scaffold is created
**Then** the repo matches Architecture §6.1: `FieldTaskManager.sln` at root; `src/FieldTaskManager.Api/` (SDK `Microsoft.NET.Sdk.Web`, `TargetFramework net10.0`, `Nullable` and `ImplicitUsings` enabled); a sibling `clientapp/` Angular 20 standalone app; and a `.gitignore` that excludes `bin/ obj/ node_modules/ dist/ wwwroot/ *.db`.
**And** the API `.csproj` pins the packages from Architecture §2/§6.3: `Microsoft.EntityFrameworkCore.Sqlite` (10.0.*), `Microsoft.EntityFrameworkCore.Design` (10.0.*, `PrivateAssets="all"`), `Microsoft.AspNetCore.Authentication.JwtBearer` (10.0.*), `BCrypt.Net-Next` (4.0.3), `Swashbuckle.AspNetCore` (7.*).
**And** the empty folder structure exists for `Domain/Entities`, `Domain/Enums`, `Data`, `Contracts`, `Controllers`, `Services`, `Security`, `Common`, and `Migrations` so later epics drop files in without restructuring.

**Given** the Angular `clientapp/`
**When** it is bootstrapped
**Then** `main.ts` calls `bootstrapApplication(App, appConfig)`; `app.config.ts` wires `provideRouter(routes)` and `provideHttpClient(...)`; `app.routes.ts`, `app/core/`, `app/features/`, and `app/shared/` folders exist per §6.1; TypeScript `strict` is on.
**And** `clientapp/package.json` defines `"build": "ng build --configuration production"` (Architecture §6.3).

**Files/components touched:** `FieldTaskManager.sln`, `.gitignore`, `src/FieldTaskManager.Api/FieldTaskManager.Api.csproj`, `clientapp/package.json`, `clientapp/angular.json`, `clientapp/tsconfig.json`, `clientapp/src/main.ts`, `clientapp/src/index.html`, `clientapp/src/app/app.ts`, `clientapp/src/app/app.config.ts`, `clientapp/src/app/app.routes.ts` (Architecture §6.1).

### Story 1.2: Single-port serving with SPA fallback (FR-22)

As a reviewer,
I want the API and the SPA served on one port with deep links working,
So that the app behaves like a normal single-page app reachable at one URL.

**Acceptance Criteria:**

**Given** `Program.cs` wired per Architecture §6.3
**When** the app starts
**Then** Kestrel listens on the single HTTP endpoint `http://localhost:5080` (from `appsettings.json` `Kestrel:Endpoints:Http:Url`), and the middleware pipeline is `UseDefaultFiles()` → `UseStaticFiles()` → `UseAuthentication()` → `UseAuthorization()` → `MapControllers()` → `MapFallbackToFile("index.html")`, in that order.

**Given** the running app
**When** a browser requests `/` or any non-API client route (e.g. `/login`, `/tasks/abc`) directly (a deep link)
**Then** the server returns the SPA shell `index.html` (HTTP 200), not a 404 (FR-22).

**Given** the running app
**When** a request hits an `/api/...` path
**Then** it resolves to a controller (or returns the controller's status code) and is **never** shadowed by the SPA fallback, because `MapControllers()` is mapped before `MapFallbackToFile` and the fallback has lowest route priority (Architecture §6.3 note).

**Given** the Angular production build
**When** it emits output
**Then** `clientapp/angular.json` `outputPath` is `{ "base": "../src/FieldTaskManager.Api/wwwroot", "browser": "" }` so `index.html` lands at `wwwroot/index.html` exactly where `MapFallbackToFile` expects it (Architecture §6.3).

**Files/components touched:** `src/FieldTaskManager.Api/Program.cs`, `src/FieldTaskManager.Api/appsettings.json` (Kestrel + ConnectionStrings), `clientapp/angular.json` (Architecture §6.3, §6.4, §12).

### Story 1.3: SQLite auto-create, migrate, and durable persistence (FR-19, FR-20)

As the system owner,
I want the SQLite schema created and migrated automatically at startup and data to survive restarts,
So that there is no manual database step and nothing is lost between runs.

**Acceptance Criteria:**

**Given** the API project
**When** the DbContext is defined
**Then** `Data/AppDbContext.cs` exists with `DbSet<User>`, `DbSet<FieldTask>`, `DbSet<Comment>` and the `OnModelCreating` configuration from Architecture §5.6 (unique index on `User.Username`; indexes on `FieldTask.AssigneeId` and `FieldTask.Status`; `Comment → FieldTask` cascade delete; `FieldTask → User` and `Comment → User` restrict). It is registered via `AddDbContext<AppDbContext>(o => o.UseSqlite(GetConnectionString("Default")))` with `Data Source=fieldtasks.db`.

> Note: the entity classes themselves (`User`, `FieldTask`, `Comment`, enums) are introduced by the epics that use them (E2/E3); this story establishes the DbContext shape and the migrate-at-startup mechanism. The initial migration is generated and committed once the first entities land (a thin `User`-only migration is acceptable in E2; this story's mechanism applies all committed migrations).

**Given** a machine with no `fieldtasks.db`
**When** the app starts
**Then** within a DI scope `db.Database.Migrate()` runs **before** any request is served and creates the database file and applies all committed migrations, with **no** manual `dotnet ef` command required by the runner (FR-20, Architecture §12 step 2).

**Given** an existing, up-to-date `fieldtasks.db`
**When** the app starts again
**Then** `Migrate()` is idempotent — it applies nothing new and the app starts cleanly without error (FR-20).

**Given** data created in one run (once entities exist)
**When** the process is stopped and restarted
**Then** the data is still present and relationships resolve correctly (a Task's Assignee, its Comments, and its coordinates), proving durability and referential integrity (FR-19, NFR-4, Architecture §12).

**Files/components touched:** `src/FieldTaskManager.Api/Data/AppDbContext.cs`, `src/FieldTaskManager.Api/Data/DbInitializer.cs` (Migrate hook; seed added in E2), `src/FieldTaskManager.Api/Program.cs` (scope + `db.Database.Migrate()`), `src/FieldTaskManager.Api/Migrations/`, `appsettings.json` `ConnectionStrings:Default` (Architecture §3.2, §5.6, §12).

### Story 1.4: MSBuild target builds Angular into wwwroot (FR-21 scaffold)

As a developer,
I want the backend build to build the Angular app automatically,
So that running the backend produces a complete, served SPA without anyone running npm by hand.

**Acceptance Criteria:**

**Given** the API `.csproj`
**When** the build targets are defined per Architecture §6.3
**Then** `SpaRoot` is `..\..\clientapp\` and `SpaDist` is `wwwroot\`; an `EnsureNpmInstall` target runs `npm ci` in `$(SpaRoot)` only when `node_modules` is absent (`Condition="!Exists('$(SpaRoot)node_modules')"`, `BeforeTargets="BuildSpa"`); a `BuildSpa` target runs `npm run build` in `$(SpaRoot)` `BeforeTargets="Build"`; and `IncludeSpaInPublish` (`AfterTargets="ComputeFilesToPublish"`) ships `wwwroot/**` with `dotnet publish`.

**Given** a working tree with no `clientapp/node_modules` and no `wwwroot/`
**When** `dotnet build` (or `dotnet run`) runs in `src/FieldTaskManager.Api`
**Then** MSBuild first runs `npm ci` (logged "Installing Angular dependencies…"), then `npm run build` (logged "Building Angular SPA into wwwroot…"), and `wwwroot/index.html` plus the hashed bundles are produced (FR-21, Architecture §6.3).

**Given** a working tree where `node_modules` already exists
**When** the backend builds again
**Then** `EnsureNpmInstall` is skipped (its condition is false) and only `npm run build` runs, so repeat builds reuse installed deps (FR-21 "second run reuses the build appropriately").

**Files/components touched:** `src/FieldTaskManager.Api/FieldTaskManager.Api.csproj` (targets `EnsureNpmInstall`, `BuildSpa`, `IncludeSpaInPublish`), `clientapp/package.json` (`build` script), `clientapp/angular.json` (`outputPath`) (Architecture §6.3).

---

## Epic 2: Authentication, Roles & Seeding

Secure identity and the Admin/Worker boundary. Introduces the `User` entity and the `Role` enum, JWT issuance/validation, BCrypt password hashing, the idempotent Admin seed, self-registration (always Worker), login, the `/api/auth/me` echo, and server-enforced authorization via declarative `[Authorize]` attributes plus the `CurrentUser`/`ICurrentUserAccessor` pattern. On the frontend it adds the login/register screens (S1/S2), the signal-based `AuthService`, the bearer `authInterceptor`, and functional `authGuard`/`adminGuard`. Realizes FR-1..FR-4; anchors NFR-2, NFR-3. Builds on E1's running host and DbContext.

### Story 2.1: Auto-seed the Admin on first run (FR-2)

As the system owner,
I want an Admin account created automatically on first startup,
So that there is always a dispatcher without any manual setup.

**Acceptance Criteria:**

**Given** the `User` entity (Architecture §5.2: `Id` Guid PK, unique `Username`, `PasswordHash`, `Role` stored as int, `DisplayName`, `CreatedAtUtc`) and the `Role` enum (`Admin = 0`, `Worker = 1`, §5.1), with the initial EF migration generated and committed
**When** the app starts against an empty database
**Then** `DbInitializer.SeedAdmin(db, config)` (called after `Migrate()`, Architecture §12 step 3) creates exactly one User with `Role = Admin` from the `SeedAdmin` config section (`Username` `admin`, `Password` `Admin#12345`, `DisplayName` `Administrator`, §6.4), and its `PasswordHash` is a BCrypt hash via `BCrypt.Net.BCrypt.HashPassword(...)` — the plaintext is never persisted (FR-2, NFR-3).

**Given** a database that already contains an Admin
**When** the app starts again
**Then** the seed finds an existing `Role.Admin` user and creates nothing — exactly one Admin remains (idempotent, FR-2).

**Given** the seeded Admin
**When** it logs in (Story 2.3) with the documented credentials
**Then** login succeeds and the returned token's role claim is `Admin`, enabling Admin-only capabilities (FR-2, FR-3).

**Files/components touched:** `src/FieldTaskManager.Api/Domain/Entities/User.cs`, `src/FieldTaskManager.Api/Domain/Enums/Role.cs`, `src/FieldTaskManager.Api/Data/DbInitializer.cs` (`SeedAdmin`), `src/FieldTaskManager.Api/Program.cs` (seed call after Migrate), `src/FieldTaskManager.Api/Migrations/` (initial migration), `appsettings.json` `SeedAdmin` section (Architecture §5.1, §5.2, §6.4, §12).

### Story 2.2: Self-register as a Worker (FR-1)

As a visitor,
I want to register an account,
So that I can log in and see my assigned work.

**Acceptance Criteria:**

**Given** the public endpoint `POST /api/auth/register` (Architecture §9.1) with `RegisterRequest { username (required), password (required, min 6), displayName? }` — a DTO that has **no** `role` field (over-posting defense, §4.4)
**When** a visitor submits a unique username and a valid password
**Then** `AuthService` creates a User with `Role = Worker` **always** (any role smuggled in the body is impossible to bind and ignored), stores the password only as a BCrypt hash, and returns **201 Created** with a `UserDto` that never includes `PasswordHash` (FR-1, NFR-3, §3 DTO discipline).

**Given** a username that already exists
**When** registration is attempted
**Then** the service throws `ConflictException` mapped to **409 Conflict** (or 400 per the PRD's accepted range) and no User is created (FR-1, §9.5).

**Given** an empty/short password or empty username
**When** registration is attempted
**Then** validation fails with **400** `ProblemDetails` and nothing is persisted (FR-1, §11).

**Given** a just-registered Worker
**When** they immediately call `POST /api/auth/login`
**Then** login succeeds (FR-1 "immediately log in", FR-3).

**On the frontend:** `RegisterComponent` (S2) is a reactive form (username, password, confirm-password) that enables submit only when passwords match; a duplicate username surfaces as an inline field error; on success the app auto-logs-in and routes to the Dashboard (UX §4.5, §3.1).

**Files/components touched:** `src/FieldTaskManager.Api/Controllers/AuthController.cs`, `src/FieldTaskManager.Api/Services/IAuthService.cs` + `AuthService.cs`, `src/FieldTaskManager.Api/Contracts/Auth/RegisterRequest.cs` + `UserDto.cs`, `src/FieldTaskManager.Api/Common/Exceptions.cs`; `clientapp/src/app/features/register/register.component.ts`, `clientapp/src/app/core/auth.service.ts` (Architecture §9.1, §4.4; UX §4.5).

### Story 2.3: Log in and receive a token (FR-3)

As a registered User,
I want to log in and receive a JWT,
So that I can call protected endpoints and the SPA knows who I am.

**Acceptance Criteria:**

**Given** `POST /api/auth/login` with `LoginRequest { username, password }` (Architecture §9.1)
**When** valid credentials are supplied
**Then** `AuthService` verifies the password with `BCrypt.Net.BCrypt.Verify(...)`, `TokenService` issues a signed HMAC-SHA256 JWT containing claims `sub` (User.Id), `role` (`ClaimTypes.Role` = `"Admin"`/`"Worker"`), `name` (`ClaimTypes.Name` = DisplayName), and `iss`/`aud`/`exp` from `JwtSettings` (480-minute lifetime), and returns **200 OK** `AuthResponse { token, user: UserDto }` (FR-3, Architecture §7.1, §6.4).

**Given** invalid credentials
**When** login is attempted
**Then** the response is **401 Unauthorized** with no token (FR-3, §9.5).

**Given** the JWT bearer middleware configured with `TokenValidationParameters` (validate issuer/audience/lifetime/signing key, `RoleClaimType = ClaimTypes.Role`, `NameClaimType = ClaimTypes.Name`)
**When** a protected endpoint is called with an absent, malformed, or expired token
**Then** the response is **401** (FR-3, NFR-3, §7.1).

**Given** a valid token
**When** `GET /api/auth/me` (`[Authorize]`) is called
**Then** it returns **200** with the current user's `UserDto` decoded from the validated claims (Architecture §9.1).

**On the frontend:** `AuthService.login()` stores the token in `localStorage`, decodes claims into a `currentUser` signal, and exposes `isAuthenticated()`; `LoginComponent` (S1) shows an inline "Incorrect username or password" banner on 401 while preserving input (UX §4.5, §3.1, §10.3).

**Files/components touched:** `src/FieldTaskManager.Api/Controllers/AuthController.cs`, `Services/AuthService.cs`, `Services/ITokenService.cs` + `TokenService.cs`, `Security/JwtSettings.cs`, `Security/CurrentUser.cs`, `Contracts/Auth/LoginRequest.cs` + `AuthResponse.cs`, `Program.cs` (`AddAuthentication(JwtBearer)`), `appsettings.json` `Jwt` section; `clientapp/src/app/features/login/login.component.ts`, `clientapp/src/app/core/auth.service.ts`, `clientapp/src/app/core/models.ts` (Architecture §7.1, §9.1, §10.3).

### Story 2.4: Server-enforced Role boundary (FR-4)

As the system owner,
I want authorization enforced in the API,
So that the Admin/Worker boundary holds even if the client UI is bypassed.

**Acceptance Criteria:**

**Given** the `ICurrentUserAccessor`/`CurrentUserAccessor` that reads `HttpContext.User` into a `CurrentUser` record (`Id`, `Role`, `Name`) and is injected into services (Architecture §4.2, §7.1)
**When** controllers and services are written
**Then** controllers carry `[Authorize]` at class level by default and `[Authorize(Roles = "Admin")]` on Admin-only actions (per the §7.2 list); services receive `CurrentUser` as a parameter and never touch `HttpContext` directly (§4.1).

**Given** an authenticated Worker
**When** they call any Admin-only endpoint (e.g. a create/edit/delete/verify/reopen/list-users route — wired in E3/E4)
**Then** the response is **403 Forbidden** and the operation has no effect (FR-4, NFR-2, §7.4).

**Given** an authenticated Worker
**When** they request a resource scoped to another Worker (wired in E3)
**Then** the response is **404** (existence not leaked) or **403**, per the §7.3 ownership rule, enforced inside the service (FR-4, FR-7, NFR-2).

**Given** any protected endpoint
**When** the JWT is removed or tampered with
**Then** validation fails and the response is **401** — access is never granted by bypassing the UI (FR-4, NFR-3).

**On the frontend:** functional `authGuard` (redirect to `/login` when not authenticated) and `adminGuard` (redirect to `/dashboard` when role is not Admin) are added to `auth.guard.ts`; the `authInterceptor` attaches `Authorization: Bearer <token>` and on a 401 calls `AuthService.logout()` and navigates to `/login` (UI hiding only — the server is the real boundary, NFR-2/SM-C2, UX §6.3) (Architecture §10.2).

**Files/components touched:** `src/FieldTaskManager.Api/Security/ICurrentUserAccessor.cs` + `CurrentUserAccessor.cs`, `Security/CurrentUser.cs`, `Common/Exceptions.cs` (`Forbidden`/`NotFound`), `Common/ProblemDetailsExceptionHandler.cs`, `Program.cs` (`AddHttpContextAccessor`, `AddAuthorization`, exception handler), all controllers' `[Authorize]` attributes; `clientapp/src/app/core/auth.guard.ts`, `clientapp/src/app/core/auth.interceptor.ts`, `clientapp/src/app/app.config.ts` (interceptor registration) (Architecture §4.1, §4.2, §7, §10.2; UX §6.3).

---

## Epic 3: Task CRUD & Map

The board comes alive. Introduces the `FieldTask` and `Comment` entities and the `FieldTaskStatus` enum, the `TasksController`/`TaskService` (create, edit, reassign, delete, role-scoped read, location update), the `UsersController` assignee list, and the frontend Dashboard (Leaflet/OSM map + task list) and the Create/Edit drawer with the click-to-place and drag-to-correct location picker. The `Comment` entity is created here (Story 3.4 depends on cascade delete being real), while comment *behavior* arrives in E4. Realizes FR-5..FR-11; anchors NFR-2 (ownership), NFR-8 (OSM tiles), UX-DR-1..UX-DR-4. Builds on E2's identity and role boundary.

### Story 3.1: Create a Task (FR-5)

As an Admin,
I want to create a Task with title, description, Location, Assignee, and Deadline,
So that a Worker has a clear, precisely located job.

**Acceptance Criteria:**

**Given** the `FieldTask` entity (Architecture §5.3) and `FieldTaskStatus` enum (`Created=0, InProgress=1, Done=2, Verified=3`, §5.1), with a committed migration
**When** an Admin calls `POST /api/tasks` (`[Authorize(Roles="Admin")]`) with `CreateTaskRequest { title (required, non-empty), description?, latitude (required), longitude (required), assigneeId (required), deadline (required, UTC) }` (§9.2)
**Then** `TaskService` validates title non-empty (trimmed), lat in -90..90 and lng in -180..180, `assigneeId` exists and is `Role.Worker`, and deadline present; on success it persists the Task with `Status = Created`, `CreatedAtUtc`/`UpdatedAtUtc` set, and returns **201 Created** with a `Location` header and the `TaskDto` (FR-5, §5.3, §9.2).

**Given** a create request missing any required field (title, latitude, longitude, assigneeId, or deadline)
**When** it is submitted
**Then** the response is **400** `ProblemDetails` and nothing is persisted (FR-5).

**Given** an `assigneeId` that does not exist or refers to a non-Worker (e.g. the Admin)
**When** create is attempted
**Then** the response is **400** and nothing is persisted (FR-5, §9.2).

**Given** a Worker
**When** they call `POST /api/tasks`
**Then** the response is **403** (FR-4/FR-5, §7.4).

**On the frontend:** `TaskFormComponent` in create mode (S5 drawer) submits via `TaskService.create(dto)`; on success the drawer closes and the new Marker appears on the map in Created color and a new row appears in the list (FR-5 → FR-9; UX §3.2, §4.4). The Create button stays disabled until title, assignee, deadline, and a placed location are all valid.

**Files/components touched:** `src/FieldTaskManager.Api/Domain/Entities/FieldTask.cs`, `Domain/Enums/FieldTaskStatus.cs`, `Controllers/TasksController.cs`, `Services/ITaskService.cs` + `TaskService.cs`, `Contracts/Tasks/CreateTaskRequest.cs` + `TaskDto.cs`, `Migrations/`; `clientapp/src/app/features/task-form/task-form.component.ts`, `clientapp/src/app/core/task.service.ts`, `clientapp/src/app/core/models.ts` (Architecture §5.1, §5.3, §9.2; UX §4.4).

### Story 3.2: Edit and reassign a Task (FR-6)

As an Admin,
I want to edit a Task's title, description, Assignee, and Deadline,
So that I can correct mistakes and move work to the right Worker.

**Acceptance Criteria:**

**Given** `PUT /api/tasks/{id}` (`[Authorize(Roles="Admin")]`) with `UpdateTaskRequest { title (required), description?, assigneeId (required), deadline (required) }` and the dedicated `PATCH /api/tasks/{id}/assignee` with `UpdateAssigneeRequest { assigneeId }` (Architecture §9.2)
**When** an Admin edits fields
**Then** the same rules as create apply (title non-empty, assignee must be an existing Worker); on success the changes persist, `UpdatedAtUtc` is bumped, Status and Location are unchanged, and **200 OK** `TaskDto` is returned, reflected in list/read/Map (FR-6, §9.2).

**Given** a reassignment to a different Worker
**When** it succeeds
**Then** the previous Assignee can no longer read/list the Task and the new Assignee can — enforced by the service ownership scoping (FR-6, FR-7, §7.3).

**Given** an edit that violates a field rule (empty title, non-existent or non-Worker assignee)
**When** submitted
**Then** the response is **400** and the Task is left unchanged (FR-6). A Worker calling `PUT`/`PATCH assignee` gets **403** (§7.4).

**On the frontend:** `TaskFormComponent` in edit mode (reachable only from the Admin `✎` in S4 or `/tasks/:id/edit`, guarded by `adminGuard`) submits via `TaskService.update(id, dto)` / `setAssignee(...)`; Workers have no edit route or affordance (UX-DR-2, UX §4.4).

**Files/components touched:** `Controllers/TasksController.cs` (`PUT`, `PATCH /assignee`), `Services/TaskService.cs`, `Contracts/Tasks/UpdateTaskRequest.cs` + `UpdateAssigneeRequest.cs`; `clientapp/src/app/features/task-form/task-form.component.ts`, `clientapp/src/app/core/task.service.ts`, `clientapp/src/app/app.routes.ts` (edit route + `adminGuard`) (Architecture §9.2, §10.1; UX §4.4).

### Story 3.3: Role-scoped Task reads (FR-7)

As a Worker,
I want to see only my assigned Tasks,
So that I'm not distracted by work that isn't mine.

**Acceptance Criteria:**

**Given** `GET /api/tasks` (`[Authorize]`) and `GET /api/tasks/{id}` (`[Authorize]`)
**When** an Admin calls the list/single-get
**Then** the list returns Tasks for all Assignees and any single Task is readable (FR-7, §7.3).

**Given** a Worker calling the list
**When** `TaskService` builds the query
**Then** it forces `q.Where(t => t.AssigneeId == current.Id)` so the result contains only the Worker's own Tasks; another Worker's Task is never present, and a Worker-supplied `assigneeId` filter is ignored (FR-7, NFR-2, §7.3).

**Given** a Worker requesting a single Task they are not the Assignee of
**When** `GET /api/tasks/{id}` runs
**Then** the service returns **404** (existence not leaked, the architecture's stronger privacy choice) (FR-7, §7.3).

**Given** results in either role
**When** the list is returned
**Then** Tasks are ordered by `deadline` ascending (soonest first), and each `TaskDto` carries `assigneeName` for display (Architecture §9.2, §9 DTOs).

**On the frontend:** `DashboardComponent` calls `TaskService.list(query)` and renders the server-scoped set in both the list pane and the map; the Worker view may omit the assignee line (always self) to reduce noise (UX §4.2).

**Files/components touched:** `Controllers/TasksController.cs` (`GET` list + single), `Services/TaskService.cs` (ownership scoping), `Contracts/Tasks/TaskDto.cs` + `TaskQuery.cs`; `clientapp/src/app/features/dashboard/dashboard.component.ts`, `clientapp/src/app/core/task.service.ts` (Architecture §7.3, §9.2; UX §4.2).

### Story 3.4: Delete a Task (FR-8)

As an Admin,
I want to delete a Task,
So that obsolete work disappears from the board with no orphaned data.

**Acceptance Criteria:**

**Given** the `Comment` entity (Architecture §5.4) configured with `Comment → FieldTask` `OnDelete: Cascade` (§5.5/§5.6) and a committed migration
**When** an Admin calls `DELETE /api/tasks/{id}` (`[Authorize(Roles="Admin")]`)
**Then** the Task is removed and the response is **204 No Content**; the Task no longer appears in any list, on the Map, or via `GET /api/tasks/{id}` (which returns **404**) (FR-8, §9.2).

**Given** a deleted Task that had Comments
**When** the delete completes
**Then** its Comments are removed by the cascade — no orphaned Comments remain (FR-8, §5.5).

**Given** a Worker
**When** they call `DELETE /api/tasks/{id}`
**Then** the response is **403** and the Task persists (FR-8, NFR-2, §7.4).

**On the frontend:** in the Admin Edit drawer (S5), a low-emphasis "Delete task" text-button opens a confirm dialog ("Delete this task and its comments? This cannot be undone."); on confirm, `TaskService.delete(id)` runs and the drawer closes and the list/map refresh (UX §4.4, §7.6).

**Files/components touched:** `src/FieldTaskManager.Api/Domain/Entities/Comment.cs`, `Data/AppDbContext.cs` (Comment cascade config), `Controllers/TasksController.cs` (`DELETE`), `Services/TaskService.cs`, `Migrations/`; `clientapp/src/app/features/task-form/task-form.component.ts` (delete + confirm), `clientapp/src/app/core/task.service.ts` (Architecture §5.4, §5.5, §5.6, §9.2; UX §4.4, §7.6).

### Story 3.5: Assignee dropdown — list Workers (supports FR-5/FR-6)

As an Admin,
I want a dropdown of selectable Workers when creating or editing a Task,
So that I can assign work without typing identifiers.

**Acceptance Criteria:**

**Given** `GET /api/users?role=1` (`[Authorize(Roles="Admin")]`, Architecture §9.4)
**When** an Admin requests the Worker list
**Then** the response is **200** with `UserDto[]` filtered to `Role.Worker` (no `PasswordHash` ever included) (§9.4, §3 DTO discipline).

**Given** a Worker
**When** they call `GET /api/users`
**Then** the response is **403** (§7.4).

**On the frontend:** `UserService.listWorkers()` calls `GET /api/users?role=1`; `TaskFormComponent`'s Assignee dropdown is populated with Workers only, so a non-Worker can never be selected (server still rejects non-Worker assignment per Story 3.1/3.2) (UX §4.4).

**Files/components touched:** `src/FieldTaskManager.Api/Controllers/UsersController.cs`, `Services/IUserService.cs` + `UserService.cs`, `Contracts/Auth/UserDto.cs`; `clientapp/src/app/core/user.service.ts`, `clientapp/src/app/features/task-form/task-form.component.ts` (Architecture §9.4, §10.3; UX §4.4).

### Story 3.6: See Tasks as status-colored Markers (FR-9)

As an Admin,
I want all my Tasks shown as color-coded Markers on a map,
So that I can read the state of the field at a glance.

**Acceptance Criteria:**

**Given** the Dashboard Leaflet map (raw Leaflet 1.9 + `@types/leaflet`, OSM tiles, no API key) initialized in `ngAfterViewInit`/`afterNextRender` with `map.invalidateSize()` after layout and `map.remove()` on teardown (Architecture §10.5, NFR-8)
**When** the role-scoped Task set loads
**Then** each visible Task renders as a Leaflet `divIcon` teardrop pin at its `(latitude, longitude)`, colored by Status using the single `status.util.ts` source — Created `#64748B`, In Progress `#F59E0B`, Done `#22C55E`, Verified `#0F766E` — matching the legend exactly (FR-9, UX-DR-3, Architecture §10.5, §10.6, UX §5.2).

**Given** the four Statuses
**When** their Markers render
**Then** each color is distinct and consistent across marker, list-row dot, detail badge, and filter pill, and each indicator pairs color with a **label and icon** (never color alone) so it survives color-blindness/grayscale (UX-DR-3/UX-DR-9, UX §5.2, §8).

**Given** the Marker set
**When** it is built
**Then** it respects Role scope (Admin sees all; Worker sees only own, from Story 3.3) (FR-9, FR-7).

**Given** a Task whose Status changes (via E4)
**When** the Dashboard re-renders/refreshes
**Then** that Task's Marker color updates to the new Status color (FR-9). When there are no tasks the map renders at a fixed default center/zoom; otherwise it fits bounds to visible markers (UX §4.2, Architecture §10.5).

**Files/components touched:** `clientapp/src/app/features/dashboard/dashboard.component.ts` (Leaflet map + marker layer), `clientapp/src/app/shared/status.util.ts` (status → color/label/icon — single source), `clientapp/src/app/shared/status-legend.component.ts`, `clientapp/src/styles.css` (import `leaflet/dist/leaflet.css`, marker color classes, §5 tokens); npm deps `leaflet` + `@types/leaflet` (Architecture §2, §10.5, §10.6; UX §5.2).

### Story 3.7: Place a Location by clicking the Map (FR-10)

As an Admin,
I want to set a Task's Location by clicking the Map,
So that location is precise, not prose.

**Acceptance Criteria:**

**Given** the Create drawer (S5) with the map in "pick" mode (Architecture §10.4, UX §4.4)
**When** the Admin clicks a point on the map
**Then** the click's `(lat, lng)` is captured, a draggable marker drops at that point, and the form's Location field shows the captured coordinates as a confirmed chip ("Set: 48.3000, 33.5200") — the user never types numbers (FR-10, UX-DR-1, UX §4.4, §7.2).

**Given** captured coordinates
**When** the Admin saves (Create)
**Then** exactly those coordinates are sent in `CreateTaskRequest.latitude/longitude` and persisted (FR-10 → FR-5).

**Given** no location has been placed
**When** the Admin attempts to submit
**Then** Create is disabled and the Location field is flagged as required (UX §4.4 submit rules).

**Files/components touched:** `clientapp/src/app/features/task-form/task-form.component.ts` (Leaflet click handler, pick mode, coordinate chip), `clientapp/src/app/core/task.service.ts`; reuses the persistent Dashboard map per the single-drawer model (UX-DR-8) (Architecture §10.4, §10.5; UX §4.4, §7.2).

### Story 3.8: Correct a Location by dragging the Marker (FR-11)

As an Admin,
I want to drag a Marker to fix a Location,
So that I can correct mistakes without re-entering data — and Workers cannot move locations.

**Acceptance Criteria:**

**Given** the Edit drawer (S5) for an existing Task
**When** the Admin drags the (draggable) marker to a new point and clicks Save
**Then** the new drop coordinates are sent via `PATCH /api/tasks/{id}/location` (`[Authorize(Roles="Admin")]`) with `UpdateLocationRequest { latitude (-90..90), longitude (-180..180) }`; the service validates the range, updates the stored coordinates, bumps `UpdatedAtUtc`, and returns **200** `TaskDto` (FR-11, Architecture §9.2).

**Given** out-of-range coordinates
**When** the patch is attempted
**Then** the response is **400** (§9.2).

**Given** a reload after a successful drag-save
**When** the Task is rendered again
**Then** the Marker appears at the new coordinates, proving the change persisted (FR-11).

**Given** a Worker
**When** they view the Task
**Then** the marker is static (no drag affordance), and any direct call to `PATCH /api/tasks/{id}/location` returns **403** — the boundary holds even if the UI is bypassed (FR-11, NFR-2, §7.4; UX §3.5, §4.4).

**Files/components touched:** `Controllers/TasksController.cs` (`PATCH /location`), `Services/TaskService.cs`, `Contracts/Tasks/UpdateLocationRequest.cs`; `clientapp/src/app/features/task-form/task-form.component.ts` (draggable marker, Admin-only), `clientapp/src/app/core/task.service.ts` (`setLocation`) (Architecture §9.2, §10.4; UX §3.5, §4.4).

---

## Epic 4: Status Workflow & Comments

The enforced state machine and the audit trail. A single `StatusTransitionService` is the only authority on transition legality; Workers advance their own Task forward; the Admin holds the closure gate (Verify/Reopen); the Task Detail drawer renders the Role × Status action matrix; and accessible Users post immutable, attributed, timestamped Comments — with each accepted status change appended as an audit comment so the thread interleaves notes and state events. Realizes FR-12..FR-16; anchors NFR-5 (auditability), UX-DR-7. Builds on E3's Tasks, Comment entity, and ownership scoping.

### Story 4.1: Worker advances own Task forward (FR-12)

As a Worker,
I want to move my Task `Created → In Progress → Done`,
So that I can report progress.

**Acceptance Criteria:**

**Given** the single transition authority `StatusTransitionService.CanTransition(role, from, to)` (Architecture §8, the only place legality is decided) and `PATCH /api/tasks/{id}/status` (`[Authorize]`) with `UpdateStatusRequest { status }` (§9.2)
**When** the assignee Worker requests `Created → InProgress` or `InProgress → Done` on their own Task
**Then** the transition is allowed, `Status` is updated, `UpdatedAtUtc` bumped, and **200** `TaskDto` returned (FR-12, §8.1, §8.2).

**Given** a Worker
**When** they request any other transition — a structurally impossible one (e.g. `Created → Done`) or any backward move
**Then** it is rejected with **400** (illegal transition) and Status is unchanged; when the requested target is an Admin-only transition (Verify/Reopen) the response is **403** ("you lack the role") — both PRD-acceptable (FR-12, §8.2 footnote).

**Given** a Worker
**When** they attempt a transition on a Task they are not the Assignee of
**Then** the ownership check returns **404** before any transition logic runs (FR-12, FR-7, §7.3, §8.2).

**Given** any accepted transition
**When** it succeeds
**Then** an audit record is written attributing the actor and timestamp (Story 4.4) (FR-12, NFR-5).

**On the frontend:** in S4, the assignee Worker sees a single primary action — "Start work" (Created) or "Mark as Done" (In Progress) — applied optimistically with rollback on error (UX-DR-5, UX §4.3, §7.3).

**Files/components touched:** `src/FieldTaskManager.Api/Services/StatusTransitionService.cs`, `Controllers/TasksController.cs` (`PATCH /status`), `Services/TaskService.cs`, `Contracts/Tasks/UpdateStatusRequest.cs`; `clientapp/src/app/features/task-detail/task-detail.component.ts`, `clientapp/src/app/core/task.service.ts` (`setStatus`) (Architecture §8, §9.2; UX §4.3).

### Story 4.2: Admin verifies closure (FR-13)

As an Admin,
I want to Verify a Done Task,
So that closure is confirmed, not assumed.

**Acceptance Criteria:**

**Given** `PATCH /api/tasks/{id}/status` with target `Verified`, decided by `StatusTransitionService` (Architecture §8.1)
**When** an Admin verifies a Task whose current Status is `Done`
**Then** the transition `Done → Verified` is allowed, `Status` becomes `Verified`, and **200** `TaskDto` is returned; on the next render the Marker recolors to verified teal `#0F766E` (FR-13, FR-9, §8.1, §10.6).

**Given** a Task not in `Done`
**When** Verify is attempted
**Then** it is rejected with **400** (Verify is only legal from Done) (FR-13, §8.1).

**Given** a Worker
**When** they attempt the Verify transition
**Then** the response is **403** (Verify is Admin-only) (FR-13, NFR-2, §8.1).

**On the frontend:** in S4, the Admin sees a positive/teal **"Verify (confirm closure)"** button only when the Status is `Done`; it is visibly available to the Admin only (UX-DR-7, UX §4.3).

**Files/components touched:** `Services/StatusTransitionService.cs` (Verify edge), `Controllers/TasksController.cs` (`PATCH /status`), `Services/TaskService.cs`; `clientapp/src/app/features/task-detail/task-detail.component.ts` (Verify button, Role × Status matrix), `clientapp/src/app/shared/status.util.ts` (Architecture §8.1, §9.2; UX §4.3).

### Story 4.3: Admin reopens a Task (FR-14)

As an Admin,
I want to Reopen a Done or Verified Task back to In Progress,
So that incomplete work returns to the Worker.

**Acceptance Criteria:**

**Given** `PATCH /api/tasks/{id}/status` with target `InProgress`, decided by `StatusTransitionService` (Architecture §8.1)
**When** an Admin reopens a Task whose current Status is `Done` or `Verified`
**Then** the transition (`Done → InProgress` or `Verified → InProgress`) is allowed, `Status` becomes `InProgress`, and **200** `TaskDto` is returned; the Assignee can then advance it again via Story 4.1 (FR-14, FR-12, §8.1).

**Given** a Task in `Created` or `InProgress`
**When** Reopen is attempted
**Then** it is rejected with **400** (Reopen is only legal from Done/Verified) (FR-14, §8.1).

**Given** a Worker
**When** they attempt the Reopen transition
**Then** the response is **403** (Reopen is Admin-only) (FR-14, NFR-2, §8.1).

**On the frontend:** in S4, the Admin sees a secondary (outlined) **"Reopen (return to work)"** button on `Done` and `Verified` Tasks; the marker returns to In-Progress orange after Reopen (UX-DR-7, UX §4.3).

**Files/components touched:** `Services/StatusTransitionService.cs` (Reopen edges), `Controllers/TasksController.cs` (`PATCH /status`), `Services/TaskService.cs`; `clientapp/src/app/features/task-detail/task-detail.component.ts` (Reopen button) (Architecture §8.1, §9.2; UX §4.3).

### Story 4.4: Status-change audit trail (NFR-5)

As an Admin,
I want every Status change recorded with who made it and when,
So that I can reconstruct a Task's history without leaving the system.

**Acceptance Criteria:**

**Given** a successful transition in `TaskService`/`StatusTransitionService` (any of Stories 4.1–4.3)
**When** the new Status is persisted
**Then** the service appends a `Comment` of the form `"[status] <Actor> changed status: <From> → <To>"`, authored by the acting User (`AuthorId = current.Id`) with the server-assigned `CreatedAtUtc` — satisfying "every status transition MUST be attributable and timestamped" using the existing comment trail, with no separate audit table (NFR-5, Architecture §8.3).

**Given** a Task's comment thread (Story 4.6)
**When** it is rendered
**Then** status-audit comments and human comments interleave in chronological order, giving the reconstructable history SM-5 requires (Architecture §8.3, §9.3).

**Files/components touched:** `src/FieldTaskManager.Api/Services/StatusTransitionService.cs` / `TaskService.cs` (audit comment write), `Domain/Entities/Comment.cs`, `Data/AppDbContext.cs` (Architecture §8.3).

### Story 4.5: Add a Comment (FR-15)

As a User,
I want to comment on a Task I can access,
So that I can record what happened.

**Acceptance Criteria:**

**Given** `POST /api/tasks/{id}/comments` (`[Authorize]`) with `CreateCommentRequest { body (required, non-empty trimmed) }` (Architecture §9.3)
**When** a User who can access the Task (Admin for any; Worker for their own) posts non-empty text
**Then** `CommentService` performs the ownership check first (Worker not assignee → **404**, existence not leaked), sets `AuthorId = current.Id` and a server-assigned `CreatedAtUtc`, persists the `Comment` (max 2000 chars), and returns **201 Created** `CommentDto` (FR-15, NFR-5, §7.3, §9.3).

**Given** an empty or whitespace-only body
**When** a Comment is posted
**Then** the response is **400** and nothing is persisted (FR-15, §9.3).

**Given** a Worker
**When** they post a Comment on a Task they are not the Assignee of
**Then** the response is **404** (or 403), per ownership scoping (FR-15, FR-7, §7.3).

**On the frontend:** the S4 composer (sticky textarea + Post) disables Post on empty/whitespace (mirrors the server rule), posts via `CommentService.add(taskId, body)`, appends the new comment, and clears; `Ctrl/Cmd+Enter` posts (UX §4.3, §7.7).

**Files/components touched:** `src/FieldTaskManager.Api/Controllers/CommentsController.cs`, `Services/ICommentService.cs` + `CommentService.cs`, `Contracts/Comments/CreateCommentRequest.cs` + `CommentDto.cs`; `clientapp/src/app/features/task-detail/task-detail.component.ts`, `clientapp/src/app/core/comment.service.ts` (Architecture §9.3, §7.3; UX §4.3).

### Story 4.6: View Comments with author and time (FR-16)

As a User,
I want to see a Task's Comments with who said what and when,
So that history is reconstructable without leaving the system.

**Acceptance Criteria:**

**Given** `GET /api/tasks/{id}/comments` (`[Authorize]`, ownership-checked) (Architecture §9.3)
**When** an accessible Task's comments are requested
**Then** the response is **200** `CommentDto[]` ordered **oldest-to-newest** by `CreatedAtUtc`, each carrying `authorId`, `authorName`, `body`, and `createdAtUtc`, and including the status-audit comments from Story 4.4 (FR-16, §8.3, §9.3).

**Given** a Worker requesting comments for a Task that isn't theirs
**When** the request runs
**Then** the response is **404** (FR-16, FR-7, §7.3).

**Given** the rendered thread (S4)
**When** a User views it
**Then** comments appear chronologically as cards with author name + local-time timestamp (UTC stored, displayed local), and there are no edit/delete affordances — Comments are immutable in v1; displayed author/timestamp match what was persisted (FR-16, UX §4.3, §11).

**Files/components touched:** `Controllers/CommentsController.cs` (`GET`), `Services/CommentService.cs`, `Contracts/Comments/CommentDto.cs`; `clientapp/src/app/features/task-detail/task-detail.component.ts` (thread render), `clientapp/src/app/core/comment.service.ts` (`list`) (Architecture §9.3, §8.3; UX §4.3, §11).

---

## Epic 5: Filtering/Search & UX Polish

Find the relevant work and bring the whole experience to the UX spec's quality bar. Adds scoped status filtering and case-insensitive text search as server query params that honor role scope, then layers in the cross-cutting UX commitments: explicit loading/empty/error states, optimistic transitions with rollback, the canonical legend wired from one source, debounced search, the single-drawer interaction model, responsive collapse, and the accessibility floor. Realizes FR-17, FR-18; anchors NFR-6, NFR-7, UX-DR-3, UX-DR-5, UX-DR-6, UX-DR-8, UX-DR-9. Builds on E3's Dashboard/list and E4's actions.

### Story 5.1: Filter Tasks by Status (FR-17)

As a User,
I want to filter Tasks by Status,
So that I can focus (e.g., the Admin clears the verification queue by viewing Done work).

**Acceptance Criteria:**

**Given** `GET /api/tasks?status={int}` (`[Authorize]`, `TaskQuery.status`) (Architecture §9.2)
**When** a Status filter is applied
**Then** the response contains only Tasks in that `FieldTaskStatus`, within the caller's authorized scope (Worker still only their own — the status filter is applied **after** the role scoping in `TaskService`) (FR-17, FR-7, §7.3, §9.2).

**Given** the filter is omitted/cleared
**When** the list is requested
**Then** the full authorized set is returned (FR-17).

**On the frontend:** the Dashboard filter bar is a horizontal segmented pill row `All · Created · In Progress · Done · Verified`, single-select (acceptable for v1), each pill carrying the Status color dot so the filter doubles as a mini-legend; selecting a pill calls `TaskService.list({ status })` and narrows both the list and the markers (FR-17, UX §4.2, §5.2).

**Files/components touched:** `Controllers/TasksController.cs` (`GET` `status` param), `Services/TaskService.cs` (status filter after scoping), `Contracts/Tasks/TaskQuery.cs`; `clientapp/src/app/features/dashboard/dashboard.component.ts` (filter pills), `clientapp/src/app/shared/status.util.ts`, `clientapp/src/app/core/task.service.ts` (Architecture §9.2; UX §4.2, §5.2).

### Story 5.2: Search Tasks by text (FR-18)

As a User,
I want to search Tasks by title or description,
So that I can find a specific job fast.

**Acceptance Criteria:**

**Given** `GET /api/tasks?search={q}` (`[Authorize]`, `TaskQuery.search`) (Architecture §9.2)
**When** a query is supplied
**Then** the response contains only authorized Tasks whose `title` OR `description` contains `q` as a case-insensitive substring, applied **after** role scoping (FR-18, §7.3, §9.2).

**Given** an empty query
**When** the list is requested
**Then** the full authorized set is returned; a non-matching query returns an empty array without error (FR-18).

**Given** a Worker searching
**When** results are returned
**Then** they never include another Worker's Tasks (FR-18, FR-7, NFR-2).

**On the frontend:** the Dashboard search box debounces ~250ms before calling `TaskService.list({ search })`, shows a subtle inline loading state during refinement (not a full skeleton), and an empty result shows "No tasks match your filter." with a Clear action — never conflated with an empty system (FR-18, UX §4.2, §6.2, §7.4).

**Files/components touched:** `Controllers/TasksController.cs` (`GET` `search` param), `Services/TaskService.cs` (case-insensitive substring after scoping), `Contracts/Tasks/TaskQuery.cs`; `clientapp/src/app/features/dashboard/dashboard.component.ts` (debounced search box), `clientapp/src/app/core/task.service.ts` (Architecture §9.2; UX §4.2, §6.2).

### Story 5.3: Loading, empty, and error states everywhere (UXG5, NFR-7)

As any User,
I want every screen to clearly show loading, empty, and error states,
So that the UI never lies about what happened.

**Acceptance Criteria:**

**Given** any async surface (Dashboard list, map, Task Detail, transition/post/save buttons)
**When** data is loading
**Then** it shows the prescribed loading treatment — skeleton rows for the list, a thin brand progress bar for the task fetch, skeletons for detail/comments, and an inline spinner + disabled state on the clicked button to prevent double-submit (UX §6.1).

**Given** an empty result
**When** rendered
**Then** the correct empty copy appears per role/context: Admin no-tasks (with + New Task), Worker no-tasks (no create button), filter/search no-match (distinct from no-tasks, with Clear), no comments, and a "No task locations to show" map caption (UX §6.2, UX-DR-2).

**Given** an error
**When** it occurs
**Then** it is handled per UX §6.3: login 401 inline banner; register 409/400 inline field error; **token expiry/401** surfaces a toast "Your session expired — please log in again," routes to `/login`, and preserves the attempted route (via the `authInterceptor` → `AuthService.logout()`); validation 400 maps to the offending field inline with the drawer kept open; network/5xx shows a top-center toast with a Retry on idempotent actions; 404 (reassigned/deleted out from under a Worker) shows a toast and closes the drawer, refreshing the list (UX §6.3).

**Given** a forbidden action that slips through (403, e.g. a raced state)
**When** the server rejects it
**Then** the UI shows "That action isn't allowed for this task right now" and **re-fetches** the task to resync to server truth — enforcement, not the UI, is the source of truth (NFR-2, SM-C2, UX §6.3).

**Files/components touched:** `clientapp/src/app/features/dashboard/dashboard.component.ts`, `clientapp/src/app/features/task-detail/task-detail.component.ts`, `clientapp/src/app/features/task-form/task-form.component.ts`, `clientapp/src/app/core/auth.interceptor.ts`, `clientapp/src/styles.css` (skeleton/toast styles, §5 tokens) (UX §6, §10.2; Architecture §10.2).

### Story 5.4: Optimistic transitions with rollback (UX §7.3)

As a Worker or Admin,
I want status actions to feel instant but stay honest,
So that the board responds immediately and never shows a state the server rejected.

**Acceptance Criteria:**

**Given** a status action in S4 (Start / Mark as Done / Verify / Reopen)
**When** the button is clicked
**Then** the badge and the Marker color update **optimistically** before the server responds (UX §7.3).

**Given** the server accepts the transition
**When** the `200 TaskDto` returns
**Then** the optimistic state is reconciled with the authoritative response and the marker/badge reflect the persisted Status (FR-9, UX §7.3).

**Given** the server rejects the transition (400/403)
**When** the error returns
**Then** the optimistic update **rolls back** to the prior Status and a toast explains the failure — the UI never shows a success it did not achieve (UXG5, UX §6.3, §7.3).

**Files/components touched:** `clientapp/src/app/features/task-detail/task-detail.component.ts` (optimistic update + rollback), `clientapp/src/app/core/task.service.ts`, `clientapp/src/app/shared/status.util.ts` (UX §7.3, §6.3).

### Story 5.5: Status legend and single-source status meta (UXG3)

As any User,
I want a visible, consistent Status legend,
So that marker and badge colors always mean the same thing.

**Acceptance Criteria:**

**Given** a single `StatusMeta` map in `status.util.ts` (`status → { hex, bgHex, label, icon }`) (UX §12 build note)
**When** any status indicator renders
**Then** the marker factory, the detail badge, the list-row dot, and the filter pills all read from that one source, so the legend can never drift from what is rendered (UXG3, UX-DR-3, UX §5.2, §12).

**Given** the App Shell (S6)
**When** the Legend popover is opened
**Then** it renders the canonical mapping verbatim: Created `#64748B` ○, In Progress `#F59E0B` ◐, Done `#22C55E` ●, Verified `#0F766E` ✓, each as color + label + icon (UX §5.2, §4.1).

**Files/components touched:** `clientapp/src/app/shared/status.util.ts` (single source), `clientapp/src/app/shared/status-legend.component.ts`, the App Shell component (legend toggle), `clientapp/src/app/features/dashboard/dashboard.component.ts`, `clientapp/src/app/features/task-detail/task-detail.component.ts` (consumers) (UX §4.1, §5.2, §10.6, §12).

### Story 5.6: Responsive layout and accessibility floor (UXG6, NFR-7)

As any User,
I want the app usable on desktop and a narrow viewport, fully keyboard- and screen-reader-operable,
So that it works wherever I am and for everyone.

**Acceptance Criteria:**

**Given** the responsive breakpoints (UX §9)
**When** the viewport is ≥1024px / 768–1023px / <768px
**Then** the layout is, respectively: map (flex-fill) left + list (380–420px) right with a ~480px right drawer; map + narrowed (~320px) list with a wider drawer; and a **single column with a Map/List segmented toggle** where the drawer becomes a full-screen sheet — and the map never disappears on any breakpoint (UX-DR-6, UX §9).

**Given** the single-drawer model (UX §7.5, UX-DR-8)
**When** S4 or S5 opens
**Then** they share one drawer slot (opening one closes the other) so the Leaflet map stays mounted; `Esc` and scrim-click close the drawer (with an unsaved-changes confirm in Create/Edit) (UX §7.5).

**Given** the accessibility floor (UX §8)
**When** the app is used by keyboard or screen reader
**Then** all actions are reachable by Tab order with a visible focus ring; the drawer is a focus-trapped `role="dialog"` with a labelled title and `Esc` to close; status indicators expose `aria-label` (e.g. "Status: In Progress"); transition/post results announce via `aria-live="polite"` and errors via `aria-live="assertive"`; hit targets are ≥36px (≥44px on phone); and `prefers-reduced-motion` disables the marker pulse and drawer slide (UX-DR-9, UX §8, §9).

**Files/components touched:** `clientapp/src/styles.css` (media queries, tokens, focus ring, reduced-motion), the App Shell + `dashboard.component.ts` (Map/List toggle, drawer container), `task-detail.component.ts`, `task-form.component.ts` (dialog semantics, aria-live, focus trap) (UX §7.5, §8, §9; Architecture §10).

---

## Epic 6: One-command Run & README/Docs

Harden and prove the headline acceptance test (SM-1), then document it. This epic carries the primary acceptance test: a reviewer with only the documented prerequisites clones the repo and runs a single command to reach a working app — no manual npm, no Docker, no external service. It also confirms single-port serving with SPA deep-link fallback (and no API shadowing), restart durability and the idempotent seed, and delivers the README that gets a reviewer running on the first try. Realizes FR-23 and verifies FR-21/FR-22/FR-19/FR-20/FR-2 end-to-end; anchors NFR-1, NFR-8, NFR-9, NFR-10. Builds on everything in E1–E5.

### Story 6.1: One-command start from a clean clone (FR-21, NFR-1)

As a reviewer,
I want to clone and run with a single command,
So that I can evaluate the system without any setup friction.

**Acceptance Criteria:**

**Given** a fresh `git clone` on a machine with only the documented prerequisites (.NET 10 SDK 10.0.300, Node.js 22 — verified 22.19.0/npm 10.9.3), with no `node_modules` and no `wwwroot/`
**When** the reviewer runs the single documented command `dotnet run` in `src/FieldTaskManager.Api`
**Then** MSBuild's `EnsureNpmInstall` runs `npm ci` and `BuildSpa` runs `npm run build` to emit the SPA into `wwwroot`, the app migrates the database and seeds the Admin, and a working app is reachable in a browser at `http://localhost:5080` — with no manual dependency install, no Docker, and no external service (FR-21, NFR-1, NFR-8, Architecture §6.3, §6.5).

**Given** the developer never runs npm by hand
**When** the backend builds
**Then** the Angular build is triggered automatically by the backend build (MSBuild → npm), not as a separate manual step (FR-21).

**Given** a second `dotnet run`
**When** `node_modules` and a built `wwwroot` already exist
**Then** `EnsureNpmInstall` is skipped, the build reuses installed deps, and the system still comes up running (FR-21 "second run reuses the build appropriately").

**Given** the supported acceptance OS is Windows
**When** the command runs on Windows
**Then** the build/run path works; cross-platform is supported where low-cost but Windows is the acceptance target (NFR-9).

**Files/components touched:** `src/FieldTaskManager.Api/FieldTaskManager.Api.csproj` (verify `EnsureNpmInstall`/`BuildSpa`/`IncludeSpaInPublish`), `clientapp/package.json`, `clientapp/angular.json` (`outputPath` flatten), `.gitignore` (ensures `wwwroot/`, `node_modules/`, `*.db` are not committed so the clean-clone path is genuine) (Architecture §6.1, §6.3, §6.5).

### Story 6.2: Single-port serving + SPA fallback, verified end-to-end (FR-22)

As a reviewer,
I want the UI and API on one port with deep links resolving,
So that the app behaves like a normal SPA after the one-command start.

**Acceptance Criteria:**

**Given** the running single-process app from Story 6.1
**When** the UI and API are exercised
**Then** both are reachable on the same single port `5080`; a direct navigation to any client-side route (`/login`, `/register`, `/tasks/:id`, `/tasks/new`, `/tasks/:id/edit`) returns the SPA shell `index.html` (200), not a 404; and `/api/...` routes resolve to controllers and are never shadowed by the fallback (FR-22, Architecture §6.3, §10.1).

**Given** the production Angular bundle
**When** it is served
**Then** `index.html` is at `wwwroot/index.html` (because `angular.json` flattened the output with `"browser": ""`), matching `MapFallbackToFile("index.html")` (Architecture §6.3).

**Files/components touched:** verify `src/FieldTaskManager.Api/Program.cs` (route order: `MapControllers()` before `MapFallbackToFile`), `clientapp/angular.json`, `clientapp/src/app/app.routes.ts` (deep-linkable routes) (Architecture §6.3, §10.1).

### Story 6.3: README that gets a reviewer running (FR-23)

As a reviewer,
I want a README covering purpose, run steps, tech, and Admin credentials,
So that I can start the system on the first try without reading the code.

**Acceptance Criteria:**

**Given** the repository root
**When** the README is written
**Then** it states: (1) **what the project does** (a map-anchored field task manager with an enforced status workflow and an auditable comment trail); (2) **prerequisites** (.NET 10 SDK 10.0.300, Node.js 22); (3) the **single run command** (`dotnet run` from `src/FieldTaskManager.Api`) and the URL `http://localhost:5080`; (4) the **technology stack** (ASP.NET Core 10 + EF Core + SQLite + JWT + BCrypt; Angular 20 standalone + Leaflet/OSM); and (5) the **seeded Admin credentials** (`admin` / `Admin#12345`) matching the `SeedAdmin` config from Story 2.1 (FR-23, FR-2, Architecture §6.1, §6.4).

**Given** a reviewer who reads only the README
**When** they follow it on a clean clone
**Then** the system starts on the first try (FR-23, NFR-1, validated against Story 6.1).

**Given** the security note (NFR-10)
**When** the README mentions the shipped JWT signing key and seed password
**Then** it clearly states they are for this internal build and must be replaced for any real deployment, and notes secrets are config-driven (`appsettings.json`), not hard-coded (NFR-10, Architecture §3.3).

**Files/components touched:** `README.md` (repo root), referencing `appsettings.json` (`SeedAdmin`, `Jwt`, `Kestrel`) (Architecture §6.1, §6.4; PRD FR-23).

### Story 6.4: Durability, migration, and idempotent seed verified across restart (FR-19, FR-20, FR-2)

As the system owner,
I want to confirm data survives restart and startup is repeatable,
So that the auto-migrate and idempotent-seed guarantees actually hold after all features exist.

**Acceptance Criteria:**

**Given** a running system with Users, Tasks, Comments, Statuses, and Locations created through the UI/API
**When** the process is stopped and `dotnet run` is executed again against the existing `fieldtasks.db`
**Then** all data is present after restart with relationships intact (each Task's Assignee, Comments, and coordinates resolve correctly) (FR-19, NFR-4, Architecture §12).

**Given** an existing up-to-date database
**When** the app restarts
**Then** `db.Database.Migrate()` applies nothing new and the app starts cleanly, and `DbInitializer.SeedAdmin(...)` finds the existing Admin and creates no second Admin (FR-20, FR-2 idempotent, Architecture §12 steps 2–3).

**Given** a deleted `fieldtasks.db`
**When** the app starts
**Then** the file is recreated and all committed migrations are applied with no manual `dotnet ef` command, and the Admin is seeded after the schema is ready (FR-20, FR-2, Architecture §12).

**Files/components touched:** verify `src/FieldTaskManager.Api/Program.cs` (scope: `Migrate()` then `SeedAdmin()`), `Data/DbInitializer.cs`, `Migrations/` (committed) (Architecture §12; PRD FR-2, FR-19, FR-20).
