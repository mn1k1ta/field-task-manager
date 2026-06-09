---
title: "UX/UI Specification: Field Task Manager"
status: draft
created: 2026-06-09
updated: 2026-06-09
author: Sally (UX Designer)
project: field-task-manager
sources:
  - _bmad-output/planning-artifacts/PRD.md
  - _bmad-output/planning-artifacts/product-brief.md
---

# UX/UI Specification: Field Task Manager

## 0. Document Purpose

This specification is the design contract for the Field Task Manager v1 frontend. Its audience is the implementing engineer (an AI agent under an 8-hour cap) and the reviewer who accepts the deliverable. It translates the PRD's functional requirements (FR-1..FR-23), non-functional requirements (NFR-1..NFR-10), and UX goals (UXG1..UXG7) into a concrete, buildable interaction and visual design.

Two design constraints shape every decision here:

1. **One person, one map, one truth.** The Admin must read the state of the field at a glance; the Worker must never wonder "is this mine?" or "where exactly is this?" The map is the primary surface, not a decoration.
2. **No heavy UI library.** Everything below is implementable in Angular standalone components with plain CSS (CSS custom properties + flexbox/grid). Leaflet is the only third-party UI dependency (mandated by the PRD for the map). No PrimeNG, no Material, no Tailwind required. This keeps the build fast, the bundle small, and the one-command start (NFR-1) unburdened.

Terminology is inherited verbatim from the PRD Glossary (§3): User, Role, Admin, Worker, Task, Assignee, Location, Map, Marker, Status, Status Workflow, Comment, Verify, Reopen, Deadline. No synonyms are introduced.

Where the PRD has Open Questions (§12), this spec states a concrete design assumption tagged `[ASSUMPTION]` so the implementer is never blocked, and flags it for confirmation.

---

## 1. Design Principles

Drawn from the PRD's UX goals and grounded in human-centered design. These are the tie-breakers when a layout decision is ambiguous.

- **P1 — Map-first, not form-first (UXG1).** Location is a manipulable object: click to place, drag to correct. We never ask anyone to type coordinates.
- **P2 — Role-appropriate by default (UXG2).** The Admin lands on the all-Tasks board; the Worker lands on their own queue. The UI never renders an affordance a Role cannot use. (The server is the real boundary — the UI merely reflects it.)
- **P3 — Status is legible at a glance (UXG3).** One color per Status, used identically on the marker, the list row, and the legend. Color is reinforced with a text label and an icon — never color alone (accessibility floor).
- **P4 — Low-friction entry (UXG4).** Creating a Task is a single panel: title, description, click-the-map Location, Assignee dropdown, Deadline. No wizard.
- **P5 — Honest state (UXG5).** Every async surface has an explicit loading, empty, and error state. The UI never shows a success it did not achieve. A failed action surfaces a clear, dismissible message.
- **P6 — Responsive, browser-only (UXG6, NFR-7).** Desktop is primary; the layout collapses gracefully to a single column on tablet/large phone. No native app, no offline.
- **P7 — The gate is discoverable (UXG7).** Verify and Reopen appear only for the Admin, only on Tasks in the eligible Status, with explicit labels. The closure gate is obvious, not hidden in a menu.

---

## 2. Screen Inventory

Every stated need in the PRD maps to exactly one surface; every surface maps to a journey that lands there. The application is a single-page app with the following routes/surfaces.

| # | Surface | Route | Role access | Realizes |
|---|---------|-------|-------------|----------|
| S1 | **Login** | `/login` | Public | FR-3 |
| S2 | **Register** | `/register` | Public | FR-1 |
| S3 | **Dashboard** (Map + Task List, side by side) | `/` (default) | Admin & Worker (scoped) | FR-7, FR-9, FR-17, FR-18, UXG1/2/3 |
| S4 | **Task Detail** (panel/drawer over Dashboard) | `/tasks/:id` | Admin (any) / Worker (own) | FR-7, FR-12..FR-16, UXG7 |
| S5 | **Task Create / Edit** (panel with map picker) | `/tasks/new`, `/tasks/:id/edit` | Admin only | FR-5, FR-6, FR-10, FR-11 |
| S6 | **App Shell** (top bar: identity, role badge, logout, legend toggle) | persistent | Authenticated | global nav |

Notes:
- S4 and S5 are presented as a **right-side drawer/panel layered over the Dashboard**, not full-page navigations. This keeps the map in view (context preserved) and matches the "map-first" principle. On narrow viewports the drawer becomes a full-screen sheet.
- There is no separate "all tasks" vs "my tasks" route. The Dashboard is one surface; the **server returns the role-scoped set** (FR-7), and the Admin simply receives more rows and more markers. This is the cleanest expression of P2.
- No user-management screen in v1 (single Admin, self-registration only — §9).

---

## 3. User Flows

Named-protagonist journeys with a climax beat, per BMAD discipline. Two protagonists: **Dana the Dispatcher** (Admin) and **Wesley the Worker**.

### 3.1 Worker registers and logs in (FR-1, FR-3)

> Wesley just got hired to service field equipment. He opens the app URL on his laptop in the truck.

1. Lands on **S1 Login**. Sees a clean card: identifier + password, a primary "Log in" button, and a "Create an account" link.
2. Clicks the link → **S2 Register**. Enters a username and password, confirms the password.
3. Submits. **Climax:** the system creates his account as a Worker (never Admin, regardless of anything in the request — FR-1) and routes him straight to **S3 Dashboard**, already showing only his tasks. He never had to be told "you are a Worker" — the scoped view makes it self-evident.
4. *Error branch:* duplicate username → inline field error "That username is already taken" (maps HTTP 409/400, FR-1); the form retains his input.

### 3.2 Dana creates and assigns a Task (FR-5, FR-10, UXG4)

> Dana is at her desk. A pump near the north gate needs servicing. She wants it on Wesley's queue in under a minute.

1. On **S3 Dashboard**, Dana clicks the prominent **"+ New Task"** button (top of the list pane).
2. The **S5 Create panel** slides in from the right; the map remains visible on the left.
3. She types a title ("Service pump — north gate") and a short description.
4. **Climax:** she clicks the exact spot on the map. A marker drops; the panel shows the captured coordinates as a confirmed chip ("Location set"). No typing of numbers (P1, FR-10).
5. She picks Wesley from the **Assignee** dropdown (populated with Workers only) and sets a **Deadline** via a date-time field.
6. Clicks **Create**. The panel closes, the new marker appears on the map in **Created** color, and the new row appears at the top of the list (FR-5 → FR-9).
7. *Validation branch:* if title, location, assignee, or deadline is missing, the **Create** button stays disabled and the missing field is flagged inline (FR-5). Nothing is persisted.

### 3.3 Wesley advances his Task (FR-12, FR-15)

> Wesley arrives on site. He opens the app to confirm the location and start work.

1. On **S3 Dashboard** he sees his task in the list and as a marker. He clicks the row (or the marker) → **S4 Task Detail** drawer opens.
2. He reads title, description, deadline, and the location (he can click "Show on map" to recenter). The current Status is **Created**.
3. He taps the single primary action **"Start work"** → Status moves `Created → In Progress` (FR-12). The button label updates to **"Mark as Done."** The marker recolors to In-Progress orange (FR-9).
4. He finishes, adds a Comment ("Replaced seal, tested OK") in the comment composer; it appears in the thread attributed to him with a timestamp (FR-15/FR-16, NFR-5).
5. **Climax:** he taps **"Mark as Done"** → `In Progress → Done`. The action area now shows a quiet, disabled note: *"Waiting for verification by the dispatcher."* Wesley cannot self-certify closure (P7) — and the UI makes that boundary feel like a hand-off, not a wall.

### 3.4 Dana verifies or reopens (FR-13, FR-14, UXG7)

> Dana filters the board to "Done" to clear her verification queue.

1. On **S3 Dashboard**, Dana sets the **Status filter** to *Done* (FR-17). The list and map narrow to Done tasks.
2. She opens Wesley's task → **S4 Task Detail**. Because she is Admin and the Status is Done, she sees **two** explicit actions: **"Verify (confirm closure)"** and **"Reopen (return to work)."**
3. She reads Wesley's comment, is satisfied, and clicks **Verify**. **Climax:** Status → **Verified**, the marker turns teal/dark-green, and the task drops out of her "Done" filter — the board visibly gets cleaner. Green-and-verified now means *truly* done (G2, SM-3).
4. *Reopen branch:* if unsatisfied, she clicks **Reopen** → `Done → In Progress`; the task returns to Wesley's actionable set and the marker returns to orange (FR-14). She typically leaves a Comment explaining why.

### 3.5 Dana corrects a Location by dragging (FR-11)

> Dana realizes she pinned the wrong pump.

1. She opens the task in **S5 Edit** (Admin only). The map shows the task's marker as **draggable** (a subtle grab cursor + a hint: "Drag the marker to move it").
2. She drags the marker to the correct spot; the coordinate chip updates live.
3. Clicks **Save**. The new coordinates persist (FR-11); after reload the marker is at the new point. A Worker viewing the same task sees a static (non-draggable) marker — no edit affordance (FR-11, P2).

---

## 4. Layout Specifications

### 4.1 App Shell (S6)

A fixed top bar, 56px tall, spanning full width:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [◧] Field Task Manager        [Legend ▾]      Dana · ADMIN   [ Log out ] │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Left:** app glyph + wordmark.
- **Center/right:** a **Legend** popover toggle (the Status color legend, §6), the current user's name, a **role badge** (`ADMIN` teal pill / `WORKER` blue pill), and **Log out**.
- The role badge is the at-a-glance reminder of which view the user is in (P2).

### 4.2 Dashboard (S3) — Map + Task List side by side

This is the heart of the product. Desktop layout below the shell:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (shell)                                                            │
├───────────────────────────────────────────┬────────────────────────────── ┤
│                                            │  TASK LIST PANE  (380–420px)   │
│                                            │ ┌────────────────────────────┐ │
│                                            │ │ [ Search tasks…        🔍 ] │ │
│              MAP PANE                      │ │ Status: (All)(Created)(In…) │ │
│            (Leaflet, flex-fill)            │ ├────────────────────────────┤ │
│                                            │ │ [ + New Task ]  (Admin only)│ │
│   • status-colored markers                 │ ├────────────────────────────┤ │
│   • click marker → opens Task Detail        │ │ ● Service pump — north gate │ │
│   • Admin: all tasks  Worker: own only     │ │   In Progress · due Jun 12  │ │
│                                            │ │   Assignee: Wesley          │ │
│                                            │ ├────────────────────────────┤ │
│                                            │ │ ● Inspect valve — sector 4  │ │
│                                            │ │   Created · due Jun 14      │ │
│                                            │ │   Assignee: Wesley          │ │
│                                            │ │  …                          │ │
│                                            │ └────────────────────────────┘ │
└───────────────────────────────────────────┴────────────────────────────────┘
```

**Map pane (left, flex-fill):**
- Fills all horizontal space not taken by the list. Leaflet with OpenStreetMap tiles (NFR-8, no key).
- Renders one marker per visible Task at its Location, colored by Status (FR-9).
- Clicking a marker opens **S4 Task Detail** and highlights the corresponding list row (and vice versa — list row hover/selection highlights its marker). This two-way binding is what makes "where is this?" instantly answerable.
- Default view when there are no tasks: a sensible fixed center/zoom (e.g., a regional view at zoom 5). `[ASSUMPTION]` resolves PRD Open Question §12.2 — implementer may set any reasonable constant; not load-bearing for acceptance.
- A small **"Fit all"** control recenters/zooms to include all visible markers.

**Task list pane (right, fixed 380–420px):**
- **Search box** (FR-18): debounced text search over title/description, case-insensitive substring, within authorized scope.
- **Status filter** (FR-17): a horizontal segmented control / pill row — `All · Created · In Progress · Done · Verified`. Single-select is acceptable for v1 (PRD §13). Each pill carries the Status color dot so the filter doubles as a mini-legend.
- **"+ New Task"** button: **Admin only** (P2). Absent entirely for Workers.
- **Task rows:** each row shows a **leading status dot** (Status color), **title** (truncated), a **meta line** (`Status · due {date}`), and the **Assignee** name (Admin view; for a Worker the assignee is always themself, so the assignee line may be omitted in the Worker view to reduce noise). An **overdue** deadline (past, not Verified) shows the date in the alert/red color with a small "Overdue" tag.
- Selecting a row opens **S4**.

### 4.3 Task Detail (S4) — comment thread + status actions

Presented as a **right drawer (~480px)** layered over the Dashboard, so the map stays visible.

```
┌────────────────────────────────────────────┐
│ ←  Service pump — north gate          [✎][✕]│   ✎ = Edit (Admin only)
│ ● In Progress                                │   status badge (color + label + icon)
├────────────────────────────────────────────┤
│ Description                                  │
│ Replace worn seal on the intake pump…        │
│                                              │
│ Assignee:  Wesley            Deadline: Jun12 │
│ Location:  48.30, 33.52   [ Show on map ]    │
├────────────────────────────────────────────┤
│ STATUS ACTIONS                               │
│  (Worker, In Progress):  [ Mark as Done ]    │
│  (Admin, Done):  [ Verify ]  [ Reopen ]      │
├────────────────────────────────────────────┤
│ COMMENTS  (3)                                │
│  ┌──────────────────────────────────────┐   │
│  │ Wesley · Jun 11, 14:22                 │   │
│  │ Replaced seal, tested OK.              │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ Dana · Jun 11, 16:05                   │   │
│  │ Please attach reading next time.       │   │
│  └──────────────────────────────────────┘   │
│  …  (oldest → newest)                        │
│  ┌──────────────────────────────────────┐   │
│  │ [ Add a comment…                    ] │   │
│  │                          [ Post ]      │   │
│  └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

**Header:** back/close, title, a **status badge** (color swatch + Status label + Status icon — never color alone, P3). The **Edit (✎)** affordance appears for **Admin only**.

**Detail block:** description, assignee, deadline, and a read-only location readout with a **"Show on map"** link that recenters the map and pulses the marker.

**Status actions — the conditional core (P7):**
The action area renders different controls based on Role × current Status. This is the single most important conditional in the UI. Exhaustive matrix:

| Current Status | Worker (Assignee) sees | Admin sees |
|---|---|---|
| **Created** | `[ Start work ]` → In Progress (FR-12) | `[ Start work ]` *(optional convenience)*; primarily edits/assigns |
| **In Progress** | `[ Mark as Done ]` → Done (FR-12) | `[ Mark as Done ]` *(optional)* |
| **Done** | *(no action)* — note: "Waiting for verification" | `[ Verify ]` → Verified (FR-13) · `[ Reopen ]` → In Progress (FR-14) |
| **Verified** | *(no action)* — note: "Verified ✓ — closed" | `[ Reopen ]` → In Progress (FR-14) |

Design rules for the action area:
- Worker forward actions are the **primary** button (filled, brand color).
- Admin **Verify** is the **primary/positive** action (verified-teal accent); **Reopen** is **secondary** (outlined, neutral/warning tone) so the irreversible-feeling positive action is visually dominant but reopen stays one click away.
- When a Role has no available transition, show a **quiet status note** (muted text), never a disabled button with no explanation. Honest state (P5).
- Every successful transition recolors the marker on the next render and updates the badge immediately (optimistic update with rollback on error — see §7.3).

**Comments (FR-15/FR-16, NFR-5):**
- Rendered **oldest → newest** (chronological), each as a card with **author name + timestamp** header and the comment body. Timestamps display in the viewer's local time (UTC stored — `[ASSUMPTION]`, PRD §12.3).
- The Admin's own comments may be visually distinguished with a subtle left accent border in the role color to aid scanning of an audit trail.
- A sticky **composer** at the bottom: a multi-line textarea + **Post** button. Empty/whitespace-only text disables Post (mirrors FR-15's server rejection). After posting, the new comment appends and the composer clears.
- Comments are **immutable** in v1 (no edit/delete affordances — §9).

### 4.4 Task Create / Edit (S5) — form + Leaflet location picker

A right drawer (~480px) over the Dashboard; the **map on the left becomes the picker surface** in this mode.

```
LEFT (map, now in "pick" mode)        RIGHT (form drawer)
┌───────────────────────────┐   ┌──────────────────────────────────┐
│  MAP — click to place      │   │  New Task                    [✕] │
│  the marker; drag to move  │   ├──────────────────────────────────┤
│                            │   │  Title *                          │
│        ◉ (draggable)       │   │  [ Service pump — north gate    ]│
│                            │   │  Description                      │
│  hint banner:              │   │  [ multiline…                   ]│
│  "Click the map to set the │   │                                   │
│   location, or drag the    │   │  Assignee *                       │
│   marker to adjust."       │   │  [ Wesley            ▾ ] (Workers)│
│                            │   │  Deadline *                       │
│                            │   │  [ 2026-06-12  14:00          ] │
│                            │   ├──────────────────────────────────┤
│                            │   │  Location *                       │
│                            │   │  ✓ Set: 48.3000, 33.5200          │
│                            │   │    (or: "Click the map to set")   │
│                            │   ├──────────────────────────────────┤
│                            │   │        [ Cancel ]   [ Create ]    │
└───────────────────────────┘   └──────────────────────────────────┘
```

**Picker behavior (FR-10, FR-11):**
- **Create:** the map enters "pick" mode. The first click drops a draggable marker and captures lat/lng; subsequent clicks move it; dragging fine-tunes. The form's **Location** field reflects the captured coordinates as a confirmed chip (read-only text; we never ask the user to type numbers, P1).
- **Edit:** the existing marker loads draggable at its current Location; dragging updates the pending coordinates; **Save** persists (FR-11).
- A persistent **hint banner** on the map explains the interaction ("Click the map to set the location, or drag the marker to adjust").

**Form fields:**
- **Title** (required, non-empty — FR-5).
- **Description** (optional multiline).
- **Assignee** (required): a dropdown populated with **Workers only** (the API supplies the list; non-Worker assignment is rejected server-side — FR-5).
- **Deadline** (required): native `datetime-local` input (no library; honors NFR — plain CSS). Stored UTC, displayed local (`[ASSUMPTION]` §12.3).
- **Location** (required): set via the map; surfaced as a confirmation chip.

**Submit rules:**
- **Create/Save** is disabled until all required fields are valid (title non-empty, assignee chosen, deadline set, location placed). Inline errors appear on blur and on submit attempt.
- On success: drawer closes, map exits pick mode, list + markers refresh (FR-5/FR-6 → FR-9).
- **Edit** (S5) is reachable only by the Admin (the ✎ in S4, or `/tasks/:id/edit`). Workers have no edit route and no edit affordance (P2, FR-6).
- **Delete** (FR-8): in **Edit** mode the Admin sees a low-emphasis, left-aligned **"Delete task"** text-button that opens a small confirm dialog ("Delete this task and its comments? This cannot be undone."). On confirm, the task and its comments are removed (FR-8) and the drawer closes.

### 4.5 Auth screens (S1 Login, S2 Register)

A centered card (max-width ~400px) on a plain branded background. No map, no shell chrome (logged-out state).

- **Login (S1):** identifier field, password field, **Log in** primary button, "Create an account →" link to S2. Invalid credentials → a single error banner above the form ("Incorrect username or password") mapping HTTP 401 (FR-3). The field values are preserved.
- **Register (S2):** identifier field, password field, confirm-password field, **Create account** primary button, "← Back to log in" link. Client-side: passwords must match before enabling submit. Server errors (duplicate identifier) → inline field error (FR-1). On success, auto-login and route to Dashboard (per FR-1 "immediately log in").

---

## 5. Visual Design System

A clean, modern, slightly cool/technical palette suited to a dispatch tool — calm neutrals, one confident brand blue, and a status palette engineered for legibility on map tiles. All values below are implementable as CSS custom properties in `:root`. No UI framework required.

### 5.1 Color tokens

```css
:root {
  /* ---- Brand & accent ---- */
  --color-brand:            #2563EB;  /* primary blue — buttons, links, focus */
  --color-brand-hover:      #1D4ED8;
  --color-brand-subtle:     #EFF4FF;  /* tinted backgrounds, selected rows */

  /* ---- Neutrals / surfaces ---- */
  --color-bg:               #F7F8FA;  /* app background */
  --color-surface:          #FFFFFF;  /* cards, panels, drawers */
  --color-surface-2:        #F2F4F7;  /* inset / secondary surface */
  --color-border:           #E2E6EC;  /* hairline dividers, input borders */
  --color-border-strong:    #CBD2DC;

  /* ---- Text ---- */
  --color-text:             #111827;  /* primary text */
  --color-text-muted:       #5B6573;  /* meta, captions, secondary */
  --color-text-faint:       #8A93A2;  /* placeholders, disabled labels */
  --color-text-on-brand:    #FFFFFF;

  /* ---- Status palette (markers + badges + legend) ---- */
  --status-created:         #64748B;  /* slate grey-blue */
  --status-inprogress:      #F59E0B;  /* amber / orange */
  --status-done:            #22C55E;  /* green */
  --status-verified:        #0F766E;  /* teal / dark-green */

  /* Soft tints for badge/row backgrounds (text uses the strong color above) */
  --status-created-bg:      #EEF1F5;
  --status-inprogress-bg:   #FEF3E2;
  --status-done-bg:         #E7F8ED;
  --status-verified-bg:     #E3F1EF;

  /* ---- Feedback ---- */
  --color-success:          #16A34A;
  --color-warning:          #D97706;
  --color-danger:           #DC2626;  /* destructive, errors, overdue */
  --color-danger-bg:        #FDECEC;

  /* ---- Role badges ---- */
  --role-admin:             #0F766E;  /* matches verified-teal — authority */
  --role-worker:            #2563EB;  /* matches brand blue */
}
```

**Status palette rationale (UXG3, FR-9):** the four status colors were chosen to be (a) mutually distinguishable, (b) legible as small dots on the busy OSM tile background, and (c) intuitive — grey-blue reads as "new/idle," amber as "active/in motion," green as "done by the worker," and the darker teal as "verified/closed by authority" (deliberately a *deeper, calmer* green than `Done` so the eye reads it as the terminal, trusted state rather than just another green). Contrast against white badge text: `--status-created` 4.7:1, `--status-verified` 5.6:1 pass AA; `--status-inprogress` (amber) and `--status-done` (green) are paired with **dark text on a light tint** (see badge spec) to stay AA-compliant rather than white-on-color.

### 5.2 Status legend (canonical mapping — UXG3)

This legend is rendered verbatim in the **Legend popover** (S6) and is the single source of truth referenced by every status indicator.

| Status | Hex | Swatch reads as | Marker | Badge style | Icon |
|---|---|---|---|---|---|
| **Created** | `#64748B` (grey-blue) | new, not yet started | grey-blue pin | text `#64748B` on `#EEF1F5` | ○ (hollow circle) |
| **In Progress** | `#F59E0B` (orange) | active work | orange pin | text `#B45309` on `#FEF3E2` | ◐ (half) |
| **Done** | `#22C55E` (green) | finished by worker, awaiting check | green pin | text `#15803D` on `#E7F8ED` | ● (filled) |
| **Verified** | `#0F766E` (teal/dark-green) | confirmed closed by Admin | teal pin | text `#0F766E` on `#E3F1EF` | ✓ (check) |

Every Status indicator in the app (marker, list-row dot, detail badge, filter pill) uses **exactly these colors** and pairs the color with the **label and icon** so the state survives color-blindness and grayscale printing (P3, accessibility floor).

### 5.3 Typography

System font stack — zero web-font cost, fast first paint, native feel (supports NFR-6/NFR-1).

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace;
}
```

| Role | Size / Line | Weight | Usage |
|---|---|---|---|
| Display / page title | 24px / 32px | 700 | rarely used (drawer titles) |
| H1 / drawer title | 20px / 28px | 600 | Task Detail / Create title |
| H2 / section | 16px / 24px | 600 | "Comments", "Status actions" |
| Body | 14px / 22px | 400 | descriptions, comments |
| Body strong | 14px / 22px | 600 | task titles in list |
| Meta / caption | 12px / 18px | 400–500 | timestamps, "due …", assignee |
| Button label | 14px / 20px | 600 | all buttons |
| Coordinate readout | 13px / 20px | 400 | `--font-mono` for lat/lng |

Base font-size 14px; titles scale up. Coordinates use the mono stack so digits align and read as data.

### 5.4 Spacing, radius, elevation

```css
:root {
  /* 4px base spacing scale */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-8: 48px;

  /* radius */
  --radius-sm: 6px;    /* inputs, small chips */
  --radius-md: 10px;   /* cards, buttons */
  --radius-lg: 14px;   /* drawers, dialogs */
  --radius-full: 9999px; /* pills, status dots, role badges */

  /* elevation — restrained; the map is the depth, UI stays flat-ish */
  --shadow-sm: 0 1px 2px rgba(17, 24, 39, 0.06);
  --shadow-md: 0 4px 12px rgba(17, 24, 39, 0.10);
  --shadow-drawer: -8px 0 24px rgba(17, 24, 39, 0.12); /* left edge of right drawer */

  --focus-ring: 0 0 0 3px rgba(37, 99, 235, 0.35); /* brand at 35% — visible AA focus */
}
```

- **Spacing:** 4px base. List rows use `--space-3`/`--space-4` padding; drawer body `--space-5` horizontal. Generous whitespace keeps the dense list scannable.
- **Radius:** 10px is the workhorse for cards/buttons; pills/dots are fully rounded.
- **Elevation:** deliberately restrained — the Leaflet map already provides visual depth, so panels sit nearly flat with hairline borders and only the drawer floats (`--shadow-drawer`).
- **Focus:** a 3px brand focus ring on every interactive element (keyboard accessibility).

### 5.5 Component visual specs (plain-CSS)

- **Buttons.** Height 38px, padding `0 16px`, `--radius-md`, weight 600.
  - *Primary:* `--color-brand` bg, white text; hover `--color-brand-hover`.
  - *Positive (Verify):* `--status-verified` bg, white text.
  - *Secondary (Reopen, Cancel):* `--color-surface` bg, `--color-border-strong` border, `--color-text`.
  - *Danger (Delete):* text-button in `--color-danger`; the confirm dialog's confirm is a filled `--color-danger` button.
  - *Disabled:* `--color-surface-2` bg, `--color-text-faint` text, no shadow, `cursor: not-allowed`.
- **Inputs / textarea / select.** Height 38px (textarea auto-grows), `--radius-sm`, `1px --color-border`; focus → `--color-brand` border + `--focus-ring`. Error state → `--color-danger` border + a 12px helper text in `--color-danger`.
- **Status badge.** A pill: colored dot + label + icon, background = the status `*-bg` tint, text = the status strong color (per §5.2 table). `--radius-full`, padding `2px 10px`, 12px text.
- **Task list row.** Surface bg; left status dot (8px); selected row → `--color-brand-subtle` bg + 3px left brand border; hover → `--color-surface-2`. Overdue date in `--color-danger`.
- **Leaflet markers.** Custom `divIcon` teardrop pins filled with the status color and a thin white stroke for tile contrast; the **draggable** marker (create/edit) gets a subtle pulsing ring to signal interactivity. Selected marker scales ~1.15× and gains `--shadow-md`.
- **Drawer.** `--color-surface`, `--radius-lg` on the inner-left corners, `--shadow-drawer`; slides in 200ms ease-out; a translucent scrim (`rgba(17,24,39,0.25)`) over the list pane (not the map) on narrow viewports.
- **Toast / inline error.** Errors prefer **inline** placement near the cause; system/network errors use a top-center toast (`--color-danger-bg` bg, `--color-danger` text, auto-dismiss 6s, manually dismissible).

---

## 6. State Patterns (loading / empty / error)

Every async surface declares all three states explicitly (P5, UXG5, NFR-7).

### 6.1 Loading

| Surface | Loading treatment |
|---|---|
| Dashboard list | 4–6 **skeleton rows** (shimmering grey bars) while the scoped task list loads. |
| Map | Leaflet tile spinner is native; markers fade in once task data resolves. A thin top **progress bar** (brand color) indicates the task fetch. |
| Task Detail | Skeleton for description + comment cards; the status badge and actions appear only after the task resolves (never guess the status). |
| Buttons (transitions, post, save) | The clicked button shows an inline spinner + "Working…" and is disabled to prevent double-submit. |

### 6.2 Empty

| Surface | Empty treatment |
|---|---|
| Dashboard list — Admin, no tasks | Friendly empty state: a map glyph, "No tasks yet. Create your first task to see it on the map," and a **+ New Task** button. |
| Dashboard list — Worker, no tasks | "You have no assigned tasks right now. New work will appear here." (No create button — P2.) |
| Filter/search yields nothing | "No tasks match your filter." + a **Clear filter / search** action. (Distinct from "no tasks at all" — never conflate an empty result with an empty system, FR-18.) |
| Comments — none yet | "No comments yet. Be the first to add a note." above the composer. |
| Map — no markers | The map still renders at the default view; an unobtrusive caption: "No task locations to show." |

### 6.3 Error

| Condition (maps to PRD) | Treatment |
|---|---|
| **Login 401** (FR-3) | Inline error banner on the login card; inputs preserved. |
| **Register 409/400 duplicate** (FR-1) | Inline field error on the identifier field. |
| **Token expired / 401 on a protected call** (FR-3, §12.1) | The app surfaces a toast "Your session expired — please log in again" and routes to **S1 Login**, preserving the attempted route for return. `[ASSUMPTION]`: hard re-login, no refresh token (PRD §12.1). |
| **Forbidden transition / action 403** (FR-4, FR-12..14) | This should be unreachable via the UI (we hide disallowed actions), but if the server returns 403 (e.g., raced state), show a toast "That action isn't allowed for this task right now" and **re-fetch the task** to resync the UI to server truth (SM-C2: enforcement is the source of truth, not the UI). |
| **Validation 400** (FR-5, FR-6, FR-15) | Map server field errors back to the offending field inline; keep the drawer open with input intact. |
| **Network / 5xx** | Top-center toast "Couldn't reach the server. Check your connection and try again," with a **Retry** affordance where the action is idempotent (re-fetch list, reload detail). |
| **Not found / deleted out from under you 404** (FR-7, FR-8) | If a Worker opens a task that's been reassigned/deleted: toast "This task is no longer available to you" and close the drawer, refreshing the list. |

Principle across all errors: **the UI never shows success it did not achieve** (UXG5). Optimistic updates (status flips, recolor) **roll back** if the server rejects.

---

## 7. Interaction Primitives

- **7.1 Map ↔ list two-way selection.** Hovering a list row highlights its marker; selecting a row opens detail and pans/pulses the marker. Clicking a marker selects+scrolls its list row and opens detail. This binding is the product's spatial backbone.
- **7.2 Location capture.** Click-to-place and drag-to-move only; coordinates are display-only confirmation, never an input. The draggable marker is visually distinct (pulsing ring) from read-only markers.
- **7.3 Optimistic transitions with rollback.** Status buttons apply the new badge/marker color immediately, then reconcile with the server response; on error they revert and toast (§6.3). Keeps the field worker's interaction feeling instant while staying honest.
- **7.4 Debounced search.** Search input debounces ~250ms before querying; the list shows a subtle inline loading state, not a full skeleton, during refinement.
- **7.5 Single active drawer.** Detail (S4) and Create/Edit (S5) share one drawer slot; opening one closes the other. `Esc` closes the drawer; the scrim click closes it (with an unsaved-changes confirm in Create/Edit).
- **7.6 Confirm only destructive/irreversible.** Only **Delete** (FR-8) and **discard unsaved edits** prompt a confirm dialog. Forward transitions, Verify, Reopen, and Post are single-click (they're reversible or additive; Reopen exists precisely to undo a Verify).
- **7.7 Keyboard.** All actions reachable by Tab order; primary button = `Enter` within a form; comment composer posts on `Ctrl/Cmd+Enter`; visible focus ring everywhere.

---

## 8. Accessibility Floor

Behavioral accessibility commitments (visual contrast is handled in §5):

- **Color is never the only signal (P3).** Status is always color **+ label + icon** on markers, badges, rows, and filter pills.
- **Contrast.** Body text on surfaces ≥ 7:1; muted text ≥ 4.5:1; all status badge text/background pairs and button text meet WCAG AA (≥ 4.5:1 normal text). The brand focus ring is ≥ 3:1 against adjacent colors.
- **Keyboard.** Full keyboard operability (§7.7); no mouse-only interaction except, by Leaflet's nature, fine marker placement — for which the coordinate readout provides confirmation and the drawer remains fully keyboard-navigable.
- **Semantics.** Buttons are `<button>`, the role badge and status badges carry `aria-label` text (e.g., "Status: In Progress"), the comment thread is a labeled list with each item exposing author + time to screen readers, and the drawer is a focus-trapped `role="dialog"` with a labelled title and `Esc` to close.
- **Live regions.** Transition results and post confirmations announce via an `aria-live="polite"` region; errors via `aria-live="assertive"`.
- **Hit targets.** Interactive controls ≥ 36px in the larger dimension (touch-friendly on tablet, NFR-7).
- **Reduced motion.** Honor `prefers-reduced-motion`: disable the marker pulse and drawer slide (instant show) when set.

---

## 9. Responsive Notes (UXG6, NFR-7)

Two primary breakpoints; single-column collapse below the desktop range. Plain CSS (flex/grid + a couple of media queries) — no library.

| Breakpoint | Layout |
|---|---|
| **≥ 1024px (desktop, primary)** | Map (flex-fill) **left**, Task List (380–420px) **right**, side by side. Detail/Create = right drawer (~480px) overlaying the list/map edge. |
| **768–1023px (tablet)** | Map and list still side by side but list narrows to ~320px; drawer widens toward full overlay (scrim over the whole content). "Fit all" and filter pills wrap. |
| **< 768px (large phone / small tablet)** | **Single column with a Map/List toggle.** A segmented control at the top switches between **Map** view (full-width Leaflet) and **List** view (full-width rows + search/filter). Detail and Create/Edit become **full-screen sheets**. The location picker uses the full-width map; the form fields stack below or the sheet flips between "map" and "form" tabs so the user can place the pin then fill the form. |

Responsive rules:
- The **map never disappears** on any breakpoint — it's the product's reason for being. On phone it's a peer view via the toggle, not buried.
- Filter pills and search collapse into a single **"Filters"** disclosure on phone to reclaim vertical space.
- Drawers → full-screen sheets below 768px with a clear back/close affordance.
- Touch: increase row and button padding to maintain ≥ 44px touch targets on phone.

---

## 10. Component → FR Traceability

Confirms every functional requirement has a UI home and every screen earns its place.

| FR | UI element(s) |
|---|---|
| FR-1 Register as Worker | S2 Register; scoped Dashboard makes role self-evident |
| FR-2 Auto-seed Admin | (no UI) — seeded creds documented in README; Admin logs in via S1 |
| FR-3 Login / token | S1 Login; 401 inline error; expiry toast → S1 (§6.3) |
| FR-4 Server-enforced authz | UI hides disallowed affordances (P2); 403 resync (§6.3) reflects the boundary, never substitutes for it |
| FR-5 Create Task | S5 Create form + map picker |
| FR-6 Edit Task | S5 Edit (Admin ✎ in S4) |
| FR-7 Role-scoped reads | Dashboard list + markers render the server-scoped set |
| FR-8 Delete Task | S5 "Delete task" + confirm dialog |
| FR-9 Status-colored markers | Leaflet `divIcon` pins per §5.2 legend; recolor on transition |
| FR-10 Place by click | S5 map pick mode |
| FR-11 Drag to edit location | S5 draggable marker (Admin only) |
| FR-12 Worker advances | S4 Start work / Mark as Done (action matrix §4.3) |
| FR-13 Verify | S4 Verify (Admin, Done) — positive/teal button |
| FR-14 Reopen | S4 Reopen (Admin, Done/Verified) — secondary button |
| FR-15 Add comment | S4 comment composer; disabled on empty |
| FR-16 View comments | S4 chronological thread, author + timestamp |
| FR-17 Filter by status | Dashboard status filter pills |
| FR-18 Text search | Dashboard search box (debounced) |
| FR-19/20 Persistence | (no UI) — restart shows same data |
| FR-21/22 One-command / SPA fallback | (infra) — UI is the single SPA served on one port; deep links (S1..S5) resolve via fallback |
| FR-23 README | (doc) |

---

## 11. Open Items & Assumptions (carried from PRD §12)

- `[ASSUMPTION]` **Token expiry** → hard re-login on 401 with a toast and return-to-route preservation; no refresh token (PRD §12.1). *Confirm if silent re-auth is wanted.*
- `[ASSUMPTION]` **Default map view** → a sensible fixed center/zoom constant when no tasks exist (PRD §12.2). Not load-bearing for acceptance.
- `[ASSUMPTION]` **Deadline timezone** → store UTC, display local; the `datetime-local` input edits in local time (PRD §12.3).
- `[ASSUMPTION]` **Comments on Verified tasks** → an accessible task stays commentable, but a Worker has no status actions once Verified (PRD §12.4). The composer remains; the action area shows "Verified ✓ — closed." *Flag if the gate should also freeze comments.*

These assumptions keep the implementer unblocked in the autonomous build; none change the acceptance tests (SM-1..SM-3).

---

## 12. Build Notes for the Implementer

- **No UI library.** Everything above is achievable with Angular standalone components, CSS custom properties (the §5 token block dropped into a global `styles.css`), flexbox/grid, and native form controls. Leaflet is the only UI dependency and is mandated.
- **One stylesheet, tokens first.** Put the `:root` token blocks (§5.1, §5.3, §5.4) in `styles.css`; every component reads `var(--…)`. This is the cheapest path to a consistent, modern look under the time cap.
- **Status is a single source.** Implement a small `StatusMeta` map (`status → { hex, bgHex, label, icon }`) consumed by the marker factory, the badge component, the list-row dot, and the filter pills — so the legend (§5.2) can never drift from what's rendered (UXG3).
- **The drawer is one component.** S4 and S5 share a drawer container; the body swaps between detail and form. Keeps the map persistently mounted (avoids costly Leaflet re-init) and matches §7.5.
- **Guard the affordances, trust the server.** Hide Admin-only and ownership-gated controls in the UI for UX, but treat 403/404 as the real boundary and resync on receipt (SM-C2).
