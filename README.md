# Lachesis

> *Measure the thread of your site's destiny.*

Open-source web audit tool. Drop a URL — receive a measured verdict on SEO,
performance, accessibility, and locale-specific best practices.

Named after [Lachesis](https://en.wikipedia.org/wiki/Moirai), the Greek goddess
of the Moirai (Fates) who *measures* the thread of mortal life. Klotho spins
it, Atropos cuts it. Lachesis decides how long it runs.

Built by [CyberDemigods](https://cyberdemigods.com).

---

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript**
- **Tailwind CSS 4**
- **cheerio** for server-side HTML parsing
- **Google PageSpeed Insights API** for Core Web Vitals + Lighthouse scores
- *(planned)* **Playwright + axe-core** for SPA rendering and accessibility scans
- *(planned)* **Vercel Functions** deployment

## What it audits

| Module       | Status  | Checks                                                                                                                    |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `on-page`    | done    | Title, meta description, H1/headings, canonical, robots, Open Graph, Twitter Card, JSON-LD, alt coverage, links, hreflang |
| `pagespeed`  | done    | Lighthouse scores (Performance, A11y, Best Practices, SEO) + Core Web Vitals (LCP, INP, CLS, TTFB, FCP) via Google PSI    |
| `locale`     | done    | Polish: encoding correctness, RODO mention, cookie consent, NIP/REGON/KRS detection, hreflang variants                    |
| `headless`   | stub    | Architecture for Playwright-based SPA render + screenshot + axe-core accessibility scan                                   |

The orchestrator runs modules in parallel where possible and aggregates findings
into a weighted overall score across six categories: SEO, Performance,
Accessibility, Best Practices, Content, Locale.

## Architecture

```
app/
├── api/scan/route.ts      Audit API endpoint (POST + GET)
├── components/
│   ├── scan-form.tsx      URL input form (client component)
│   └── report-view.tsx    Renders a ScanReport
├── layout.tsx
├── page.tsx               Landing page
└── globals.css

lib/audit/
├── index.ts               Orchestrator: runs modules in parallel
├── types.ts               Shared types (AuditFinding, AuditSection, ScanReport)
├── scoring.ts             Per-category aggregation + weighted overall score
├── on-page.ts             cheerio-based HTML audit
├── pagespeed.ts           Google PageSpeed Insights API client
├── headless.ts            Playwright + axe-core (stub — see file)
└── locale.ts              Locale-specific checks (currently Polish)
```

## Getting started

```bash
git clone https://github.com/CyberDemigods/lachesis
cd lachesis
npm install
cp .env.example .env.local   # optional — add PageSpeed API key for higher rate limits
npm run dev
```

Open http://localhost:3000.

### API

The audit is accessible programmatically:

```bash
# GET (query params)
curl 'http://localhost:3000/api/scan?url=https://example.com&skipPageSpeed=1'

# POST (JSON body)
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

Response: a `ScanReport` (see [`lib/audit/types.ts`](./lib/audit/types.ts)) with
overall score, per-category scores, and findings grouped by module.

### Environment

| Variable            | Required | Purpose                                                              |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `PAGESPEED_API_KEY` | optional | Google PageSpeed Insights key. Without it, requests are rate-limited. |

## Scoring model

Each finding has a severity (`pass` / `warn` / `fail` / `info`). Findings map
to one or more categories (`lib/audit/scoring.ts`). A category score is the
average of its findings (`pass=1, warn=0.5, fail=0`, `info` is excluded). The
overall score is a weighted average of category scores:

| Category        | Weight |
| --------------- | ------ |
| SEO             | 30%    |
| Performance     | 25%    |
| Accessibility   | 20%    |
| Best Practices  | 15%    |
| Content         | 5%     |
| Locale          | 5%     |

## Roadmap

- [ ] Wire up the `headless` module (Playwright + axe-core via Vercel Sandbox or external worker)
- [ ] Side-by-side comparison mode — designed to integrate with [`web-transformation`](https://github.com/CyberDemigods/web-transformation)
- [ ] Persistent scan history (Postgres / SQLite)
- [ ] PDF export of audit reports
- [ ] More locales (DE, ES, FR — locale-specific privacy regulations and structured data)
- [ ] CLI: `npx lachesis https://example.com`
- [ ] GitHub Action for PR-time SEO regression checks

## Contributing

Issues and PRs welcome. The audit modules are intentionally decoupled — adding
a new check is usually a single function in the relevant module plus a category
mapping in `lib/audit/scoring.ts`.

## License

MIT — see [LICENSE](./LICENSE).

---

*Forged by [CyberDemigods](https://cyberdemigods.com).*
