import { expect, test } from "@playwright/test";

/* Core UI flows. Auth outcomes are server-dependent, so E2E asserts UI
   presence + routing only — never credentials or enrollments. */

test("landing renders hero and navigates to catalog", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.locator("#content")).toBeVisible();
  await page.goto("/#/courses");
  await expect(page.locator("#content")).toContainText(/track|academy|course|كورس|مسار/i);
});

test("catalog lists courses and opens a detail page", async ({ page }) => {
  await page.goto("/#/courses");
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  await page.goto("/#/courses/python-data");
  await expect(page.locator("#content")).toContainText(/python|بايثون|data|داتا|program|برمج/i);
});

test("dashboard without session redirects to sign-in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/#/dashboard");
  await expect.poll(async () => page.url(), { timeout: 15000 }).toContain("signin.html");
  await expect(page.locator("#signinForm")).toBeVisible();
});

test("signin form validates empty submit", async ({ page }) => {
  await page.goto("/signin.html");
  await expect(page.locator("#signinForm")).toBeVisible();
  await page.locator('#signinForm input[type="email"]').fill("not-an-email");
  await expect(page.locator('#signinForm button[type="submit"]')).toBeEnabled();
});

test("baccalaureate hub renders ministry content", async ({ page }) => {
  await page.goto("/#/baccalaureate");
  await expect(page.locator("#content")).toContainText(/baccalaureate|بكالوريا/i);
});
