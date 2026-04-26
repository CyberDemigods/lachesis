/**
 * Aggregate scoring across audit sections. Each finding is mapped to one or
 * more categories; the category score is the WEIGHTED average of contributing
 * findings. The overall score is a weighted average of categories.
 *
 * Findings carry a `weight` field (default 1). Severity points: pass=1,
 * warn=0.5, fail=0. Info findings are excluded from scoring.
 */

import type {
  AuditFinding,
  AuditSection,
  CategoryScore,
  ScoreCategory,
} from "./types";

const FINDING_CATEGORIES: Record<string, ScoreCategory[]> = {
  // Core SEO
  "missing-title": ["seo"],
  "title-length": ["seo"],
  "missing-meta-description": ["seo"],
  "meta-description-length": ["seo"],
  canonical: ["seo"],
  "robots-noindex": ["seo"],
  "open-graph": ["seo"],
  "twitter-card": ["seo"],
  "json-ld": ["seo"],
  hreflang: ["seo"],
  links: ["seo"],
  "word-count": ["seo", "content"],

  // A11y / structure
  "h1-count": ["seo", "accessibility"],
  "heading-hierarchy": ["accessibility"],
  "alt-coverage": ["accessibility", "seo"],
  "html-lang": ["accessibility", "seo"],
  "lang-content-mismatch": ["seo", "accessibility", "best-practices"],
  "lang-content-match": ["seo", "accessibility"],
  viewport: ["accessibility", "best-practices"],

  // Best practices
  https: ["best-practices"],
  "no-https": ["best-practices"],
  "http-error": ["best-practices"],
  "http-redirect": ["best-practices"],
  charset: ["best-practices"],
  "security-headers": ["best-practices"],

  // PageSpeed (also handled by prefix fallback below)
  "psi-performance": ["performance"],
  "psi-accessibility": ["accessibility"],
  "psi-best-practices": ["best-practices"],
  "psi-seo": ["seo"],

  // Image performance
  "image-total-weight": ["performance"],
  "image-avg-load": ["performance"],
  "image-slowest": ["performance"],
  "image-heaviest": ["performance"],
  "image-lazy-loading": ["performance", "best-practices"],
  "image-modern-formats": ["performance", "best-practices"],
  "image-fetch-errors": ["performance", "best-practices"],
  "image-fetch-failed": ["performance"],

  // Headless / real browser
  "headless-lcp": ["performance"],
  "headless-fcp": ["performance"],
  "headless-cls": ["performance"],
  "headless-load": ["performance"],
  "layout-horizontal-overflow": ["best-practices", "accessibility"],
  "layout-underfilled": ["best-practices"],
  "layout-footer-position": ["best-practices"],
  "layout-no-footer": ["best-practices", "accessibility"],
  "layout-tiny-fonts": ["accessibility", "best-practices"],
  "a11y-critical": ["accessibility"],
  "a11y-serious": ["accessibility"],
  "a11y-moderate": ["accessibility"],
  "a11y-minor": ["accessibility"],
  "a11y-passes": ["accessibility"],

  // Locale
  "pl-diacritics": ["locale", "best-practices"],
  "pl-rodo": ["locale", "best-practices"],
  "pl-cookie-banner": ["locale", "best-practices"],
  "pl-company-ids": ["locale"],
  "pl-hreflang": ["locale", "seo"],
  "locale-not-polish": ["locale"],
};

const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  seo: 0.3,
  performance: 0.25,
  accessibility: 0.2,
  "best-practices": 0.15,
  content: 0.05,
  locale: 0.05,
};

function severityToPoints(sev: AuditFinding["severity"]): number | null {
  switch (sev) {
    case "pass":
      return 1;
    case "warn":
      return 0.5;
    case "fail":
      return 0;
    case "info":
      return null; // not scorable
  }
}

function resolveCategories(f: AuditFinding): ScoreCategory[] {
  const explicit = FINDING_CATEGORIES[f.id];
  if (explicit) return explicit;
  if (f.id.startsWith("psi-") || f.id.startsWith("crux-")) return ["performance"];
  if (f.id.startsWith("image-")) return ["performance"];
  if (f.id.startsWith("pl-")) return ["locale"];
  return ["best-practices"];
}

export function computeCategories(sections: AuditSection[]): CategoryScore[] {
  const buckets = new Map<
    ScoreCategory,
    { weightedSum: number; totalWeight: number; ids: string[] }
  >();

  for (const section of sections) {
    for (const f of section.findings) {
      const points = severityToPoints(f.severity);
      if (points === null) continue;
      const weight = f.weight ?? 1;
      for (const cat of resolveCategories(f)) {
        if (!buckets.has(cat))
          buckets.set(cat, { weightedSum: 0, totalWeight: 0, ids: [] });
        const b = buckets.get(cat)!;
        b.weightedSum += points * weight;
        b.totalWeight += weight;
        b.ids.push(f.id);
      }
    }
  }

  const allCategories: ScoreCategory[] = [
    "seo",
    "performance",
    "accessibility",
    "best-practices",
    "content",
    "locale",
  ];
  const result: CategoryScore[] = [];
  for (const cat of allCategories) {
    const b = buckets.get(cat);
    if (!b || b.totalWeight === 0) continue;
    result.push({
      category: cat,
      score: Math.round((b.weightedSum / b.totalWeight) * 100),
      findingIds: b.ids,
    });
  }
  return result;
}

export function computeOverallScore(categories: CategoryScore[]): number {
  if (categories.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const c of categories) {
    const w = CATEGORY_WEIGHTS[c.category];
    weightedSum += c.score * w;
    weightTotal += w;
  }
  return Math.round(weightedSum / weightTotal);
}
