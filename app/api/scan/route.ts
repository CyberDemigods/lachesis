import { NextRequest } from "next/server";
import { runScan } from "@/lib/audit";
import type { ScanRequestBody } from "@/lib/audit/types";

// Allow up to 60s for slow PageSpeed Insights calls.
export const maxDuration = 60;
export const runtime = "nodejs";

function normalizeUrl(input: string): string | null {
  if (!input) return null;
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const skipPageSpeed = request.nextUrl.searchParams.get("skipPageSpeed") === "1";
  const skipHeadless = request.nextUrl.searchParams.get("skipHeadless") === "1";

  const normalized = url ? normalizeUrl(url) : null;
  if (!normalized) {
    return Response.json(
      { error: "Missing or invalid 'url' parameter" },
      { status: 400 }
    );
  }

  try {
    const report = await runScan({
      url: normalized,
      skipPageSpeed,
      skipHeadless,
    });
    return Response.json(report);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: ScanRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeUrl(body.url);
  if (!normalized) {
    return Response.json(
      { error: "Missing or invalid 'url' field" },
      { status: 400 }
    );
  }

  try {
    const report = await runScan({ ...body, url: normalized });
    return Response.json(report);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
