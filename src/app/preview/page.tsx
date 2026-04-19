import Link from "next/link";
import { GymAppLogo } from "@/components/ui/Logo";
import { KineticHaloInline } from "@/components/fx/KineticHalo";

const screens = [
  {
    href: "/preview/login",
    title: "Auth",
    desc: "Card glass-strong, halo EVA watermark, inputs con acento en foco.",
    tag: "Entrada",
  },
  {
    href: "/preview/dashboard",
    title: "Dashboard coach",
    desc: "Shell dock glass, mesh + grain, métricas en mono / display.",
    tag: "Home",
  },
  {
    href: "/preview/cliente",
    title: "Detalle alumno",
    desc: "Hero glass, adherencia como número-instrumento, gráfico neutro.",
    tag: "Alumno",
  },
  {
    href: "/preview/builder",
    title: "Workout builder",
    desc: "Bloques glass-card, borde izquierdo por músculo, estado drag kinetic.",
    tag: "Herramienta",
  },
];

export default function PreviewIndex() {
  return (
    <main className="relative mx-auto max-w-[1100px] px-8 py-20 pb-32 md:py-24">
      <div
        className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 opacity-[0.07] md:top-12"
        aria-hidden
      >
        <KineticHaloInline size={520} opacity={0.12} />
      </div>

      <div className="relative z-[1] flex flex-wrap items-center gap-4">
        <GymAppLogo className="h-10 w-36 flex-shrink-0" />
        <span className="chip chip-primary">Concept A · Kinetic Obsidian</span>
      </div>

      <h1 className="display-hero mt-8 max-w-[720px] text-4xl text-[var(--obs-text)] md:text-6xl">
        Alpha preview
        <br />
        <span className="text-[rgb(var(--theme-primary-rgb))]">after-dark studio</span>
      </h1>
      <p className="mt-6 max-w-[640px] text-base leading-relaxed text-[var(--obs-text-dim)] md:text-lg">
        Cuatro pantallas mock alineadas con{" "}
        <code className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-sm text-[var(--obs-text)]">
          PREVIEW_CONCEPT_A.md
        </code>
        : obsidiana, glass 3ª gen, acento white-label solo en firma y focos. Sin backend.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {screens.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="pv-glass-card group rounded-2xl p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5"
            style={{ borderRadius: 18 }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="chip">{s.tag}</span>
              <span
                className="text-lg font-bold text-[rgb(var(--theme-primary-rgb))] opacity-80 transition-opacity group-hover:opacity-100"
                aria-hidden
              >
                →
              </span>
            </div>
            <h2 className="display mt-5 text-2xl text-[var(--obs-text)]">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--obs-text-dim)]">{s.desc}</p>
          </Link>
        ))}
      </div>

      <div
        className="pv-glass-card mt-16 rounded-2xl p-6 md:p-8"
        style={{ borderRadius: 18 }}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--obs-text-faint)]">
          Nota
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--obs-text-dim)]">
          Estas rutas viven en{" "}
          <code className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[var(--obs-text)]">
            /preview
          </code>{" "}
          y no reemplazan la app real. El scope visual está acotado a{" "}
          <code className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[var(--obs-text)]">
            .preview-root
          </code>
          .
        </p>
      </div>
    </main>
  );
}
