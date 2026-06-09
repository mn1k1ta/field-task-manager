import { expect, test } from '@playwright/test';
import {
  clearStorage,
  clickMapCenter,
  createTaskViaForm,
  futureDeadlineLocal,
  loginAsAdmin,
  logout,
  pinLanguage,
  registerWorker,
  uniqueSuffix,
} from './helpers';

/**
 * Epic 2 — Task CRUD (PRD §6.2, Story 2.1) + Epic 3 map placement (FR-9, FR-10).
 *
 * As Admin: create a Task by filling the title, clicking the map to place the
 * Location point, picking the Assignee, setting the Deadline, saving — then
 * confirm it appears both as a Marker on the dashboard map and as a list row.
 */
test.describe('admin task creation', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('admin creates a task with a map-placed location and an assignee; it appears as a marker and a list row (FR-5, FR-9, FR-10)', async ({
    page,
  }) => {
    // A worker must exist to be the assignee.
    const worker = await registerWorker(page);
    await logout(page);

    await loginAsAdmin(page);

    const title = `Inspect pump ${uniqueSuffix()}`;
    await createTaskViaForm(page, { title, assigneeDisplayName: worker.displayName });

    // We land on the new task's detail page showing the title + assignee.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(worker.displayName)).toBeVisible();
    // A freshly created task is in status "Created".
    await expect(page.locator('.status-badge')).toContainText(/created/i);

    // Back on the dashboard: the new task is a list row AND a map marker.
    await page.goto('/dashboard');
    const row = page.getByRole('button', { name: new RegExp(`Open task ${escapeRegex(title)}`) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(title);
    // Admin list rows show the assignee name.
    await expect(row).toContainText(worker.displayName);

    // At least one Leaflet marker is rendered (the divIcon for our task).
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  });

  test('the create form blocks save until a title is entered and a location is placed (FR-5)', async ({
    page,
  }) => {
    await registerWorker(page);
    await logout(page);
    await loginAsAdmin(page);

    await page.getByRole('link', { name: /new task/i }).first().click();
    await page.waitForURL('**/tasks/new');

    const submit = page.getByRole('button', { name: /^create$/i });
    // Nothing filled yet: submit is disabled.
    await expect(submit).toBeDisabled();

    // Fill everything EXCEPT clicking the map — still disabled (no location).
    await page.locator('#task-title').fill(`No-location task ${uniqueSuffix()}`);
    await page.locator('#task-assignee').selectOption({ index: 1 });
    await page.locator('#task-deadline').fill(futureDeadlineLocal());
    await expect(submit).toBeDisabled();

    // Now place the location — submit becomes enabled.
    await clickMapCenter(page, '.map-canvas');
    await expect(page.locator('.map-msg--ok')).toBeVisible();
    await expect(submit).toBeEnabled();
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
