import { expect, test } from '@playwright/test';
import {
  clearStorage,
  futureDeadlineLocal,
  loginAsAdmin,
  logout,
  pinLanguage,
  registerWorker,
  uniqueSuffix,
} from './helpers';

/**
 * Epic 3 — Map and Location, area drawing (PRD UXG1; FR-10 extended).
 *
 * On the create form, switching to "Draw area" mode turns each map click into a
 * polygon vertex. With >= 3 vertices the polygon becomes valid, the point marker
 * is re-anchored to its centroid, and the task saves with an area. We then
 * confirm the detail page renders an area polygon (a Leaflet SVG path) on its map.
 */
test.describe('draw a polygon area', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('admin draws a 4-vertex area, the polygon validates, and the task saves with it', async ({
    page,
  }) => {
    const worker = await registerWorker(page);
    await logout(page);
    await loginAsAdmin(page);

    await page.getByRole('link', { name: /new task/i }).first().click();
    await page.waitForURL('**/tasks/new');

    const title = `Survey area ${uniqueSuffix()}`;
    await page.locator('#task-title').fill(title);

    // Switch the map to area-drawing mode.
    await page.getByRole('button', { name: /draw area/i }).click();

    // Click 4 distinct points inside the map canvas to build a polygon.
    const map = page.locator('.map-canvas');
    await expect(map).toBeVisible();
    // Don't wait on the tile pane (OSM tiles may be blocked offline); Leaflet
    // resolves clicks to lat/lng from the container geometry regardless.
    await expect(map).toHaveClass(/leaflet-container/);
    await map.locator('.leaflet-map-pane').waitFor({ state: 'attached' });
    await page.waitForTimeout(400);
    const box = await map.boundingBox();
    if (!box) throw new Error('map-canvas has no bounding box');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const dx = box.width * 0.18;
    const dy = box.height * 0.18;
    // A diamond around the center (4 well-separated vertices).
    await page.mouse.click(cx, cy - dy);
    await page.mouse.click(cx + dx, cy);
    await page.mouse.click(cx, cy + dy);
    await page.mouse.click(cx - dx, cy);

    // With >= 3 vertices the area is valid; the footer confirms the count.
    await expect(page.locator('.map-msg--ok')).toContainText(/Area with 4 points/i);
    // A polygon outline (+ vertex dots) is now drawn on the picker map as
    // Leaflet SVG paths in the overlay pane — assert at least one is present.
    await expect
      .poll(async () => map.locator('.leaflet-overlay-pane path').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Finish drawing (back to point mode) and complete the rest of the form.
    // The area toolbar's "Done" button (✓ Done) exits draw mode.
    await page.getByRole('button', { name: /done/i }).click();
    await page.locator('#task-assignee').selectOption({ label: worker.displayName });
    await page.locator('#task-deadline').fill(futureDeadlineLocal());

    const submit = page.getByRole('button', { name: /^create$/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Saved -> detail page; the map renders the saved area polygon.
    await page.waitForURL(/\/tasks\/[0-9a-fA-F-]{36}$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.detail__map .leaflet-overlay-pane path')).toHaveCount(1, {
      timeout: 10_000,
    });
  });
});
