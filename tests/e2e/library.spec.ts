import { expect, test, type Page } from "@playwright/test";

test.describe("bibliotheque Mosaïque", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Publications sauvegardées" })).toBeVisible();
  });

  test("charge les 18 publications du fallback local", async ({ page }) => {
    await expect(page.locator(".brand-logo")).toBeVisible();
    await expect(page.locator(".brand-name")).toContainText("Insta Post Explorer");
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

  test("affiche un état de chargement pendant un filtrage lent", async ({ page }) => {
    await page.route("**/api/posts?**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    const filters = await openFilters(page);
    await filters.getByRole("button", { name: /Dessert protéiné/ }).click();
    const loading = page.getByRole("status").filter({ hasText: /Chargement des résultats/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeHidden();
  });

  test("traite Favoris comme un filtre principal unique", async ({ page }) => {
    const favoriteFilter = page.getByRole("button", { name: "Favoris", exact: true });
    await favoriteFilter.click();
    await expect(favoriteFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".active-tags")).not.toContainText("Favoris");
    await expect.poll(() => new URL(page.url()).searchParams.get("tags")).toBe("Favoris");
  });

  test("ouvre le detail et navigue au bouton et au clavier", async ({ page }) => {
    await page.getByRole("button", { name: "Ouvrir la publication de esncom.fr" }).click();
    const dialog = page.getByRole("dialog", { name: "Publication de esncom.fr" });

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Photo", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Date", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Commentaires", { exact: true })).toHaveCount(0);
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

  test("ne propose plus le tri par commentaires", async ({ page }) => {
    await page.goto("/");
    const sort = page.getByLabel("Trier les résultats");
    await expect(sort.locator("option[value='comments']")).toHaveCount(0);
    await expect(sort.locator("option[value='likes']")).toHaveText("Plus likés");
  });

  test("parcourt tous les médias d'un carrousel dans le détail", async ({ page }) => {
    const response = await page.request.get("/api/posts?limit=1");
    const item = (await response.json() as { items: Array<Record<string, unknown>> }).items[0];
    const postId = String(item.id);
    const imageUrl = String(item.thumbnailUrl);
    await page.route(`**/api/posts/${postId}`, (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...item,
        contentType: "carousel",
        media: [
          { id: "carousel-1", type: "image", url: imageUrl, sourcePath: null, thumbnailUrl: imageUrl, position: 0 },
          { id: "carousel-2", type: "image", url: imageUrl, sourcePath: null, thumbnailUrl: imageUrl, position: 1 },
        ],
      }),
    }));

    await page.locator(`[data-post-id="${postId}"]`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Carrousel", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Média suivant" }).click();
    await expect(dialog.getByText("2 / 2", { exact: true })).toBeVisible();
  });

  test("prépare la lecture vidéo et le fallback source_path", async ({ page }) => {
    const response = await page.request.get("/api/posts?limit=1");
    const item = (await response.json() as { items: Array<Record<string, unknown>> }).items[0];
    const postId = String(item.id);
    await page.route(`**/api/posts/${postId}`, (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...item,
        contentType: "reel",
        media: [
          { id: "video-1", type: "video", url: "https://cdn.example.com/video.mp4", sourcePath: "auteur/CODE/video.mp4", thumbnailUrl: String(item.thumbnailUrl), position: 0 },
          { id: "local-2", type: "image", url: null, sourcePath: "auteur/CODE/photo.jpg", thumbnailUrl: null, position: 1 },
        ],
      }),
    }));

    await page.locator(`[data-post-id="${postId}"]`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("video[controls][playsinline]")).toBeVisible();
    await dialog.getByRole("button", { name: "Média suivant" }).click();
    await expect(dialog.getByText("Média indisponible", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/source locale/i)).toBeVisible();
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

  test("reste en lecture seule pour un visiteur", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Ouvrir la connexion administrateur" })).toBeVisible();
    await expect(page.locator("button.import-button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Favoris", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter aux favoris" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retirer des favoris" })).toHaveCount(0);

    await page.getByRole("button", { name: "Ouvrir la publication de esncom.fr" }).click();
    const dialog = page.getByRole("dialog", { name: "Publication de esncom.fr" });
    await expect(dialog.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
    await expect(dialog.getByLabel(/Ajouter un tag/)).toHaveCount(0);
  });

  test("autorise les lectures publiques et refuse les mutations anonymes", async ({ request }) => {
    await expect((await request.get("/api/brand/logo")).status()).toBe(200);
    await expect((await request.get("/api/posts?limit=1")).status()).toBe(200);
    await expect((await request.post("/api/import", { data: [] })).status()).toBe(401);
    await expect((await request.delete("/api/posts/post-inexistant")).status()).toBe(401);
  });

  test("ne déborde pas horizontalement et garde un Masonry stable", async ({ page }) => {
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll<HTMLElement>("[data-post-id]")].map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }),
    }));

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.cards.length).toBe(18);
    expect(layout.cards.every((card) => card.left >= 0 && card.right <= layout.viewport + 1)).toBe(true);
    expect(layout.cards.every((card) => card.width > 0 && card.height > 0)).toBe(true);
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
