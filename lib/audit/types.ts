/**
 * Shared types for the Lachesis audit pipeline.
 *
 * The audit produces a `ScanReport` aggregating signals from multiple modules
 * (on-page, PageSpeed Insights, headless browser, accessibility, locale-specific
 * heuristics). Each module returns an `AuditSection` and the orchestrator
 * combines them with category-level scoring.
 */

export type AuditSeverity = "pass" | "info" | "warn" | "fail";

export interface AuditFinding {
  /** Stable identifier, kebab-case (e.g. "missing-meta-description") */
  id: string;
  /** Short human-readable title */
  title: string;
  /** Optional longer description with remediation guidance */
  description?: string;
  /** Severity bucket — affects scoring weight */
  severity: AuditSeverity;
  /**
   * Per-finding weight in scoring (Lighthouse-style).
   * Defaults to 1 when omitted. Conventional tiers:
   *   5 = critical (page can't rank, can't render, etc.)
   *   3 = major (significant SEO/UX impact)
   *   2 = medium (notable but not crippling)
   *   1 = minor (nice-to-have)
   */
  weight?: number;
  /** Concrete value found on the page, when relevant */
  value?: string | number | null;
  /** Free-form metadata for renderer (e.g. context, code snippets) */
  meta?: Record<string, unknown>;
}

export interface AuditSection {
  /** Module identifier, e.g. "on-page", "pagespeed", "a11y" */
  module: string;
  /** 0–100 score for this section. `null` if module did not run */
  score: number | null;
  /** All findings discovered by the module */
  findings: AuditFinding[];
  /** Time the module took to execute, in milliseconds */
  durationMs: number;
  /** Optional error if the module failed */
  error?: string;
}

export type ScoreCategory =
  | "seo"
  | "performance"
  | "accessibility"
  | "best-practices"
  | "content"
  | "locale"
  | "visual";

export interface CategoryScore {
  category: ScoreCategory;
  score: number;
  /** Findings contributing to this category */
  findingIds: string[];
}

export interface ScanReport {
  url: string;
  /** Final URL after redirects */
  finalUrl?: string;
  scannedAt: string;
  durationMs: number;
  /** Aggregate 0–100 score (weighted average across categories) */
  overallScore: number;
  categories: CategoryScore[];
  sections: AuditSection[];
  /** Optional screenshot (data URL), captured by the headless module */
  screenshot?: string;
}

export interface ScanRequestBody {
  url: string;
  /** Optional flags to skip slow modules */
  skipPageSpeed?: boolean;
  skipHeadless?: boolean;
  skipVisual?: boolean;
  /** Locale hints (e.g. "pl") for locale-specific checks */
  locale?: string;
}
