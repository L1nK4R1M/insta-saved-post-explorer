import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LOGO_PATH = path.join(process.cwd(), "resources", "branding", "insta-post-explorer-logo.png");

export async function GET(): Promise<NextResponse> {
  const logo = await readFile(LOGO_PATH);
  return new NextResponse(logo, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
