---
title: "Architecture: Field Task Manager"
status: draft
created: 2026-06-09
updated: 2026-06-09
author: Winston (System Architect)
project: field-task-manager
workflowType: architecture
inputDocuments:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/product-brief.md
---

# Architecture Decision Document: Field Task Manager

_This is the single source of truth for implementation. It is precise and unambiguous by intent: every entity field, every endpoint, every transition rule, and the exact one-command run wiring are specified so an AI agent (or human) can build the system without re-deriving decisions. Where the PRD fixed the stack (§8), this document pins versions exactly and explains the wiring._

## 1. Context and Scope

Field Task Manager is a single-deployable web application: an ASP.NET Core Web API on .NET 10 that also serves an Angular SPA from its own `wwwroot`, persisting to a local SQLite file. There is no second process, no container, no external service. The headline constraint (PRD NFR-1) is that `dotnet run` on the backend, from a fresh clone, builds the Angular app, creates/migrates the database, seeds the Admin, and serves the whole system on one port.

This architecture realizes the PRD goals: frictionless start (G1), server-enforced accountability and role boundary (G2, NFR-2), a map-first situational view (G3), auditable comments and status changes (G4, NFR-5), and self-documenting delivery (G5).

**Solution shape (one box):**

```
                         ┌──────────────────────────────────────────────┐
                         │   FieldTaskManager.Api  (ASP.NET Core, :5080) │
  Browser  ── HTTP ────► │                                                │
                         │  /api/*   ─► Controllers ─► Services ─► EF Core ─► SQLite (fieldtasks.db)
                         │  /*       ─► Static files (wwwroot) + SPA fallback (index.html)
                         │                                                │
                         │  wwwroot/ is produced at build time by the     │
                         │  Angular `ng build` invoked from an MSBuild     │
                         │  target (npm ci + npm run build).               │
                         └──────────────────────────────────────────────┘
        Map tiles fetched by the browser directly from tile.openstreetmap.org (no key, no proxy)
```

## 2. Technology Stack (Pinned)

The stack is fixed by the PRD/brief. Versions below are pinned to what is installed and verified on the build machine (`dotnet --version` = 10.0.300, `node --version` = v22.19.0, `npm --version` = 10.9.3) and to the current stable Angular line.

### Backend (.NET)

| Concern | Choice | Version / TFM | Notes |
|---|---|---|---|
| Runtime/SDK | .NET SDK | 10.0.300 | Target framework `net10.0`. |
| Web framework | ASP.NET Core Web API | 10.0 | Controllers (not Minimal API) for explicit `[Authorize]` and route clarity. |
| ORM | Entity Framework Core | 10.0.* | `Microsoft.EntityFrameworkCore` |
| Database provider | EF Core SQLite | 10.0.* | `Microsoft.EntityFrameworkCore.Sqlite` — file DB, zero server. |
| EF tooling | EF Core Design | 10.0.* | `Microsoft.EntityFrameworkCore.Design` for migrations. |
| Auth | JWT Bearer | 10.0.* | `Microsoft.AspNetCore.Authentication.JwtBearer` |
| JWT handling | System.IdentityModel.Tokens.Jwt | 8.* (transitive-compatible) | Token creation/validation. |
| Password hashing | BCrypt.Net-Next | 4.0.3 | `BCrypt.Net.BCrypt.HashPassword` / `Verify`. |
| API docs (dev) | Swashbuckle.AspNetCore (Swagger) | 7.* | Dev-only UI at `/swagger`. |

> Pin packages exactly in the `.csproj`. Use the latest 10.0.x patch available at build time for the EF/ASP.NET packages; do not float to a different major.

### Frontend (Angular)

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Node | Node.js | 22.x (22.19.0 verified) | Required by Angular CLI 20. |
| Framework | Angular (standalone) | 20.x (latest stable) | Standalone components, no NgModules. |
| CLI/build | @angular/cli, @angular-devkit/build-angular | 20.x | `ng build` via npm script. |
| HTTP | @angular/common/http | 20.x | `provideHttpClient(withInterceptors(...))`. |
| Router | @angular/router | 20.x | `provideRouter` with functional guards. |
| Map | leaflet | 1.9.x | Raw Leaflet from npm (no Angular wrapper). |
| Map types | @types/leaflet | 1.9.x | Dev dependency. |
| Language | TypeScript | 5.8.x (per Angular 20 peer range) | `strict` mode on. |

> Rationale (boring-tech principle): raw Leaflet + `@types/leaflet` rather than a wrapper library (e.g. ngx-leaflet) avoids a third-party version-coupling risk against a brand-new Angular major. The map surface is small enough that direct DOM control is simpler and more stable.

## 3. Core Architectural Decisions

### 3.1 Decision Priority Analysis

**Critical (block implementation):**
- Single-process model: API serves SPA + API on one port with SPA fallback (NFR-1, FR-22).
- EF Core + SQLite with **migrations** applied at startup (FR-19, FR-20).
- JWT bearer auth with role + ownership enforced server-side (FR-4, FR-7, NFR-2, NFR-3).
- Status state machine enforced in a single server-side authority (FR-12..FR-14).

**Important (shape the architecture):**
- Layered controller → service → DbContext structure (no repository abstraction — Rule of Three: one consumer of data access, so EF `DbContext` is the repository).
- DTOs at the API boundary; entities never serialized directly (prevents over-posting `Role`, prevents leaking `PasswordHash`).
- Angular standalone components + functional route guards + functional HTTP interceptor.

**Deferred (out of scope per PRD §9.2):** refresh tokens, multi-admin, attachments, notifications, real-time, comment edit/delete.

### 3.2 Data Architecture

- **Database:** SQLite file `fieldtasks.db` in the API content root. Connection string in `appsettings.json`.
- **Schema management:** **EF Core Migrations** (not `EnsureCreated`). Decision: migrations are committed to the repo; at startup the app calls `db.Database.Migrate()`. This is idempotent, supports schema evolution, and satisfies FR-20 ("auto-create and migrate") without a manual `dotnet ef` step at runtime. `EnsureCreated` is rejected because it cannot evolve a schema and conflicts with migrations.
- **Initial migration:** committed in `Migrations/`. If absent on a fresh clone, the app still works because `Migrate()` on an empty DB applies all committed migrations. The developer generates migrations with `dotnet ef migrations add <Name>` during development; the reviewer never runs EF tooling.
- **Validation strategy:** two layers — (1) DataAnnotations + explicit guard checks in services for business rules (title non-empty, assignee must be a Worker, valid transition); (2) EF model constraints (required columns, FKs, unique index on identifier).
- **Caching:** none (NFR-6 scale is low hundreds of tasks; premature).
- **Timestamps:** all stored as UTC (`DateTime` with `DateTimeKind.Utc`). Display-local is a frontend concern (PRD §12.3).

### 3.3 Authentication & Security

- **Authentication:** JWT bearer. Login returns a signed JWT; the SPA stores it and sends `Authorization: Bearer <token>` on every API call.
- **Password storage:** BCrypt hash only (`BCrypt.Net.BCrypt.HashPassword(plaintext)`), work factor default (11). Plaintext is never persisted, logged, or returned.
- **Authorization:** declarative `[Authorize]` (authenticated) and `[Authorize(Roles="Admin")]` (admin-only) on controllers/actions, plus **ownership filtering inside services** for Worker scoping (see §7).
- **Secret management:** JWT signing key, issuer, audience, and seed-admin credentials live in `appsettings.json` (and overridable by environment variables / `appsettings.Development.json`). Not hard-coded in C#. For this internal build the key ships in config with a clear README note that it must be replaced for any real deployment (NFR-10).
- **CORS:** in **Development** only, allow `http://localhost:4200` (the `ng serve` dev origin) so the dev workflow works. In the single-port production/run model the SPA is same-origin, so CORS is not needed there.
- **Transport:** plain HTTP on the single port for local run simplicity; HTTPS redirection is left off by default to avoid dev-cert friction on a fresh clone (documented).

### 3.4 API & Communication Patterns

- **Style:** REST over JSON, controller-based, route prefix `/api`. JSON uses camelCase (ASP.NET default `System.Text.Json`); enums serialized as **integers** (default) — the contract below documents both the numeric value and the name. Clients send/receive the integer.
- **DTOs:** request and response DTOs are records in `Contracts/`. Entities are never the wire type.
- **Error model:** validation and business-rule failures return RFC 7807 `ProblemDetails` (ASP.NET built-in) with the appropriate status code and a human-readable `detail`. A global exception handler maps uncaught exceptions to 500 ProblemDetails without leaking stack traces.
- **Status codes:** 200 OK (read/update returning a body), 201 Created (POST creating a resource, with `Location`), 204 No Content (delete), 400 Bad Request (validation/illegal transition), 401 Unauthorized (no/invalid token), 403 Forbidden (role/ownership denied), 404 Not Found (missing or not-visible-to-caller), 409 Conflict (duplicate identifier on register).
- **API docs:** Swagger UI at `/swagger` in Development only.

### 3.5 Frontend Architecture

- **Standalone components**, bootstrapped via `bootstrapApplication(App, appConfig)`; providers wired with `provideRouter`, `provideHttpClient(withInterceptors([authInterceptor]))`.
- **State:** lightweight signal-based services (Angular signals); no NgRx (Rule of Three — one feature area, low complexity).
- **Auth state:** `AuthService` holds the JWT (in `localStorage`) and a decoded-claims signal (`currentUser`). Functional route guards read it.
- **Routing:** functional guards `authGuard` (must be logged in) and `adminGuard` (role must be Admin).
- **HTTP:** functional interceptor attaches the bearer token and, on 401, clears auth and redirects to `/login`.
- **Map:** raw Leaflet, lifecycle managed in the dashboard/task-form components (`afterNextRender`/`ngAfterViewInit` to ensure the DOM node exists). Tiles from OpenStreetMap.

### 3.6 Infrastructure & Deployment

- **Hosting:** the single ASP.NET Core process. `dotnet run` for dev/review; `dotnet publish -c Release` produces a self-contained folder with `wwwroot` populated for any "real" host.
- **Build pipeline:** an MSBuild target in the API `.csproj` runs `npm ci` + `npm run build` and emits the Angular bundle into `wwwroot` (see §6).
- **CI/CD:** out of scope for v1 beyond GitLab hosting; the same `.csproj` build path works in CI.
- **Monitoring/logging:** default ASP.NET Core console logging; no external sink.

## 4. Implementation Patterns & Consistency Rules

These rules exist so every generated file looks the same.

1. **Layering:** `Controller` (HTTP + auth attributes + model binding) → `Service` (business rules, ownership/role enforcement, transition validation) → `AppDbContext` (EF). Controllers contain no business logic; services contain no HTTP types except by accepting a "current user" value object.
2. **Current user:** a `CurrentUser` record (`Id`, `Role`, `Name`) is resolved once per request from JWT claims via a small `ICurrentUserAccessor` (reads `HttpContext.User`). Services take it as a parameter; they never touch `HttpContext`.
3. **DTO discipline:** never accept or return an entity. Map entity→DTO in the service or a tiny mapping method. Never include `PasswordHash` in any DTO.
4. **Over-posting defense:** registration DTO has **no** `role` field; the service always assigns `Role.Worker`. Task create/update DTOs do not contain `status` (status changes only via the dedicated transition endpoints).
5. **Validation order in services:** existence → authorization (role/ownership) → business rules → persist. Return typed results that the controller maps to status codes (pattern: throw a small set of domain exceptions — `NotFoundException`, `ForbiddenException`, `ValidationException` — caught by a global handler/`ProblemDetails` middleware, OR return a `Result<T>`; this codebase uses **domain exceptions** for brevity).
6. **Async everywhere:** all EF calls are `async`/`await` with `CancellationToken`.
7. **Status authority:** a single `StatusTransitionService.CanTransition(role, from, to)` + the matrix in §8 is the *only* place transition legality is decided. Both the generic `PATCH status` path and any convenience checks call it.
8. **Naming:** C# PascalCase types/properties; JSON camelCase on the wire (default serializer). Angular: kebab-case files, PascalCase classes, `camelCase` members.

## 5. Data Model

All entities live in `FieldTaskManager.Api/Domain/Entities`. EF discovers them via `DbSet<>` on `AppDbContext`.

### 5.1 Enums

```csharp
public enum Role
{
    Admin = 0,
    Worker = 1
}

public enum FieldTaskStatus
{
    Created    = 0,
    InProgress = 1,
    Done       = 2,
    Verified   = 3
}
```

### 5.2 Entity: User

| Property | C# type | Nullable | Constraints / notes |
|---|---|---|---|
| `Id` | `Guid` | no | PK. Default `Guid.NewGuid()`. |
| `Username` | `string` | no | Unique. The login identifier (PRD "username or email"). Max length 256. Unique index. |
| `PasswordHash` | `string` | no | BCrypt hash. Never serialized. |
| `Role` | `Role` | no | Stored as int. Self-registration always `Worker`; seed is `Admin`. |
| `DisplayName` | `string` | no | Human name shown in UI / comment attribution. Defaults to `Username` if not supplied. Max 256. |
| `CreatedAtUtc` | `DateTime` | no | UTC. Set on insert. |
| `AssignedTasks` | `ICollection<FieldTask>` | n/a | Inverse nav for `FieldTask.Assignee`. |
| `Comments` | `ICollection<Comment>` | n/a | Inverse nav for `Comment.Author`. |

### 5.3 Entity: FieldTask

| Property | C# type | Nullable | Constraints / notes |
|---|---|---|---|
| `Id` | `Guid` | no | PK. Default `Guid.NewGuid()`. |
| `Title` | `string` | no | Required, non-empty (trimmed). Max 200. |
| `Description` | `string?` | yes | Optional free text. |
| `Latitude` | `double` | no | WGS84. Range -90..90. |
| `Longitude` | `double` | no | WGS84. Range -180..180. |
| `AssigneeId` | `Guid` | no | FK → `User.Id`. The single Worker responsible. |
| `Assignee` | `User` | no (nav) | Required relationship. |
| `Deadline` | `DateTime` | no | UTC. Required (FR-5). |
| `Status` | `FieldTaskStatus` | no | Stored as int. Defaults to `Created` on create. |
| `CreatedAtUtc` | `DateTime` | no | UTC. Set on insert. |
| `UpdatedAtUtc` | `DateTime` | no | UTC. Set on insert and every mutation. |
| `Comments` | `ICollection<Comment>` | n/a | Ordered by `CreatedAtUtc`. Cascade-deleted with the task. |

> Note: `Deadline` is non-nullable per FR-5 ("a create attempt missing a required field (title, Location, Assignee, **Deadline**) is rejected"). The brief lists deadline as a task field; the PRD makes it required.

### 5.4 Entity: Comment

| Property | C# type | Nullable | Constraints / notes |
|---|---|---|---|
| `Id` | `Guid` | no | PK. Default `Guid.NewGuid()`. |
| `FieldTaskId` | `Guid` | no | FK → `FieldTask.Id`. Cascade delete (FR-8: no orphan comments). |
| `FieldTask` | `FieldTask` | no (nav) | Parent task. |
| `AuthorId` | `Guid` | no | FK → `User.Id`. Attribution (NFR-5). |
| `Author` | `User` | no (nav) | The commenting user. |
| `Body` | `string` | no | Required, non-empty trimmed (FR-15). Max 2000. |
| `CreatedAtUtc` | `DateTime` | no | UTC. Server-assigned at post time. Immutable (v1). |

### 5.5 Relationships (EF configuration)

- `User (1) ──< (N) FieldTask` via `AssigneeId`. `OnDelete: Restrict` (do not allow deleting a user that still owns tasks in v1; not exposed anyway).
- `FieldTask (1) ──< (N) Comment` via `FieldTaskId`. `OnDelete: Cascade` (FR-8).
- `User (1) ──< (N) Comment` via `AuthorId`. `OnDelete: Restrict`.
- Unique index on `User.Username`.
- Index on `FieldTask.AssigneeId` and `FieldTask.Status` (supports scoped list + status filter, NFR-6).

### 5.6 DbContext shape

```csharp
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<FieldTask> FieldTasks => Set<FieldTask>();
    public DbSet<Comment> Comments => Set<Comment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
            e.Property(u => u.DisplayName).IsRequired().HasMaxLength(256);
            e.Property(u => u.Role).HasConversion<int>();
        });

        b.Entity<FieldTask>(e =>
        {
            e.HasKey(t => t.Id);
            e.Property(t => t.Title).IsRequired().HasMaxLength(200);
            e.Property(t => t.Status).HasConversion<int>();
            e.HasIndex(t => t.AssigneeId);
            e.HasIndex(t => t.Status);
            e.HasOne(t => t.Assignee).WithMany(u => u.AssignedTasks)
             .HasForeignKey(t => t.AssigneeId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Comment>(e =>
        {
            e.HasKey(c => c.Id);
            e.Property(c => c.Body).IsRequired().HasMaxLength(2000);
            e.HasOne(c => c.FieldTask).WithMany(t => t.Comments)
             .HasForeignKey(c => c.FieldTaskId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Author).WithMany(u => u.Comments)
             .HasForeignKey(c => c.AuthorId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
```

## 6. Project Structure & Boundaries

### 6.1 Repository layout

```
field-task-manager/
├── README.md                         # purpose, run command, tech, seeded admin creds (FR-23)
├── .gitignore                        # ignores bin/ obj/ node_modules/ dist/ wwwroot/ *.db
├── FieldTaskManager.sln
├── src/
│   ├── FieldTaskManager.Api/         # the ONE deployable; `dotnet run` here
│   │   ├── FieldTaskManager.Api.csproj   # contains the npm/Angular MSBuild target (§6.3)
│   │   ├── Program.cs                # host build, DI, middleware, Migrate+Seed, MapControllers + MapFallbackToFile
│   │   ├── appsettings.json          # ConnectionStrings, Jwt, SeedAdmin
│   │   ├── appsettings.Development.json
│   │   ├── Domain/
│   │   │   ├── Entities/
│   │   │   │   ├── User.cs
│   │   │   │   ├── FieldTask.cs
│   │   │   │   └── Comment.cs
│   │   │   └── Enums/
│   │   │       ├── Role.cs
│   │   │       └── FieldTaskStatus.cs
│   │   ├── Data/
│   │   │   ├── AppDbContext.cs
│   │   │   └── DbInitializer.cs       # Migrate() + idempotent admin seed
│   │   ├── Migrations/                # EF migrations (committed)
│   │   ├── Contracts/                 # request/response DTOs (records)
│   │   │   ├── Auth/  (RegisterRequest, LoginRequest, AuthResponse, UserDto)
│   │   │   ├── Tasks/ (CreateTaskRequest, UpdateTaskRequest, TaskDto, UpdateStatusRequest,
│   │   │   │           UpdateLocationRequest, UpdateAssigneeRequest, TaskQuery)
│   │   │   └── Comments/ (CreateCommentRequest, CommentDto)
│   │   ├── Controllers/
│   │   │   ├── AuthController.cs
│   │   │   ├── TasksController.cs
│   │   │   ├── CommentsController.cs
│   │   │   └── UsersController.cs
│   │   ├── Services/
│   │   │   ├── IAuthService.cs / AuthService.cs
│   │   │   ├── ITokenService.cs / TokenService.cs
│   │   │   ├── ITaskService.cs / TaskService.cs
│   │   │   ├── ICommentService.cs / CommentService.cs
│   │   │   ├── IUserService.cs / UserService.cs
│   │   │   └── StatusTransitionService.cs   # the transition matrix authority
│   │   ├── Security/
│   │   │   ├── CurrentUser.cs                # record(Id, Role, Name)
│   │   │   ├── ICurrentUserAccessor.cs / CurrentUserAccessor.cs
│   │   │   └── JwtSettings.cs
│   │   ├── Common/
│   │   │   ├── Exceptions.cs                 # NotFound/Forbidden/Validation/Conflict
│   │   │   └── ProblemDetailsExceptionHandler.cs
│   │   └── wwwroot/                          # BUILD OUTPUT of Angular (gitignored)
│   └── (no separate test project required for the 8h budget; optional FieldTaskManager.Tests/)
└── clientapp/                          # Angular source (built into ../src/FieldTaskManager.Api/wwwroot)
    ├── package.json
    ├── angular.json                    # outputPath -> ../src/FieldTaskManager.Api/wwwroot
    ├── tsconfig.json
    └── src/
        ├── main.ts                     # bootstrapApplication(App, appConfig)
        ├── index.html
        ├── styles.css                  # global + leaflet.css import + marker color classes
        └── app/
            ├── app.ts / app.config.ts / app.routes.ts
            ├── core/
            │   ├── auth.service.ts
            │   ├── auth.interceptor.ts
            │   ├── auth.guard.ts        # authGuard + adminGuard (functional)
            │   ├── task.service.ts
            │   ├── comment.service.ts
            │   ├── user.service.ts
            │   └── models.ts           # TS interfaces + enums mirroring DTOs
            ├── features/
            │   ├── login/login.component.ts
            │   ├── register/register.component.ts
            │   ├── dashboard/dashboard.component.ts   # map + list + filters
            │   ├── task-detail/task-detail.component.ts
            │   └── task-form/task-form.component.ts    # create/edit, map click + drag
            └── shared/
                ├── status-legend.component.ts
                └── status.util.ts       # status -> color + label
```

> **Decision — Angular source location.** Angular source lives in a sibling `clientapp/` folder (not inside the API project) so that `dotnet`'s implicit file globbing does not try to compile `node_modules`. The Angular build emits into the API's `wwwroot`. This is the cleanest split for a single deployable.

### 6.2 Requirements → structure mapping

| PRD Epic / FR | Lives in |
|---|---|
| Epic 1 Auth/roles (FR-1..4) | `AuthController`, `AuthService`, `TokenService`, `Security/*`, Angular `login`/`register`, `auth.guard.ts`, `auth.interceptor.ts` |
| Epic 2 Task CRUD (FR-5..8) | `TasksController`, `TaskService`, Angular `task-form`, `dashboard` list |
| Epic 3 Map/location (FR-9..11) | Angular `dashboard` map, `task-form` map, `status.util.ts`; `PATCH /location` in `TasksController`/`TaskService` |
| Epic 4 Status workflow (FR-12..14) | `StatusTransitionService`, `PATCH /status`, `task-detail` action buttons |
| Epic 5 Comments (FR-15..16) | `CommentsController`, `CommentService`, Angular `task-detail` comment list/form |
| Epic 6 Filter/search (FR-17..18) | `GET /api/tasks` query params, `TaskService` query, `dashboard` filter bar |
| Epic 7 Persistence/run/README (FR-19..23) | `AppDbContext`, `DbInitializer`, `.csproj` MSBuild target, `Program.cs` fallback, `README.md` |

### 6.3 The one-command run: MSBuild + serving wiring

**`FieldTaskManager.Api.csproj` — the Angular build target:**

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <!-- Path to the Angular source, relative to this csproj -->
    <SpaRoot>..\..\clientapp\</SpaRoot>
    <!-- npm produces files here; angular.json outputPath also points here -->
    <SpaDist>wwwroot\</SpaDist>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.*" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.*" PrivateAssets="all" />
    <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.0.*" />
    <PackageReference Include="BCrypt.Net-Next" Version="4.0.3" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="7.*" />
  </ItemGroup>

  <!-- Restore npm deps once (idempotent: skipped if node_modules exists). -->
  <Target Name="EnsureNpmInstall"
          BeforeTargets="BuildSpa"
          Condition="!Exists('$(SpaRoot)node_modules')">
    <Message Importance="high" Text="Installing Angular dependencies (npm ci)..." />
    <Exec WorkingDirectory="$(SpaRoot)" Command="npm ci" />
  </Target>

  <!-- Build the Angular app into wwwroot on every build. -->
  <Target Name="BuildSpa" BeforeTargets="Build">
    <Message Importance="high" Text="Building Angular SPA into wwwroot..." />
    <Exec WorkingDirectory="$(SpaRoot)" Command="npm run build" />
  </Target>

  <!-- Make sure the produced wwwroot ships with publish. -->
  <Target Name="IncludeSpaInPublish" AfterTargets="ComputeFilesToPublish">
    <ItemGroup>
      <ResolvedFileToPublish Include="$(SpaDist)**" >
        <RelativePath>wwwroot\%(RecursiveDir)%(Filename)%(Extension)</RelativePath>
        <CopyToPublishDirectory>PreserveNewest</CopyToPublishDirectory>
      </ResolvedFileToPublish>
    </ItemGroup>
  </Target>

</Project>
```

**`clientapp/package.json` build script** (production build, no hashing surprises needed):

```json
{
  "scripts": {
    "build": "ng build --configuration production"
  }
}
```

**`clientapp/angular.json` — `outputPath` points into the API `wwwroot`:**

```json
"architect": {
  "build": {
    "options": {
      "outputPath": { "base": "../src/FieldTaskManager.Api/wwwroot" }
    }
  }
}
```

> Angular 20 emits to `outputPath/browser` by default. Set `"outputPath": { "base": "...wwwroot", "browser": "" }` so files land directly in `wwwroot` (so `index.html` is at `wwwroot/index.html`, which `MapFallbackToFile` expects). Alternatively keep the `browser/` subfolder and point the fallback/static-files at it. The chosen approach: flatten to `wwwroot` root via `"browser": ""`.

**`Program.cs` — serving + fallback + startup migrate/seed (essential shape):**

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));
// AddAuthentication(JwtBearer) with TokenValidationParameters from JwtSettings
// AddAuthorization();  AddControllers();  AddHttpContextAccessor();
// register ICurrentUserAccessor, IAuthService, ITokenService, ITaskService,
// ICommentService, IUserService, StatusTransitionService
// AddEndpointsApiExplorer + AddSwaggerGen (dev)
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(o => o.AddPolicy("dev", p =>
        p.WithOrigins("http://localhost:4200").AllowAnyHeader().AllowAnyMethod()));
}

var app = builder.Build();

// FR-20 + FR-2: migrate then idempotent seed, BEFORE serving.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    DbInitializer.SeedAdmin(db, builder.Configuration);
}

if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); app.UseCors("dev"); }

app.UseDefaultFiles();      // serve index.html at "/"
app.UseStaticFiles();       // serve wwwroot assets
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();                 // /api/* — registered BEFORE fallback so it wins
app.MapFallbackToFile("index.html");  // FR-22: SPA deep links return the shell

app.Run();
```

> **Fallback ordering (FR-22):** `MapControllers()` is mapped before `MapFallbackToFile`. The fallback has the lowest route priority, so `/api/...` always resolves to a controller and is never shadowed; any non-API, non-file path returns `index.html`.

### 6.4 Configuration (`appsettings.json`)

```json
{
  "ConnectionStrings": {
    "Default": "Data Source=fieldtasks.db"
  },
  "Jwt": {
    "Issuer": "FieldTaskManager",
    "Audience": "FieldTaskManager",
    "SigningKey": "REPLACE_WITH_A_LONG_RANDOM_SECRET_AT_LEAST_32_BYTES_LONG",
    "AccessTokenMinutes": 480
  },
  "SeedAdmin": {
    "Username": "admin",
    "Password": "Admin#12345",
    "DisplayName": "Administrator"
  },
  "Kestrel": {
    "Endpoints": { "Http": { "Url": "http://localhost:5080" } }
  }
}
```

- **Single port:** 5080 (HTTP). Documented in README.
- **JWT lifetime:** 480 minutes (8 hours) — long enough that a reviewer never hits expiry during evaluation, satisfying PRD §12.1's "fixed modest lifetime, re-login on expiry, no refresh tokens."
- **Seed credentials** are config-driven and documented in the README (FR-2, FR-23).

### 6.5 Dev workflow (not the one-command path, but documented)

- **Reviewer / one command:** from `src/FieldTaskManager.Api`, run `dotnet run`. MSBuild runs `npm ci` (first time) + `npm run build`, the app migrates+seeds and serves on `http://localhost:5080`.
- **Active frontend dev:** run the API (`dotnet run`) and, in parallel, `ng serve` in `clientapp/` on `:4200` for hot reload; the dev CORS policy permits `:4200 → :5080` API calls. The Angular `environment` points API calls at `http://localhost:5080/api` in dev and at same-origin `/api` in production.
- **Schema change:** developer runs `dotnet ef migrations add <Name>` in the API project and commits the migration; the reviewer never runs EF tooling.

## 7. Authorization Design (Server-Enforced)

### 7.1 JWT claims

Issued on login (`TokenService`). Symmetric HMAC-SHA256 signing with `Jwt:SigningKey`.

| Claim | Source | Value |
|---|---|---|
| `sub` (`JwtRegisteredClaimNames.Sub`) | `User.Id` | user GUID (string) |
| `role` (`ClaimTypes.Role`) | `User.Role` | `"Admin"` or `"Worker"` (string name, so `[Authorize(Roles=...)]` works) |
| `name` (`ClaimTypes.Name`) | `User.DisplayName` | display name for UI |
| `iss` / `aud` / `exp` | config | issuer, audience, now + `AccessTokenMinutes` |

- `TokenValidationParameters`: validate issuer, audience, lifetime, signing key; `RoleClaimType = ClaimTypes.Role`, `NameClaimType = ClaimTypes.Name`; zero clock skew tolerance kept default (5 min) is fine.
- **`CurrentUserAccessor`** reads `HttpContext.User`: `Id = Guid.Parse(sub)`, `Role = Enum.Parse<Role>(roleClaim)`, `Name = nameClaim`. Exposed as `CurrentUser` to services.

### 7.2 Declarative gates

- Controller default: `[Authorize]` (any authenticated user) at class level.
- Admin-only actions: `[Authorize(Roles = "Admin")]` on the action — applies to: create task, update task, delete task, verify/reopen (these flow through `PATCH status` but the service checks role), update assignee, `GET /api/users`. Endpoints reachable by both roles (list, get, comment add/list, worker status transitions, location for admin) use class-level `[Authorize]` and enforce role/ownership in the service.

### 7.3 Worker "sees only own tasks" — exact enforcement

Ownership is enforced **inside `TaskService`/`CommentService` using `CurrentUser`**, never relying on the UI. The rule is applied uniformly to list, single-get, and every mutation:

- **List (`GET /api/tasks`):**
  ```
  IQueryable<FieldTask> q = _db.FieldTasks.Include(t => t.Assignee);
  if (current.Role == Role.Worker)
      q = q.Where(t => t.AssigneeId == current.Id);   // hard scope
  else if (query.AssigneeId is Guid a)                 // admin-only optional filter
      q = q.Where(t => t.AssigneeId == a);
  // then apply search + status filters (see §9)
  ```
  A Worker's results can never include another Worker's task; a Worker-supplied `assigneeId` query param is ignored (their scope is already forced to themselves).

- **Single get (`GET /api/tasks/{id}`):**
  ```
  var task = await _db.FieldTasks.Include(...).FirstOrDefaultAsync(t => t.Id == id);
  if (task is null) throw new NotFoundException();
  if (current.Role == Role.Worker && task.AssigneeId != current.Id)
      throw new NotFoundException();   // 404 (do not leak existence)
  ```
  Decision: a Worker hitting someone else's task gets **404** (not 403) so the API does not confirm the task exists. Both are PRD-acceptable ("HTTP 403/404"); 404 is the stronger privacy choice.

- **Mutations the Worker is allowed (status transition, comment add/list, get):** same ownership check first — load the task, if Worker and not assignee → 404. Then role/transition rules apply.

- **Mutations the Worker is never allowed (create, update, delete, assignee, location, verify, reopen):** blocked by `[Authorize(Roles="Admin")]` and re-checked in service. A Worker calling them gets **403**.

### 7.4 Who can edit / delete / assign / comment (authority matrix)

| Action | Admin | Worker |
|---|---|---|
| Register / Login | n/a (public) | public |
| Create task | yes | 403 |
| Edit task fields (title, desc, assignee, deadline) | yes | 403 |
| Update location (lat/lng) | yes | 403 |
| Reassign (assignee) | yes | 403 |
| Delete task | yes | 403 |
| List tasks | all tasks | own only |
| Get task | any | own only (else 404) |
| Status: Created→InProgress, InProgress→Done | yes (override allowed) | own task only |
| Status: Done→Verified (Verify) | yes | 403 |
| Status: Done→InProgress, Verified→InProgress (Reopen) | yes | 403 |
| Add comment | any task | own task only |
| View comments | any task | own task only |
| List users | yes | 403 |

## 8. Status Transition Matrix

The single authority is `StatusTransitionService`. The `PATCH /api/tasks/{id}/status` endpoint sets the **target** status; the service validates legality against `(role, from, to)` and ownership, then persists.

### 8.1 Allowed transitions

| From → To | Worker (assignee) | Admin |
|---|---|---|
| Created → InProgress | ✅ allowed | ✅ allowed (override) |
| InProgress → Done | ✅ allowed | ✅ allowed (override) |
| Done → Verified (**Verify**) | ❌ 403 | ✅ allowed |
| Done → InProgress (**Reopen**) | ❌ 403 | ✅ allowed |
| Verified → InProgress (**Reopen**) | ❌ 403 | ✅ allowed |
| Created → Done / Created → Verified | ❌ 400 | ❌ 400 (not a defined transition) |
| InProgress → Verified | ❌ 400 | ❌ 400 |
| Any → same status (no-op) | ❌ 400 | ❌ 400 |
| Any backward by Worker | ❌ 403 | n/a |

> **Admin override scope:** the PRD says "any admin override." Interpreted precisely: the Admin may perform any transition that exists in the defined Status Workflow (the forward Worker transitions plus Verify and Reopen). The Admin is **not** permitted to invent non-workflow jumps (e.g. Created→Verified), because the workflow itself does not define them and FR-13/FR-14 bound Verify/Reopen to specific source states. This keeps the state machine honest (SM-3) while giving the Admin full reach over every legal edge.

### 8.2 Validation rules (service logic)

```
PATCH status(taskId, targetStatus, current):
  task = load(taskId) or 404
  if current.Role == Worker:
      if task.AssigneeId != current.Id: 404            // ownership
      allowed = (from==Created && to==InProgress) ||
                (from==InProgress && to==Done)
      if !allowed: 400 (illegal transition) — but if target is Verified/Reopen target: still 400/403*
  if current.Role == Admin:
      allowed = (from==Created && to==InProgress) ||
                (from==InProgress && to==Done) ||
                (from==Done && to==Verified) ||
                (from==Done && to==InProgress) ||
                (from==Verified && to==InProgress)
      if !allowed: 400 (illegal transition)
  if from == to: 400
  apply: task.Status = to; task.UpdatedAtUtc = now; save
  record audit: a system Comment OR an audit row is appended noting actor + from→to + timestamp (NFR-5)
```

\* For a Worker the distinction between 400 and 403 on a forbidden Verify/Reopen: the service returns **403** when the *target itself is an Admin-only transition* (Verify/Reopen) so the message is "you lack the role," and **400** for structurally impossible transitions (e.g. Created→Done). Both are PRD-acceptable.

### 8.3 Audit of transitions (NFR-5)

Every accepted status change is attributed and timestamped. Implementation: on each successful transition the service writes a `Comment` of the form `"[status] <Actor> changed status: <From> → <To>"` authored by the acting user with the server timestamp. This satisfies "every status transition MUST be attributable and timestamped" using the existing comment trail (no separate audit table needed for v1). The comment list (§9) thus interleaves human notes and status events in chronological order, giving the reconstructable history SM-5 requires.

## 9. REST API Contract (Complete)

Base URL: `/api`. All bodies JSON (camelCase). Enums on the wire are **integers** (names documented). All endpoints except `register`/`login` require `Authorization: Bearer <jwt>`; missing/invalid/expired → **401**.

Shared DTOs:

```
UserDto        { id: Guid, username: string, displayName: string, role: int /*0 Admin,1 Worker*/ }
TaskDto        { id: Guid, title: string, description: string?, latitude: double, longitude: double,
                 assigneeId: Guid, assigneeName: string, deadline: DateTime(UTC),
                 status: int /*0..3*/, createdAtUtc: DateTime, updatedAtUtc: DateTime }
CommentDto     { id: Guid, taskId: Guid, authorId: Guid, authorName: string,
                 body: string, createdAtUtc: DateTime }
AuthResponse   { token: string, user: UserDto }
ProblemDetails { type, title, status, detail }   // RFC 7807 on errors
```

### 9.1 Auth

**POST `/api/auth/register`** — public. Self-register as Worker.
- Request: `RegisterRequest { username: string (required), password: string (required, min 6), displayName: string? }`
- Behavior: creates `User` with `Role = Worker` always (any `role` in body is ignored — DTO has no such field). Password BCrypt-hashed.
- Responses: **201 Created** `UserDto` (no token; client then logs in) · **400** validation (empty/short) · **409** username already exists.

**POST `/api/auth/login`** — public.
- Request: `LoginRequest { username: string, password: string }`
- Behavior: verify BCrypt; issue JWT.
- Responses: **200 OK** `AuthResponse` · **401** invalid credentials (no token).

**GET `/api/auth/me`** — `[Authorize]`.
- Behavior: returns the current user from the validated token claims.
- Responses: **200 OK** `UserDto` · **401** if token absent/invalid.

### 9.2 Tasks

**GET `/api/tasks`** — `[Authorize]`. List, role-scoped.
- Query params (`TaskQuery`):
  - `search: string?` — case-insensitive substring on title OR description (FR-18).
  - `status: int?` — filter to a single `FieldTaskStatus` (FR-17). Omitted = all.
  - `assigneeId: Guid?` — **Admin-only** filter. Ignored for Workers (their scope is forced to self).
- Behavior: Worker → only `AssigneeId == current.Id`; Admin → all, optionally narrowed by `assigneeId`. Then apply `status` and `search`. Ordered by `deadline` ascending (soonest first).
- Responses: **200 OK** `TaskDto[]`.

**GET `/api/tasks/{id}`** — `[Authorize]`. Single, ownership-checked.
- Responses: **200 OK** `TaskDto` · **404** if missing, or Worker requesting a task they are not assigned (existence not leaked).

**POST `/api/tasks`** — `[Authorize(Roles="Admin")]`. Create.
- Request: `CreateTaskRequest { title: string (required, non-empty), description: string?, latitude: double (required), longitude: double (required), assigneeId: Guid (required), deadline: DateTime (required, UTC) }`
- Behavior: validate title non-empty, lat/lng in range, `assigneeId` exists and is `Role.Worker`, deadline present. Status set to `Created`, timestamps set.
- Responses: **201 Created** `TaskDto` (with `Location` header) · **400** validation / non-Worker or non-existent assignee · **403** if caller not Admin.

**PUT `/api/tasks/{id}`** — `[Authorize(Roles="Admin")]`. Edit fields (not status, not location — those have dedicated routes).
- Request: `UpdateTaskRequest { title: string (required), description: string?, assigneeId: Guid (required), deadline: DateTime (required) }`
- Behavior: same field rules as create (title non-empty, assignee must be existing Worker). Status and location unchanged. `UpdatedAtUtc` bumped.
- Responses: **200 OK** `TaskDto` · **400** validation · **403** non-Admin · **404** missing.

**DELETE `/api/tasks/{id}`** — `[Authorize(Roles="Admin")]`. Delete (cascades comments).
- Responses: **204 No Content** · **403** non-Admin (task persists) · **404** missing.

**PATCH `/api/tasks/{id}/status`** — `[Authorize]`. Transition (validated per §8).
- Request: `UpdateStatusRequest { status: int /*target FieldTaskStatus*/ }`
- Behavior: ownership + role + transition matrix (§8); on success persists and appends the audit comment.
- Responses: **200 OK** `TaskDto` · **400** illegal/no-op transition · **403** Worker attempting Verify/Reopen, or non-assignee role mismatch · **404** missing or not-visible-to-Worker.

**PATCH `/api/tasks/{id}/location`** — `[Authorize(Roles="Admin")]`. Move marker (FR-11).
- Request: `UpdateLocationRequest { latitude: double (required, -90..90), longitude: double (required, -180..180) }`
- Behavior: update coordinates, bump `UpdatedAtUtc`.
- Responses: **200 OK** `TaskDto` · **400** out-of-range · **403** non-Admin (Worker drag rejected server-side) · **404** missing.

**PATCH `/api/tasks/{id}/assignee`** — `[Authorize(Roles="Admin")]`. Reassign (FR-6).
- Request: `UpdateAssigneeRequest { assigneeId: Guid (required) }`
- Behavior: new assignee must exist and be `Role.Worker`. Old assignee loses visibility, new gains it (enforced by scoping in §7).
- Responses: **200 OK** `TaskDto` · **400** non-existent/non-Worker assignee · **403** non-Admin · **404** missing.

### 9.3 Comments

**GET `/api/tasks/{id}/comments`** — `[Authorize]`. Ownership-checked (Worker only own task).
- Behavior: returns comments for the task, **oldest-to-newest** by `CreatedAtUtc` (FR-16). Includes status-audit comments (§8.3).
- Responses: **200 OK** `CommentDto[]` · **404** task missing or not visible to Worker.

**POST `/api/tasks/{id}/comments`** — `[Authorize]`. Add comment (FR-15).
- Request: `CreateCommentRequest { body: string (required, non-empty trimmed) }`
- Behavior: ownership-checked (Worker only own task). Author = current user; timestamp server-assigned.
- Responses: **201 Created** `CommentDto` · **400** empty/whitespace body · **404** task missing or not visible to Worker.

### 9.4 Users

**GET `/api/users`** — `[Authorize(Roles="Admin")]`. For the assignee dropdown.
- Query param: `role: int?` — optional filter (the UI passes `1` = Worker to populate the assignee dropdown).
- Responses: **200 OK** `UserDto[]` (Workers, or all if no filter) · **403** non-Admin.

### 9.5 Status code summary

| Code | When |
|---|---|
| 200 | Successful read or mutation returning a body |
| 201 | Resource created (register, create task, create comment) |
| 204 | Delete success |
| 400 | Validation failure or illegal/no-op status transition |
| 401 | Missing/invalid/expired token on a protected route |
| 403 | Authenticated but role/authority denied (Worker hitting Admin-only) |
| 404 | Resource missing, or hidden from a Worker by ownership scoping |
| 409 | Duplicate username on register |

## 10. Frontend Architecture (Detail)

### 10.1 Routes (`app.routes.ts`)

| Path | Component | Guard |
|---|---|---|
| `/login` | `LoginComponent` | none (redirect to `/dashboard` if already authed) |
| `/register` | `RegisterComponent` | none |
| `/dashboard` | `DashboardComponent` | `authGuard` |
| `/tasks/new` | `TaskFormComponent` (create) | `authGuard` + `adminGuard` |
| `/tasks/:id` | `TaskDetailComponent` | `authGuard` |
| `/tasks/:id/edit` | `TaskFormComponent` (edit) | `authGuard` + `adminGuard` |
| `**` | redirect → `/dashboard` | — |

### 10.2 Guards & interceptor

- `authGuard` (functional `CanActivateFn`): if `AuthService.isAuthenticated()` false → `router.parseUrl('/login')`.
- `adminGuard`: if `AuthService.currentUser()?.role !== Role.Admin` → redirect `/dashboard`. (UI hiding only; the server is the real boundary per NFR-2.)
- `authInterceptor` (functional `HttpInterceptorFn`): clones request adding `Authorization: Bearer <token>` when present; on `401` response → `AuthService.logout()` + navigate `/login` (PRD §12.1 re-login on expiry, UXG5 honest errors).

### 10.3 Services

- `AuthService`: `register()`, `login()` (stores token in `localStorage`, decodes claims into a `currentUser` signal), `logout()`, `isAuthenticated()`, `currentUser()` signal, `me()`.
- `TaskService`: `list(query)`, `get(id)`, `create(dto)`, `update(id, dto)`, `delete(id)`, `setStatus(id, status)`, `setLocation(id, lat, lng)`, `setAssignee(id, assigneeId)`.
- `CommentService`: `list(taskId)`, `add(taskId, body)`.
- `UserService`: `listWorkers()` (calls `GET /api/users?role=1`).
- `models.ts`: TS `interface` mirrors of the DTOs and `enum Role { Admin=0, Worker=1 }`, `enum FieldTaskStatus { Created=0, InProgress=1, Done=2, Verified=3 }` (must match the server integers exactly).

### 10.4 Components

- **LoginComponent / RegisterComponent:** reactive forms; on success store token / redirect.
- **DashboardComponent:** the primary surface (UXG1). Left/top: filter bar (search box + status select) and a task list; main: a Leaflet map. Admin sees all tasks + an assignee filter and a "New Task" button; Worker sees only own (server-scoped). Clicking a list item or marker opens task detail. Status legend (UXG3) is always visible.
- **TaskDetailComponent:** shows task fields, a small read-only map marker, the comment thread (oldest→newest with author + timestamp), an add-comment box, and status-action buttons rendered conditionally: Worker assignee sees "Start" (Created→InProgress) and "Mark Done" (InProgress→Done); Admin sees "Verify" (on Done) and "Reopen" (on Done/Verified) plus Edit/Delete. Buttons reflect server authority but the server re-enforces (NFR-2, SM-C2).
- **TaskFormComponent:** create/edit. Fields: title, description, assignee dropdown (Workers from `UserService`), deadline (datetime). A Leaflet map where **click places the marker** (FR-10) and the marker is **draggable** to adjust (FR-11). On submit, create/update via `TaskService`; for edit, location changes go through `PATCH /location` (or are included in create).

### 10.5 Leaflet integration approach

- Install `leaflet` + `@types/leaflet` (dev) via npm; import `leaflet/dist/leaflet.css` in global `styles.css`.
- Default marker icon fix: Angular's bundler does not resolve Leaflet's image asset paths automatically; set `L.Icon.Default` image paths explicitly (or use `L.divIcon` colored markers — preferred here for status color).
- **Status → colored marker:** use `L.divIcon` with a CSS class per status so marker color encodes status (FR-9, UXG3). Map and legend share `status.util.ts`.
- Lifecycle: create the map in `ngAfterViewInit`/`afterNextRender` (DOM container must exist); call `map.invalidateSize()` after layout; destroy with `map.remove()` on component teardown to avoid leaks.
- Default view (PRD §12.2): a sensible fixed center/zoom (e.g. a city-level view) when there are no tasks; otherwise fit bounds to the visible markers.

### 10.6 Status → color legend (single source: `status.util.ts`)

| Status (int) | Name | Color | Hex | Meaning |
|---|---|---|---|---|
| 0 | Created | Gray | `#9e9e9e` | New, not started |
| 1 | In Progress | Blue | `#1e88e5` | Worker is working |
| 2 | Done | Amber | `#fb8c00` | Worker finished; awaiting Admin |
| 3 | Verified | Green | `#43a047` | Admin-confirmed closed |

This mapping is used identically on markers and in the list/legend (UXG3, SM-4). Green = done-and-verified, matching the Admin's success criterion.

## 11. Security, Validation, Error Handling, Config (Summary)

- **Security:** JWT bearer + BCrypt; role + ownership enforced server-side on list, single-get, and every mutation (NFR-2, NFR-3); over-posting prevented by DTO shape (no `role` on register, no `status` on task create/update); `PasswordHash` never serialized; secrets in config not code (NFR-10).
- **Validation:** DataAnnotations on DTOs + explicit service guards (title non-empty, lat/lng range, assignee exists & is Worker, deadline required, comment body non-empty, transition legality). Failures → 400 `ProblemDetails`.
- **Error handling:** domain exceptions (`NotFound`→404, `Forbidden`→403, `Validation`→400, `Conflict`→409) mapped centrally; uncaught → 500 ProblemDetails without stack traces. Frontend surfaces all failures via a clear message (UXG5) and never shows unachieved success.
- **Config / ports:** single HTTP port **5080**; SQLite `Data Source=fieldtasks.db`; JWT issuer/audience/key/lifetime (480 min) and seed-admin (`admin` / `Admin#12345`) in `appsettings.json`; dev CORS allows `http://localhost:4200`.

## 12. Persistence & Startup Sequence

1. Host builds; `AppDbContext` registered with SQLite connection string.
2. On startup, in a DI scope: `db.Database.Migrate()` applies all committed migrations (creates `fieldtasks.db` if absent — FR-20).
3. `DbInitializer.SeedAdmin(db, config)`: if no `User` with `Role.Admin` exists, create one from `SeedAdmin` config with a BCrypt-hashed password (FR-2, idempotent — a second run finds the Admin and does nothing).
4. Middleware pipeline configured; `MapControllers()` then `MapFallbackToFile("index.html")`.
5. Kestrel listens on `:5080`. The SPA and API are same-origin.

Data durability (FR-19): all entities persist to the SQLite file and survive restart with relationships intact (assignee, comments, coordinates resolve correctly after restart).

## 13. Architecture Validation (Traceability)

| PRD requirement | Where satisfied |
|---|---|
| FR-1 self-register as Worker | §9.1 register (no role field; service forces Worker), §4.4 |
| FR-2 auto-seed Admin idempotent | §12 step 3, §6.4 SeedAdmin config |
| FR-3 login + JWT | §9.1 login, §7.1 claims |
| FR-4 server-side role authz | §7.2 attributes, §7.3 ownership, §11 |
| FR-5 create task | §9.2 POST, §5.3 fields, validation rules |
| FR-6 edit task / reassign | §9.2 PUT + PATCH assignee |
| FR-7 role-scoped reads | §7.3 list + single-get scoping |
| FR-8 delete task (cascade comments) | §9.2 DELETE, §5.5 cascade |
| FR-9 status-colored markers | §10.5, §10.6 legend |
| FR-10 place location by click | §10.4 TaskForm, §10.5 |
| FR-11 edit location by drag | §10.4 + §9.2 PATCH location (Worker rejected) |
| FR-12 Worker forward transitions | §8.1 matrix, §8.2 logic |
| FR-13 Admin Verify | §8.1, §9.2 PATCH status |
| FR-14 Admin Reopen | §8.1, §9.2 PATCH status |
| FR-15/16 comments attributed/ordered | §9.3, §8.3 audit comments |
| FR-17 filter by status | §9.2 `status` query |
| FR-18 search title/description | §9.2 `search` query |
| FR-19 durable SQLite | §12 |
| FR-20 auto-create/migrate | §3.2, §12 step 2 |
| FR-21 one-command start | §6.3 MSBuild target |
| FR-22 single-port + fallback | §6.3 Program.cs ordering |
| FR-23 README | repo `README.md` (§6.1) |
| NFR-1 zero-setup start | §6.3, §6.5 |
| NFR-2 server-enforced authz | §7 |
| NFR-3 JWT + BCrypt | §3.3, §7.1 |
| NFR-4 durability/migrate | §12 |
| NFR-5 auditability | §8.3 |
| NFR-8 no external keys | OSM tiles client-side, SQLite file |

## 14. Open Items Resolved (vs PRD §12)

- **§12.1 JWT lifetime:** fixed 480-minute access token, no refresh; SPA hard-logs-out + redirects on 401 (§10.2).
- **§12.2 Initial map view:** fixed city-level center/zoom when no tasks; fit-to-markers otherwise (§10.5).
- **§12.3 Deadline tz:** store UTC, display local (§5.3, §3.2).
- **§12.4 Worker comment on Verified:** allowed — accessible (own) tasks remain commentable; the closure gate governs status, not comments (§9.3).
