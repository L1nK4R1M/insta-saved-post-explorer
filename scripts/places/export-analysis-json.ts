import { execFile } from "node:child_process";
import { loadEnvFile } from "node:process";
import { promisify } from "node:util";

import {
  buildPlacesAnalysisInput,
  DEFAULT_ANALYSIS_JSON_OUTPUT,
  MAX_ANALYSIS_EXPORT_RECORDS,
  parsePlacesAnalysisExportArgs,
  resolvePlacesTargetDatabase,
  resolveSafeAnalysisOutputPath,
  sanitizePlacesAnalysisExportError,
  writePlacesAnalysisInputFile,
} from "@/server/places/analysis-json-export";

const execFileAsync = promisify(execFile);

async function gitOutput(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    });
    return stdout.trim();
  } catch {
    throw Object.assign(new Error("GIT_SOURCE_UNAVAILABLE"), {
      code: "GIT_SOURCE_UNAVAILABLE",
    });
  }
}

function writeLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

function loadLocalEnvironment(): void {
  // Explicit shell variables retain priority. Loading .env.local before .env
  // gives the usual local override semantics without adding a dotenv dependency.
  for (const file of [".env.local", ".env"]) {
    try {
      loadEnvFile(file);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        (error as { code?: string }).code !== "ENOENT"
      ) {
        throw Object.assign(new Error("ENV_LOAD_FAILED"), {
          code: "ENV_LOAD_FAILED",
        });
      }
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const args = parsePlacesAnalysisExportArgs(process.argv.slice(2));
  const target = resolvePlacesTargetDatabase(args.target, process.env);
  const ownerId = args.owner?.trim() || process.env.APP_OWNER_ID?.trim() || "local";
  const outputPath = args.output || DEFAULT_ANALYSIS_JSON_OUTPUT;

  // Validate the path before opening any database connection.
  const safeOutput = await resolveSafeAnalysisOutputPath(
    process.cwd(),
    outputPath,
  );
  process.env.DATABASE_URL = target.databaseUrl;

  // Database modules are loaded only after the explicit target has been
  // selected. This prevents Prisma from binding to an ambient DATABASE_URL.
  const [
    { exportCaptionBatch, loadPlacesExportPreflightCounts },
    { PLACES_ANALYSIS_VERSION },
    { prisma },
  ] = await Promise.all([
    import("@/server/places/caption-batch"),
    import("@/server/places/jobs"),
    import("@/server/db"),
  ]);

  try {
    const [developCommit, workingTree, counts] = await Promise.all([
      gitOutput(["rev-parse", "origin/develop"]),
      gitOutput(["status", "--short"]),
      loadPlacesExportPreflightCounts(ownerId),
    ]);
    const expectedPosts = args.postId
      ? Math.min(1, counts.eligibleCount)
      : args.all
        ? counts.eligibleCount
        : Math.min(args.limit ?? 100, counts.eligibleCount);

    writeLine("PLACES_ANALYSIS_JSON_EXPORT_PREFLIGHT");
    writeLine(`develop_head=${developCommit}`);
    writeLine(`working_tree=${workingTree ? "dirty" : "clean"}`);
    writeLine(`target=${target.sanitized.target}`);
    writeLine(`database_host=${target.sanitized.hostname}`);
    writeLine(`database_name=${target.sanitized.database}`);
    writeLine(`database_ssl=${target.sanitized.ssl ?? "none"}`);
    writeLine(`owner=${ownerId}`);
    writeLine(`total_posts=${counts.totalPosts}`);
    writeLine(`voyages_count=${counts.voyagesCount}`);
    writeLine(`restaurant_count=${counts.restaurantCount}`);
    writeLine(`posts_to_export=${expectedPosts}`);
    writeLine("business_writes=false");

    writeLine("PLACES_ANALYSIS_JSON_EXPORT_READY");
    writeLine(`target=${target.sanitized.target}`);
    writeLine(`owner=${ownerId}`);
    writeLine(`expected_posts=${expectedPosts}`);
    writeLine("read_only=true");
    writeLine(`output=${outputPath}`);

    const records = await exportCaptionBatch({
      ownerId,
      all: args.all,
      limit: args.all ? MAX_ANALYSIS_EXPORT_RECORDS : args.limit,
      postId: args.postId,
      // A complete analysis handoff always includes current inputs even when an
      // older successful analysis exists.
      force: true,
      analysisVersion: PLACES_ANALYSIS_VERSION,
    });
    const document = buildPlacesAnalysisInput(records, {
      repository: "L1nK4R1M/insta-saved-post-explorer",
      branch: "develop",
      commit: developCommit,
      target: args.target,
      owner_id: ownerId,
      analysis_version: PLACES_ANALYSIS_VERSION,
    });
    const report = await writePlacesAnalysisInputFile({
      repositoryRoot: process.cwd(),
      outputPath: safeOutput,
      document,
    });

    if (report.warningLargeFile) {
      writeLine("warning=PRIMARY_FILE_EXCEEDS_40_MIB");
      writeLine(`part_count=${report.parts.length}`);
    }
    writeLine(`record_count=${document.summary.record_count}`);
    writeLine(`voyages_count=${document.summary.voyages_count}`);
    writeLine(`restaurant_count=${document.summary.restaurant_count}`);
    writeLine(`output=${report.relativePath}`);
    writeLine(`bytes=${report.bytes}`);
    writeLine(`sha256=${report.sha256}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const code = sanitizePlacesAnalysisExportError(error);
    process.stderr.write(`PLACES_ANALYSIS_JSON_EXPORT_FAILED code=${code}\n`);
    if (code === "TARGET_DATABASE_NOT_CONFIGURED") {
      const targetIndex = process.argv.indexOf("--target");
      const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : "";
      const variable =
        target === "develop"
          ? "PLACES_DEVELOP_DATABASE_URL"
          : "PLACES_PRODUCTION_DATABASE_URL";
      process.stderr.write(
        `instruction=configure ${variable} with the intended PostgreSQL read-only DSN and sslmode=require\n`,
      );
    }
    process.exit(1);
  });
