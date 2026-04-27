import { ScanForm } from "./components/scan-form";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--border)] px-6 py-5 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-warm)]">
              <ThreadIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Lachesis</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Measure the thread
              </div>
            </div>
          </div>
          <a
            href="https://github.com/CyberDemigods/lachesis"
            target="_blank"
            rel="noopener"
            className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="px-6 pt-16 pb-10 print:px-0 print:pt-0 print:pb-0">
          <div className="mx-auto max-w-3xl text-center print:hidden">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Measure the thread of your{" "}
              <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-warm)] bg-clip-text text-transparent">
                site&apos;s destiny
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-7 text-[var(--muted)]">
              Drop a URL. Lachesis scans on-page SEO, Core Web Vitals,
              accessibility, and locale-specific best practices, then returns a
              measured verdict.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl print:mt-0 print:max-w-none">
            <ScanForm />
          </div>
        </section>

        <section className="border-t border-[var(--border)] bg-[var(--surface)]/40 px-6 py-12 print:hidden">
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Capability
              title="On-page SEO"
              description="Title, meta, headings, canonical, Open Graph, JSON-LD, alt coverage, link analysis."
            />
            <Capability
              title="Performance"
              description="Lighthouse scores and Core Web Vitals (LCP, INP, CLS) via Google PageSpeed Insights."
            />
            <Capability
              title="Accessibility"
              description="Heading hierarchy, lang, viewport, alt, plus axe-core scan when headless module is wired."
            />
            <Capability
              title="Locale & Privacy"
              description="Polish-specific heuristics: RODO mention, encoding correctness, business identifiers, hreflang."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-6 py-5 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] print:hidden">
        Forged by{" "}
        <a
          href="https://cyberdemigods.com"
          target="_blank"
          rel="noopener"
          className="text-[var(--accent)] hover:underline"
        >
          CyberDemigods
        </a>
        {" · "}
        Open source on{" "}
        <a
          href="https://github.com/CyberDemigods/lachesis"
          target="_blank"
          rel="noopener"
          className="text-[var(--accent)] hover:underline"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}

function Capability({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
    </div>
  );
}

function ThreadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12h2.5l2-7 4 14 2-10 1.5 5H21" />
    </svg>
  );
}
