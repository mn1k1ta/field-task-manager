# E2E tests (Playwright)

End-to-end tests that drive the **running** Field Task Manager through a real
browser. The .NET backend serves both the Angular SPA and the API on a single
origin — `http://localhost:5080` — so these tests hit that one instance for both
UI and data.

## What's covered

Grounded in the PRD acceptance criteria (`_bmad-output/planning-artifacts/PRD.md`)
and the architecture contract (`_bmad-output/planning-artifacts/architecture.md`):

| Spec | Journey | PRD refs |
|---|---|---|
| `01-auth.spec.ts` | Register a Worker, auto-login, land on dashboard; admin login; bad-credentials + duplicate-username rejection; protected-route guard | FR-1, FR-2, FR-3, FR-4 |
| `02-task-create.spec.ts` | Admin creates a task (title, map-click location, assignee, deadline); appears as marker + list row; form gating | FR-5, FR-9, FR-10 |
| `03-status-workflow.spec.ts` | Worker Start → Mark Done, Admin Verify, Admin Reopen; status badge changes; Verify is Admin-only | FR-12, FR-13, FR-14, UXG7 |
| `04-comments.spec.ts` | Add a comment (author + timestamp), reject empty, chronological order | FR-15, FR-16 |
| `05-filter-search.spec.ts` | Search by title, filter by status, clear restores set | FR-17, FR-18 |
| `06-i18n.spec.ts` | UA default, UA/EN toggle swaps copy live + persists | UXG6 |
| `07-area-polygon.spec.ts` | Draw a polygon area on the create form; saved task renders the area | UXG1, FR-10 |

## Prerequisites

- The app **must be running** on `http://localhost:5080`.
- A one-time Chromium download for Playwright.

## How to run

```bash
# 1) Start the app (from the repo root). This builds the SPA, migrates+seeds
#    the SQLite DB, seeds the Admin, and serves everything on :5080.
cd server
dotnet run

# 2) In a SECOND terminal, install the Playwright browser once.
cd client
npx playwright install

# 3) Run the E2E suite.
npm run e2e
```

The HTML report is written to `client/playwright-report/`; open it with
`npx playwright show-report` if a run fails.

## Notes for maintainers

- **Seeded Admin:** `admin` / `Admin#12345` (from `server/appsettings.json` →
  `SeedAdmin`). The auth helper uses these.
- **Default language is Ukrainian.** Most specs pin the UI to English via a
  pre-navigation init script (`pinLanguage`) so text assertions are stable; the
  i18n spec opts out to verify the real default and toggle. Where copy is
  language-dependent, locators prefer roles, labels, ids, and structural classes
  over literal strings.
- **Isolation:** each test clears `localStorage` before navigating and creates
  its own data with a unique per-run suffix, so reruns never collide. The suite
  runs serially (`workers: 1`) against the shared SQLite instance.
- **No `webServer` auto-start** by default — the app is expected to be up. A
  commented `webServer` block in `playwright.config.ts` can enable auto-start.
- Tests **do not reset the database**; they only add rows. They never assert on
  global counts, only on the specific records they created.
