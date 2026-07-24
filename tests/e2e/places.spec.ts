import { expect, test } from "@playwright/test";

// Phase G browser coverage. The e2e environment has no database and no map tile
// key, so the page renders its empty/unconfigured states: that is exactly the
// contract we assert here — the route, the controls, the filters, the URL state
// and the accessibility affordances must all work without a live map. No real
// tile or Geoapify request is ever made.

test.describe("page Places", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/places");
  });

  test("expose la route, le titre et la zone carte", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Places", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Lieux sauvegardés" })).toBeVisible();
    // Without NEXT_PUBLIC_PLACES_TILE_URL the map states it is unconfigured
    // instead of failing; the rest of the page stays usable.
    await expect(page.getByText("NEXT_PUBLIC_PLACES_TILE_URL")).toBeVisible();
  });

  test("est accessible depuis la navigation principale", async ({ page }) => {
    await page.goto("/");
    const placesLink = page.getByRole("link", { name: "Places" });
    await expect(placesLink).toBeVisible();
    await placesLink.click();
    await expect(page).toHaveURL(/\/places$/);
    await expect(page.getByRole("heading", { name: "Places", level: 1 })).toBeVisible();
  });

  test("ouvre et ferme le panneau de filtres depuis le bouton", async ({ page }) => {
    const filtersButton = page.getByRole("button", { name: "Filtres" });
    await expect(filtersButton).toHaveAttribute("aria-expanded", "false");
    await filtersButton.click();

    const panel = page.getByRole("dialog", { name: "Filtres" });
    await expect(panel).toBeVisible();
    // Theme stays the contract vocabulary; place types are the new group filter.
    await expect(panel.getByText("Thème du post")).toBeVisible();
    await expect(panel.getByText("Type de lieu")).toBeVisible();
    await expect(panel.getByText("Café et brunch")).toBeVisible();

    await panel.getByRole("button", { name: "Fermer les filtres" }).click();
    await expect(panel).toBeHidden();
  });

  test("reflète les filtres sélectionnés dans l'URL et le compteur", async ({ page }) => {
    await page.getByRole("button", { name: "Filtres" }).click();
    const panel = page.getByRole("dialog", { name: "Filtres" });

    await panel.getByText("Voyages", { exact: true }).click();
    await panel.getByText("Café et brunch").click();

    // Several place types can be selected at once (multi-select).
    await expect(page).toHaveURL(/theme=Voyages/);
    await expect(page).toHaveURL(/categories=cafe/);
    await expect(page.getByRole("button", { name: /Filtres/ })).toContainText("2");

    await panel.getByRole("button", { name: "Effacer" }).click();
    await expect(page).toHaveURL(/\/places$/);
  });

  test("restaure les filtres partagés par un lien profond", async ({ page }) => {
    await page.goto("/places?theme=Restaurant&categories=restaurant,bar&precision=EXACT");
    await page.getByRole("button", { name: /Filtres/ }).click();
    const panel = page.getByRole("dialog", { name: "Filtres" });
    // 1 theme + 2 categories + 1 precision = 4 active filters restored.
    await expect(page.getByRole("button", { name: /Filtres/ })).toContainText("4");
    await expect(panel.getByRole("checkbox").nth(0)).toBeDefined();
  });

  test("permet la recherche et l'affichage du résumé", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Rechercher un lieu" });
    await expect(search).toBeVisible();
    await search.fill("santorin");
    await expect(page).toHaveURL(/q=santorin/);
    await expect(page.getByRole("status").first()).toBeVisible();
  });

  test("ouvre les statistiques limitées au thème et au pays", async ({ page }) => {
    await page.getByRole("button", { name: /Statistiques/ }).click();
    const stats = page.getByRole("dialog", { name: "Statistiques" });
    await expect(stats).toBeVisible();
    await expect(stats.getByText("Par thème")).toBeVisible();
    await expect(stats.getByText("Par pays")).toBeVisible();
    // Precision and continents were deliberately dropped from the popover.
    await expect(stats.getByText("Par précision")).toHaveCount(0);
  });

  test("ouvre la liste et annonce l'absence de résultat", async ({ page }) => {
    await page.getByRole("button", { name: /Liste/ }).click();
    const drawer = page.getByRole("complementary", { name: "Liste des lieux" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Aucun lieu ne correspond à ces filtres.")).toBeVisible();
    await drawer.getByRole("button", { name: "Fermer la liste" }).click();
    await expect(drawer).toBeHidden();
  });

  test("reste navigable au clavier", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Rechercher un lieu" });
    await search.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Filtres" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();
  });

  test("ne déborde pas horizontalement", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
