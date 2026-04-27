"use client";

import { useState, useTransition } from "react";
import type { ScanReport } from "@/lib/audit/types";
import type { CrawlReport } from "@/lib/crawl/runner";
import { ReportView } from "./report-view";
import { CrawlReportView } from "./crawl-report-view";

type Mode = "single" | "crawl";

type CrawlReportWithSource = CrawlReport & {
  sitemapSource: string | null;
  sitemapUrlsFound: number;
  pagesAudited: number;
};

export function ScanForm() {
  const [mode, setMode] = useState<Mode>("single");
  const [url, setUrl] = useState("");
  const [skipPageSpeed, setSkipPageSpeed] = useState(false);
  const [maxPages, setMaxPages] = useState(20);
  const [singleReport, setSingleReport] = useState<ScanReport | null>(null);
  const [crawlReport, setCrawlReport] = useState<CrawlReportWithSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setSingleReport(null);
    setCrawlReport(null);

    startTransition(async () => {
      try {
        if (mode === "single") {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, skipPageSpeed }),
          });
          const data = (await res.json()) as ScanReport | { error: string };
          if (!res.ok || "error" in data) {
            setError("error" in data ? data.error : "Scan failed");
            return;
          }
          setSingleReport(data);
        } else {
          const res = await fetch("/api/crawl", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, maxPages, fast: true }),
          });
          const data = (await res.json()) as
            | CrawlReportWithSource
            | { error: string; triedSources?: string[] };
          if (!res.ok || "error" in data) {
            const tried =
              "triedSources" in data && data.triedSources
                ? ` (tried: ${data.triedSources.slice(0, 3).join(", ")})`
                : "";
            setError(("error" in data ? data.error : "Crawl failed") + tried);
            return;
          }
          setCrawlReport(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 print:hidden">
        <div className="flex w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`flex-1 px-4 py-2 transition-colors ${
              mode === "single"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
            }`}
          >
            Single page
          </button>
          <button
            type="button"
            onClick={() => setMode("crawl")}
            className={`flex-1 px-4 py-2 transition-colors ${
              mode === "crawl"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
            }`}
          >
            Crawl site (sitemap)
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-mono text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
            disabled={isPending}
            autoFocus
          />
          <button
            type="submit"
            disabled={isPending || !url.trim()}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending
              ? mode === "single"
                ? "Measuring…"
                : "Crawling…"
              : mode === "single"
              ? "Measure"
              : "Crawl"}
          </button>
        </div>

        {mode === "single" ? (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={skipPageSpeed}
              onChange={(e) => setSkipPageSpeed(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Skip PageSpeed Insights (faster, no Core Web Vitals)
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <label className="flex items-center gap-2">
              <span>Max pages:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={maxPages}
                onChange={(e) =>
                  setMaxPages(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
                className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center font-mono text-[var(--foreground)]"
                disabled={isPending}
              />
            </label>
            <span className="text-[var(--muted)]">
              Fast mode (on-page + image-perf only). Pulls URLs from sitemap.xml or robots.txt.
            </span>
          </div>
        )}
      </form>

      {isPending && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
          <div className="flex items-center justify-center gap-3">
            <Spinner />
            <span>
              {mode === "single"
                ? "Spinning the thread… PageSpeed Insights can take 20–40 seconds."
                : `Crawling up to ${maxPages} pages. This can take 1-3 minutes.`}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--fail)]/40 bg-[var(--fail)]/10 p-4 text-sm text-[var(--fail)]">
          {error}
        </div>
      )}

      {singleReport && <ReportView report={singleReport} />}
      {crawlReport && <CrawlReportView report={crawlReport} />}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-[var(--accent)]"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}
