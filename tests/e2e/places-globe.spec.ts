import { expect, test } from "@playwright/test";

// Phase I browser coverage, limited to the cross-cutting journeys that unit and
// component tests cannot prove: real routing, a real lazy chunk, a real WebGL
// context and real layout. Rules already proven by a unit test are not replayed
// here.
//
// Like the Phase G suite, the e2e environment has no database and no tile key,
// so the page renders its empty state — which is exactly what makes these
// assertions meaningful without a live map or a live globe. Nothing is fetched
// from a tile server, a texture CDN or any 3D provider.
//
// Most scenarios are viewport-independent and run on desktop only; the mobile
// project runs the one journey where behaviour genuinely differs (touch layout
// on a small screen).

const desktopOnly = () => test.skip(test.info().project.name !== "chromium", "viewport-independent");
const mobileOnly = () => test.skip(test.info().project.name !== "mobile", "mobile journey");

const PROVIDER_HOSTS = ["geoapify", "mapbox", "cesium", "openstreetmap", "unpkg", "jsdelivr", "cdn."];

test.describe("page Places — vue 3D", () => {
  test("garde la 2D par défaut et ne charge pas le moteur 3D", async ({ page }) => {
    desktopOnly();
    const chunkRequests: string[] = [];
    page.on("request", (request) => {
      if (/three|globe/i.test(request.url()) && request.url().includes("/_next/")) chunkRequests.push(request.url());
    });

    await page.goto("/places");
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    // A historical URL must not gain a view parameter it never had.
    await expect(page).toHaveURL(/\/places$/);
    await page.waitForTimeout(300);
    expect(chunkRequests).toEqual([]);

    // An explicit view=map behaves identically and stays clean.
    await page.goto("/places?view=map");
    await expect(page).toHaveURL(/\/places$/);
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
  });

  test("rend le globe, son attribution, et n'appelle aucun fournisseur", async ({ page }) => {
    desktopOnly();
    const offenders: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return;
      if (PROVIDER_HOSTS.some((host) => url.includes(host))) offenders.push(url);
    });

    await page.goto("/places?view=globe");
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await expect(page.locator(".places-globe-canvas canvas")).toBeVisible();
    // The texture licence must be visible in the view that uses it (FR-I-15).
    await expect(page.getByText("Natural Earth")).toBeVisible();
    await page.waitForTimeout(400);
    expect(offenders).toEqual([]);

    // The texture is a local asset, small enough to keep the first render cheap.
    const response = await page.request.get("/places/earth-dark.png");
    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength).toBeLessThan(200 * 1024);
  });

  test("bascule dans les deux sens en conservant filtres, recherche et sélection", async ({ page }) => {
    desktopOnly();
    await page.goto("/places?theme=Voyages&categories=cafe&placeId=abc");
    await page.getByRole("searchbox", { name: "Rechercher un lieu" }).fill("rome");
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByTestId("places-globe")).toBeVisible();
    for (const fragment of [/view=globe/, /theme=Voyages/, /categories=cafe/, /q=rome/, /placeId=abc/]) {
      await expect(page).toHaveURL(fragment);
    }

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/placeId=abc/);
  });

  test("rend précédent et suivant cohérents entre les vues", async ({ page }) => {
    desktopOnly();
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

  test("bascule proprement en 2D quand WebGL est refusé, sans demander le chunk", async ({ page }) => {
    desktopOnly();
    // Deny every WebGL context before any application script runs — the
    // situation of a browser or device that cannot render the globe.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (typeof args[0] === "string" && args[0].includes("webgl")) return null;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const chunkRequests: string[] = [];
    page.on("request", (request) => {
      if (/three|globe/i.test(request.url()) && request.url().includes("/_next/")) chunkRequests.push(request.url());
    });

    await page.goto("/places?view=globe&q=rome");
    await expect(page.getByText(/WebGL indisponible/)).toBeVisible();
    await expect(page.getByTestId("places-globe")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "3D" })).toBeDisabled();
    // The URL is corrected and everything else survives.
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/q=rome/);
    await page.getByRole("button", { name: /Liste/ }).click();
    await expect(page.getByRole("complementary", { name: "Liste des lieux" })).toBeVisible();
    expect(chunkRequests).toEqual([]);
  });

  test("reste utilisable au clavier et ne déborde pas", async ({ page }) => {
    desktopOnly();
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

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("parcours mobile : bascule, globe lisible, aucun débordement", async ({ page }) => {
    mobileOnly();
    await page.goto("/places");
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByTestId("places-globe")).toBeVisible();
    await expect(page.locator(".places-globe-canvas canvas")).toBeVisible();
    await expect(page.getByText("Natural Earth")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
