import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { MAX_CANDIDATES_PER_POST } from "@/lib/places/candidates";
import type { CaptionBatchRecord } from "@/server/places/caption-batch";

export const PLACES_ANALYSIS_INPUT_SCHEMA_VERSION =
  "places-caption-analysis-input-v3" as const;
export const DEFAULT_ANALYSIS_JSON_OUTPUT =
  ".tmp/places/places-analysis-input.json";
export const MAX_ANALYSIS_EXPORT_RECORDS = 10_000;
export const SINGLE_FILE_WARNING_BYTES = 40 * 1024 * 1024;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const ELIGIBLE_THEMES = ["Voyages", "Restaurant"] as const;
const TARGETS = ["develop", "production"] as const;

export type PlacesAnalysisTarget = (typeof TARGETS)[number];

export class PlacesAnalysisExportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PlacesAnalysisExportError";
  }
}

export function sanitizePlacesAnalysisExportError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;
  }
  return "EXPORT_FAILED";
}

const analysisRecordSchema = z
  .object({
    post_id: z.string().trim().min(1).max(200),
    main_theme: z.enum(ELIGIBLE_THEMES),
    caption: z.string(),
    hashtags: z.array(z.string().min(1)),
    mentions: z.array(z.string().min(1)),
    internal_tags: z.array(z.string()),
    author_username: z.string(),
    instagram_location: z.string().nullable(),
    input_hash: z.string().regex(SHA256_HEX),
    analysis_version: z.string().trim().min(1).max(120),
  })
  .strict();

const sourceSchema = z
  .object({
    repository: z.literal("L1nK4R1M/insta-saved-post-explorer"),
    branch: z.literal("develop"),
    commit: z.string().regex(FULL_GIT_SHA),
    target: z.enum(TARGETS),
    owner_id: z.string().trim().min(1),
    analysis_version: z.string().trim().min(1).max(120),
  })
  .strict();

const summarySchema = z
  .object({
    record_count: z.number().int().nonnegative().max(MAX_ANALYSIS_EXPORT_RECORDS),
    voyages_count: z.number().int().nonnegative(),
    restaurant_count: z.number().int().nonnegative(),
  })
  .strict();

const candidateOutputContractSchema = z
  .object({
    format: z.literal("jsonl"),
    maximum_candidates_per_post: z.literal(MAX_CANDIDATES_PER_POST),
    coordinates_forbidden: z.literal(true),
    provider_fields_forbidden: z.literal(true),
    precision_field_forbidden: z.literal(true),
    required_identity_fields: z.tuple([
      z.literal("post_id"),
      z.literal("input_hash"),
      z.literal("analysis_version"),
    ]),
    required_candidate_fields: z.tuple([
      z.literal("name"),
      z.literal("address"),
      z.literal("city"),
      z.literal("region"),
      z.literal("country"),
      z.literal("category"),
      z.literal("confidence"),
      z.literal("evidence"),
    ]),
    nullable_candidate_fields: z.tuple([
      z.literal("name"),
      z.literal("address"),
      z.literal("city"),
      z.literal("region"),
      z.literal("country"),
    ]),
  })
  .strict();

export const placesAnalysisInputSchema = z
  .object({
    schema_version: z.literal(PLACES_ANALYSIS_INPUT_SCHEMA_VERSION),
    generated_at: z.string().datetime({ offset: true }),
    source: sourceSchema,
    summary: summarySchema,
    candidate_output_contract: candidateOutputContractSchema,
    records: z.array(analysisRecordSchema).max(MAX_ANALYSIS_EXPORT_RECORDS),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>();
    let voyagesCount = 0;
    let restaurantCount = 0;

    for (const [index, record] of document.records.entries()) {
      if (ids.has(record.post_id)) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "post_id"],
          message: "DUPLICATE_POST_ID",
        });
      }
      ids.add(record.post_id);
      if (record.main_theme === "Voyages") voyagesCount += 1;
      if (record.main_theme === "Restaurant") restaurantCount += 1;
      if (record.analysis_version !== document.source.analysis_version) {
        context.addIssue({
          code: "custom",
          path: ["records", index, "analysis_version"],
          message: "ANALYSIS_VERSION_MISMATCH",
        });
      }
    }

    if (document.summary.record_count !== document.records.length) {
      context.addIssue({
        code: "custom",
        path: ["summary", "record_count"],
        message: "RECORD_COUNT_MISMATCH",
      });
    }
    if (document.summary.voyages_count !== voyagesCount) {
      context.addIssue({
        code: "custom",
        path: ["summary", "voyages_count"],
        message: "VOYAGES_COUNT_MISMATCH",
      });
    }
    if (document.summary.restaurant_count !== restaurantCount) {
      context.addIssue({
        code: "custom",
        path: ["summary", "restaurant_count"],
        message: "RESTAURANT_COUNT_MISMATCH",
      });
    }
  });

export type PlacesAnalysisInput = z.infer<typeof placesAnalysisInputSchema>;
export type PlacesAnalysisSource = z.infer<typeof sourceSchema>;

function extractTokens(caption: string, expression: RegExp): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of caption.matchAll(expression)) {
    const token = match[1];
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

export function extractOriginalHashtags(caption: string): string[] {
  return extractTokens(caption, /(?<![\p{L}\p{N}_])(#[\p{L}\p{N}_]+)/gu);
}

export function extractOriginalMentions(caption: string): string[] {
  return extractTokens(caption, /(?<![A-Za-z0-9._])(@[A-Za-z0-9._]+)/g);
}

export function buildPlacesAnalysisInput(
  records: CaptionBatchRecord[],
  source: PlacesAnalysisSource,
  generatedAt = new Date(),
): PlacesAnalysisInput {
  const document = {
    schema_version: PLACES_ANALYSIS_INPUT_SCHEMA_VERSION,
    generated_at: generatedAt.toISOString(),
    source,
    summary: {
      record_count: records.length,
      voyages_count: records.filter((record) => record.main_theme === "Voyages")
        .length,
      restaurant_count: records.filter(
        (record) => record.main_theme === "Restaurant",
      ).length,
    },
    candidate_output_contract: {
      format: "jsonl",
      maximum_candidates_per_post: MAX_CANDIDATES_PER_POST,
      coordinates_forbidden: true,
      provider_fields_forbidden: true,
      precision_field_forbidden: true,
      required_identity_fields: [
        "post_id",
        "input_hash",
        "analysis_version",
      ],
      required_candidate_fields: [
        "name",
        "address",
        "city",
        "region",
        "country",
        "category",
        "confidence",
        "evidence",
      ],
      nullable_candidate_fields: [
        "name",
        "address",
        "city",
        "region",
        "country",
      ],
    },
    records: records.map((record) => ({
      post_id: record.post_id,
      main_theme: record.main_theme,
      caption: record.caption,
      hashtags: extractOriginalHashtags(record.caption),
      mentions: extractOriginalMentions(record.caption),
      internal_tags: record.internal_tags,
      author_username: record.author_username,
      instagram_location: record.instagram_location,
      input_hash: record.input_hash,
      analysis_version: record.analysis_version,
    })),
  };

  const parsed = placesAnalysisInputSchema.safeParse(document);
  if (!parsed.success) {
    throw new PlacesAnalysisExportError("EXPORT_VALIDATION_FAILED");
  }
  return parsed.data;
}

export type PlacesAnalysisExportArgs = {
  all: boolean;
  target: PlacesAnalysisTarget;
  owner?: string;
  postId?: string;
  limit?: number;
  output?: string;
};

function requireFlagValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
  }
  return value;
}

export function parsePlacesAnalysisExportArgs(
  argv: string[],
): PlacesAnalysisExportArgs {
  const args: Partial<PlacesAnalysisExportArgs> = { all: false };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--all":
        args.all = true;
        break;
      case "--target": {
        const value = requireFlagValue(argv, index);
        index += 1;
        if (!TARGETS.includes(value as PlacesAnalysisTarget)) {
          throw new PlacesAnalysisExportError("TARGET_INVALID");
        }
        args.target = value as PlacesAnalysisTarget;
        break;
      }
      case "--owner":
        args.owner = requireFlagValue(argv, index).trim();
        index += 1;
        break;
      case "--post-id":
        args.postId = requireFlagValue(argv, index).trim();
        index += 1;
        break;
      case "--limit": {
        const value = Number(requireFlagValue(argv, index));
        index += 1;
        if (
          !Number.isInteger(value) ||
          value < 1 ||
          value > MAX_ANALYSIS_EXPORT_RECORDS
        ) {
          throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
        }
        args.limit = value;
        break;
      }
      case "--output":
        args.output = requireFlagValue(argv, index);
        index += 1;
        break;
      default:
        throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
    }
  }

  if (!args.target) {
    throw new PlacesAnalysisExportError("TARGET_REQUIRED");
  }
  if (args.all && args.limit !== undefined) {
    throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
  }
  if (args.owner !== undefined && !args.owner) {
    throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
  }
  if (args.postId !== undefined && !args.postId) {
    throw new PlacesAnalysisExportError("ARGUMENT_INVALID");
  }

  return args as PlacesAnalysisExportArgs;
}

type Environment = Record<string, string | undefined>;

export type ResolvedPlacesTarget = {
  databaseUrl: string;
  sanitized: {
    target: PlacesAnalysisTarget;
    hostname: string;
    database: string;
    ssl: string | null;
  };
};

function isLocalDatabaseHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function resolvePlacesTargetDatabase(
  target: PlacesAnalysisTarget,
  environment: Environment,
): ResolvedPlacesTarget {
  const variable =
    target === "production"
      ? "PLACES_PRODUCTION_DATABASE_URL"
      : "PLACES_DEVELOP_DATABASE_URL";
  const databaseUrl = environment[variable]?.trim();
  if (!databaseUrl) {
    throw new PlacesAnalysisExportError("TARGET_DATABASE_NOT_CONFIGURED");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new PlacesAnalysisExportError("TARGET_DATABASE_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.pathname.slice(1)
  ) {
    throw new PlacesAnalysisExportError("TARGET_DATABASE_INVALID");
  }

  const ssl = parsed.searchParams.get("sslmode");
  if (
    !isLocalDatabaseHost(parsed.hostname) &&
    !["require", "verify-ca", "verify-full"].includes(ssl ?? "")
  ) {
    throw new PlacesAnalysisExportError("TARGET_SSL_REQUIRED");
  }

  return {
    databaseUrl,
    sanitized: {
      target,
      hostname: parsed.hostname,
      database: decodeURIComponent(parsed.pathname.slice(1)),
      ssl,
    },
  };
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function findExistingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        (error as { code?: string }).code !== "ENOENT"
      ) {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function resolveSafeAnalysisOutputPath(
  repositoryRoot: string,
  candidate: string,
): Promise<string> {
  const root = path.resolve(repositoryRoot);
  const output = path.resolve(root, candidate);
  const temporaryRoot = path.join(root, ".tmp");

  if (
    output === root ||
    output === temporaryRoot ||
    !isInside(temporaryRoot, output)
  ) {
    throw new PlacesAnalysisExportError("OUTPUT_PATH_UNSAFE");
  }

  const rootReal = await realpath(root);
  const ancestor = await findExistingAncestor(path.dirname(output));
  const ancestorReal = await realpath(ancestor);
  if (!isInside(rootReal, ancestorReal)) {
    throw new PlacesAnalysisExportError("OUTPUT_PATH_UNSAFE");
  }

  try {
    const outputState = await lstat(output);
    if (outputState.isSymbolicLink() || outputState.isDirectory()) {
      throw new PlacesAnalysisExportError("OUTPUT_PATH_UNSAFE");
    }
  } catch (error) {
    if (
      error instanceof PlacesAnalysisExportError ||
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      (error as { code?: string }).code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return output;
}

type WrittenFile = {
  absolutePath: string;
  relativePath: string;
  bytes: number;
  sha256: string;
};

export type PlacesAnalysisWriteReport = WrittenFile & {
  warningLargeFile: boolean;
  parts: WrittenFile[];
};

async function writeValidatedFile(
  repositoryRoot: string,
  outputPath: string,
  document: unknown,
): Promise<WrittenFile> {
  const output = await resolveSafeAnalysisOutputPath(
    repositoryRoot,
    outputPath,
  );
  const outputDirectory = path.dirname(output);
  await mkdir(outputDirectory, { recursive: true });

  const rootReal = await realpath(path.resolve(repositoryRoot));
  const temporaryRootReal = await realpath(
    path.join(path.resolve(repositoryRoot), ".tmp"),
  );
  const outputDirectoryReal = await realpath(outputDirectory);
  if (
    !isInside(rootReal, temporaryRootReal) ||
    !isInside(temporaryRootReal, outputDirectoryReal)
  ) {
    throw new PlacesAnalysisExportError("OUTPUT_PATH_UNSAFE");
  }

  const parsed = placesAnalysisInputSchema.safeParse(document);
  if (!parsed.success) {
    throw new PlacesAnalysisExportError("EXPORT_VALIDATION_FAILED");
  }

  const serialized = `${JSON.stringify(parsed.data, null, 2)}\n`;
  const temporaryPath = `${output}.partial-${process.pid}-${randomBytes(6).toString("hex")}`;

  try {
    await writeFile(temporaryPath, serialized, {
      encoding: "utf8",
      flag: "wx",
    });
    const written = await readFile(temporaryPath, "utf8");
    const reparsed = placesAnalysisInputSchema.safeParse(JSON.parse(written));
    if (!reparsed.success) {
      throw new PlacesAnalysisExportError("EXPORT_VALIDATION_FAILED");
    }
    const bytes = Buffer.byteLength(written);
    const sha256 = createHash("sha256").update(written).digest("hex");
    await rename(temporaryPath, output);
    return {
      absolutePath: output,
      relativePath: path.relative(repositoryRoot, output),
      bytes,
      sha256,
    };
  } catch (error) {
    if (error instanceof PlacesAnalysisExportError) throw error;
    throw new PlacesAnalysisExportError("EXPORT_WRITE_FAILED");
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function buildAutonomousParts(
  document: PlacesAnalysisInput,
  threshold: number,
): PlacesAnalysisInput[] {
  const parts: PlacesAnalysisInput[] = [];
  let current: CaptionBatchRecord[] = [];

  const asCaptionRecord = (
    record: PlacesAnalysisInput["records"][number],
  ): CaptionBatchRecord => ({
    post_id: record.post_id,
    main_theme: record.main_theme,
    caption: record.caption,
    hashtags: record.hashtags,
    internal_tags: record.internal_tags,
    author_username: record.author_username,
    instagram_location: record.instagram_location,
    input_hash: record.input_hash,
    analysis_version: record.analysis_version,
  });

  for (const record of document.records) {
    const next = [...current, asCaptionRecord(record)];
    const nextDocument = buildPlacesAnalysisInput(
      next,
      document.source,
      new Date(document.generated_at),
    );
    const nextBytes = Buffer.byteLength(
      `${JSON.stringify(nextDocument, null, 2)}\n`,
    );
    if (current.length > 0 && nextBytes > threshold) {
      parts.push(
        buildPlacesAnalysisInput(
          current,
          document.source,
          new Date(document.generated_at),
        ),
      );
      current = [asCaptionRecord(record)];
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    parts.push(
      buildPlacesAnalysisInput(
        current,
        document.source,
        new Date(document.generated_at),
      ),
    );
  }
  return parts;
}

export async function writePlacesAnalysisInputFile(input: {
  repositoryRoot: string;
  outputPath: string;
  document: unknown;
  partThresholdBytes?: number;
}): Promise<PlacesAnalysisWriteReport> {
  const parsed = placesAnalysisInputSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new PlacesAnalysisExportError("EXPORT_VALIDATION_FAILED");
  }

  const primary = await writeValidatedFile(
    input.repositoryRoot,
    input.outputPath,
    parsed.data,
  );
  const threshold = input.partThresholdBytes ?? SINGLE_FILE_WARNING_BYTES;
  const report: PlacesAnalysisWriteReport = {
    ...primary,
    warningLargeFile: primary.bytes > threshold,
    parts: [],
  };

  if (!report.warningLargeFile) return report;

  const parts = buildAutonomousParts(parsed.data, threshold);
  for (const [index, part] of parts.entries()) {
    const partName = `part-${String(index + 1).padStart(3, "0")}.json`;
    report.parts.push(
      await writeValidatedFile(
        input.repositoryRoot,
        path.join(".tmp", "places", "analysis-parts", partName),
        part,
      ),
    );
  }
  return report;
}
