import { expect, test } from '@playwright/test';
import { SEED_ADMIN, clearStorage, login } from './helpers';

/**
 * UX i18n (PRD UXG6; architecture §10, i18n service).
 *
 * The default language is Ukrainian. Toggling UA/EN in the nav must swap the
 * UI copy live and persist the choice. We assert a known label on the login
 * screen (the sign-in button) and the nav's Log out button.
 *
 * NOTE: this spec intentionally does NOT pin the language — it verifies the UK
 * default and the real toggle behavior.
 */
test.describe('i18n language toggle', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('the login screen defaults to Ukrainian (UA default)', async ({ page }) => {
    await page.goto('/login');
    // UK: "Увійти" (Sign in). The EN equivalent ("Sign in") must NOT be present.
    await expect(page.getByRole('button', { name: 'Увійти' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  });

  test('toggling the nav UA/EN switch swaps UI copy live and persists (UXG6)', async ({ page }) => {
    // The language toggle lives in the authenticated app shell, so log in first.
    // Log in using role-based locators that work regardless of current language:
    await page.goto('/login');
    await page.locator('#login-username').fill(SEED_ADMIN.username);
    await page.locator('#login-password').fill(SEED_ADMIN.password);
    // The submit button is the only button inside the login form.
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/dashboard');

    // Default UK: the nav shows "Вийти" (Log out).
    const logoutBtn = () => page.locator('header.app-bar .btn--secondary');
    await expect(logoutBtn()).toContainText('Вийти');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');

    // Toggle to EN via the language switch. The aria-label is localized (UA by
    // default), so match the language-agnostic button TEXT ("EN") within the nav
    // language group instead.
    await page.locator('header [role="group"] button', { hasText: 'EN' }).click();
    await expect(logoutBtn()).toContainText(/log out/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // The EN dashboard search placeholder now reads in English.
    await expect(page.getByRole('searchbox', { name: /search tasks/i })).toBeVisible();

    // Toggle back to UA (match button text, not the localized aria-label).
    await page.locator('header [role="group"] button', { hasText: 'UA' }).click();
    await expect(logoutBtn()).toContainText('Вийти');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');

    // Persistence: a reload keeps Ukrainian.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(logoutBtn()).toContainText('Вийти');
  });
});
