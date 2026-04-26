/**
 * On-page SEO audit. Server-side fetch of the URL's raw HTML, parsed with
 * cheerio. Doesn't execute JS — for SPAs use the headless module.
 */

import * as cheerio from "cheerio";
import type { AuditFinding, AuditSection } from "./types";

const TITLE_MIN = 30;
const TITLE_MAX = 65;
const DESC_MIN = 70;
const DESC_MAX = 160;
const MIN_WORDS = 300;

interface PageData {
  html: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
}

async function fetchPage(url: string): Promise<PageData> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LachesisBot/0.1; +https://github.com/CyberDemigods/lachesis)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  const html = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { html, finalUrl: res.url, status: res.status, headers };
}

export async function runOnPageAudit(url: string): Promise<{
  section: AuditSection;
  page: PageData | null;
}> {
  const start = performance.now();
  const findings: AuditFinding[] = [];
  let page: PageData | null = null;

  try {
    page = await fetchPage(url);
    const $ = cheerio.load(page.html);

    // --- HTTP status ---
    if (page.status >= 400) {
      findings.push({
        id: "http-error",
        title: `Page returned HTTP ${page.status}`,
        severity: "fail",
        value: page.status,
      });
    } else if (page.status >= 300) {
      findings.push({
        id: "http-redirect",
        title: `Page redirected (final URL ${page.finalUrl})`,
        severity: "info",
        value: page.status,
      });
    }

    // --- HTTPS ---
    if (page.finalUrl.startsWith("http://")) {
      findings.push({
        id: "no-https",
        title: "Page is served over plain HTTP",
        description: "Search engines and browsers strongly prefer HTTPS. Migrate the site to TLS.",
        severity: "fail",
      });
    } else {
      findings.push({ id: "https", title: "Served over HTTPS", severity: "pass" });
    }

    // --- <title> ---
    const title = $("head > title").first().text().trim();
    if (!title) {
      findings.push({
        id: "missing-title",
        title: "Missing <title> tag",
        severity: "fail",
      });
    } else {
      const len = title.length;
      const sev: AuditFinding["severity"] =
        len >= TITLE_MIN && len <= TITLE_MAX ? "pass" : "warn";
      findings.push({
        id: "title-length",
        title: `Title length: ${len} chars`,
        description: `Recommended ${TITLE_MIN}–${TITLE_MAX} chars.`,
        severity: sev,
        value: title,
      });
    }

    // --- Meta description ---
    const desc = $('head meta[name="description"]').attr("content")?.trim();
    if (!desc) {
      findings.push({
        id: "missing-meta-description",
        title: "Missing meta description",
        severity: "fail",
      });
    } else {
      const len = desc.length;
      const sev: AuditFinding["severity"] =
        len >= DESC_MIN && len <= DESC_MAX ? "pass" : "warn";
      findings.push({
        id: "meta-description-length",
        title: `Meta description length: ${len} chars`,
        description: `Recommended ${DESC_MIN}–${DESC_MAX} chars.`,
        severity: sev,
        value: desc,
      });
    }

    // --- <html lang> ---
    const lang = $("html").attr("lang");
    findings.push({
      id: "html-lang",
      title: lang ? `Language declared: ${lang}` : "Missing <html lang> attribute",
      severity: lang ? "pass" : "warn",
      value: lang ?? null,
    });

    // --- Viewport ---
    const viewport = $('head meta[name="viewport"]').attr("content");
    findings.push({
      id: "viewport",
      title: viewport ? "Viewport meta present" : "Missing viewport meta",
      severity: viewport ? "pass" : "fail",
      value: viewport ?? null,
    });

    // --- Charset ---
    const charset =
      $("head meta[charset]").attr("charset") ||
      $('head meta[http-equiv="Content-Type"]').attr("content");
    findings.push({
      id: "charset",
      title: charset ? `Charset: ${charset}` : "Missing charset declaration",
      severity: charset ? "pass" : "warn",
      value: charset ?? null,
    });

    // --- Canonical ---
    const canonical = $('head link[rel="canonical"]').attr("href");
    findings.push({
      id: "canonical",
      title: canonical ? "Canonical URL set" : "Missing canonical URL",
      severity: canonical ? "pass" : "warn",
      value: canonical ?? null,
    });

    // --- Robots meta ---
    const robots = $('head meta[name="robots"]').attr("content");
    if (robots && /noindex/i.test(robots)) {
      findings.push({
        id: "robots-noindex",
        title: "Page is set to noindex",
        description: "Page will not appear in search results.",
        severity: "fail",
        value: robots,
      });
    } else {
      findings.push({
        id: "robots-meta",
        title: robots ? `Robots meta: ${robots}` : "No robots meta (defaults to index, follow)",
        severity: "info",
        value: robots ?? null,
      });
    }

    // --- Headings ---
    const h1Count = $("h1").length;
    const h1Texts = $("h1").map((_, el) => $(el).text().trim()).get();
    findings.push({
      id: "h1-count",
      title: `H1 count: ${h1Count}`,
      description:
        h1Count === 1
          ? "Exactly one H1 (recommended)."
          : h1Count === 0
          ? "Missing H1 tag."
          : "Multiple H1 tags — best practice is exactly one.",
      severity: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
      value: h1Count,
      meta: { texts: h1Texts },
    });

    const headingCounts: Record<string, number> = {};
    for (let i = 1; i <= 6; i++) {
      headingCounts[`h${i}`] = $(`h${i}`).length;
    }
    findings.push({
      id: "heading-hierarchy",
      title: `Heading distribution: ${Object.entries(headingCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
      severity: "info",
      meta: headingCounts,
    });

    // --- Open Graph ---
    const ogTitle = $('head meta[property="og:title"]').attr("content");
    const ogDesc = $('head meta[property="og:description"]').attr("content");
    const ogImage = $('head meta[property="og:image"]').attr("content");
    const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
    findings.push({
      id: "open-graph",
      title: `Open Graph tags: ${ogCount}/3 core (title/description/image)`,
      severity: ogCount === 3 ? "pass" : ogCount > 0 ? "warn" : "fail",
      meta: { ogTitle, ogDesc, ogImage },
    });

    // --- Twitter Card ---
    const twitterCard = $('head meta[name="twitter:card"]').attr("content");
    findings.push({
      id: "twitter-card",
      title: twitterCard ? `Twitter card: ${twitterCard}` : "No Twitter card meta",
      severity: twitterCard ? "pass" : "info",
      value: twitterCard ?? null,
    });

    // --- JSON-LD Structured data ---
    const jsonLdBlocks: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        jsonLdBlocks.push(JSON.parse($(el).text()));
      } catch {
        // skip malformed
      }
    });
    findings.push({
      id: "json-ld",
      title: `Structured data (JSON-LD) blocks: ${jsonLdBlocks.length}`,
      severity: jsonLdBlocks.length > 0 ? "pass" : "warn",
      value: jsonLdBlocks.length,
      meta: { blocks: jsonLdBlocks },
    });

    // --- Images & alt text ---
    const images = $("img");
    const imagesWithAlt = images.filter((_, el) => {
      const a = $(el).attr("alt");
      return a !== undefined && a !== "";
    }).length;
    const imagesMissingAlt = images.length - imagesWithAlt;
    findings.push({
      id: "alt-coverage",
      title: `Alt text coverage: ${imagesWithAlt}/${images.length} images`,
      description:
        imagesMissingAlt > 0
          ? `${imagesMissingAlt} <img> tags without alt attribute (or empty).`
          : "All images have alt text.",
      severity:
        images.length === 0 ? "info" : imagesMissingAlt === 0 ? "pass" : "warn",
      value: imagesMissingAlt,
      meta: { total: images.length, withAlt: imagesWithAlt },
    });

    // --- Word count ---
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText ? bodyText.split(" ").length : 0;
    findings.push({
      id: "word-count",
      title: `Word count: ${wordCount}`,
      description:
        wordCount < MIN_WORDS
          ? `Below the ${MIN_WORDS}-word threshold often used as a thin-content marker.`
          : undefined,
      severity: wordCount >= MIN_WORDS ? "pass" : "warn",
      value: wordCount,
    });

    // --- Internal vs external links ---
    let internal = 0;
    let external = 0;
    let nofollowExternal = 0;
    const origin = new URL(page.finalUrl).origin;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const rel = $(el).attr("rel") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      try {
        const abs = new URL(href, page!.finalUrl);
        if (abs.origin === origin) internal++;
        else {
          external++;
          if (/nofollow/i.test(rel)) nofollowExternal++;
        }
      } catch {
        // ignore malformed
      }
    });
    findings.push({
      id: "links",
      title: `Links: ${internal} internal, ${external} external (${nofollowExternal} nofollow)`,
      severity: "info",
      meta: { internal, external, nofollowExternal },
    });

    // --- Hreflang ---
    const hreflang = $('head link[rel="alternate"][hreflang]').length;
    if (hreflang > 0) {
      findings.push({
        id: "hreflang",
        title: `Hreflang variants declared: ${hreflang}`,
        severity: "pass",
        value: hreflang,
      });
    }

    // --- Server headers (security/perf hints) ---
    const xfo = page.headers["x-frame-options"];
    const csp = page.headers["content-security-policy"];
    findings.push({
      id: "security-headers",
      title: "Security headers",
      severity: "info",
      meta: {
        "x-frame-options": xfo ?? null,
        "content-security-policy": csp ?? null,
        "strict-transport-security": page.headers["strict-transport-security"] ?? null,
        "x-content-type-options": page.headers["x-content-type-options"] ?? null,
      },
    });
  } catch (err) {
    return {
      section: {
        module: "on-page",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
      page: null,
    };
  }

  // Score: pass=1, info=1, warn=0.5, fail=0 — average × 100
  const scorable = findings.filter((f) => f.severity !== "info");
  const score =
    scorable.length === 0
      ? 100
      : Math.round(
          (scorable.reduce(
            (sum, f) =>
              sum + (f.severity === "pass" ? 1 : f.severity === "warn" ? 0.5 : 0),
            0
          ) /
            scorable.length) *
            100
        );

  return {
    section: {
      module: "on-page",
      score,
      findings,
      durationMs: performance.now() - start,
    },
    page,
  };
}
