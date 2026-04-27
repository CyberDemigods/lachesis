/**
 * Lachesis audit orchestrator. Runs all enabled modules in parallel where
 * possible and aggregates the result into a `ScanReport`.
 */

import { runOnPageAudit } from "./on-page";
import { runPageSpeedAudit } from "./pagespeed";
import { runHeadlessAudit } from "./headless";
import { runLocaleAudit } from "./locale";
import { runImagePerfAudit } from "./image-perf";
import { runVisualAudit } from "./visual";
import { computeCategories, computeOverallScore } from "./scoring";
import type { AuditSection, ScanReport, ScanRequestBody } from "./types";

export async function runScan(req: ScanRequestBody): Promise<ScanReport> {
  const start = performance.now();
  const url = req.url;

  // On-page must run first because the locale and image-perf modules reuse
  // its HTML and final URL.
  const { section: onPageSection, page } = await runOnPageAudit(url);

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

  const imagePerfPromise: Promise<AuditSection> = page
    ? runImagePerfAudit(page.html, page.finalUrl)
    : Promise.resolve<AuditSection>({
        module: "image-perf",
        score: null,
        findings: [],
        durationMs: 0,
        error: "on-page module did not return HTML",
      });

  const [pageSpeedSection, headlessResult, imagePerfSection] = await Promise.all([
    pageSpeedPromise,
    headlessPromise,
    imagePerfPromise,
  ]);

  // Visual audit depends on the headless screenshot — must run sequentially
  // after headless completes.
  const visualSection: AuditSection = req.skipVisual
    ? {
        module: "visual",
        score: null,
        findings: [],
        durationMs: 0,
        error: "skipped",
      }
    : await runVisualAudit(headlessResult.screenshot);

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
    imagePerfSection,
    headlessResult.section,
    visualSection,
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
