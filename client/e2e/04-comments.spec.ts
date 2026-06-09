import { expect, test } from '@playwright/test';
import {
  clearStorage,
  createTaskViaForm,
  loginAsAdmin,
  logout,
  pinLanguage,
  registerWorker,
  uniqueSuffix,
} from './helpers';

/**
 * Epic 5 — Comments and Audit Trail (PRD §6.5, Stories 5.1–5.2).
 *
 * Add a Comment and confirm it appears in the thread with the author's name and
 * a timestamp (FR-15, FR-16). Empty/whitespace comments are rejected (FR-15).
 */
test.describe('comments', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await pinLanguage(page, 'en');
  });

  test('admin adds a comment and it shows in the thread with author + timestamp (FR-15, FR-16)', async ({
    page,
  }) => {
    const worker = await registerWorker(page);
    await logout(page);

    await loginAsAdmin(page);
    const title = `Comment task ${uniqueSuffix()}`;
    await createTaskViaForm(page, { title, assigneeDisplayName: worker.displayName });

    const body = `Looks good — proceeding ${uniqueSuffix()}`;
    const composer = page.getByRole('textbox', { name: /add a comment/i });
    await composer.fill(body);
    await page.getByRole('button', { name: /^post$/i }).click();

    // The new comment appears in the thread.
    const comment = page.locator('.comment', { hasText: body });
    await expect(comment).toBeVisible();

    // Attribution: the seeded Admin's display name authored it.
    await expect(comment.locator('.comment__author')).toContainText(/admin/i);
    // Timestamp: a non-empty, time-formatted string is shown.
    await expect(comment.locator('.comment__time')).not.toBeEmpty();

    // The composer is cleared after a successful post.
    await expect(composer).toHaveValue('');
  });

  test('a whitespace-only comment is rejected and not posted (FR-15)', async ({ page }) => {
    const worker = await registerWorker(page);
    await logout(page);

    await loginAsAdmin(page);
    const title = `Empty-comment task ${uniqueSuffix()}`;
    await createTaskViaForm(page, { title, assigneeDisplayName: worker.displayName });

    // The Post button is disabled while the body is empty/whitespace, so a
    // blank comment cannot be submitted in the first place.
    const composer = page.getByRole('textbox', { name: /add a comment/i });
    const post = page.getByRole('button', { name: /^post$/i });
    await expect(post).toBeDisabled();

    await composer.fill('    ');
    await expect(post).toBeDisabled();

    // No comment was added; the empty-thread placeholder still shows.
    await expect(page.getByText(/no comments yet/i)).toBeVisible();
    await expect(page.locator('.comment')).toHaveCount(0);
  });

  test('comments render newest-after-oldest in chronological order (FR-16)', async ({ page }) => {
    const worker = await registerWorker(page);
    await logout(page);

    await loginAsAdmin(page);
    const title = `Ordered-comments task ${uniqueSuffix()}`;
    await createTaskViaForm(page, { title, assigneeDisplayName: worker.displayName });

    const composer = page.getByRole('textbox', { name: /add a comment/i });
    const post = page.getByRole('button', { name: /^post$/i });

    const first = `first-${uniqueSuffix()}`;
    const second = `second-${uniqueSuffix()}`;

    await composer.fill(first);
    await post.click();
    await expect(page.locator('.comment', { hasText: first })).toBeVisible();

    await composer.fill(second);
    await post.click();
    await expect(page.locator('.comment', { hasText: second })).toBeVisible();

    // Oldest-to-newest: the "first" comment precedes the "second" in the DOM.
    const bodies = await page.locator('.comment .comment__body').allTextContents();
    const firstIdx = bodies.findIndex((b) => b.includes(first));
    const secondIdx = bodies.findIndex((b) => b.includes(second));
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
