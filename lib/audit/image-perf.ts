/**
 * Image performance audit. Server-side fetches a sample of `<img>` URLs
 * found in the rendered HTML and measures their byte size and TTFB-to-end
 * time. Aggregates into total weight and average load time signals.
 *
 * This is a coarse-grained proxy for what users experience — without a real
 * browser we can't measure render time, decode time, or LCP — but heavy /
 * slow images are catchable here cheaply. Headless module fills the gap.
 */

import * as cheerio from "cheerio";
import type { AuditFinding, AuditSection } from "./types";

const SAMPLE_LIMIT = 12;
const PER_IMAGE_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 30_000;

interface ImageResult {
  url: string;
  bytes?: number;
  ms?: number;
  status?: number;
  error?: string;
}

async function fetchImage(url: string): Promise<ImageResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PER_IMAGE_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LachesisBot/0.1; +https://github.com/CyberDemigods/lachesis)",
      },
    });
    const buf = await res.arrayBuffer();
    return {
      url,
      bytes: buf.byteLength,
      ms: performance.now() - start,
      status: res.status,
    };
  } catch (err) {
    return {
      url,
      error: err instanceof Error ? err.message : String(err),
      ms: performance.now() - start,
    };
  }
}

export async function runImagePerfAudit(
  html: string,
  baseUrl: string
): Promise<AuditSection> {
  const start = performance.now();
  const findings: AuditFinding[] = [];

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const urls: string[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("data:")) return;
    try {
      const abs = new URL(src, baseUrl).href;
      if (!seen.has(abs)) {
        seen.add(abs);
        urls.push(abs);
      }
    } catch {
      // skip malformed
    }
  });

  if (urls.length === 0) {
    return {
      module: "image-perf",
      score: null,
      findings: [
        {
          id: "image-no-images",
          title: "No images detected on the page",
          severity: "info",
        },
      ],
      durationMs: performance.now() - start,
    };
  }

  const sample = urls.slice(0, SAMPLE_LIMIT);
  let results: ImageResult[];
  try {
    results = await Promise.race([
      Promise.all(sample.map(fetchImage)),
      new Promise<ImageResult[]>((_, reject) =>
        setTimeout(
          () => reject(new Error("Image-perf overall timeout")),
          TOTAL_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    results = sample.map((url) => ({
      url,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  const successful = results.filter(
    (r): r is ImageResult & { bytes: number; ms: number } =>
      typeof r.bytes === "number" && typeof r.ms === "number"
  );
  const failed = results.length - successful.length;

  if (successful.length === 0) {
    return {
      module: "image-perf",
      score: null,
      findings: [
        {
          id: "image-fetch-failed",
          title: `Failed to fetch any of the ${results.length} sampled images`,
          severity: "warn",
          weight: 1,
        },
      ],
      durationMs: performance.now() - start,
    };
  }

  const totalBytes = successful.reduce((s, r) => s + (r.bytes ?? 0), 0);
  const avgMs =
    successful.reduce((s, r) => s + (r.ms ?? 0), 0) / successful.length;
  const slowest = [...successful].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))[0];
  const heaviest = [...successful].sort(
    (a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)
  )[0];

  // --- Total weight ---
  const totalMb = totalBytes / 1024 / 1024;
  let totalSev: AuditFinding["severity"];
  let totalDesc: string | undefined;
  if (totalMb > 5) {
    totalSev = "fail";
    totalDesc = "Sampled image weight exceeds 5 MB — heavy hit on mobile and bandwidth-constrained users.";
  } else if (totalMb > 2) {
    totalSev = "warn";
    totalDesc = "Sampled image weight 2–5 MB. Consider WebP/AVIF and responsive sizes.";
  } else {
    totalSev = "pass";
  }
  findings.push({
    id: "image-total-weight",
    title: `Total image weight (${successful.length}/${urls.length} sampled): ${totalMb.toFixed(2)} MB`,
    description: totalDesc,
    severity: totalSev,
    weight: 3,
    value: Math.round(totalBytes),
    meta: { sampled: successful.length, total: urls.length },
  });

  // --- Average load time ---
  let avgSev: AuditFinding["severity"];
  let avgDesc: string | undefined;
  if (avgMs > 1500) {
    avgSev = "fail";
    avgDesc = "Average image fetch >1.5s. Major contributor to slow perceived load.";
  } else if (avgMs > 800) {
    avgSev = "warn";
    avgDesc = "Average image fetch 800–1500ms. Consider CDN, compression, or lazy-loading.";
  } else {
    avgSev = "pass";
  }
  findings.push({
    id: "image-avg-load",
    title: `Average image load time: ${Math.round(avgMs)} ms`,
    description: avgDesc,
    severity: avgSev,
    weight: 3,
    value: Math.round(avgMs),
  });

  // --- Slowest single image (only flag if notably slow) ---
  if (slowest && (slowest.ms ?? 0) > 2000) {
    findings.push({
      id: "image-slowest",
      title: `Slowest image: ${Math.round(slowest.ms ?? 0)} ms`,
      description: slowest.url,
      severity: (slowest.ms ?? 0) > 4000 ? "fail" : "warn",
      weight: 1,
      value: Math.round(slowest.ms ?? 0),
    });
  }

  // --- Heaviest single image ---
  const heaviestMb = (heaviest?.bytes ?? 0) / 1024 / 1024;
  if (heaviestMb > 1) {
    findings.push({
      id: "image-heaviest",
      title: `Heaviest single image: ${heaviestMb.toFixed(2)} MB`,
      description:
        heaviest?.url +
        " — consider compression / WebP / responsive sizes (srcset).",
      severity: heaviestMb > 3 ? "fail" : "warn",
      weight: 2,
      value: Math.round(heaviest?.bytes ?? 0),
    });
  }

  // --- Lazy loading hint ---
  const totalImgs = $("img").length;
  const lazyImgs = $('img[loading="lazy"]').length;
  if (totalImgs > 5) {
    const lazyRatio = lazyImgs / totalImgs;
    findings.push({
      id: "image-lazy-loading",
      title: `Lazy loading: ${lazyImgs}/${totalImgs} images use loading="lazy"`,
      description:
        lazyRatio < 0.3
          ? "Most images load eagerly. Add loading=\"lazy\" to off-screen images."
          : undefined,
      severity: lazyRatio >= 0.5 ? "pass" : lazyRatio > 0 ? "warn" : "fail",
      weight: 1,
      value: lazyImgs,
      meta: { total: totalImgs, lazy: lazyImgs },
    });
  }

  // --- Modern format hint ---
  const webpCount = $('img[src$=".webp"], picture source[type="image/webp"]').length;
  const avifCount = $('img[src$=".avif"], picture source[type="image/avif"]').length;
  if (totalImgs > 3) {
    const modernCount = webpCount + avifCount;
    findings.push({
      id: "image-modern-formats",
      title: `Modern formats: ${webpCount} WebP + ${avifCount} AVIF`,
      severity: modernCount > 0 ? "pass" : "warn",
      weight: 1,
      meta: { webp: webpCount, avif: avifCount, total: totalImgs },
    });
  }

  if (failed > 0) {
    findings.push({
      id: "image-fetch-errors",
      title: `${failed} image(s) failed to fetch (404, timeout, or network error)`,
      severity: "warn",
      weight: 1,
      value: failed,
    });
  }

  // Weighted score
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
    totalWeight === 0 ? 100 : Math.round((sumWeighted / totalWeight) * 100);

  return {
    module: "image-perf",
    score,
    findings,
    durationMs: performance.now() - start,
  };
}
