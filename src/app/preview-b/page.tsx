"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { BRAND_APP_ICON } from "@/lib/brand-assets";
import { usePreviewBTheme } from "./_components/PreviewBRoot";

const links = [
  { href: "/preview-b/login", title: "Auth editorial", desc: "Form tipo diario: líneas finas, jerarquía serif." },
  { href: "/preview-b/dashboard", title: "Portada coach", desc: "Hero alumno, pull-quote, sparklines en papel." },
  { href: "/preview-b/cliente", title: "Ficha alumno", desc: "Diario + métricas mono, adherencia con barra acento." },
  { href: "/preview-b/builder", title: "Builder", desc: "Días en fases; biblioteca colapsable en móvil." },
];

export default function PreviewBIndexPage() {
  const { isDark, toggleTheme } = usePreviewBTheme();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-28 pt-[max(2rem,env(safe-area-inset-top))] md:py-16 md:pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden smoked-badge md:h-16 md:w-16">
            <Image
              src={BRAND_APP_ICON}
              alt=""
              width={32}
              height={32}
              className="relative z-[1] object-contain"
            />
          </div>
          <div>
            <p className="caption-micro text-primary">EVA · Concept B</p>
            <h1 className="display-editorial mt-1 text-3xl tracking-tight text-foreground md:text-4xl">
              Luminous Paper
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-12 min-h-12 w-12 min-w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/40"
          aria-label={isDark ? "Modo claro" : "Modo oscuro"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      <p className="drop-cap mt-8 text-base leading-relaxed text-muted-foreground md:text-lg">
        Papel premium tintado: cada pantalla es un artículo editorial. Explorá el alpha responsive
        según PREVIEW_CONCEPT_B — light default, dark adaptativo, acento del coach solo en
        subrayados, CTAs y barras de adherencia.
      </p>

      <ul className="mt-10 space-y-4">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="paper-card group block rounded-xl p-5 transition-transform active:scale-[0.99] md:p-6"
            >
              <p className="caption-micro text-primary">Navegar</p>
              <h2 className="display-editorial mt-1 text-xl text-foreground group-hover:underline md:text-2xl">
                {l.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{l.desc}</p>
            </Link>
          </li>
        ))}
      </ul>

      <blockquote className="pull-quote mt-12 text-base md:text-lg">
        White-label: el color se infunde al 4% en el fondo; nunca satura superficies grandes.
      </blockquote>
    </div>
  );
}
