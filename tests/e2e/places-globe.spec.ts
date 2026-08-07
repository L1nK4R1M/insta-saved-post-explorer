import { expect, test } from "@playwright/test";

const expectedGlobeAttribution = process.env.NEXT_PUBLIC_PLACES_TILE_URL ? "OpenStreetMap" : "Natural Earth";

// Phase I browser coverage, limited to the cross-cutting journeys that unit and
// component tests cannot prove: real routing, a real MapLibre canvas, a real
// WebGL context and real layout. Rules already proven by a unit test are not
// replayed here.
//
// Like the Phase G suite, the e2e environment has no database, so the page
// renders its empty state. With no tile URL the globe uses the versioned local
// texture; a smoke may opt into a public raster URL to exercise the configured
// tile path.
//
// Project scoping is declarative (see playwright.config.ts): untagged scenarios
// run on desktop only, and the single `@mobile @mobile-only` journey runs on the
// real mobile device. Nothing is skipped at runtime, so the report shows work
// actually done rather than a wall of skips.

const PROVIDER_HOSTS = ["geoapify", "mapbox", "cesium", "openstreetmap", "unpkg", "jsdelivr", "cdn."];

test.describe("page Places — vue 3D", () => {
  test("garde la 2D par défaut sans monter la vue globe", async ({ page }) => {
    await page.goto("/places");
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".places-globe-canvas")).toHaveCount(0);
    // A historical URL must not gain a view parameter it never had.
    await expect(page).toHaveURL(/\/places$/);
    // An explicit view=map behaves identically and stays clean.
    await page.goto("/places?view=map");
    await expect(page).toHaveURL(/\/places$/);
    await expect(page.locator(".places-globe-canvas")).toHaveCount(0);
  });

  test("rend le globe et l'attribution de sa source de fond", async ({ page }) => {
    const offenders: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) return;
      if (PROVIDER_HOSTS.some((host) => url.includes(host))) offenders.push(url);
    });

    await page.goto("/places?view=globe");
    await expect(page.locator(".places-globe-canvas")).toBeVisible();
    await expect(page.locator(".places-globe-canvas canvas")).toBeVisible();
    // The active base source's attribution must be visible in the globe.
    await expect(page.getByText(expectedGlobeAttribution)).toBeVisible();
    await page.waitForTimeout(400);
    const configuredTileHost = process.env.NEXT_PUBLIC_PLACES_TILE_URL
      ? new URL(process.env.NEXT_PUBLIC_PLACES_TILE_URL).hostname
      : null;
    if (configuredTileHost) {
      expect(offenders.every((url) => url.includes(configuredTileHost))).toBe(true);
    } else {
      expect(offenders).toEqual([]);
    }

    // The texture is a local asset, small enough to keep the first render cheap.
    const response = await page.request.get("/places/earth-dark.png");
    expect(response.status()).toBe(200);
    expect((await response.body()).byteLength).toBeLessThan(200 * 1024);
  });

  test("bascule dans les deux sens en conservant filtres, recherche et sélection", async ({ page }) => {
    await page.goto("/places?theme=Voyages&categories=cafe&placeId=abc");
    await page.getByRole("searchbox", { name: "Rechercher un lieu" }).fill("rome");
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.locator(".places-globe-canvas")).toBeVisible();
    if (process.env.NEXT_PUBLIC_PLACES_TILE_URL) {
      await page.evaluate(() => {
        (window as unknown as { placesCanvasBefore?: HTMLCanvasElement }).placesCanvasBefore = document.querySelector(
          ".places-globe-canvas canvas",
        ) as HTMLCanvasElement;
      });
    }
    for (const fragment of [/view=globe/, /theme=Voyages/, /categories=cafe/, /q=rome/, /placeId=abc/]) {
      await expect(page).toHaveURL(fragment);
    }

    await page.getByRole("button", { name: "2D" }).click();
    if (process.env.NEXT_PUBLIC_PLACES_TILE_URL) {
      await expect(page.locator(".places-map-canvas")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { placesCanvasBefore?: HTMLCanvasElement }).placesCanvasBefore ===
              document.querySelector(".places-map-canvas canvas"),
          ),
        )
        .toBe(true);
    } else {
      await expect(page.locator(".places-globe-canvas")).toHaveCount(0);
    }
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/placeId=abc/);
  });

  test("rend précédent et suivant cohérents entre les vues", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.locator(".places-globe-canvas")).toBeVisible();

    await page.goBack();
    await expect(page.locator(".places-globe-canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");

    await page.goForward();
    await expect(page.locator(".places-globe-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  });

  test("reste utilisable quand WebGL2 est refusé, sans canvas MapLibre", async ({ page }) => {
    // Deny every WebGL context before any application script runs — the
    // situation of a browser or device that cannot render the globe.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (typeof args[0] === "string" && args[0].includes("webgl")) return null;
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto("/places?view=globe&q=rome");
    await expect(page.getByTestId("places-map-unavailable")).toContainText("WebGL2 indisponible");
    await expect(page.locator(".places-globe-canvas")).toHaveCount(0);
    await expect(page.locator(".places-map-canvas canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "3D" })).toBeDisabled();
    // The URL is corrected and everything else survives.
    await expect(page).not.toHaveURL(/view=globe/);
    await expect(page).toHaveURL(/q=rome/);
    await page.getByRole("button", { name: /Liste/ }).click();
    await expect(page.getByRole("complementary", { name: "Liste des lieux" })).toBeVisible();
  });

  test("reste utilisable au clavier et ne déborde pas", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("button", { name: "Filtres" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "2D" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "3D" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".places-globe-canvas")).toBeVisible();
    // The globe canvas must not swallow focus.
    await page.keyboard.press("Tab");
    await expect(page.locator(".places-globe-canvas")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // The only scenario that needs the real mobile device: touch input, device
  // pixel ratio and the small-screen layout together.
  test("parcours mobile : bascule, globe lisible, aucun débordement @mobile @mobile-only", async ({ page }) => {
    await page.goto("/places");
    const switchBounds = await page.locator(".places-segmented").boundingBox();
    const stageBounds = await page.locator(".places-stage").boundingBox();
    const viewport = page.viewportSize();
    expect(switchBounds).not.toBeNull();
    expect(stageBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(switchBounds!.x).toBeGreaterThanOrEqual(stageBounds!.x);
    expect(switchBounds!.x + switchBounds!.width).toBeLessThanOrEqual(stageBounds!.x + stageBounds!.width);
    expect(switchBounds!.x + switchBounds!.width).toBeLessThanOrEqual(viewport!.width);
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.locator(".places-globe-canvas")).toBeVisible();
    await expect(page.locator(".places-globe-canvas canvas")).toBeVisible();
    await expect(page.getByText(expectedGlobeAttribution)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
