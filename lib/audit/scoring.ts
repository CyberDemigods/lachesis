/**
 * Aggregate scoring across audit sections. Each finding is mapped to one or
 * more categories; the category score is the average of contributing findings.
 * The overall score is a weighted average of the categories.
 */

import type {
  AuditFinding,
  AuditSection,
  CategoryScore,
  ScoreCategory,
} from "./types";

/**
 * Mapping from finding ID to categories. Multiple categories per finding are
 * allowed (e.g. a missing alt is both A11y and SEO).
 */
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
  viewport: ["accessibility", "best-practices"],

  // Best practices
  https: ["best-practices"],
  "no-https": ["best-practices"],
  "http-error": ["best-practices"],
  "http-redirect": ["best-practices"],
  charset: ["best-practices"],
  "security-headers": ["best-practices"],

  // PageSpeed
  "psi-performance": ["performance"],
  "psi-accessibility": ["accessibility"],
  "psi-best-practices": ["best-practices"],
  "psi-seo": ["seo"],

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

export function computeCategories(sections: AuditSection[]): CategoryScore[] {
  const buckets = new Map<ScoreCategory, { sum: number; count: number; ids: string[] }>();

  for (const section of sections) {
    for (const f of section.findings) {
      // PSI sub-audits like psi-largest-contentful-paint go to performance
      const cats =
        FINDING_CATEGORIES[f.id] ??
        (f.id.startsWith("psi-")
          ? (["performance"] as ScoreCategory[])
          : f.id.startsWith("crux-")
          ? (["performance"] as ScoreCategory[])
          : (["best-practices"] as ScoreCategory[]));

      const points = severityToPoints(f.severity);
      if (points === null) continue;

      for (const cat of cats) {
        if (!buckets.has(cat)) buckets.set(cat, { sum: 0, count: 0, ids: [] });
        const b = buckets.get(cat)!;
        b.sum += points;
        b.count += 1;
        b.ids.push(f.id);
      }
    }
  }

  const result: CategoryScore[] = [];
  const allCategories: ScoreCategory[] = [
    "seo",
    "performance",
    "accessibility",
    "best-practices",
    "content",
    "locale",
  ];
  for (const cat of allCategories) {
    const b = buckets.get(cat);
    if (!b || b.count === 0) continue;
    result.push({
      category: cat,
      score: Math.round((b.sum / b.count) * 100),
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
