/**
 * Headless browser audit. Renders the page in a real Chromium instance and
 * collects:
 *   - Real Web Vitals (LCP, FCP, CLS) via PerformanceObserver
 *   - Layout signals from the DOM (footer position, content height, overflow)
 *   - Accessibility violations via axe-core
 *   - Screenshot (base64 JPEG) for downstream visual evaluation (phase 2B)
 *
 * Heavy: launches a browser per scan. Acceptable for local dev.
 * Production: deploy via Vercel Sandbox, browserless.io, or external worker.
 */

import { chromium, type Browser } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";
import type { AuditFinding, AuditSection } from "./types";

// Read axe-core's bundled UMD source directly from disk at request time.
// Turbopack rewrites import paths and strips axe-core's `.source` export,
// so we bypass module resolution entirely.
function loadAxeSource(): string {
  return readFileSync(
    join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    "utf8"
  );
}

interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  nodes: Array<{ target: string[] }>;
}

interface AxeResults {
  violations: AxeViolation[];
  passes: Array<{ id: string }>;
  incomplete: Array<{ id: string }>;
}

const NAV_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1500; // give CLS observer time to record late shifts
const VIEWPORT = { width: 1366, height: 768 };

interface InjectedMetrics {
  lcp: number;
  fcp: number;
  cls: number;
}

interface FooterInfo {
  found: boolean;
  top: number;
  bottom: number;
  height: number;
  position: string;
  belowFold: boolean;
  bodyHeight: number;
  viewportHeight: number;
}

interface PageMeasurements {
  vitals: InjectedMetrics;
  navigation: {
    domContentLoaded: number;
    loadEvent: number;
    ttfb: number;
  };
  layout: {
    bodyHeight: number;
    viewportHeight: number;
    docWidth: number;
    viewportWidth: number;
    horizontalOverflow: boolean;
    underfilled: boolean;
  };
  footer: FooterInfo;
  fontSizes: { tooSmallCount: number; total: number };
}

const PERFORMANCE_INIT_SCRIPT = `
  window.__lachesis = { lcp: 0, fcp: 0, cls: 0 };
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) window.__lachesis.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) window.__lachesis.cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === 'first-contentful-paint') window.__lachesis.fcp = e.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {}
`;

async function collectMeasurements(browser: Browser, url: string): Promise<{
  measurements: PageMeasurements;
  axe: AxeResults;
  screenshot: string;
}> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (compatible; LachesisBot/0.1 Headless; +https://github.com/CyberDemigods/lachesis)",
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(PERFORMANCE_INIT_SCRIPT);

  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "load",
      timeout: NAV_TIMEOUT_MS,
    });
  } catch (err) {
    await context.close();
    throw err;
  }

  // Settle period — let lazy CLS shifts and late LCP candidates record.
  await page.waitForTimeout(SETTLE_MS);

  const measurements = (await page.evaluate(() => {
    type Win = Window & { __lachesis?: { lcp: number; fcp: number; cls: number } };
    const w = window as Win;
    const vitals = w.__lachesis ?? { lcp: 0, fcp: 0, cls: 0 };

    const nav = (performance.getEntriesByType("navigation")[0] ?? {}) as PerformanceNavigationTiming;
    const navigation = {
      domContentLoaded: nav.domContentLoadedEventEnd ?? 0,
      loadEvent: nav.loadEventEnd ?? 0,
      ttfb: (nav.responseStart ?? 0) - (nav.requestStart ?? 0),
    };

    const bodyHeight = Math.max(
      document.body?.scrollHeight ?? 0,
      document.documentElement?.scrollHeight ?? 0
    );
    const viewportHeight = window.innerHeight;
    const docWidth = Math.max(
      document.body?.scrollWidth ?? 0,
      document.documentElement?.scrollWidth ?? 0
    );
    const viewportWidth = window.innerWidth;
    const layout = {
      bodyHeight,
      viewportHeight,
      docWidth,
      viewportWidth,
      horizontalOverflow: docWidth > viewportWidth + 1,
      // "Underfilled" = page is barely as tall as the viewport, footer hangs mid-screen.
      underfilled: bodyHeight < viewportHeight * 1.2,
    };

    const footerEl =
      (document.querySelector("footer") as HTMLElement | null) ??
      (document.querySelector("[role='contentinfo']") as HTMLElement | null);
    let footer: FooterInfoLocal;
    if (footerEl) {
      const r = footerEl.getBoundingClientRect();
      const cs = window.getComputedStyle(footerEl);
      footer = {
        found: true,
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        position: cs.position,
        belowFold: r.top >= viewportHeight - 1,
        bodyHeight,
        viewportHeight,
      };
    } else {
      footer = {
        found: false,
        top: 0,
        bottom: 0,
        height: 0,
        position: "static",
        belowFold: false,
        bodyHeight,
        viewportHeight,
      };
    }

    // Tiny font detection (a UX signal).
    const allText = Array.from(
      document.querySelectorAll("p, span, li, td, a, label, div")
    ) as HTMLElement[];
    let tooSmall = 0;
    for (const el of allText) {
      const fs = parseFloat(window.getComputedStyle(el).fontSize);
      if (fs && fs < 12 && (el.textContent?.trim().length ?? 0) > 10) tooSmall++;
    }

    type FooterInfoLocal = {
      found: boolean;
      top: number;
      bottom: number;
      height: number;
      position: string;
      belowFold: boolean;
      bodyHeight: number;
      viewportHeight: number;
    };

    return {
      vitals,
      navigation,
      layout,
      footer,
      fontSizes: { tooSmallCount: tooSmall, total: allText.length },
    };
  })) as PageMeasurements;

  // axe-core full scan — inject the bundled UMD source directly, then run.
  await page.addScriptTag({ content: loadAxeSource() });
  const axe = (await page.evaluate(async () => {
    type Win = Window & { axe?: { run: () => Promise<unknown> } };
    const w = window as Win;
    if (!w.axe) throw new Error("axe-core failed to inject");
    return await w.axe.run();
  })) as AxeResults;

  // Screenshot for downstream phase 2B (AI vision eval).
  const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
  const screenshot = buf.toString("base64");

  await context.close();
  return { measurements, axe, screenshot };
}

function findingsFromMeasurements(m: PageMeasurements): AuditFinding[] {
  const out: AuditFinding[] = [];

  // --- LCP ---
  if (m.vitals.lcp > 0) {
    let sev: AuditFinding["severity"];
    if (m.vitals.lcp > 4000) sev = "fail";
    else if (m.vitals.lcp > 2500) sev = "warn";
    else sev = "pass";
    out.push({
      id: "headless-lcp",
      title: `Largest Contentful Paint: ${(m.vitals.lcp / 1000).toFixed(2)}s`,
      description:
        "Google CWV thresholds: <2.5s good, 2.5–4s needs improvement, >4s poor.",
      severity: sev,
      weight: 3,
      value: Math.round(m.vitals.lcp),
    });
  }

  // --- FCP ---
  if (m.vitals.fcp > 0) {
    let sev: AuditFinding["severity"];
    if (m.vitals.fcp > 3000) sev = "fail";
    else if (m.vitals.fcp > 1800) sev = "warn";
    else sev = "pass";
    out.push({
      id: "headless-fcp",
      title: `First Contentful Paint: ${(m.vitals.fcp / 1000).toFixed(2)}s`,
      severity: sev,
      weight: 2,
      value: Math.round(m.vitals.fcp),
    });
  }

  // --- CLS ---
  let clsSev: AuditFinding["severity"];
  if (m.vitals.cls > 0.25) clsSev = "fail";
  else if (m.vitals.cls > 0.1) clsSev = "warn";
  else clsSev = "pass";
  out.push({
    id: "headless-cls",
    title: `Cumulative Layout Shift: ${m.vitals.cls.toFixed(3)}`,
    description:
      "Google CWV thresholds: <0.1 good, 0.1–0.25 needs improvement, >0.25 poor.",
    severity: clsSev,
    weight: 2,
    value: m.vitals.cls,
  });

  // --- Page load time ---
  if (m.navigation.loadEvent > 0) {
    let sev: AuditFinding["severity"];
    if (m.navigation.loadEvent > 5000) sev = "fail";
    else if (m.navigation.loadEvent > 3000) sev = "warn";
    else sev = "pass";
    out.push({
      id: "headless-load",
      title: `Total load time: ${(m.navigation.loadEvent / 1000).toFixed(2)}s`,
      severity: sev,
      weight: 2,
      value: Math.round(m.navigation.loadEvent),
    });
  }

  // --- Horizontal overflow ---
  out.push({
    id: "layout-horizontal-overflow",
    title: m.layout.horizontalOverflow
      ? `Horizontal scroll detected: doc ${m.layout.docWidth}px > viewport ${m.layout.viewportWidth}px`
      : "No horizontal overflow",
    description: m.layout.horizontalOverflow
      ? "Mobile users will see a scrollbar; usually a sign of broken responsive layout or overflowing element."
      : undefined,
    severity: m.layout.horizontalOverflow ? "fail" : "pass",
    weight: 4,
    meta: { docWidth: m.layout.docWidth, viewportWidth: m.layout.viewportWidth },
  });

  // --- Underfilled page (footer hangs mid-screen) ---
  out.push({
    id: "layout-underfilled",
    title: m.layout.underfilled
      ? `Page is shorter than the viewport (${m.layout.bodyHeight}px vs ${m.layout.viewportHeight}px)`
      : `Page content fills the viewport (${m.layout.bodyHeight}px)`,
    description: m.layout.underfilled
      ? "Content barely fills the screen — footer ends up floating in the middle of the page. Either there's not enough content, or the layout doesn't push the footer to the bottom (use min-height: 100vh + flex on the wrapper)."
      : undefined,
    severity: m.layout.underfilled ? "warn" : "pass",
    weight: 2,
    value: m.layout.bodyHeight,
  });

  // --- Footer detection / weird position ---
  if (m.footer.found) {
    const weirdFixedPos =
      (m.footer.position === "fixed" || m.footer.position === "absolute") &&
      m.footer.bottom > 0 &&
      m.footer.bottom < m.layout.viewportHeight - 50;
    if (weirdFixedPos) {
      out.push({
        id: "layout-footer-position",
        title: `Footer has unusual position: ${m.footer.position}, bottom edge at ${Math.round(m.footer.bottom)}px in viewport`,
        description:
          "Footer is fixed/absolute and not flush with the bottom — likely a layout bug.",
        severity: "warn",
        weight: 2,
      });
    }
  } else {
    out.push({
      id: "layout-no-footer",
      title: "No <footer> or [role='contentinfo'] element found",
      description:
        "Semantic footer landmarks help screen readers and SEO. Wrap the bottom region in <footer>.",
      severity: "warn",
      weight: 1,
    });
  }

  // --- Tiny fonts ---
  if (m.fontSizes.total > 0 && m.fontSizes.tooSmallCount / m.fontSizes.total > 0.15) {
    out.push({
      id: "layout-tiny-fonts",
      title: `${m.fontSizes.tooSmallCount}/${m.fontSizes.total} text elements use font-size <12px`,
      description:
        "Significant amount of text smaller than 12px hurts readability, especially on mobile.",
      severity: "warn",
      weight: 1,
    });
  }

  return out;
}

function findingsFromAxe(axe: AxeResults): AuditFinding[] {
  const out: AuditFinding[] = [];
  const buckets: Record<string, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const samples: Record<string, string[]> = {
    critical: [],
    serious: [],
    moderate: [],
    minor: [],
  };

  for (const v of axe.violations) {
    const impact = (v.impact ?? "moderate") as keyof typeof buckets;
    if (impact in buckets) {
      buckets[impact] += v.nodes.length;
      if (samples[impact].length < 3) samples[impact].push(v.id);
    }
  }

  if (buckets.critical > 0) {
    out.push({
      id: "a11y-critical",
      title: `axe-core: ${buckets.critical} critical accessibility violation node(s)`,
      description:
        "Critical issues (e.g. missing form labels, broken landmark structure) — high priority fixes.",
      severity: "fail",
      weight: 4,
      value: buckets.critical,
      meta: { rules: samples.critical },
    });
  } else {
    out.push({
      id: "a11y-critical",
      title: "No critical accessibility violations",
      severity: "pass",
      weight: 4,
    });
  }

  if (buckets.serious > 0) {
    out.push({
      id: "a11y-serious",
      title: `axe-core: ${buckets.serious} serious violation node(s)`,
      severity: buckets.serious > 5 ? "fail" : "warn",
      weight: 3,
      value: buckets.serious,
      meta: { rules: samples.serious },
    });
  } else {
    out.push({
      id: "a11y-serious",
      title: "No serious accessibility violations",
      severity: "pass",
      weight: 3,
    });
  }

  if (buckets.moderate > 0) {
    out.push({
      id: "a11y-moderate",
      title: `axe-core: ${buckets.moderate} moderate violation node(s)`,
      severity: "warn",
      weight: 1,
      value: buckets.moderate,
      meta: { rules: samples.moderate },
    });
  }

  if (buckets.minor > 0) {
    out.push({
      id: "a11y-minor",
      title: `axe-core: ${buckets.minor} minor violation node(s)`,
      severity: "info",
      value: buckets.minor,
      meta: { rules: samples.minor },
    });
  }

  out.push({
    id: "a11y-passes",
    title: `axe-core: ${axe.passes.length} accessibility checks passed`,
    severity: "info",
    meta: { count: axe.passes.length },
  });

  return out;
}

export async function runHeadlessAudit(url: string): Promise<{
  section: AuditSection;
  screenshot?: string;
}> {
  const start = performance.now();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const { measurements, axe, screenshot } = await collectMeasurements(browser, url);

    const findings = [
      ...findingsFromMeasurements(measurements),
      ...findingsFromAxe(axe),
    ];

    const scorable = findings.filter((f) => f.severity !== "info");
    const totalWeight = scorable.reduce((s, f) => s + (f.weight ?? 1), 0);
    const sumWeighted = scorable.reduce(
      (s, f) =>
        s +
        (f.severity === "pass" ? 1 : f.severity === "warn" ? 0.5 : 0) *
          (f.weight ?? 1),
      0
    );
    const score =
      totalWeight === 0 ? null : Math.round((sumWeighted / totalWeight) * 100);

    return {
      section: {
        module: "headless",
        score,
        findings,
        durationMs: performance.now() - start,
      },
      screenshot,
    };
  } catch (err) {
    return {
      section: {
        module: "headless",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
