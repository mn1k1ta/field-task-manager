import { expect, test, type Page } from '@playwright/test';
import {
  clearStorage,
  createTaskViaForm,
  login,
  loginAsAdmin,
  logout,
  pinLanguage,
  registerWorker,
  uniqueSuffix,
} from './helpers';

/**
 * Epic 4 — Status Workflow + Closure Gate (PRD §6.4, Stories 4.1–4.2).
 *
 * Full lifecycle across two roles in one context:
 *   Worker: Created -> In Progress (Start) -> Done (Mark Done)   [FR-12]
 *   Admin:  Done -> Verified (Verify)                            [FR-13]
 * Asserting the status badge changes at each step, and that the closure gate
 * (Verify) is Admin-only (UXG7) — the Worker never sees a Verify button.
 */
test.describe('status workflow', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('worker advances Created -> In Progress -> Done, then admin Verifies (FR-12, FR-13)', async ({
    page,
  }) => {
    // 1) A worker exists.
    const worker = await registerWorker(page);
    await logout(page);

    // 2) Admin creates a task assigned to that worker.
    await loginAsAdmin(page);
    const title = `Workflow task ${uniqueSuffix()}`;
    const taskUrl = await createTaskViaForm(page, {
      title,
      assigneeDisplayName: worker.displayName,
    });
    await expect(page.locator('.status-badge')).toContainText(/created/i);
    await logout(page);

    // 3) Worker opens the assigned task and advances it.
    await login(page, worker.username, worker.password);
    await page.goto(taskUrl);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // The worker sees Start but NOT Verify (Admin-only gate, UXG7).
    await expect(page.getByRole('button', { name: /start work/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /verify/i })).toHaveCount(0);

    // Start -> In Progress
    await page.getByRole('button', { name: /start work/i }).click();
    await expectStatusBadge(page, /in progress/i);

    // Mark Done -> Done
    await page.getByRole('button', { name: /mark as done/i }).click();
    await expectStatusBadge(page, /done/i);
    // Worker now has no forward action; a "waiting for verification" note shows.
    await expect(page.getByText(/waiting for verification/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /verify/i })).toHaveCount(0);
    await logout(page);

    // 4) Admin verifies the Done task -> Verified.
    await loginAsAdmin(page);
    await page.goto(taskUrl);
    await expectStatusBadge(page, /done/i);
    const verifyBtn = page.getByRole('button', { name: /verify/i });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();
    await expectStatusBadge(page, /verified/i);

    // A Verified task can be Reopened by the Admin (FR-14 affordance present).
    await expect(page.getByRole('button', { name: /reopen/i })).toBeVisible();
  });

  test('admin can Reopen a Verified task back to In Progress (FR-14)', async ({ page }) => {
    const worker = await registerWorker(page);
    await logout(page);

    await loginAsAdmin(page);
    const title = `Reopen task ${uniqueSuffix()}`;
    const taskUrl = await createTaskViaForm(page, {
      title,
      assigneeDisplayName: worker.displayName,
    });
    await logout(page);

    // Worker drives it to Done.
    await login(page, worker.username, worker.password);
    await page.goto(taskUrl);
    await page.getByRole('button', { name: /start work/i }).click();
    await expectStatusBadge(page, /in progress/i);
    await page.getByRole('button', { name: /mark as done/i }).click();
    await expectStatusBadge(page, /done/i);
    await logout(page);

    // Admin verifies then reopens.
    await loginAsAdmin(page);
    await page.goto(taskUrl);
    await page.getByRole('button', { name: /verify/i }).click();
    await expectStatusBadge(page, /verified/i);

    await page.getByRole('button', { name: /reopen/i }).click();
    await expectStatusBadge(page, /in progress/i);
  });
});

/** The detail page may show several status badges (header + audit comments);
 *  assert the FIRST (header) badge reflects the expected status. */
async function expectStatusBadge(page: Page, pattern: RegExp): Promise<void> {
  await expect(page.locator('.status-badge').first()).toContainText(pattern);
}
