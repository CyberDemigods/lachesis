/**
 * Crawl runner. Given a list of URLs (typically from a sitemap), runs the
 * audit pipeline on each one and aggregates the results. Sequential by
 * default — Playwright + a local vision model don't parallelise cleanly
 * inside one process, and most production sites we crawl don't appreciate
 * 10 concurrent bots either.
 *
 * In "fast mode" the heavy modules are skipped (headless, visual,
 * pagespeed) so a 25-page audit completes inside one HTTP request.
 */

import { runScan } from "../audit";
import type {
  CategoryScore,
  ScanReport,
  ScoreCategory,
} from "../audit/types";

export interface CrawlOptions {
  urls: string[];
  fast?: boolean;
  /**
   * Pause between scans in milliseconds. Default 1000ms — many shared
   * hostings rate-limit aggressive crawlers (HTTP 508 / 429), and
   * image-perf alone fires up to 12 image requests per page.
   */
  throttleMs?: number;
}

const DEFAULT_THROTTLE_MS = 1_000;

export interface CrawlPageError {
  url: string;
  error: string;
}

export interface CrawlReport {
  rootUrl: string;
  pagesAttempted: number;
  pagesScanned: number;
  durationMs: number;
  scannedAt: string;
  fastMode: boolean;
  /** Average overall score across successful scans. */
  overallAverage: number;
  /** Average per-category score across pages where the category was present. */
  categoryAverages: Partial<Record<ScoreCategory, number>>;
  /** Lightweight per-page summaries (no screenshots, no full findings). */
  pages: CrawlPageSummary[];
  errors: CrawlPageError[];
}

export interface CrawlPageSummary {
  url: string;
  finalUrl?: string;
  overallScore: number;
  durationMs: number;
  categories: CategoryScore[];
  /** Counts of failures, warnings, passes across all sections — for the table view. */
  totals: { fail: number; warn: number; pass: number; info: number };
  /** Top 3 most severe findings (FAIL > WARN > info), titles only. */
  topIssues: Array<{ id: string; severity: string; title: string; description?: string }>;
}

function summarisePage(report: ScanReport): CrawlPageSummary {
  const totals = { fail: 0, warn: 0, pass: 0, info: 0 };
  const flatFindings = report.sections.flatMap((s) => s.findings);
  for (const f of flatFindings) {
    if (f.severity === "fail") totals.fail++;
    else if (f.severity === "warn") totals.warn++;
    else if (f.severity === "pass") totals.pass++;
    else totals.info++;
  }
  const severityRank: Record<string, number> = { fail: 0, warn: 1, pass: 2, info: 3 };
  const topIssues = flatFindings
    .filter((f) => f.severity === "fail" || f.severity === "warn")
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        (b.weight ?? 1) - (a.weight ?? 1)
    )
    .slice(0, 3)
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      description: f.description,
    }));

  return {
    url: report.url,
    finalUrl: report.finalUrl,
    overallScore: report.overallScore,
    durationMs: report.durationMs,
    categories: report.categories,
    totals,
    topIssues,
  };
}

export async function runCrawl(opts: CrawlOptions): Promise<CrawlReport> {
  const start = performance.now();
  const fastMode = opts.fast !== false;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const pages: CrawlPageSummary[] = [];
  const errors: CrawlPageError[] = [];

  for (let i = 0; i < opts.urls.length; i++) {
    const url = opts.urls[i];
    try {
      const report = await runScan({
        url,
        skipHeadless: fastMode,
        skipVisual: fastMode,
        skipPageSpeed: fastMode,
      });
      pages.push(summarisePage(report));
    } catch (err) {
      errors.push({
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (throttleMs > 0 && i < opts.urls.length - 1) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  // Aggregate scores
  const overallAverage =
    pages.length === 0
      ? 0
      : Math.round(
          pages.reduce((s, p) => s + p.overallScore, 0) / pages.length
        );

  const catBuckets = new Map<ScoreCategory, { sum: number; count: number }>();
  for (const p of pages) {
    for (const c of p.categories) {
      if (!catBuckets.has(c.category))
        catBuckets.set(c.category, { sum: 0, count: 0 });
      const b = catBuckets.get(c.category)!;
      b.sum += c.score;
      b.count += 1;
    }
  }
  const categoryAverages: Partial<Record<ScoreCategory, number>> = {};
  for (const [cat, b] of catBuckets.entries()) {
    if (b.count > 0) categoryAverages[cat] = Math.round(b.sum / b.count);
  }

  return {
    rootUrl: opts.urls[0] ?? "",
    pagesAttempted: opts.urls.length,
    pagesScanned: pages.length,
    durationMs: Math.round(performance.now() - start),
    scannedAt: new Date().toISOString(),
    fastMode,
    overallAverage,
    categoryAverages,
    pages,
    errors,
  };
}
