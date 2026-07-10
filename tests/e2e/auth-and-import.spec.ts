import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const realAuthConfigured = Boolean(adminEmail && adminPassword);
const runDatabaseImport = process.env.E2E_RUN_DB_IMPORT === "true";

test.describe("authentification administrateur réelle", () => {
  test.skip(!realAuthConfigured, "Définir E2E_ADMIN_EMAIL et E2E_ADMIN_PASSWORD.");

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await expectRealLoginForm(page);
  });

  test("refuse des identifiants invalides sans révéler le champ incorrect", async ({ page }) => {
    await page.getByLabel("Adresse e-mail").fill("intrus@example.com");
    await page.getByLabel("Mot de passe").fill("mot-de-passe-incorrect");
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /e-mail ou mot de passe incorrect/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("connecte, protège le cookie puis déconnecte depuis l'interface", async ({ context, page }) => {
    await login(page);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("region", { name: /Publications sauvegardées/i })).toBeVisible();

    const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "mosaic_session");
    expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test("neutralise une cible next externe après connexion", async ({ page }) => {
    await page.goto("/login?next=https://example.net/phishing");
    await expectRealLoginForm(page);
    await login(page);

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("import PostgreSQL idempotent", () => {
  test.skip(!realAuthConfigured, "Définir E2E_ADMIN_EMAIL et E2E_ADMIN_PASSWORD.");
  test.skip(!runDatabaseImport, "Définir E2E_RUN_DB_IMPORT=true sur une base de preview jetable.");

  test("expose un health check public prêt pour Vercel", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      database: "connected",
      authentication: "configured",
    });
  });

  test("importe une seule publication puis permet de l'administrer", async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/login");
    await expectRealLoginForm(page);
    await login(page);

    const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "mosaic_session");
    expect(sessionCookie).toBeDefined();
    const authHeaders = { Cookie: `${sessionCookie!.name}=${sessionCookie!.value}` };

    const nonce = `qa-${randomUUID()}`;
    const postUrl = `https://www.instagram.com/p/${nonce}`;
    const payload = [{
      post_url: postUrl,
      thumbnail_url: "https://scontent.cdninstagram.com/qa-auth-placeholder.jpg",
      username: "qa_auth",
      caption: `Import idempotent ${nonce}`,
      tags: ["qa-auth", nonce],
    }];
    const firstKey = `${nonce}:batch-0`;

    const first = await page.request.post("/api/import?sourceName=qa-auth.json", {
      headers: { ...authHeaders, "Idempotency-Key": firstKey },
      data: payload,
    });
    expect(first.status()).toBe(201);
    const firstReport = await first.json();

    const retry = await page.request.post("/api/import?sourceName=qa-auth.json", {
      headers: { ...authHeaders, "Idempotency-Key": firstKey },
      data: payload,
    });
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toEqual(firstReport);

    const secondJob = await page.request.post("/api/import?sourceName=qa-auth.json", {
      headers: { ...authHeaders, "Idempotency-Key": `${nonce}:batch-1` },
      data: payload,
    });
    expect(secondJob.status()).toBe(201);
    expect(await secondJob.json()).toMatchObject({ imported: 0, updated: 1 });

    const listing = await page.request.get(`/api/posts?q=${encodeURIComponent(nonce)}&limit=48`, {
      headers: authHeaders,
    });
    expect(listing.ok()).toBe(true);
    const pageResult = await listing.json() as {
      items?: Array<{ id: string; postUrl?: string; tags: string[] }>;
    };
    const importedPosts = pageResult.items?.filter((item) => item.postUrl === postUrl) ?? [];
    expect(importedPosts).toHaveLength(1);
    const importedPost = importedPosts[0];

    const addTag = await page.request.post(`/api/posts/${importedPost.id}/tags`, {
      headers: authHeaders,
      data: { tag: "qa-admin" },
    });
    expect(addTag.status()).toBe(201);
    expect(await addTag.json()).toMatchObject({ tags: expect.arrayContaining(["qa-admin"]) });

    const removeTag = await page.request.delete(`/api/posts/${importedPost.id}/tags`, {
      headers: authHeaders,
      data: { tag: "qa-admin" },
    });
    expect(removeTag.ok()).toBe(true);
    expect(await removeTag.json()).not.toMatchObject({ tags: expect.arrayContaining(["qa-admin"]) });

    const removePost = await page.request.delete(`/api/posts/${importedPost.id}`, {
      headers: authHeaders,
    });
    expect(removePost.ok()).toBe(true);

    const afterDelete = await page.request.get(`/api/posts?q=${encodeURIComponent(nonce)}&limit=48`, {
      headers: authHeaders,
    });
    expect(afterDelete.ok()).toBe(true);
    expect((await afterDelete.json() as { items?: unknown[] }).items).toHaveLength(0);
  });
});

async function login(page: Page): Promise<void> {
  await page.getByLabel("Adresse e-mail").fill(adminEmail!);
  await page.getByLabel("Mot de passe").fill(adminPassword!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/$/);
}

async function expectRealLoginForm(page: Page): Promise<void> {
  const bypassNotice = page.getByText(/AUTH_DISABLED=true/i);
  if (await bypassNotice.isVisible().catch(() => false)) {
    throw new Error(
      "Le serveur Playwright utilise le bypass. Démarrer npm run dev séparément avec AUTH_DISABLED=false et les vraies variables auth avant ce test.",
    );
  }
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
}
