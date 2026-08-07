#!/usr/bin/env node
// Keeps public/maplibre in sync with the installed maplibre-gl.
//
// Why this exists: MapLibre 6 ships its worker as a separate ESM file and finds
// it from `import.meta.url`. Turbopack does not expose an http(s) `import.meta.url`
// inside the bundled chunk, so MapLibre's own resolver returns an empty string and
// builds `new Worker("", { type: "module" })`. That does not throw — the worker
// loads the HTML document as a module, dies on the parse error, and every GeoJSON
// source stays unloaded. The map renders its raster tiles and nothing else, with
// no console error at all.
//
// The renderer therefore calls `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")`,
// which requires those files to be served as static assets. Copying them here on
// every build is what stops the vendored copy from drifting away from the
// installed package.
//
// The worker imports "./maplibre-gl-shared.mjs" as a sibling, so both files must
// be copied together and keep their names.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "maplibre");
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function main() {
  const check = process.argv.includes("--check");

  const { version } = JSON.parse(
    await readFile(join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"),
  );

  // A missing dist file means the package layout changed; failing loudly here is
  // better than shipping a blank map again.
  const available = await readdir(source);
  const missing = FILES.filter((file) => !available.includes(file));
  if (missing.length > 0) {
    console.error(`maplibre-gl ${version} does not ship ${missing.join(", ")}.`);
    console.error("The worker layout changed; revisit setWorkerUrl in places-map.tsx.");
    process.exit(1);
  }

  await mkdir(target, { recursive: true });

  let stale = 0;
  for (const file of FILES) {
    const from = await readFile(join(source, file));
    const to = await readFile(join(target, file)).catch(() => null);
    if (to && sha(from) === sha(to)) continue;
    stale += 1;
    if (check) {
      console.error(`public/maplibre/${file} is out of date with maplibre-gl ${version}.`);
      continue;
    }
    await writeFile(join(target, file), from);
    console.log(`synced public/maplibre/${file} (maplibre-gl ${version})`);
  }

  if (check && stale > 0) {
    console.error("Run `npm run places:sync-maplibre-worker` and commit the result.");
    process.exit(1);
  }
  if (stale === 0) console.log(`public/maplibre is in sync with maplibre-gl ${version}.`);
}

await main();
