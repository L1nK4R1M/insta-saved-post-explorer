#!/usr/bin/env node
// Generates the static Earth texture used by the Places 3D globe (Phase I, D3).
//
// Why generate instead of downloading one:
// decision D3 requires a static, free, optimized texture whose licence, source
// and attribution are documented, and forbids committing anything whose licence
// is not clearly compatible. Rather than fetching a photographic basemap of
// uncertain provenance, this script rasterizes the Natural Earth 1:110m Admin 0
// country polygons — data explicitly released into the **public domain** — into a
// flat Web Mercator raster image. That gives exactly what D3 asks for (continents,
// oceans and main borders), matches the sober dark globe of Concept 2, and keeps
// the provenance auditable: the input ships inside `three-globe` (MIT) and
// the output is reproducible by re-running this script. The package is kept as
// a build-only source-data dependency; it is not imported by the application.
//
//   npm run places:generate-earth-texture
//
// The PNG encoder is written here on purpose: it keeps the repository free of an
// image-processing dependency that only this one asset would need.

import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const WIDTH = 2048;
const HEIGHT = 1024;
const OUTPUT = resolve(ROOT, "public/places/earth-dark.png");

// Sober dark palette: a deep navy ocean, a slate landmass and a lighter border,
// so the luminous place markers stay the brightest thing on the globe.
const PALETTE = [
  [0x0a, 0x15, 0x26], // 0 — ocean
  [0x1e, 0x2f, 0x47], // 1 — land
  [0x3b, 0x52, 0x73], // 2 — border
];
const OCEAN = 0;
const LAND = 1;
const BORDER = 2;

function loadCountries() {
  // Resolved through the build-only `three-globe` package so the input is
  // versioned by the lockfile instead of being a loose copy in the repository.
  // The package restricts its
  // `exports`, so the package root is derived from its main entry point rather
  // than resolving the data file directly.
  const packageRoot = resolve(dirname(require.resolve("three-globe")), "..");
  const path = resolve(packageRoot, "example/country-polygons/ne_110m_admin_0_countries.geojson");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed?.features?.length) throw new Error(`No features found in ${path}`);
  return { path, features: parsed.features };
}

// Web Mercator projection: longitude maps linearly to x and latitude follows the
// same ordinate MapLibre uses for the image source's ±85.051129° world extent.
const toX = (lon) => ((lon + 180) / 360) * WIDTH;
const MAX_LATITUDE = 85.051129;
const toY = (lat) => {
  const clamped = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, lat));
  const radians = (clamped * Math.PI) / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)) * HEIGHT;
};

function ringsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Even-odd scanline fill. Applying it to the outer ring and its holes together
// is what carves lakes and enclaves out of the landmass correctly.
function fillPolygon(pixels, rings) {
  const edges = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const x1 = toX(ring[i][0]);
      const y1 = toY(ring[i][1]);
      const x2 = toX(ring[i + 1][0]);
      const y2 = toY(ring[i + 1][1]);
      if (y1 === y2) continue; // horizontal edges contribute no crossing
      edges.push({ x1, y1, x2, y2 });
      minY = Math.min(minY, y1, y2);
      maxY = Math.max(maxY, y1, y2);
    }
  }
  if (edges.length === 0) return;

  const from = Math.max(0, Math.floor(minY));
  const to = Math.min(HEIGHT - 1, Math.ceil(maxY));
  for (let y = from; y <= to; y += 1) {
    const scan = y + 0.5;
    const crossings = [];
    for (const { x1, y1, x2, y2 } of edges) {
      const lower = Math.min(y1, y2);
      const upper = Math.max(y1, y2);
      if (scan < lower || scan >= upper) continue;
      crossings.push(x1 + ((scan - y1) / (y2 - y1)) * (x2 - x1));
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const end = Math.min(WIDTH - 1, Math.floor(crossings[i + 1] - 0.5));
      for (let x = start; x <= end; x += 1) pixels[y * WIDTH + x] = LAND;
    }
  }
}

function plot(pixels, x, y, value) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  pixels[y * WIDTH + x] = value;
}

// Bresenham, one pixel wide: the borders stay a hint rather than a graphic.
function strokeSegment(pixels, ax, ay, bx, by) {
  let x0 = Math.round(ax);
  let y0 = Math.round(ay);
  const x1 = Math.round(bx);
  const y1 = Math.round(by);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  // Guard against a pathological segment spanning the whole texture.
  for (let guard = 0; guard <= dx - dy + 4; guard += 1) {
    plot(pixels, x0, y0, BORDER);
    if (x0 === x1 && y0 === y1) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function strokePolygon(pixels, rings) {
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const ax = toX(ring[i][0]);
      const ay = toY(ring[i][1]);
      const bx = toX(ring[i + 1][0]);
      const by = toY(ring[i + 1][1]);
      // A segment that appears to span the texture is an antimeridian artefact;
      // drawing it would streak a line across the whole map.
      if (Math.abs(ax - bx) > WIDTH / 2) continue;
      strokeSegment(pixels, ax, ay, bx, by);
    }
  }
}

// --- Minimal indexed-colour PNG encoder -----------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(3, 9); // colour type 3 — indexed
  // compression, filter and interlace methods are all 0.

  const palette = Buffer.concat(PALETTE.map((rgb) => Buffer.from(rgb)));

  // One filter byte per row. Filter 0 (None) compresses best here: the image is
  // made of long identical runs, which deflate already handles optimally.
  const raw = Buffer.alloc(HEIGHT * (WIDTH + 1));
  for (let y = 0; y < HEIGHT; y += 1) {
    const offset = y * (WIDTH + 1);
    raw[offset] = 0;
    for (let x = 0; x < WIDTH; x += 1) raw[offset + 1 + x] = pixels[y * WIDTH + x];
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Main ------------------------------------------------------------------

const { path, features } = loadCountries();
const pixels = new Uint8Array(WIDTH * HEIGHT).fill(OCEAN);

for (const feature of features) {
  for (const rings of ringsOf(feature.geometry)) fillPolygon(pixels, rings);
}
// Borders are stroked after every landmass is filled, so a shared border is not
// painted over by the neighbouring country.
for (const feature of features) {
  for (const rings of ringsOf(feature.geometry)) strokePolygon(pixels, rings);
}

const png = encodePng(pixels);
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, png);

const land = pixels.reduce((count, value) => (value === OCEAN ? count : count + 1), 0);
console.log(`source     ${path.replace(`${ROOT}/`, "")}`);
console.log(`countries  ${features.length}`);
console.log(`size       ${WIDTH}x${HEIGHT}`);
console.log(`land+border ${((land / pixels.length) * 100).toFixed(1)}% of pixels`);
console.log(`written    ${OUTPUT.replace(`${ROOT}/`, "")} (${(png.length / 1024).toFixed(1)} KiB)`);
