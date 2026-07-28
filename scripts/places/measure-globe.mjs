#!/usr/bin/env node
// Phase I performance harness (decision D6).
//
// The budgets are measurable, not decorative, so this script measures the real
// page against a real database rather than estimating. It:
//   1. seeds a LOCAL PostgreSQL database with N synthetic places,
//   2. drives the built application in Chromium,
//   3. records the time to first globe render and the frame rate while rotating.
//
// It never touches a deployed database. `DATABASE_URL` must point at a local
// throwaway database; the script refuses anything that looks remote.
//
//   node scripts/places/measure-globe.mjs --counts 100,500,1000 --url http://127.0.0.1:3000
//
// Results are reported as measured. If a budget is missed, report the number —
// do not relax the budget.

import { PrismaClient } from "@prisma/client";
import { chromium, devices } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const COUNTS = (args.get("counts") ?? "100,500,1000").split(",").map(Number);
const BASE_URL = args.get("url") ?? "http://127.0.0.1:3000";
const OWNER_ID = args.get("owner") ?? "perf-owner";
const SAMPLE_MS = Number(args.get("sample") ?? 4000);

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1|\/var\/lib\/postgresql/.test(databaseUrl)) {
  throw new Error("Refusing to run: DATABASE_URL must point at a local throwaway database.");
}

const prisma = new PrismaClient();

const PRECISIONS = ["EXACT", "PROBABLE", "APPROXIMATE"];

// Deterministic pseudo-random so two runs measure the same scene.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seed(count) {
  await prisma.postPlace.deleteMany({ where: { ownerId: OWNER_ID } });
  await prisma.place.deleteMany({ where: { ownerId: OWNER_ID } });

  const random = mulberry32(count);
  const rows = Array.from({ length: count }, (_, index) => {
    const precision = PRECISIONS[index % PRECISIONS.length];
    return {
      ownerId: OWNER_ID,
      displayName: `Lieu de test ${index}`,
      normalizedName: `lieu de test ${index}`,
      category: index % 2 === 0 ? "catering.restaurant" : "catering.cafe",
      provider: "perf",
      providerPlaceId: `perf-${index}`,
      city: `Ville ${index % 120}`,
      country: `Pays ${index % 40}`,
      countryCode: String.fromCharCode(65 + (index % 26), 65 + Math.floor(index / 26) % 26),
      latitude: (random() - 0.5) * 170,
      longitude: (random() - 0.5) * 360,
      precision,
      confidence: 0.5 + random() * 0.5,
      approximationRadiusMeters: precision === "APPROXIMATE" ? 2_000 + Math.floor(random() * 20_000) : null,
    };
  });

  await prisma.place.createMany({ data: rows });
  return count;
}

async function measure(page, count) {
  await page.goto(`${BASE_URL}/places`, { waitUntil: "networkidle" });

  // Time to first globe render: from the click that requests the 3D view until
  // the engine has actually presented a frame.
  const startedAt = Date.now();
  await page.getByRole("button", { name: "3D" }).click();
  await page.locator(".places-globe-canvas canvas").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".places-globe-canvas canvas");
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    },
    { timeout: 30_000 },
  );
  const firstRenderMs = Date.now() - startedAt;

  // Frame rate while the camera is actually moving: a static globe would report
  // a flattering number that says nothing about interaction.
  const fps = await page.evaluate(async (sampleMs) => {
    const canvas = document.querySelector(".places-globe-canvas canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const drag = (type, x, y) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0 }));

    let frames = 0;
    const start = performance.now();
    let running = true;
    const tick = () => {
      frames += 1;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    drag("pointerdown", cx, cy);
    const steps = Math.floor(sampleMs / 16);
    for (let i = 0; i < steps; i += 1) {
      drag("pointermove", cx + Math.sin(i / 12) * 160, cy + Math.cos(i / 18) * 60);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    drag("pointerup", cx, cy);

    running = false;
    const elapsed = performance.now() - start;
    return Math.round((frames / elapsed) * 1000);
  }, SAMPLE_MS);

  return { count, firstRenderMs, fps };
}

const profiles = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["mobile", devices["Pixel 7"]],
];

const results = [];
for (const count of COUNTS) {
  await seed(count);
  for (const [label, options] of profiles) {
    const browser = await chromium.launch();
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const result = await measure(page, count);
    results.push({ profile: label, ...result });
    console.log(
      `${label.padEnd(8)} ${String(count).padStart(5)} places   first render ${String(result.firstRenderMs).padStart(5)} ms   ${String(result.fps).padStart(3)} fps`,
    );
    await browser.close();
  }
}

const renderer = await (async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const info = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "none";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
  await browser.close();
  return info;
})();

console.log("");
console.log(`WebGL renderer: ${renderer}`);
console.log(JSON.stringify(results, null, 2));

await prisma.postPlace.deleteMany({ where: { ownerId: OWNER_ID } });
await prisma.place.deleteMany({ where: { ownerId: OWNER_ID } });
await prisma.$disconnect();
