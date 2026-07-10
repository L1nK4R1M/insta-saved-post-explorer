import { expect, test } from "@playwright/test";

test.skip(process.env.CAPTURE_VISUALS !== "true", "Visual references are generated on demand.");

test("capture les références visuelles du design D", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Publications sauvegardées" })).toBeVisible();

  await selectTheme(page, "Sombre");
  await page.screenshot({
    path: `docs/ui-implementation/${testInfo.project.name}-dark.png`,
    fullPage: true,
  });

  await page.locator("[data-post-id]").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: `docs/ui-implementation/${testInfo.project.name}-dark-detail.png`,
    fullPage: false,
  });
  await page.keyboard.press("Escape");

  if (testInfo.project.name === "chromium") {
    await selectTheme(page, "Clair");
    await page.screenshot({
      path: "docs/ui-implementation/chromium-light.png",
      fullPage: true,
    });
  }
});

async function selectTheme(page: import("@playwright/test").Page, theme: "Clair" | "Sombre") {
  await page.getByRole("button", { name: "Changer le thème" }).click();
  await page.getByRole("menuitemradio", { name: theme }).click();
}
