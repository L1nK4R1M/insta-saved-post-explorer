import { expect, test, type Page } from "@playwright/test";

const mobileWidths = [360, 375, 390, 412, 420];

for (const width of mobileWidths) {
  test.describe(`toolbar mobile ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("reste compacte, accessible et sans overflow document", async ({ page }) => {
      await openLibrary(page);

      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const ribbon = page.locator(".control-ribbon");
      const firstPost = page.locator("[data-post-id]").first();
      await expect(ribbon).toBeVisible();
      await expect(firstPost).toBeVisible();

      const compactControls = [
        page.getByRole("button", { name: /Ouvrir les filtres/ }),
        page.getByLabel("Trier les résultats"),
        page.getByRole("button", { name: "Grille régulière" }),
        page.getByRole("button", { name: "Grille masonry" }),
      ];
      for (const control of compactControls) {
        await expect(control).toBeVisible();
        expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }

      await expect(page.locator(".ribbon-end .author-control")).toBeHidden();
      await expect(page.locator(".ribbon-end .year-control")).toBeHidden();
      await expect(page.locator(".ribbon-end .collection-control")).toBeHidden();
      await expect(page.locator(".main-theme-filters")).toHaveCSS("overflow-x", "auto");

      const ribbonBottom = await ribbon.evaluate((node) => node.getBoundingClientRect().bottom);
      const postTop = await firstPost.evaluate((node) => node.getBoundingClientRect().top);
      expect(postTop - ribbonBottom).toBeLessThanOrEqual(16);
    });

    test("place auteur, année et collection dans le drawer Radix", async ({ page }) => {
      await openLibrary(page);
      const trigger = page.getByRole("button", { name: /Ouvrir les filtres/ });
      await trigger.focus();
      await trigger.click();

      const drawer = page.getByRole("dialog", { name: "Filtres avancés" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("combobox", { name: "Filtrer par auteur dans le drawer" })).toBeVisible();
      await expect(drawer.getByLabel("Filtrer par année dans le drawer")).toBeVisible();
      await expect(drawer.getByLabel("Filtrer par collection dans le drawer")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });
}

test("préserve la structure du ruban desktop à 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLibrary(page);

  await expect(page.getByRole("button", { name: "Filtres avancés" })).toBeVisible();
  await expect(page.locator(".mobile-filter-trigger")).toBeHidden();
  await expect(page.locator(".ribbon-end .author-control")).toBeVisible();
  await expect(page.locator(".ribbon-end .year-control")).toBeVisible();
  await expect(page.locator(".ribbon-end .collection-control")).toBeVisible();
  await expect(page.locator(".control-ribbon")).toHaveCSS("display", "flex");
  await expect(page.locator(".ribbon-end")).toHaveCSS("display", "flex");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function openLibrary(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Publications sauvegardées" })).toBeVisible();
}
