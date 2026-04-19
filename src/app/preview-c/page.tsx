import Link from "next/link";
import { EvaWatermark } from "./_components/EvaWatermark";

const slides = [
  {
    k: "I",
    title: "Void absoluto",
    body: "Lienzo #000. Sin sombras: solo bordes 2px y pigmento saturado en acción.",
    href: "/preview-c/dashboard",
    cta: "Panel",
  },
  {
    k: "II",
    title: "Tablero espacial",
    body: "Pan, zoom, nodos conectados por SVG. Minimap y paleta ⌘K con entrada spring + blur.",
    href: "/preview-c/builder",
    cta: "Builder",
  },
  {
    k: "III",
    title: "Marquee + rail",
    body: "Barra 64px vertical con tipografía rotada. Status infinito en cliente.",
    href: "/preview-c/cliente",
    cta: "Roster",
  },
  {
    k: "IV",
    title: "Auth por pasos",
    body: "Un campo a la vez, número hero, shake de validación.",
    href: "/preview-c/login",
    cta: "Entrar",
  },
];

export default function PreviewCIndexPage() {
  return (
    <div className="relative z-[1] min-h-dvh">
      <EvaWatermark />
      <div className="relative z-[1] px-3 pb-12 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pb-16">
        <header className="max-w-5xl">
          <p className="pc-caps-micro text-[var(--pc-primary)]">EVA · Concept C</p>
          <h1 className="mt-2 text-4xl font-bold uppercase leading-[0.95] tracking-[0.04em] text-[var(--pc-chalk)] md:text-6xl">
            Neo-brutalist
            <br />
            spatial
          </h1>
          <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-[var(--pc-muted)] md:text-base">
            Alpha navegable según PREVIEW_CONCEPT_C: responsive, animaciones funcionales, rail + bottom
            nav en móvil.
          </p>
        </header>

        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:mt-14 md:gap-6">
          {slides.map((s) => (
            <article
              key={s.k}
              className="pc-edge-muted w-[min(88vw,320px)] shrink-0 snap-start p-5 md:w-[300px] md:p-6"
            >
              <p className="pc-mono text-xs text-[var(--pc-primary)]">{s.k}</p>
              <h2 className="mt-2 text-xl font-bold uppercase tracking-[0.06em] text-[var(--pc-chalk)]">
                {s.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--pc-muted)]">{s.body}</p>
              <Link
                href={s.href}
                className="mt-5 inline-flex min-h-11 items-center border-2 border-[var(--pc-chalk)] bg-[var(--pc-chalk)] px-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--pc-void)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {s.cta} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
