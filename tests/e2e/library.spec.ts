import { expect, test, type Page } from "@playwright/test";

test.describe("bibliotheque Mosaïque", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Publications sauvegardées" })).toBeVisible();
  });

  test("charge les 18 publications du fallback local", async ({ page }) => {
    await expect(page.getByText("18 résultats", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ouvrir la publication de esncom.fr" })).toBeVisible();
    await expect(page.locator("[data-post-id]")).toHaveCount(18);
  });

  test("recherche sans accent et restaure la requete dans l'URL", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Rechercher dans la bibliothèque" });

    await search.fill("patisserie");

    await expect(page.getByText("1 résultats", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ouvrir la publication de damienpichon_" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("patisserie");
  });

  test("combine les tags en ET puis en OU", async ({ page }) => {
    const filters = await openFilters(page);
    await filters.getByRole("button", { name: /Dessert protéiné/ }).click();
    await filters.getByRole("button", { name: "Chocolat 1", exact: true }).click();

    await expect(page.getByText("1 résultats", { exact: true })).toBeVisible();
    await filters.getByRole("button", { name: "OU", exact: true }).click();
    await expect(page.getByText("11 résultats", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("tagMode")).toBe("or");
  });

  test("ouvre le detail et navigue au bouton et au clavier", async ({ page }) => {
    await page.getByRole("button", { name: "Ouvrir la publication de esncom.fr" }).click();
    const dialog = page.getByRole("dialog", { name: "Publication de esncom.fr" });

    await expect(dialog).toBeVisible();
    const firstId = new URL(page.url()).searchParams.get("post");
    expect(firstId).not.toBeNull();
    await dialog.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const secondId = new URL(page.url()).searchParams.get("post");
    expect(secondId).not.toBe(firstId);

    await page.keyboard.press("ArrowRight");
    await expect.poll(() => new URL(page.url()).searchParams.get("post")).not.toBe(secondId);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => new URL(page.url()).searchParams.get("post")).toBe(secondId);
  });

  test("applique et persiste les themes clair, sombre et systeme", async ({ page }) => {
    await selectTheme(page, "Clair");
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("light");

    await selectTheme(page, "Sombre");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");

    await page.emulateMedia({ colorScheme: "dark" });
    await selectTheme(page, "Système");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
  });

  test("ouvre l'import JSON depuis une action nommee", async ({ page }) => {
    const importButton = page.locator("button.import-button");
    await expect(importButton).toHaveAccessibleName("Importer JSON");
    await importButton.click();

    await expect(page.getByRole("dialog", { name: "Importer des publications" })).toBeVisible();
    await expect(page.getByText(/Déposez votre fichier JSON ici/)).toBeVisible();
  });
});

async function openFilters(page: Page) {
  const desktopPanel = page.locator(".desktop-filter-panel");
  if (await desktopPanel.isVisible()) return desktopPanel;

  await page.getByRole("button", { name: /^Filtres/ }).click();
  const drawer = page.getByRole("dialog", { name: "Filtres avancés" });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function selectTheme(page: Page, theme: "Clair" | "Sombre" | "Système") {
  await page.getByRole("button", { name: "Changer le thème" }).click();
  await page.getByRole("menuitemradio", { name: theme }).click();
}
