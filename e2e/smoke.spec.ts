import { expect, test } from "@playwright/test";

test("browser smoke renders the foundation page", async ({ page }) => {
  await page.setContent("<main><h1>Latchkey foundation is ready</h1></main>");

  await expect(
    page.getByRole("heading", { name: "Latchkey foundation is ready" })
  ).toBeVisible();
});
