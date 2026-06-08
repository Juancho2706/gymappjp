import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientExerciseCatalog } from "./ClientExerciseCatalog";
import { Dumbbell } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
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
    <div className="min-h-dvh bg-background pb-32">
      <header className="border-b border-border/10 px-4 py-4 md:px-8 sticky top-0 pt-safe bg-background/80 backdrop-blur-xl z-40 flex items-center gap-3 shadow-sm">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--theme-primary) 10%, transparent)",
          }}
        >
          <Dumbbell
            className="w-5 h-5"
            style={{ color: "var(--theme-primary)" }}
          />
        </div>
        <div className="flex-1 flex items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground">
              Aprender Técnica
            </h1>
            <p className="text-xs text-muted-foreground">
              Catálogo completo de ejercicios
            </p>
          </div>
          <InfoTooltip content="Catálogo completo de ejercicios. Toca cualquiera para ver la técnica, instrucciones y el video de ejecución." />
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
