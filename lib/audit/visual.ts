/**
 * Visual evaluation module. Takes the screenshot captured by the headless
 * module and sends it to a local vision-language model (via LM Studio's
 * OpenAI-compatible API) for qualitative judgment of design quality.
 *
 * Configured by env vars:
 *   LM_STUDIO_URL   default "http://192.168.0.38:1234"
 *   VISION_MODEL    default "qwen3-vl-4b-instruct"
 *
 * The model is asked to return strict JSON with scores and comments for
 * six design dimensions (composition, hierarchy, professionalism,
 * readability, typography, color). Each dimension is mapped to a finding;
 * scores aggregate into the new `visual` category.
 */

import type { AuditFinding, AuditSection } from "./types";

const DEFAULT_URL = "http://192.168.0.38:1234";
const DEFAULT_MODEL = "qwen3-vl-4b-instruct";
const TIMEOUT_MS = 90_000;

const DIMENSIONS = [
  "composition",
  "hierarchy",
  "professionalism",
  "readability",
  "typography",
  "color",
] as const;

interface DimensionRating {
  score: number;
  comment: string;
}

interface VisualReport {
  composition: DimensionRating;
  hierarchy: DimensionRating;
  professionalism: DimensionRating;
  readability: DimensionRating;
  typography: DimensionRating;
  color: DimensionRating;
  overall_impression: string;
}

const SYSTEM_PROMPT = `You are a senior visual/UX designer evaluating a website screenshot. You judge quickly and honestly. You never invent praise. You always return strict JSON.`;

const USER_PROMPT = `Rate the design of this website screenshot across six dimensions, each 0-100:

- composition: layout balance, whitespace, alignment, grid discipline
- hierarchy: visual flow, signaling of importance, reading order
- professionalism: overall polish, attention to detail, perceived quality of work
- readability: text legibility, contrast, font sizing, line length
- typography: font choices, consistency, type scale, kerning/spacing
- color: harmony, palette discipline, appropriate use of accents, brand cohesion

Scoring guide:
- 90-100: exceptional, portfolio-grade
- 75-89: solid professional work
- 50-74: acceptable but with clear weaknesses
- 25-49: noticeably amateur or broken
- 0-24: unusable / serious problems

Return ONLY a JSON object in this exact shape, no markdown fences, no preamble:

{
  "composition": {"score": 75, "comment": "one sentence"},
  "hierarchy": {"score": 60, "comment": "one sentence"},
  "professionalism": {"score": 65, "comment": "one sentence"},
  "readability": {"score": 80, "comment": "one sentence"},
  "typography": {"score": 70, "comment": "one sentence"},
  "color": {"score": 85, "comment": "one sentence"},
  "overall_impression": "one sentence summary"
}`;

function extractJson(text: string): string | null {
  // Strip markdown fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Find the first { ... } block (greedy).
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}

function severityFromScore(score: number): AuditFinding["severity"] {
  if (score >= 80) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

function isValidReport(obj: unknown): obj is VisualReport {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  for (const dim of DIMENSIONS) {
    const v = o[dim];
    if (!v || typeof v !== "object") return false;
    const vv = v as Record<string, unknown>;
    if (typeof vv.score !== "number" || typeof vv.comment !== "string") return false;
  }
  return true;
}

export async function runVisualAudit(
  screenshotBase64: string | undefined
): Promise<AuditSection> {
  const start = performance.now();

  if (!screenshotBase64) {
    return {
      module: "visual",
      score: null,
      findings: [
        {
          id: "visual-no-screenshot",
          title: "Visual audit skipped — no screenshot from headless module",
          severity: "info",
        },
      ],
      durationMs: performance.now() - start,
    };
  }

  const url = process.env.LM_STUDIO_URL ?? DEFAULT_URL;
  const model = process.env.VISION_MODEL ?? DEFAULT_MODEL;

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
          },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
  };

  let raw: string;
  try {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        module: "visual",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: `LM Studio HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    raw = data.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return {
      module: "visual",
      score: null,
      findings: [],
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const jsonStr = extractJson(raw);
  if (!jsonStr) {
    return {
      module: "visual",
      score: null,
      findings: [],
      durationMs: performance.now() - start,
      error: `Vision model returned non-JSON response (first 200 chars): ${raw.slice(0, 200)}`,
    };
  }

  let report: VisualReport;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!isValidReport(parsed)) {
      return {
        module: "visual",
        score: null,
        findings: [],
        durationMs: performance.now() - start,
        error: "Vision model returned JSON with missing or malformed dimension fields",
      };
    }
    report = parsed;
  } catch (err) {
    return {
      module: "visual",
      score: null,
      findings: [],
      durationMs: performance.now() - start,
      error: `Vision JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const findings: AuditFinding[] = [];
  for (const dim of DIMENSIONS) {
    const r = report[dim];
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    findings.push({
      id: `visual-${dim}`,
      title: `${dim[0].toUpperCase() + dim.slice(1)}: ${score}/100`,
      description: r.comment,
      severity: severityFromScore(score),
      weight: 2,
      value: score,
    });
  }
  if (report.overall_impression) {
    findings.push({
      id: "visual-overall",
      title: "Overall visual impression",
      description: report.overall_impression,
      severity: "info",
      meta: { model, durationMs: Math.round(performance.now() - start) },
    });
  }

  // Section score: average of the six dimension scores.
  const avg =
    DIMENSIONS.reduce((s, d) => s + Math.round(report[d].score), 0) /
    DIMENSIONS.length;

  return {
    module: "visual",
    score: Math.round(avg),
    findings,
    durationMs: performance.now() - start,
  };
}

