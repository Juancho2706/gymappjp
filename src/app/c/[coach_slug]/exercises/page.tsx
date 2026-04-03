import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ClientExerciseCatalog } from "./ClientExerciseCatalog";
import { Dumbbell } from "lucide-react";

export const metadata: Metadata = {
  title: "Catálogo de Ejercicios | COACH OP",
};

interface Props {
  params: Promise<{ coach_slug: string }>;
}

export default async function ClientExercisesPage({ params }: Props) {
  const { coach_slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/c/${coach_slug}/login`);

  // Fetch client/coach branding AND exercises in parallel
  const [clientResponse, exercisesResponse] = await Promise.all([
    (supabase as any)
      .from("clients")
      .select(
        `
            id, coach_id,
            coaches ( brand_name, primary_color )
        `,
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("exercises")
      .select("*")
      .order("name")
  ]);

  const client = clientResponse.data;
  if (!client) redirect(`/c/${coach_slug}/login`);

  const coachBranding = Array.isArray(client.coaches)
    ? client.coaches[0]
    : client.coaches;

  // Filter exercises (server-side filter for security, then group)
  const safeExercises = (exercisesResponse.data || []).filter((ex: any) => 
    !ex.coach_id || ex.coach_id === client.coach_id
  );

  // Group by muscle
  const byMuscle = safeExercises.reduce((acc: any, ex: any) => {
    if (!acc[ex.muscle_group]) acc[ex.muscle_group] = [];
    acc[ex.muscle_group].push(ex);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border/10 px-4 py-4 md:px-8 sticky top-0 bg-background/80 backdrop-blur-xl z-40 flex items-center gap-3 shadow-sm">
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
        <div>
          <h1
            className="text-xl md:text-2xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Aprender Técnica
          </h1>
          <p className="text-xs text-muted-foreground">
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
