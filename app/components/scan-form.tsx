"use client";

import { useState, useTransition } from "react";
import type { ScanReport } from "@/lib/audit/types";
import { ReportView } from "./report-view";

export function ScanForm() {
  const [url, setUrl] = useState("");
  const [skipPageSpeed, setSkipPageSpeed] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setReport(null);
    startTransition(async () => {
      try {
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
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 print:hidden">
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
            {isPending ? "Measuring…" : "Measure"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={skipPageSpeed}
            onChange={(e) => setSkipPageSpeed(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Skip PageSpeed Insights (faster, no Core Web Vitals)
        </label>
      </form>

      {isPending && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
          <div className="flex items-center justify-center gap-3">
            <Spinner />
            <span>
              Spinning the thread… PageSpeed Insights can take 20–40 seconds.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--fail)]/40 bg-[var(--fail)]/10 p-4 text-sm text-[var(--fail)]">
          {error}
        </div>
      )}

      {report && <ReportView report={report} />}
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
