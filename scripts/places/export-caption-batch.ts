import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { exportCaptionBatch, serializeCaptionBatch } from "@/server/places/caption-batch";

// Local Places caption exporter. Emits a bounded, text-only JSONL batch of
// theme-eligible posts for external Claude Code / Codex analysis. It never emits
// media URLs, R2 keys, secrets, or collection data. Run with:
//   npm run places:export-captions -- --limit 100 --output .tmp/places/captions.jsonl

type ExportArgs = {
  limit?: number;
  postId?: string;
  output?: string;
  force: boolean;
  owner: string;
};

function parseArgs(argv: string[]): ExportArgs {
  const args: ExportArgs = { force: false, owner: process.env.APP_OWNER_ID?.trim() || "local" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[(i += 1)];
    switch (flag) {
      case "--limit":
        args.limit = Number.parseInt(next() ?? "", 10);
        break;
      case "--post-id":
        args.postId = next();
        break;
      case "--output":
        args.output = next();
        break;
      case "--owner":
        args.owner = next() ?? args.owner;
        break;
      case "--force":
        args.force = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

// Restrict writes to inside the project so a batch file can never escape the repo.
function safeOutputPath(candidate: string): string {
  const resolved = path.resolve(process.cwd(), candidate);
  if (resolved !== process.cwd() && !resolved.startsWith(process.cwd() + path.sep)) {
    throw new Error("Output path must stay inside the project directory.");
  }
  return resolved;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const records = await exportCaptionBatch({
    ownerId: args.owner,
    limit: args.limit,
    postId: args.postId,
    force: args.force,
  });
  const jsonl = serializeCaptionBatch(records);

  if (args.output) {
    const output = safeOutputPath(args.output);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, jsonl.length > 0 ? `${jsonl}\n` : "", "utf8");
    process.stdout.write(`Exported ${records.length} eligible post(s) to ${path.relative(process.cwd(), output)}\n`);
    return;
  }
  process.stdout.write(jsonl.length > 0 ? `${jsonl}\n` : "");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // Never print captions or stack traces that could contain user data.
    process.stderr.write(`Export failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exit(1);
  });
