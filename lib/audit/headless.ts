/**
 * Headless browser module — Playwright-based render + screenshot + axe-core
 * accessibility scan. Required for SPAs that don't ship meaningful HTML in
 * the initial response.
 *
 * STATUS: stubbed. Playwright + browser binaries are heavy (~150 MB) and
 * do not fit Vercel's default serverless function limits. Two paths to
 * production:
 *
 *   1. Vercel Sandbox / Fluid Compute — long-running, larger deployment.
 *   2. External worker (Cloudflare Browser Rendering, Browserless.io, or a
 *      tiny VPS) called from this module via fetch.
 *
 * Local development can install playwright directly:
 *
 *     npm install playwright @axe-core/playwright
 *     npx playwright install chromium
 *
 * Then replace the stub body below with:
 *
 *     const { chromium } = await import("playwright");
 *     const browser = await chromium.launch();
 *     const page = await browser.newPage();
 *     await page.goto(url, { waitUntil: "networkidle" });
 *     const screenshot = (await page.screenshot({ type: "png" })).toString("base64");
 *     const axe = new (await import("@axe-core/playwright")).default({ page });
 *     const results = await axe.analyze();
 *     await browser.close();
 *     ...
 */

import type { AuditSection } from "./types";

export async function runHeadlessAudit(_url: string): Promise<{
  section: AuditSection;
  screenshot?: string;
}> {
  const start = performance.now();
  return {
    section: {
      module: "headless",
      score: null,
      findings: [
        {
          id: "headless-not-configured",
          title: "Headless browser audit not configured",
          description:
            "Install playwright + @axe-core/playwright and wire up a worker. See lib/audit/headless.ts.",
          severity: "info",
        },
      ],
      durationMs: performance.now() - start,
    },
  };
}
