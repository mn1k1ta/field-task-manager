import { expect, test } from '@playwright/test';
import {
  SEED_ADMIN,
  clearStorage,
  getToken,
  login,
  logout,
  pinLanguage,
  registerWorker,
  uniqueSuffix,
} from './helpers';

/**
 * Epic 1 — Authentication, Roles, Account Bootstrap (PRD §6.1, Stories 1.1–1.3).
 *
 * Covers FR-1 (self-register as Worker), FR-3 (login + token), and the
 * landing-on-dashboard journey. Server-side authz (FR-4) is exercised in the
 * status-workflow spec where role boundaries are visible in the UI.
 */
test.describe('auth', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('a visitor can register a new worker, gets auto-logged-in, and lands on the dashboard (FR-1, FR-3)', async ({
    page,
  }) => {
    const { username } = await registerWorker(page);

    // Landed on the dashboard with a usable session.
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(await getToken(page)).toBeTruthy();

    // Self-registered users are Workers (PRD FR-1): the nav badge reflects it,
    // and Worker-only dashboard affordances apply (no "New Task" for workers).
    await expect(page.locator('.role-badge--worker')).toBeVisible();
    await expect(page.locator('.role-badge--admin')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /new task/i })).toHaveCount(0);

    // A fresh worker has no assigned tasks yet — the empty state shows.
    await expect(page.getByText(/no assigned tasks/i)).toBeVisible();

    // Username we registered is non-empty and unique per run.
    expect(username).toContain('worker_');
  });

  test('a registered worker can log out and log back in (FR-3)', async ({ page }) => {
    const { username, password } = await registerWorker(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login$/);
    expect(await getToken(page)).toBeNull();

    await login(page, username, password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.role-badge--worker')).toBeVisible();
  });

  test('the seeded Admin can log in and sees Admin affordances (FR-2, FR-3)', async ({ page }) => {
    await login(page, SEED_ADMIN.username, SEED_ADMIN.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.role-badge--admin')).toBeVisible();
    // Admin-only: the "New Task" entry point is present.
    await expect(page.getByRole('link', { name: /new task/i }).first()).toBeVisible();
  });

  test('invalid credentials are rejected with an inline error and no session (FR-3)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.locator('#login-username').fill('admin');
    await page.locator('#login-password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Stays on /login, shows the bad-credentials alert, stores no token.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toContainText(/incorrect username or password/i);
    expect(await getToken(page)).toBeNull();
  });

  test('registering a duplicate identifier is rejected without creating a session (FR-1)', async ({
    page,
  }) => {
    // First registration succeeds (and auto-logs-in).
    const username = `dupe_${uniqueSuffix()}`;
    await registerWorker(page, { username });
    await logout(page);

    // Second attempt with the same username must surface the taken-username error.
    await page.goto('/register');
    await page.locator('#reg-username').fill(username);
    await page.locator('#reg-password').fill('Passw0rd!');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByText(/already taken/i)).toBeVisible();
    expect(await getToken(page)).toBeNull();
  });

  test('an unauthenticated visitor is redirected from a protected route to /login (FR-4 / authGuard)', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
