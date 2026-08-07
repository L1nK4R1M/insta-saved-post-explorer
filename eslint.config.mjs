import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  // public/maplibre holds minified MapLibre files copied verbatim from
  // node_modules by scripts/places/sync-maplibre-worker.mjs. They are vendor
  // output, not source, so linting them is noise.
  globalIgnores([
    ".next/**",
    ".tmp/**",
    "coverage/**",
    "playwright-report/**",
    "public/maplibre/**",
    "services/worker/dist/**",
  ]),
]);
