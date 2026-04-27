import type { ScoreCategory } from "@/lib/audit/types";
import type { CrawlPageSummary, CrawlReport } from "@/lib/crawl/runner";

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  seo: "SEO",
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  content: "Content",
  locale: "Locale",
  visual: "Visual",
};

const CATEGORY_ORDER: ScoreCategory[] = [
  "seo",
  "performance",
  "accessibility",
  "best-practices",
  "visual",
  "content",
  "locale",
];

type CrawlReportWithSource = CrawlReport & {
  sitemapSource: string | null;
  sitemapUrlsFound: number;
  pagesAudited: number;
};

export function CrawlReportView({ report }: { report: CrawlReportWithSource }) {
  const sortedPages = [...report.pages].sort(
    (a, b) => a.overallScore - b.overallScore
  );

  return (
    <div className="space-y-6">
      <CrawlActions report={report} />
      <CrawlOverall report={report} />
      <CrawlCategoryGrid report={report} />
      <PagesTable pages={sortedPages} />
      {report.errors.length > 0 && <ErrorsList errors={report.errors} />}
      <div className="text-center text-xs text-[var(--muted)]">
        Crawl completed in {(report.durationMs / 1000).toFixed(1)}s ·{" "}
        {report.pagesScanned}/{report.pagesAttempted} pages scanned
        {report.fastMode && " · fast mode (on-page + image-perf only)"}
      </div>
    </div>
  );
}

function CrawlActions({ report }: { report: CrawlReportWithSource }) {
  function printReport() {
    const oldTitle = document.title;
    let host = report.rootUrl;
    try {
      host = new URL(report.rootUrl).hostname;
    } catch {
      // keep raw URL
    }
    const date = new Date(report.scannedAt).toISOString().slice(0, 10);
    document.title = `Lachesis Crawl - ${host} - ${date}`;
    window.print();
    window.setTimeout(() => {
      document.title = oldTitle;
    }, 1000);
  }

  return (
    <div className="flex justify-end gap-2 print:hidden">
      <button
        type="button"
        onClick={printReport}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-2)]"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}

function tierColor(score: number): string {
  if (score >= 90) return "text-[var(--pass)]";
  if (score >= 70) return "text-[var(--accent)]";
  if (score >= 40) return "text-[var(--warn)]";
  return "text-[var(--fail)]";
}

function CrawlOverall({ report }: { report: CrawlReportWithSource }) {
  let host = report.rootUrl;
  try {
    host = new URL(report.rootUrl).hostname;
  } catch {
    /* keep raw */
  }
  return (
    <div className="lachesis-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Site-wide audit
          </div>
          <div className="mt-1 font-mono text-sm">{host}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {report.pagesScanned} pages crawled
            {report.sitemapUrlsFound > report.pagesScanned &&
              ` (of ${report.sitemapUrlsFound} in sitemap)`}
            {report.sitemapSource && (
              <>
                {" · source: "}
                <span className="font-mono">
                  {new URL(report.sitemapSource).pathname}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-center">
          <div
            className={`text-7xl font-bold tabular-nums ${tierColor(
              report.overallAverage
            )}`}
          >
            {report.overallAverage}
          </div>
          <div
            className={`text-sm uppercase tracking-[0.18em] ${tierColor(
              report.overallAverage
            )}`}
          >
            average across pages
          </div>
        </div>
      </div>
    </div>
  );
}

function CrawlCategoryGrid({ report }: { report: CrawlReportWithSource }) {
  const present = CATEGORY_ORDER.filter(
    (c) => report.categoryAverages[c] !== undefined
  );
  if (present.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {present.map((cat) => {
        const score = report.categoryAverages[cat]!;
        return (
          <div
            key={cat}
            className="lachesis-card rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
              {CATEGORY_LABELS[cat]} · avg
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-3xl font-semibold tabular-nums ${tierColor(score)}`}
              >
                {score}
              </span>
              <span className="text-sm text-[var(--muted)]">/100</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-warm)]"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PagesTable({ pages }: { pages: CrawlPageSummary[] }) {
  if (pages.length === 0) return null;
  // Determine which categories actually appear in the data, to avoid empty cols.
  const presentCats = CATEGORY_ORDER.filter((c) =>
    pages.some((p) => p.categories.some((cat) => cat.category === c))
  );

  return (
    <div className="lachesis-section overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] p-4">
        <div className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Per-page scores · sorted worst first
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-2 font-medium">URL</th>
              <th className="px-3 py-2 text-right font-medium">Overall</th>
              {presentCats.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2 text-right font-medium"
                  title={CATEGORY_LABELS[c]}
                >
                  {CATEGORY_LABELS[c].slice(0, 4)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Issues</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <PageRow key={p.url} page={p} presentCats={presentCats} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageRow({
  page,
  presentCats,
}: {
  page: CrawlPageSummary;
  presentCats: ScoreCategory[];
}) {
  const path = (() => {
    try {
      return new URL(page.finalUrl ?? page.url).pathname || "/";
    } catch {
      return page.url;
    }
  })();

  return (
    <>
      <tr className="border-b border-[var(--border)] align-top hover:bg-[var(--surface-2)]">
        <td className="px-4 py-3">
          <details className="group">
            <summary className="cursor-pointer list-none">
              <span className="font-mono text-xs">{path}</span>
              <span className="ml-2 text-[10px] text-[var(--muted)] group-open:hidden">
                ▸ expand
              </span>
              <span className="ml-2 hidden text-[10px] text-[var(--muted)] group-open:inline">
                ▾ collapse
              </span>
            </summary>
            <div className="mt-2 space-y-1.5">
              {page.topIssues.length === 0 && (
                <div className="text-xs text-[var(--muted)]">
                  No fail/warn findings — clean page.
                </div>
              )}
              {page.topIssues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
                      issue.severity === "fail"
                        ? "border-[var(--fail)]/30 bg-[var(--fail)]/15 text-[var(--fail)]"
                        : "border-[var(--warn)]/30 bg-[var(--warn)]/15 text-[var(--warn)]"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-[var(--foreground)]">{issue.title}</span>
                </div>
              ))}
              <a
                href={`/api/scan?url=${encodeURIComponent(page.finalUrl ?? page.url)}`}
                target="_blank"
                rel="noopener"
                className="inline-block text-[10px] text-[var(--accent)] hover:underline"
              >
                Full scan JSON →
              </a>
            </div>
          </details>
        </td>
        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${tierColor(page.overallScore)}`}>
          {page.overallScore}
        </td>
        {presentCats.map((cat) => {
          const c = page.categories.find((x) => x.category === cat);
          if (!c) {
            return (
              <td
                key={cat}
                className="px-3 py-3 text-right text-xs text-[var(--muted)]"
              >
                —
              </td>
            );
          }
          return (
            <td
              key={cat}
              className={`px-3 py-3 text-right tabular-nums ${tierColor(c.score)}`}
            >
              {c.score}
            </td>
          );
        })}
        <td className="px-3 py-3 text-right text-xs">
          {page.totals.fail > 0 && (
            <span className="text-[var(--fail)]">{page.totals.fail}F</span>
          )}
          {page.totals.fail > 0 && page.totals.warn > 0 && (
            <span className="text-[var(--muted)]"> · </span>
          )}
          {page.totals.warn > 0 && (
            <span className="text-[var(--warn)]">{page.totals.warn}W</span>
          )}
        </td>
      </tr>
    </>
  );
}

function ErrorsList({
  errors,
}: {
  errors: Array<{ url: string; error: string }>;
}) {
  return (
    <div className="rounded-lg border border-[var(--fail)]/40 bg-[var(--fail)]/5 p-4">
      <div className="text-xs uppercase tracking-[0.15em] text-[var(--fail)]">
        {errors.length} page{errors.length === 1 ? "" : "s"} failed
      </div>
      <ul className="mt-2 space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-xs">
            <span className="font-mono text-[var(--muted)]">{e.url}</span>
            <span className="ml-2 text-[var(--fail)]">{e.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
