import { NextRequest } from "next/server";
import { discoverSitemap } from "@/lib/crawl/sitemap";
import { runCrawl } from "@/lib/crawl/runner";

// Allow up to 5 minutes for large crawls. Vercel free tier won't honour
// this, but local dev (where Lachesis lives until production deploy) does.
export const maxDuration = 300;
export const runtime = "nodejs";

const DEFAULT_MAX_PAGES = 20;
const HARD_LIMIT_MAX_PAGES = 50;

interface CrawlRequestBody {
  url?: string;
  maxPages?: number;
  fast?: boolean;
}

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

export async function POST(request: NextRequest) {
  let body: CrawlRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeUrl(body.url ?? "");
  if (!normalized) {
    return Response.json(
      { error: "Missing or invalid 'url' field" },
      { status: 400 }
    );
  }

  const maxPages = Math.max(
    1,
    Math.min(
      HARD_LIMIT_MAX_PAGES,
      Math.round(body.maxPages ?? DEFAULT_MAX_PAGES)
    )
  );
  const fast = body.fast !== false;

  // Discover sitemap.
  const discovery = await discoverSitemap(normalized);
  if (discovery.urls.length === 0) {
    return Response.json(
      {
        error:
          discovery.error ??
          "No sitemap URLs discovered. Ensure /sitemap.xml exists or robots.txt declares one.",
        triedSources: discovery.triedSources,
      },
      { status: 404 }
    );
  }

  const urls = discovery.urls.slice(0, maxPages);

  // Run crawl.
  const report = await runCrawl({ urls, fast });

  return Response.json({
    sitemapSource: discovery.source,
    sitemapUrlsFound: discovery.urls.length,
    pagesAudited: urls.length,
    ...report,
  });
}
