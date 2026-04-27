import type {
  AuditFinding,
  AuditSection,
  CategoryScore,
  ScanReport,
  ScoreCategory,
} from "@/lib/audit/types";

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  seo: "SEO",
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  content: "Content",
  locale: "Locale",
  visual: "Visual",
};

const SEVERITY_BADGE: Record<AuditFinding["severity"], string> = {
  pass: "bg-[var(--pass)]/15 text-[var(--pass)] border-[var(--pass)]/30",
  warn: "bg-[var(--warn)]/15 text-[var(--warn)] border-[var(--warn)]/30",
  fail: "bg-[var(--fail)]/15 text-[var(--fail)] border-[var(--fail)]/30",
  info: "bg-[var(--muted)]/15 text-[var(--muted)] border-[var(--muted)]/30",
};

export function ReportView({ report }: { report: ScanReport }) {
  return (
    <div className="space-y-6">
      <OverallScore report={report} />
      <CategoryGrid categories={report.categories} />
      {report.screenshot && <Screenshot data={report.screenshot} />}
      <div className="space-y-4">
        {report.sections.map((s) => (
          <SectionCard key={s.module} section={s} />
        ))}
      </div>
      <div className="text-center text-xs text-[var(--muted)]">
        Scan completed in {(report.durationMs / 1000).toFixed(1)}s ·{" "}
        <a
          href={`/api/scan?url=${encodeURIComponent(report.url)}`}
          target="_blank"
          rel="noopener"
          className="hover:underline"
        >
          Raw JSON
        </a>
      </div>
    </div>
  );
}

function Screenshot({ data }: { data: string }) {
  return (
    <details
      open
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
    >
      <summary className="cursor-pointer p-4 text-xs uppercase tracking-[0.15em] text-[var(--muted)] hover:bg-[var(--surface-2)]">
        Rendered screenshot
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--background)] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${data}`}
          alt="Rendered page screenshot"
          className="w-full rounded border border-[var(--border)]"
        />
      </div>
    </details>
  );
}

function OverallScore({ report }: { report: ScanReport }) {
  const score = report.overallScore;
  const tier = score >= 90 ? "destined" : score >= 70 ? "promising" : score >= 40 ? "frayed" : "doomed";
  const color =
    score >= 90
      ? "text-[var(--pass)]"
      : score >= 70
      ? "text-[var(--accent)]"
      : score >= 40
      ? "text-[var(--warn)]"
      : "text-[var(--fail)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Lachesis verdict
          </div>
          <div className="mt-1 font-mono text-sm text-[var(--muted)]">
            {report.finalUrl ?? report.url}
          </div>
        </div>
        <div className="text-center">
          <div className={`text-7xl font-bold tabular-nums ${color}`}>
            {score}
          </div>
          <div className={`text-sm uppercase tracking-[0.18em] ${color}`}>
            thread is {tier}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryGrid({ categories }: { categories: CategoryScore[] }) {
  if (categories.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <div
          key={c.category}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            {CATEGORY_LABELS[c.category]}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-3xl font-semibold tabular-nums ${
                c.score >= 90
                  ? "text-[var(--pass)]"
                  : c.score >= 70
                  ? "text-[var(--accent)]"
                  : c.score >= 40
                  ? "text-[var(--warn)]"
                  : "text-[var(--fail)]"
              }`}
            >
              {c.score}
            </span>
            <span className="text-sm text-[var(--muted)]">/100</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-warm)]"
              style={{ width: `${c.score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: AuditSection }) {
  return (
    <details
      open
      className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
    >
      <summary className="flex cursor-pointer items-center justify-between p-4 hover:bg-[var(--surface-2)]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            {section.module}
          </span>
          {section.score !== null && (
            <span className="text-lg font-semibold tabular-nums">
              {section.score}
              <span className="text-sm text-[var(--muted)]">/100</span>
            </span>
          )}
          {section.error && (
            <span className="text-xs text-[var(--fail)]">
              error: {section.error}
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--muted)]">
          {section.findings.length} findings · {Math.round(section.durationMs)}ms
        </span>
      </summary>
      <div className="border-t border-[var(--border)] p-4">
        {section.findings.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">No findings.</div>
        ) : (
          <ul className="space-y-2">
            {section.findings.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function FindingRow({ finding }: { finding: AuditFinding }) {
  return (
    <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${SEVERITY_BADGE[finding.severity]}`}
            >
              {finding.severity}
            </span>
            <span className="text-sm font-medium">{finding.title}</span>
          </div>
          {finding.description && (
            <div className="mt-1 text-xs text-[var(--muted)]">
              {finding.description}
            </div>
          )}
          {typeof finding.value === "string" && finding.value.length > 0 && (
            <div className="mt-2 max-w-full overflow-x-auto rounded border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-xs text-[var(--foreground)]">
              {finding.value}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
