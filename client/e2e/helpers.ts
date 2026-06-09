import { expect, type Page } from '@playwright/test';

/**
 * Shared E2E helpers for Field Task Manager.
 *
 * Design notes for resilient, deterministic, isolated tests:
 *  - Default UI language is Ukrainian (TranslationService DEFAULT_LANG = 'uk',
 *    persisted under localStorage 'ftm.lang'). To keep assertions language-stable
 *    we pin the language to English via an init script BEFORE the app boots, so
 *    `t(...)` lookups resolve to the EN dictionary. The dedicated i18n spec opts
 *    out of this and exercises the real UA/EN toggle instead.
 *  - The JWT lives in localStorage under 'ftm.token' (AuthService TOKEN_KEY).
 *  - Every test that creates data uses a unique suffix so reruns never collide
 *    (registration usernames are unique; task titles carry a per-run marker).
 */

export const SEED_ADMIN = { username: 'admin', password: 'Admin#12345' } as const;

const LANG_KEY = 'ftm.lang';
const TOKEN_KEY = 'ftm.token';

/** A process-stable, per-invocation unique token for collision-free test data. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Pin the SPA language for stable text assertions. Must run before the first
 * navigation so it is in place when TranslationService reads localStorage.
 */
export async function pinLanguage(page: Page, lang: 'en' | 'uk' = 'en'): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode — ignore */
      }
    },
    [LANG_KEY, lang],
  );
}

/**
 * No-op by design. Each Playwright test runs in a fresh, ISOLATED BrowserContext,
 * so localStorage already starts empty — nothing to clear.
 *
 * Critically, do NOT clear via page.addInitScript: that script re-runs on EVERY
 * navigation, so it would wipe the auth token AFTER login and log the user out on
 * the next full page load (page.goto) — redirecting to /login mid-test.
 */
export async function clearStorage(page: Page): Promise<void> {
  void page;
}

/** Read the persisted bearer token (post-login), or null. */
export async function getToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
}

/**
 * Log in through the real login form and land on the dashboard.
 * Locators are id/role based so they survive copy changes.
 */
export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard');
  // The app shell (with the Log out button) only renders once authenticated.
  await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, SEED_ADMIN.username, SEED_ADMIN.password);
}

/**
 * Register a brand-new Worker through the real form. Registration auto-logs-in
 * and routes to /dashboard on success (RegisterComponent.afterRegister).
 * Returns the created credentials so the caller can re-use them.
 */
export async function registerWorker(
  page: Page,
  opts?: { username?: string; password?: string; displayName?: string },
): Promise<{ username: string; password: string; displayName: string }> {
  const username = opts?.username ?? `worker_${uniqueSuffix()}`;
  const password = opts?.password ?? 'Passw0rd!';
  const displayName = opts?.displayName ?? username;

  await page.goto('/register');
  await page.locator('#reg-username').fill(username);
  await page.locator('#reg-displayname').fill(displayName);
  await page.locator('#reg-password').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();

  return { username, password, displayName };
}

/** Log out via the nav button and confirm we are back on /login. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /log out/i }).click();
  await page.waitForURL('**/login');
}

/**
 * Click the dashboard's Leaflet map at its center to place a point Location.
 * The map registers a Leaflet `click` on the canvas DOM node; clicking the
 * container's center reliably resolves to a valid lat/lng inside the view.
 * Returns once a marker (Leaflet divIcon) is present on that map.
 */
export async function clickMapCenter(page: Page, mapSelector: string): Promise<void> {
  const map = page.locator(mapSelector);
  await expect(map).toBeVisible();
  // Wait for Leaflet to initialize the container + build its panes, then let
  // layout settle. Do NOT wait on the TILE pane — OSM tiles may be blocked
  // offline (empty tile pane reads as "hidden"), but Leaflet still resolves a
  // click to lat/lng from the container geometry, which is all we need here.
  await expect(map).toHaveClass(/leaflet-container/);
  await map.locator('.leaflet-map-pane').waitFor({ state: 'attached' });
  await page.waitForTimeout(400);
  const box = await map.boundingBox();
  if (!box) throw new Error(`Map ${mapSelector} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** A datetime-local string (yyyy-MM-ddTHH:mm) a week in the future. */
export function futureDeadlineLocal(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create a Task through the Admin "New Task" form: fill title, click the map to
 * set the Location, pick an assignee, set the deadline, then save. Resolves on
 * the resulting task-detail URL (the form navigates to /tasks/:id on success).
 *
 * Assumes the page is already authenticated as an Admin and at /dashboard.
 */
export async function createTaskViaForm(
  page: Page,
  opts: { title: string; assigneeDisplayName?: string },
): Promise<string> {
  // Start from the dashboard so the "New Task" link is present even when the
  // caller is currently on a task-detail page (e.g. creating several tasks).
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /new task/i }).first().click();
  await page.waitForURL('**/tasks/new');

  // Title
  await page.locator('#task-title').fill(opts.title);

  // Location: click the picker map (point mode is the default).
  await clickMapCenter(page, '.map-canvas');
  // The "✓ Location set" message confirms coords were captured.
  await expect(page.locator('.map-msg--ok')).toBeVisible();

  // Assignee: select by visible label if given, else the first real worker.
  const assignee = page.locator('#task-assignee');
  if (opts.assigneeDisplayName) {
    await assignee.selectOption({ label: opts.assigneeDisplayName });
  } else {
    // index 0 is the disabled "Select a worker…" placeholder.
    await assignee.selectOption({ index: 1 });
  }

  // Deadline (datetime-local).
  await page.locator('#task-deadline').fill(futureDeadlineLocal());

  // Submit — the button is disabled until form valid AND a location exists.
  const submit = page.getByRole('button', { name: /^create$/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  await page.waitForURL(/\/tasks\/[0-9a-fA-F-]{36}$/);
  return page.url();
}
