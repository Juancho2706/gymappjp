"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dumbbell, Search, Play, X, Info } from "lucide-react";
import type { Exercise } from "@/lib/database.types";

interface Props {
  byMuscle: Record<string, Exercise[]>;
  primaryColor: string;
}

export function ClientExerciseCatalog({ byMuscle, primaryColor }: Props) {
  const [search, setSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<string>("Todos");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  );

  const muscleGroups = ["Todos", ...Object.keys(byMuscle).sort()];
  // Flatten and filter exercises
  const allExercises = Object.values(byMuscle).flat();
  const filteredExercises = allExercises.filter((ex) => {
    const matchesMuscle =
      selectedMuscle === "Todos" || ex.muscle_group === selectedMuscle;
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    return matchesMuscle && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre de ejercicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-11 pr-4 bg-card border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 transition-all shadow-sm"
            style={
              {
                "--tw-ring-color":
                  "color-mix(in srgb, var(--theme-primary) 50%, transparent)",
              } as React.CSSProperties
            }
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar snap-x">
          {muscleGroups.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMuscle(m)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all snap-start shadow-sm
                            ${
                              selectedMuscle === m
                                ? "text-white"
                                : "bg-card border border-border text-muted-foreground hover:bg-muted"
                            }`}
              style={
                selectedMuscle === m ? { backgroundColor: primaryColor } : {}
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredExercises.map((ex) => (
          <div
            key={ex.id}
            onClick={() => setSelectedExercise(ex)}
            className="bg-card border border-border rounded-2xl p-3 flex gap-4 items-center cursor-pointer hover:border-border/80 hover:bg-muted/30 transition-all shadow-sm group"
          >
            <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0 relative flex items-center justify-center">
              {ex.gif_url ? (
                <Image
                  src={ex.gif_url}
                  alt={ex.name}
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                  unoptimized
                />
              ) : (
                <Dumbbell className="w-6 h-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: primaryColor }}
              >
                {ex.muscle_group}
              </p>
              <h3 className="font-semibold text-foreground truncate">
                {ex.name}
              </h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors mr-1">
              <Info className="w-4 h-4" />
            </div>
          </div>
        ))}

        {filteredExercises.length === 0 && (
          <div className="col-span-full py-12 text-center bg-card border border-dashed border-border rounded-3xl">
            <Dumbbell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">
              No encontramos ejercicios que coincidan con tu búsqueda.
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog
        open={!!selectedExercise}
        onOpenChange={(open) => !open && setSelectedExercise(null)}
      >
        <DialogContent className="bg-card border-border rounded-3xl overflow-hidden p-0 max-w-md w-[90vw]">
          {selectedExercise && (
            <>
              {selectedExercise.gif_url && (
                <div className="relative w-full aspect-square bg-muted flex items-center justify-center border-b border-border/50">
                  <Image
                    src={selectedExercise.gif_url}
                    alt={selectedExercise.name}
                    fill
                    className="object-contain p-4"
                    unoptimized
                  />
                </div>
              )}
              {!selectedExercise.gif_url && selectedExercise.video_url && (
                <div className="p-8 text-center bg-muted border-b border-border/50">
                  <a
                    href={selectedExercise.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-bold"
                    style={{ color: primaryColor }}
                  >
                    <Play className="w-5 h-5" /> Ver Video de Referencia
                  </a>
                </div>
              )}
              <div className="p-6">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-bold">
                    {selectedExercise.name}
                  </DialogTitle>
                  <p
                    className="text-sm font-bold uppercase tracking-widest mt-1"
                    style={{ color: primaryColor }}
                  >
                    {selectedExercise.muscle_group}
                  </p>
                </DialogHeader>

                {selectedExercise.instructions &&
                selectedExercise.instructions.length > 0 ? (
                  <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4" /> Instrucciones paso a paso
                    </h4>
                    <ol className="space-y-3">
                      {selectedExercise.instructions.map((step, i) => (
                        <li
                          key={i}
                          className="flex gap-3 text-sm text-foreground/80"
                        >
                          <span
                            className="flex-shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs mt-0.5"
                            style={{
                              backgroundColor:
                                "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                              color: "var(--theme-primary)",
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">
                            {step.replace(/^Step:\d+\s*/i, "")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    El entrenador aún no ha añadido instrucciones específicas
                    para este ejercicio.
                  </p>
                )}

                <button
                  onClick={() => setSelectedExercise(null)}
                  className="w-full mt-8 py-3.5 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                  style={{ backgroundColor: primaryColor }}
                >
                  <X className="w-5 h-5" />
                  Cerrar
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
