import { readFile } from "node:fs/promises";
import path from "node:path";

import { importCandidateBatch } from "@/server/places/caption-batch";
import { getConfiguredPlaceResolver } from "@/server/places/resolvers";

// Local Places candidate importer. Validates a candidate JSONL file, resolves
// each textual candidate through Geoapify, scores it, and persists atomically.
// Defaults to a dry-run; pass --commit to write. Requires GEOAPIFY_API_KEY.
//   npm run places:import-candidates -- --input .tmp/places/candidates.jsonl --commit

type ImportArgs = {
  input: string;
  commit: boolean;
  continueOnError: boolean;
  limit?: number;
  postId?: string;
  owner: string;
};

function parseArgs(argv: string[]): ImportArgs {
  const args: Partial<ImportArgs> = { commit: false, continueOnError: false, owner: process.env.APP_OWNER_ID?.trim() || "local" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[(i += 1)];
    switch (flag) {
      case "--input":
        args.input = next();
        break;
      case "--limit":
        args.limit = Number.parseInt(next() ?? "", 10);
        break;
      case "--post-id":
        args.postId = next();
        break;
      case "--owner":
        args.owner = next() ?? args.owner;
        break;
      case "--commit":
        args.commit = true;
        break;
      case "--continue-on-error":
        args.continueOnError = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!args.input) throw new Error("Missing required --input <path>");
  return args as ImportArgs;
}

function safeInputPath(candidate: string): string {
  const resolved = path.resolve(process.cwd(), candidate);
  if (resolved !== process.cwd() && !resolved.startsWith(process.cwd() + path.sep)) {
    throw new Error("Input path must stay inside the project directory.");
  }
  return resolved;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const jsonl = await readFile(safeInputPath(args.input), "utf8");
  const resolver = getConfiguredPlaceResolver();

  const report = await importCandidateBatch({
    ownerId: args.owner,
    jsonl,
    resolver,
    commit: args.commit,
    limit: args.limit,
    postId: args.postId,
    continueOnError: args.continueOnError,
  });

  // Print counts only — never a caption or a candidate body.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.committed) {
    process.stdout.write("Dry run: nothing was written. Re-run with --commit to persist.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`Import failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exit(1);
  });
