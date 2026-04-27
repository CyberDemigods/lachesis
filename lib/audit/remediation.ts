/**
 * Remediation tips for audit findings — actionable "how to fix this" advice
 * keyed by finding ID. Returned as plain text with optional inline code in
 * single backticks; the UI renders single-backtick spans as <code>.
 *
 * Most entries are static strings. Conditional cases (where the fix depends
 * on the finding's value, e.g. title too short vs too long) are functions
 * receiving the finding for inspection.
 */

import type { AuditFinding } from "./types";

type Remediation = string | ((f: AuditFinding) => string);

const REMEDIATIONS: Record<string, Remediation> = {
  // === On-page · HTTP / transport ===
  "http-error": (f) => {
    const status = typeof f.value === "number" ? f.value : 0;
    if (status === 429 || status === 508) {
      return "Server is rate-limiting requests. Increase the throttle between scans, run during off-peak hours, or contact the hosting provider about resource limits.";
    }
    if (status === 404) {
      return "Page not found. Either the URL is wrong, the page has moved (redirect to its new location), or it should be removed from the sitemap.";
    }
    if (status >= 500) {
      return "Server error — investigate logs for stack traces, database connection issues, or out-of-memory errors. The page is unreachable for users and crawlers.";
    }
    return `HTTP ${status} — investigate the response. Search engines won't index pages returning 4xx/5xx.`;
  },
  "no-https": "Provision an SSL certificate (Let's Encrypt is free) and force redirect HTTP to HTTPS via your server config or `.htaccess`. Update internal links and the canonical URL to use `https://`.",

  // === On-page · meta ===
  "missing-title": "Add a `<title>` element inside `<head>` with 30-65 characters describing the page. Keep it unique per page and front-load the most important keyword.",
  "title-length": (f) => {
    const len = typeof f.value === "string" ? f.value.length : 0;
    if (len < 25)
      return "Title is too short to communicate purpose. Aim for 30-65 chars and include both the page topic and brand, e.g. `<title>Page Topic — Brand Name</title>`.";
    return "Title exceeds 65 chars and will be truncated in search results. Trim it while keeping the keyword and brand readable.";
  },
  "missing-meta-description": "Add `<meta name=\"description\" content=\"...\">` to `<head>`. Aim for 70-160 chars summarising the page — search engines often display this snippet in results.",
  "meta-description-length": (f) => {
    const len = typeof f.value === "string" ? f.value.length : 0;
    if (len < 70)
      return "Description is too brief. Expand to 70-160 chars with a concise summary that entices clicks.";
    return "Description will be cut off in SERP. Trim to 160 chars or fewer while keeping the most compelling sentence first.";
  },
  "html-lang":
    "Add a `lang` attribute to the `<html>` element, e.g. `<html lang=\"en\">` or `<html lang=\"pl\">`. Critical for screen readers, browser translation, and locale-targeted SEO.",
  "lang-content-mismatch": (f) => {
    const declared =
      (f.meta as { declaredLang?: string } | undefined)?.declaredLang ?? "??";
    return `Declared language \`${declared}\` contradicts the actual content. Update \`<html lang>\` to match — for Polish content use \`<html lang="pl">\`, for English \`<html lang="en">\`, etc.`;
  },
  viewport:
    "Add `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">` to `<head>`. Without this, mobile browsers render the page as a 980px-wide desktop view zoomed out — terrible UX and a hard-fail for mobile-first indexing.",
  charset:
    "Declare charset early in `<head>`: `<meta charset=\"UTF-8\">`. Should be the first child of `<head>` so the parser knows how to decode the rest.",
  canonical:
    "Add `<link rel=\"canonical\" href=\"https://yoursite.com/this-page\">` to `<head>` pointing to the preferred URL of this page. Prevents duplicate-content issues from query params, trailing slashes, http/https, and www/non-www variants.",
  "robots-noindex":
    "Remove `noindex` from `<meta name=\"robots\">` if you want this page in search results. Common cause: a CMS staging flag accidentally left on after launch.",

  // === On-page · structure ===
  "h1-count": (f) => {
    const n = typeof f.value === "number" ? f.value : 0;
    if (n === 0)
      return "Add exactly one `<h1>` containing the page's main heading. The H1 is the strongest on-page topic signal for search engines and the primary landmark for screen readers.";
    return "Reduce to one `<h1>` per page. Demote secondary headings to `<h2>`/`<h3>`. Multiple H1s dilute topical clarity.";
  },
  "open-graph":
    "Add the three core Open Graph tags so the page previews well when shared on social platforms: `<meta property=\"og:title\">`, `<meta property=\"og:description\">`, `<meta property=\"og:image\">` (1200×630 recommended).",
  "twitter-card":
    "Add `<meta name=\"twitter:card\" content=\"summary_large_image\">` plus matching `twitter:title`, `twitter:description`, `twitter:image`. Falls back to Open Graph if missing, but explicit tags give you more control on Twitter/X.",
  "json-ld":
    "Add structured data via `<script type=\"application/ld+json\">` describing the page (Article, Product, Organization, BreadcrumbList, FAQPage, etc. — see schema.org). Enables rich results in Google.",
  "alt-coverage":
    "Add an `alt` attribute to every `<img>`. Use `alt=\"\"` (empty) for purely decorative images, descriptive text for content images. Required by WCAG and used by search engines to understand image content.",
  hreflang:
    "Already declaring hreflang — make sure each language variant uses correct `xx-YY` codes (e.g. `pl-PL`, `en-GB`, `en-US`) and that variants reciprocally reference each other.",
  "word-count": (f) => {
    const n = typeof f.value === "number" ? f.value : 0;
    if (n < 100)
      return "Page is essentially empty for crawlers. Add real content — at least 300+ words of meaningful text. If this is a landing page for an image gallery or app, ensure key context (purpose, value prop, descriptions) is in HTML, not just images.";
    return "Add more substantive content. Pages with 300+ words of original, useful text rank consistently better. Cover the topic thoroughly rather than padding.";
  },

  // === Image performance ===
  "image-total-weight":
    "Compress images aggressively. Targets: hero <200KB, content images <100KB, thumbnails <30KB. Convert to WebP/AVIF for 25-50% smaller files. Use responsive `srcset` so mobile devices download mobile-sized images, not desktop ones.",
  "image-avg-load":
    "Slow image fetches usually mean: no CDN, slow origin, no HTTP/2, no caching. Add a CDN (Cloudflare, Bunny, Vercel), enable HTTP/2 or HTTP/3, and set `Cache-Control: public, max-age=31536000, immutable` for fingerprinted assets.",
  "image-slowest":
    "Profile this specific image. Common fixes: compress (mozjpeg, cwebp, avifenc), serve via CDN, add `loading=\"lazy\"` if it's below the fold, or replace with a smaller variant via `srcset`.",
  "image-heaviest":
    "This image is enormous. Run it through `cwebp -q 80` or `avifenc -q 65` — typically 60-80% size reduction. For photos, also consider `mozjpeg -quality 80`. Then add responsive variants via `<picture>` so mobile gets a smaller version.",
  "image-lazy-loading":
    "Add `loading=\"lazy\"` to all images below the fold. Browsers will defer their fetch until the user scrolls near them. Critical above-the-fold images should keep `loading=\"eager\"` (default).",
  "image-modern-formats":
    "Replace JPG/PNG with WebP and/or AVIF. Use `<picture>` with fallback: `<picture><source type=\"image/avif\" srcset=\"...\"><source type=\"image/webp\" srcset=\"...\"><img src=\"fallback.jpg\"></picture>`. Most CDNs and image hosts can do this transformation automatically.",
  "image-fetch-errors":
    "Some images returned errors (404, timeout, network). Check broken `src` paths, expired CDN URLs, or rate-limited origins.",

  // === Headless · Web Vitals ===
  "headless-lcp":
    "Optimise the Largest Contentful Paint element. Common wins: preload the hero image with `<link rel=\"preload\" as=\"image\" href=\"...\">`, defer non-critical CSS/JS, reduce server response time, eliminate render-blocking resources.",
  "headless-fcp":
    "Reduce time to First Contentful Paint. Key levers: critical CSS inlined, render-blocking JS deferred (`<script defer>` or `async`), system fonts or `font-display: swap`, reduce TTFB via better hosting/CDN.",
  "headless-cls":
    "Cumulative Layout Shift fixes: set explicit `width` and `height` attributes on all `<img>`, `<iframe>`, and embedded videos so the browser reserves space. Avoid inserting content above existing content (e.g. ad slots that push everything down). Reserve space for ads, banners, and dynamic widgets.",
  "headless-load":
    "Total load time is dragged out by render-blocking resources or slow assets. Audit waterfall in DevTools, defer or lazy-load below-the-fold scripts and images, enable HTTP/2 server push or 103 Early Hints if available.",

  // === Headless · layout ===
  "layout-horizontal-overflow":
    "Hunt the offending element — usually an image, table, `<pre>`, or hard-coded width without `max-width: 100%`. Quick check: `* { outline: 1px solid red; }` in DevTools highlights overflows. Avoid `overflow-x: hidden` as a band-aid — fix the source.",
  "layout-underfilled":
    "Page content doesn't fill the viewport so the footer floats mid-screen. Use a flex layout on the wrapper: `body { display: flex; flex-direction: column; min-height: 100vh; } main { flex: 1; }`. The footer will stick to the bottom regardless of content height.",
  "layout-footer-position":
    "Footer is positioned `fixed` or `absolute` at coordinates that don't match the bottom of the page. Either remove the positioning (let it flow naturally) or adjust to `position: fixed; bottom: 0;` if you want it always visible.",
  "layout-no-footer":
    "Wrap the bottom region in a semantic `<footer>` element (or `role=\"contentinfo\"`). Helps screen readers identify the footer landmark and improves SEO understanding of page structure.",
  "layout-tiny-fonts":
    "Increase body text size to 14-16px minimum (16px recommended). Sub-12px text is hard to read on mobile and fails WCAG. Use `rem` units and let users override via browser settings.",

  // === Accessibility (axe-core) ===
  "a11y-critical":
    "Fix critical accessibility violations first — they prevent assistive tech users from using the page. Common: missing form labels, broken landmark structure, keyboard traps, missing alt text. Each axe rule has a help URL with examples (search the rule ID at deque.com/axe).",
  "a11y-serious":
    "Address serious violations: insufficient color contrast, missing ARIA labels on interactive elements, focus order issues, missing skip-to-content link. WCAG AA compliance is the typical legal threshold.",
  "a11y-moderate":
    "Moderate violations are mostly heading order, redundant ARIA, and minor contrast issues. Worth fixing for polish but not blocking.",

  // === Locale (Polish) ===
  "pl-diacritics":
    "Polish characters appear corrupted — encoding mismatch. Save all HTML/CSS/JS files as UTF-8 (no BOM), and send `Content-Type: text/html; charset=UTF-8` header. Add `<meta charset=\"UTF-8\">` as the first child of `<head>`.",
  "pl-rodo":
    "Polish sites collecting any user data (forms, cookies, analytics) need a privacy policy referencing RODO. Add a `Polityka prywatności` link in the footer linking to a page covering: data controller, purposes, legal basis, retention, user rights (access/erase/export), data transfers, contact for data protection officer.",
  "pl-cookie-banner":
    "If you use non-essential cookies (analytics, marketing, embeds), display a cookie consent banner. Must offer granular choices (Accept all / Reject all / Customize) — pre-checked boxes and \"continue using = consent\" patterns are illegal under RODO/ePrivacy.",
};

export function getRemediation(finding: AuditFinding): string | undefined {
  const entry = REMEDIATIONS[finding.id];
  if (typeof entry === "string") return entry;
  if (typeof entry === "function") return entry(finding);
  return undefined;
}

/**
 * Render a remediation string with single-backtick code spans converted to
 * `<code>` markup. Returns an array of text/code segments for the UI to map.
 */
export function parseRemediationSegments(
  text: string
): Array<{ kind: "text" | "code"; value: string }> {
  const out: Array<{ kind: "text" | "code"; value: string }> = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "code", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
