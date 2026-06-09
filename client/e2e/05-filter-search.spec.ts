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
 * Epic 6 — Filtering and Search (PRD §6.6, Stories 6.1–6.2).
 *
 * Search narrows the dashboard list to matching titles (FR-18); the status
 * filter narrows to a single status (FR-17); clearing restores the full set.
 * All within the caller's authorized scope (here: Admin sees all).
 */
test.describe('dashboard filter & search', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('search by title narrows the list and a non-match clears it (FR-18)', async ({ page }) => {
    const worker = await registerWorker(page);
    await logout(page);
    await loginAsAdmin(page);

    // Two tasks with a shared unique marker but distinct, searchable titles.
    const run = uniqueSuffix();
    const alphaTitle = `Alpha widget ${run}`;
    const betaTitle = `Beta gadget ${run}`;
    await createTaskViaForm(page, { title: alphaTitle, assigneeDisplayName: worker.displayName });
    await createTaskViaForm(page, { title: betaTitle, assigneeDisplayName: worker.displayName });

    await page.goto('/dashboard');
    const search = page.getByRole('searchbox', { name: /search tasks/i });

    // Searching the run marker shows both of our tasks.
    await search.fill(run);
    await expectRowVisible(page, alphaTitle);
    await expectRowVisible(page, betaTitle);

    // Searching a word unique to Alpha narrows to just Alpha.
    await search.fill(`Alpha ${run}`);
    await expectRowVisible(page, alphaTitle);
    await expect(rowFor(page, betaTitle)).toHaveCount(0);

    // A non-matching query yields the empty-filtered state, with no error.
    await search.fill(`no-such-task-${uniqueSuffix()}`);
    await expect(page.getByText(/no tasks match your filter/i)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Clearing the search restores our tasks.
    await search.fill('');
    await expectRowVisible(page, alphaTitle);
    await expectRowVisible(page, betaTitle);
  });

  test('filtering by status shows only matching tasks and clearing restores the set (FR-17)', async ({
    page,
  }) => {
    const worker = await registerWorker(page);
    await logout(page);
    await loginAsAdmin(page);

    const run = uniqueSuffix();
    // One task left in "Created"; one driven to "In Progress" via admin override.
    const createdTitle = `Created-only ${run}`;
    const progressTitle = `Moved-to-progress ${run}`;

    await createTaskViaForm(page, { title: createdTitle, assigneeDisplayName: worker.displayName });
    const progressUrl = await createTaskViaForm(page, {
      title: progressTitle,
      assigneeDisplayName: worker.displayName,
    });

    // "Start work" (Created -> In Progress) is the assignee's action, surfaced in
    // the UI only to the worker — so drive it as the worker, who owns both tasks
    // and therefore also sees both on the dashboard for the filter assertions below.
    await logout(page);
    await login(page, worker.username, worker.password);
    await page.goto(progressUrl);
    await page.getByRole('button', { name: /start work/i }).click();
    await expect(page.locator('.status-badge').first()).toContainText(/in progress/i);

    await page.goto('/dashboard');
    // Scope the view to this run so other test data doesn't interfere.
    const search = page.getByRole('searchbox', { name: /search tasks/i });
    await search.fill(run);
    await expectRowVisible(page, createdTitle);
    await expectRowVisible(page, progressTitle);

    const statusSelect = page.getByLabel(/filter by status/i);

    // Filter to "In Progress" (value 1) -> only the progress task remains.
    await statusSelect.selectOption('1');
    await expectRowVisible(page, progressTitle);
    await expect(rowFor(page, createdTitle)).toHaveCount(0);

    // Filter to "Created" (value 0) -> only the created task remains.
    await statusSelect.selectOption('0');
    await expectRowVisible(page, createdTitle);
    await expect(rowFor(page, progressTitle)).toHaveCount(0);

    // Clear the status filter ("" = All) -> both visible again.
    await statusSelect.selectOption('');
    await expectRowVisible(page, createdTitle);
    await expectRowVisible(page, progressTitle);
  });
});

function rowFor(page: Page, title: string) {
  return page.getByRole('button', { name: new RegExp(`Open task ${escapeRegex(title)}`) });
}

async function expectRowVisible(page: Page, title: string): Promise<void> {
  await expect(rowFor(page, title)).toBeVisible();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
