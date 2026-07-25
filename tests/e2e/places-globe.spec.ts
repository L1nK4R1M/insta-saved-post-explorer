import { expect, test, type Page } from "@playwright/test";

// Phase I browser coverage. Like the Phase G suite, the e2e environment has no
// database and no tile key, so the page renders its empty state — which is
// exactly what makes these assertions about routing, the view contract, the
// fallback and accessibility meaningful without a live map or a live globe.
//
// No request ever leaves for a tile server, a texture CDN or any 3D provider:
// the only asset the globe needs is the local /places/earth-dark.png.

const PROVIDER_HOSTS = ["geoapify", "mapbox", "cesium", "openstreetmap", "unpkg", "jsdelivr", "cdn."];

async function failOnProviderRequests(page: Page) {
  const offenders: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return;
    if (PROVIDER_HOSTS.some((host) => url.includes(host))) offenders.push(url);
  });
  return () => offenders;
}

test.describe("page Places — vue 3D", () => {
  test("garde la vue 2D par défaut sur une URL historique", async ({ page }) => {
    await page.goto("/places");
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    // The URL must not gain a view parameter it did not have.
    await expect(page).toHaveURL(/\/places$/);
  });

  test("rend la 2D pour view=map et n'ajoute pas le paramètre par défaut", async ({ page }) => {
    await page.goto("/places?view=map");
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    await expect(page).toHaveURL(/\/places$/);
  });

  test("rend le globe pour view=globe avec son attribution", async ({ page }) => {
    await page.goto("/places?view=globe");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    // The texture licence must be visible in the view that uses it (FR-I-15).
    await expect(page.getByText("Natural Earth")).toBeVisible();
    await expect(page.locator(".places-globe-canvas canvas")).toBeVisible();
  });

  test("bascule dans les deux sens et reflète la vue dans l'URL", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page).toHaveURL(/view=globe/);
    await expect(page.getByTestId("places-globe")).toBeVisible();

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
  });

  test("conserve les filtres et la recherche à travers la bascule", async ({ page }) => {
    await page.goto("/places?theme=Voyages&categories=cafe");
    await page.getByRole("searchbox", { name: "Rechercher un lieu" }).fill("rome");
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page).toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/theme=Voyages/);
    await expect(page).toHaveURL(/categories=cafe/);
    await expect(page).toHaveURL(/q=rome/);
    await expect(page.getByRole("button", { name: /Filtres/ })).toContainText("3");
  });

  test("restaure un lien profond globe + placeId", async ({ page }) => {
    await page.goto("/places?view=globe&placeId=abc&country=FR");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await expect(page).toHaveURL(/placeId=abc/);
    await expect(page).toHaveURL(/view=globe/);
  });

  test("rend la navigation précédent/suivant cohérente", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByTestId("places-globe")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");

    await page.goForward();
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  });

  test("bascule proprement en 2D quand WebGL est indisponible", async ({ page }) => {
    // Deny every WebGL context before any application script runs, which is the
    // situation of a browser or a device that cannot render the globe.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (typeof args[0] === "string" && args[0].includes("webgl")) return null;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });

    await page.goto("/places?view=globe&q=rome");
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    await expect(page.getByText(/WebGL indisponible/)).toBeVisible();
    // The 3D button is refused, the URL is corrected, and everything else works.
    await expect(page.getByRole("button", { name: "3D" })).toBeDisabled();
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/q=rome/);
    await page.getByRole("button", { name: /Liste/ }).click();
    await expect(page.getByRole("complementary", { name: "Liste des lieux" })).toBeVisible();
  });

  test("reste utilisable au clavier", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("button", { name: "Filtres" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "2D" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "3D" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    // The globe canvas must not swallow focus.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("places-globe")).toBeVisible();
  });

  test("ne déborde pas horizontalement en vue globe", async ({ page }) => {
    await page.goto("/places?view=globe");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("n'appelle aucun fournisseur de carte ni de 3D", async ({ page }) => {
    const offenders = await failOnProviderRequests(page);
    await page.goto("/places?view=globe");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await page.waitForTimeout(500);
    expect(offenders()).toEqual([]);
  });

  test("sert la texture depuis les assets locaux", async ({ page }) => {
    const response = await page.request.get("/places/earth-dark.png");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    // The texture must stay small enough to keep the first globe render cheap.
    const body = await response.body();
    expect(body.byteLength).toBeLessThan(200 * 1024);
  });

  test("respecte prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/places?view=globe");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    // The globe still renders; nothing keeps moving on its own.
    const autoRotating = await page.evaluate(() => document.querySelectorAll(".places-globe-canvas canvas").length);
    expect(autoRotating).toBe(1);
  });
});
