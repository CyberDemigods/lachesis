/**
 * Locale-specific audit. Currently focused on Polish (pl) but extensible.
 * Detects locale from <html lang>, then runs language-specific heuristics.
 *
 * Polish heuristics:
 *  - Polish characters render correctly (ą ę ć ł ń ó ś ź ż not mojibake)
 *  - NIP / REGON / KRS numbers in expected formats when company data is present
 *  - Cookie banner mentions RODO / GDPR
 *  - Privacy policy link present (Polityka prywatności / Polityka cookies)
 */

import * as cheerio from "cheerio";
import type { AuditFinding, AuditSection } from "./types";

const PL_DIACRITICS = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";
// Common mojibake patterns when UTF-8 is read as Latin-1
const MOJIBAKE_HINTS = ["Ã³", "Ã¡", "Ä…", "Å‚", "Ã„", "Ã™"];

export function runLocaleAudit(html: string): AuditSection {
  const start = performance.now();
  const findings: AuditFinding[] = [];

  const $ = cheerio.load(html);
  const lang = ($("html").attr("lang") ?? "").toLowerCase();
  const isPolish =
    lang.startsWith("pl") ||
    new RegExp(`[${PL_DIACRITICS}]`).test($("body").text());

  if (!isPolish) {
    return {
      module: "locale",
      score: null,
      findings: [
        {
          id: "locale-not-polish",
          title: "Page does not appear to be Polish — skipping PL-specific checks",
          severity: "info",
          value: lang || null,
        },
      ],
      durationMs: performance.now() - start,
    };
  }

  // --- PL diacritics rendering ---
  const bodyText = $("body").text();
  const hasMojibake = MOJIBAKE_HINTS.some((m) => bodyText.includes(m));
  findings.push({
    id: "pl-diacritics",
    title: hasMojibake
      ? "Polish characters appear corrupted (encoding mismatch)"
      : "Polish characters render correctly",
    description: hasMojibake
      ? "Likely a charset mismatch — ensure UTF-8 in <meta charset> and HTTP headers."
      : undefined,
    severity: hasMojibake ? "fail" : "pass",
  });

  // --- RODO / cookie consent mention ---
  const lowerText = bodyText.toLowerCase();
  const hasRodo =
    lowerText.includes("rodo") ||
    lowerText.includes("gdpr") ||
    lowerText.includes("polityka prywatności") ||
    lowerText.includes("polityka cookies");
  findings.push({
    id: "pl-rodo",
    title: hasRodo
      ? "RODO / privacy mention found"
      : "No mention of RODO / privacy policy on page",
    description: hasRodo
      ? undefined
      : "Polish sites collecting user data should reference RODO and link to a privacy policy.",
    severity: hasRodo ? "pass" : "warn",
  });

  // --- Cookie banner heuristic ---
  const cookieMentions = ["cookie", "ciasteczka", "akceptuj", "zgadzam się"];
  const cookieBannerLikely = cookieMentions.filter((w) =>
    lowerText.includes(w)
  ).length;
  findings.push({
    id: "pl-cookie-banner",
    title:
      cookieBannerLikely >= 2
        ? "Cookie banner / consent terminology detected"
        : "No obvious cookie consent terminology",
    severity: cookieBannerLikely >= 2 ? "pass" : "warn",
    value: cookieBannerLikely,
  });

  // --- NIP / REGON / KRS detection (footer / contact) ---
  const nip = /NIP[:\s]*([0-9\-\s]{10,15})/i.exec(bodyText);
  const regon = /REGON[:\s]*([0-9\-\s]{9,15})/i.exec(bodyText);
  const krs = /KRS[:\s]*([0-9\-\s]{10,15})/i.exec(bodyText);
  if (nip || regon || krs) {
    findings.push({
      id: "pl-company-ids",
      title: "Polish business identifiers found",
      severity: "info",
      meta: {
        nip: nip?.[1]?.trim() ?? null,
        regon: regon?.[1]?.trim() ?? null,
        krs: krs?.[1]?.trim() ?? null,
      },
    });
  }

  // --- hreflang for Polish ---
  const plHreflang = $('link[rel="alternate"][hreflang^="pl"]').length;
  if (plHreflang > 0) {
    findings.push({
      id: "pl-hreflang",
      title: `hreflang variants for pl-*: ${plHreflang}`,
      severity: "pass",
      value: plHreflang,
    });
  }

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
    module: "locale",
    score,
    findings,
    durationMs: performance.now() - start,
  };
}
