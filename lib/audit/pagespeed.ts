/**
 * Google PageSpeed Insights API integration. Returns Lighthouse scores
 * (Performance, Accessibility, Best Practices, SEO) and Core Web Vitals
 * (LCP, INP, CLS, FCP, TTFB) for the given URL.
 *
 * Free, requires no API key for low volumes, but a key from
 * https://developers.google.com/speed/docs/insights/v5/get-started lifts
 * rate limits significantly. Set `PAGESPEED_API_KEY` in .env.local.
 */

import type { AuditFinding, AuditSection } from "./types";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface CategoryRef {
  id: string;
  score: number | null;
  title: string;
}

interface AuditRef {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
  numericValue?: number;
}

interface PSIResult {
  lighthouseResult?: {
    categories?: Record<string, CategoryRef>;
    audits?: Record<string, AuditRef>;
    finalUrl?: string;
  };
  loadingExperience?: {
    metrics?: Record<
      string,
      { percentile: number; category: "FAST" | "AVERAGE" | "SLOW" }
    >;
  };
  error?: { message: string };
}

export async function runPageSpeedAudit(
  url: string,
  strategy: "desktop" | "mobile" = "mobile"
): Promise<AuditSection> {
  const start = performance.now();
  const findings: AuditFinding[] = [];

  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
  });
  // PSI accepts repeated `category` params for multiple categories.
  const additionalCategories = ["accessibility", "best-practices", "seo"];
  for (const cat of additionalCategories) params.append("category", cat);

  if (process.env.PAGESPEED_API_KEY) {
    params.set("key", process.env.PAGESPEED_API_KEY);
  }

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      // PSI runs Lighthouse server-side and can take 20-40 seconds.
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json()) as PSIResult;

    if (data.error) {
      return {
        module: "pagespeed",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: data.error.message,
      };
    }

    const lh = data.lighthouseResult;
    if (!lh) {
      return {
        module: "pagespeed",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: "Empty PageSpeed response",
      };
    }

    // Category scores
    if (lh.categories) {
      for (const [key, cat] of Object.entries(lh.categories)) {
        const score = cat.score === null ? null : Math.round(cat.score * 100);
        findings.push({
          id: `psi-${key}`,
          title: `${cat.title}: ${score ?? "n/a"}/100`,
          severity:
            score === null
              ? "info"
              : score >= 90
              ? "pass"
              : score >= 50
              ? "warn"
              : "fail",
          value: score,
        });
      }
    }

    // Core Web Vitals (lab data from Lighthouse + field data when available)
    const vitalAudits = [
      "largest-contentful-paint",
      "first-contentful-paint",
      "cumulative-layout-shift",
      "interaction-to-next-paint",
      "total-blocking-time",
      "speed-index",
      "server-response-time",
    ];
    if (lh.audits) {
      for (const id of vitalAudits) {
        const a = lh.audits[id];
        if (!a) continue;
        findings.push({
          id: `psi-${id}`,
          title: `${a.title}: ${a.displayValue ?? "n/a"}`,
          severity:
            a.score === null
              ? "info"
              : a.score >= 0.9
              ? "pass"
              : a.score >= 0.5
              ? "warn"
              : "fail",
          value: a.numericValue ?? null,
          meta: { displayValue: a.displayValue },
        });
      }
    }

    // Field data (CrUX) — real-user metrics if available
    if (data.loadingExperience?.metrics) {
      for (const [metric, m] of Object.entries(data.loadingExperience.metrics)) {
        findings.push({
          id: `crux-${metric.toLowerCase()}`,
          title: `Real-user ${metric}: ${m.percentile} (p75, ${m.category})`,
          severity:
            m.category === "FAST" ? "pass" : m.category === "AVERAGE" ? "warn" : "fail",
          value: m.percentile,
          meta: { category: m.category },
        });
      }
    }

    // Aggregate score = average of the 4 Lighthouse category scores
    const catScores = Object.values(lh.categories ?? {})
      .map((c) => (c.score === null ? null : c.score * 100))
      .filter((s): s is number => s !== null);
    const score = catScores.length
      ? Math.round(catScores.reduce((a, b) => a + b, 0) / catScores.length)
      : null;

    return {
      module: "pagespeed",
      score,
      findings,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      module: "pagespeed",
      score: null,
      findings: [],
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
