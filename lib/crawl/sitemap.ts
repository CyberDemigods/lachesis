/**
 * Sitemap discovery and parsing.
 *
 * Tries several conventional sitemap locations + robots.txt directives,
 * supports both `<urlset>` and `<sitemapindex>` formats, and handles up
 * to one level of sitemap nesting. Returns deduplicated URLs filtered
 * to the same origin as the entry URL.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_SUB_SITEMAPS = 6;
const MAX_URLS_TOTAL = 500;

const UA =
  "Mozilla/5.0 (compatible; LachesisBot/0.1; +https://github.com/CyberDemigods/lachesis)";

export interface SitemapDiscovery {
  source: string | null;
  /** Same-origin URLs found in the sitemap, deduplicated, in document order. */
  urls: string[];
  /** Sources the crawler attempted, useful for diagnosis. */
  triedSources: string[];
  error?: string;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/xml,application/xml,text/plain,*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u) out.push(u);
  }
  return out;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

function rootHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function sameSite(url: string, entryRootHost: string): boolean {
  const h = rootHost(url);
  return h !== null && h === entryRootHost;
}

async function readRobotsSitemaps(origin: string): Promise<string[]> {
  const text = await fetchText(`${origin}/robots.txt`);
  if (!text) return [];
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(.+?)\s*$/i.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

export async function discoverSitemap(entryUrl: string): Promise<SitemapDiscovery> {
  let origin: string;
  let entryHost: string;
  try {
    const u = new URL(entryUrl);
    origin = u.origin;
    entryHost = u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return {
      source: null,
      urls: [],
      triedSources: [],
      error: "Invalid entry URL",
    };
  }

  const triedSources: string[] = [];
  const robotsSitemaps = await readRobotsSitemaps(origin);
  const candidates: string[] = [
    ...robotsSitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemaps/sitemap.xml`,
  ];

  for (const candidate of candidates) {
    if (triedSources.includes(candidate)) continue;
    triedSources.push(candidate);
    const xml = await fetchText(candidate);
    if (!xml) continue;

    if (isSitemapIndex(xml)) {
      const subSitemaps = extractLocs(xml).slice(0, MAX_SUB_SITEMAPS);
      const collected: string[] = [];
      for (const sub of subSitemaps) {
        triedSources.push(sub);
        const subXml = await fetchText(sub);
        if (!subXml) continue;
        for (const u of extractLocs(subXml)) {
          if (sameSite(u, entryHost)) collected.push(u);
          if (collected.length >= MAX_URLS_TOTAL) break;
        }
        if (collected.length >= MAX_URLS_TOTAL) break;
      }
      const deduped = Array.from(new Set(collected));
      if (deduped.length > 0) {
        return { source: candidate, urls: deduped, triedSources };
      }
      // empty index — fall through and try next candidate
      continue;
    }

    // Plain urlset
    const locs = extractLocs(xml);
    const filtered = Array.from(
      new Set(locs.filter((u) => sameSite(u, entryHost)))
    ).slice(0, MAX_URLS_TOTAL);
    if (filtered.length > 0) {
      return { source: candidate, urls: filtered, triedSources };
    }
  }

  return {
    source: null,
    urls: [],
    triedSources,
    error: "No reachable sitemap found at conventional locations or in robots.txt",
  };
}
