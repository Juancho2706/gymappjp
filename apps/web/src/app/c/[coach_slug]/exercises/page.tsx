import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientExerciseCatalog } from "./ClientExerciseCatalog";
import { ArrowLeft } from "lucide-react";
import { getClientExerciseCatalogData } from "./_data/exercises.queries";
import { getClientBasePath } from "@/lib/client/base-path";

export const metadata: Metadata = {
  title: "Aprender | EVA",
};

interface Props {
  params: Promise<{ coach_slug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function ClientExercisesPage({ params, searchParams }: Props) {
  const { coach_slug } = await params;
  const sp = await searchParams;
  // Deep-link ?q= (desde los PRs del dashboard) → precarga la búsqueda server-side.
  const initialSearch = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";

  const base = await getClientBasePath(coach_slug);
  const { user, coachBranding, exercises, muscleGroups, hasMore, total } =
    await getClientExerciseCatalogData(initialSearch);
  if (!user) redirect(`${base}/login`);

  return (
    <div className="min-h-dvh bg-surface-app pb-32 md:pb-0">
      {/* Móvil (<760): header sticky branded — flecha + título (patrón nutrición) */}
      <header className="sticky top-0 z-40 flex items-center gap-1 border-b border-subtle px-4 pb-3.5 pt-[calc(env(safe-area-inset-top,0px)+14px)] backdrop-blur-xl md:hidden bg-[color-mix(in_srgb,var(--surface-app)_80%,transparent)]">
        <Link
          href={`${base}/dashboard`}
          aria-label="Volver"
          className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-strong transition-colors active:bg-surface-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-black leading-none tracking-[-0.02em] text-strong">
            Aprender
          </h1>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            Técnica de cada ejercicio
          </p>
        </div>
      </header>

      <main className="relative z-0 mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:pt-7 md:pb-11">
        {/* Desktop (>=760): cabecera DesktopAprender — eyebrow + título grande */}
        <div className="mb-[22px] hidden md:block">
          <div className="text-[12px] font-bold tracking-[0.03em] text-muted">
            Técnica de cada ejercicio
          </div>
          <h1 className="mt-[3px] font-display text-[30px] font-black tracking-[-0.03em] text-strong">
            Aprender
          </h1>
        </div>

        <ClientExerciseCatalog
          initialExercises={exercises}
          initialHasMore={hasMore}
          initialTotal={total}
          muscleGroups={muscleGroups}
          initialSearch={initialSearch}
          primaryColor={coachBranding?.primary_color || "var(--theme-primary)"}
        />
      </main>
    </div>
  );
}
