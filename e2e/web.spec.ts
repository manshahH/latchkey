import { expect, test, type Page } from "@playwright/test";

const base = "http://localhost:3100";
const store = "/s/5e11e700-0000-4000-8000-000000000001";

const screens: [string, string, string][] = [
  ["landing", "/", "Your payment company takes the money"],
  ["claim", "/claim/sample-claim-signed-out-000000000", "Your code is ready."],
  ["claim-signed-in", "/claim/sample-claim-signed-in-0000000000", "Almost there."],
  ["claim-expired", "/claim/sample-claim-expired-000000000000", "This link has run out."],
  ["claim-used", "/claim/sample-claim-used-000000000000000", "already connected"],
  ["claim-unknown", "/claim/not-a-real-claim-link-at-all", "This link does not work."],
  ["purchases", "/purchases", "Your purchases"],
  ["access", "/access/a0000000-0000-4000-8000-000000000002", "Accept your invite on GitHub."],
  ["seller-home", store, "things need you."],
  ["seller-buyers", `${store}/buyers`, "Buyers"],
  ["seller-buyer", `${store}/buyers/11c00000-0000-4000-8000-000000000003`, "@mkhan"],
  ["seller-products", `${store}/products`, "Products"],
  ["seller-team", `${store}/team`, "Team"]
];

const noSideScroll = async (page: Page) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(0);

for (const [width, label] of [
  [400, "phone"],
  [1280, "desktop"]
] as const) {
  test(`every screen renders at ${label} width with one heading, no side scroll, and no em dashes`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path, heading] of screens) {
      const response = await page.goto(`${base}${path}`);
      expect(response?.status(), name).toBeLessThan(400);
      await expect(page.locator("h1"), name).toHaveCount(1);
      await expect(page.locator("h1"), name).toContainText(heading);
      await noSideScroll(page);
      const text = await page.locator("body").innerText();
      expect(text, name).not.toMatch(/[–—]/);
      await page.screenshot({ path: `test-results/web/${name}-${label}.png`, fullPage: true });
    }
  });
}

test("a store the signed-in person does not belong to is not found, never forbidden", async ({
  page
}) => {
  const response = await page.goto(`${base}/s/00000000-0000-4000-8000-000000000009`);
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Nothing here.");
});

test("the seller can filter and search buyers, and an empty search offers a way back", async ({
  page
}) => {
  await page.goto(`${base}${store}/buyers`);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(22);

  await page.getByRole("button", { name: /Needs you/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(page).toHaveURL(/show=needs/);

  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByLabel("Search buyers").fill("@nadia");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("@nadia-codes");

  await page.getByLabel("Search buyers").fill("nobody-by-this-name");
  await expect(page.getByText('No buyers match "nobody-by-this-name".')).toBeVisible();
  await page.getByRole("button", { name: "Show everyone" }).click();
  await expect(rows).toHaveCount(22);
});

test("removing access asks for a reason before anything is sent", async ({ page }) => {
  await page.goto(`${base}${store}/buyers/11c00000-0000-4000-8000-000000000001`);
  let posted = false;
  await page.route("**/sellers/**/revoke", (route) => {
    posted = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"queued":true}' });
  });
  await page.getByRole("button", { name: "Remove access" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Remove access" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Add a short reason");
  expect(posted).toBe(false);

  await dialog.getByLabel("Reason").fill("Shared the code publicly");
  await dialog.getByRole("button", { name: "Remove access" }).click();
  await expect(dialog).toBeHidden();
  expect(posted).toBe(true);
});

test("the delivery tabs work with the keyboard", async ({ page }) => {
  await page.goto(`${base}/#delivery`);
  const first = page.getByRole("tab", { name: "GitHub repo" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "One command install" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByRole("tabpanel")).toContainText("npx shadcn@latest add");
});
