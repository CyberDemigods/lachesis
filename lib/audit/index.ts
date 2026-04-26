/**
 * Lachesis audit orchestrator. Runs all enabled modules in parallel where
 * possible and aggregates the result into a `ScanReport`.
 */

import { runOnPageAudit } from "./on-page";
import { runPageSpeedAudit } from "./pagespeed";
import { runHeadlessAudit } from "./headless";
import { runLocaleAudit } from "./locale";
import { computeCategories, computeOverallScore } from "./scoring";
import type { AuditSection, ScanReport, ScanRequestBody } from "./types";

export async function runScan(req: ScanRequestBody): Promise<ScanReport> {
  const start = performance.now();
  const url = req.url;

  // On-page must run first because the locale module reuses its HTML.
  const { section: onPageSection, page } = await runOnPageAudit(url);

  // Run remaining modules in parallel.
  const pageSpeedPromise = req.skipPageSpeed
    ? Promise.resolve<AuditSection>({
        module: "pagespeed",
        score: null,
        findings: [],
        durationMs: 0,
        error: "skipped",
      })
    : runPageSpeedAudit(url);
  const headlessPromise: Promise<{ section: AuditSection; screenshot?: string }> =
    req.skipHeadless
      ? Promise.resolve({
          section: {
            module: "headless",
            score: null,
            findings: [],
            durationMs: 0,
            error: "skipped",
          },
        })
      : runHeadlessAudit(url);
  const [pageSpeedSection, headlessResult] = await Promise.all([
    pageSpeedPromise,
    headlessPromise,
  ]);

  const localeSection: AuditSection = page
    ? runLocaleAudit(page.html)
    : {
        module: "locale",
        score: null,
        findings: [],
        durationMs: 0,
        error: "on-page module did not return HTML",
      };

  const sections = [
    onPageSection,
    pageSpeedSection,
    headlessResult.section,
    localeSection,
  ];
  const categories = computeCategories(sections);
  const overallScore = computeOverallScore(categories);

  return {
    url,
    finalUrl: page?.finalUrl,
    scannedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
    overallScore,
    categories,
    sections,
    screenshot: headlessResult.screenshot,
  };
}
