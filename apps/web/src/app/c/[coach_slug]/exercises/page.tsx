import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientExerciseCatalog } from "./ClientExerciseCatalog";
import { Dumbbell } from "lucide-react";
import { getClientExerciseCatalogData } from "./_data/exercises.queries";
import { getClientBasePath } from "@/lib/client/base-path";

export const metadata: Metadata = {
  title: "Catálogo de Ejercicios | EVA",
};

interface Props {
  params: Promise<{ coach_slug: string }>;
}

export default async function ClientExercisesPage({ params }: Props) {
  const { coach_slug } = await params;
  const base = await getClientBasePath(coach_slug);
  const { user, client, exercises } = await getClientExerciseCatalogData();
  if (!user) redirect(`${base}/login`);
  if (!client) redirect(`${base}/login`);

  const coachBranding = Array.isArray(client.coaches)
    ? client.coaches[0]
    : client.coaches;

  // Group by muscle
  const byMuscle = exercises.reduce((acc: any, ex: any) => {
    if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
    acc[ex.muscle_group].push(ex);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="min-h-dvh bg-surface-app pb-32">
      <header className="sticky top-0 z-40 flex items-center gap-[11px] border-b border-subtle px-4 py-4 pt-safe backdrop-blur-xl md:px-8 bg-[color-mix(in_srgb,var(--surface-app)_80%,transparent)]">
        <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-control bg-sport-100 text-sport-600">
          <Dumbbell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-[22px] font-black leading-none tracking-[-0.02em] text-strong">
            Aprender Técnica
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Catálogo completo de ejercicios
          </p>
        </div>
      </header>

      <main className="px-4 py-6 md:px-8 max-w-5xl mx-auto relative z-0">
        <ClientExerciseCatalog
          byMuscle={byMuscle}
          primaryColor={coachBranding?.primary_color || "var(--theme-primary)"}
        />
      </main>
    </div>
  );
}
