import Reveal from './Reveal';

import { FAQS } from '../lib/faq-content';

export default function Faq() {
  return (
    <section id="faq" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-ink md:text-4xl">
            Pertanyaan Umum.
          </h2>
          <div className="accent-bar mx-auto mt-4" aria-hidden="true" />
        </Reveal>

        <div className="mt-12 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <details className="group nx-card overflow-hidden px-6 py-1 open:border-accent/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg
                    className="h-5 w-5 shrink-0 text-ink transition-transform duration-300 group-open:rotate-45"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
