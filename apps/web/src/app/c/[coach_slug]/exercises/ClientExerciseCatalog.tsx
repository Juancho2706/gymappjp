"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Dumbbell, Search, X, Info, Loader2 } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { filterExercises } from "@/lib/utils";
import { exerciseEmbedUrl } from "@/lib/youtube";
import { getExerciseInstructions } from "./_actions/exercises.actions";

type Exercise = Tables<"exercises">;

interface Props {
  byMuscle: Record<string, Exercise[]>;
  primaryColor: string;
}

/** Cuántas tarjetas se montan por tanda (evita renderizar 800+ <Image> de golpe). */
const PAGE_SIZE = 48;

/** Image that fades in once the GIF / next-image has finished loading. */
function FadeImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 768px) 45vw, 200px"
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={`object-cover group-hover:scale-110 transition-transform duration-500 transition-opacity ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      unoptimized
    />
  );
}

/** A single exercise card: thumbnail + muscle group + name. */
function ExerciseCard({
  ex,
  primaryColor,
  onSelect,
}: {
  ex: Exercise;
  primaryColor: string;
  onSelect: () => void;
}) {
  const renderThumb = () => {
    if (ex.gif_url) {
      return <FadeImage src={ex.gif_url} alt={ex.name} />;
    }

    const url = ex.video_url;
    const isYouTube = url?.includes("youtube.com") || url?.includes("youtu.be");
    const getYouTubeId = (u: string) => {
      const match = u.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    };

    if (isYouTube) {
      const ytId = getYouTubeId(url!);
      return ytId ? (
        <FadeImage
          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
          alt={ex.name}
        />
      ) : (
        <Dumbbell className="w-6 h-6 text-muted-foreground/50" />
      );
    }

    if (url) {
      return <FadeImage src={url} alt={ex.name} />;
    }

    return <Dumbbell className="w-6 h-6 text-muted-foreground/50" />;
  };

  return (
    <div
      onClick={onSelect}
      className="bg-card border border-border rounded-2xl p-3 flex gap-4 items-center cursor-pointer hover:border-border/80 hover:bg-muted/30 transition-all shadow-sm group animate-in fade-in duration-300"
    >
      <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden flex-shrink-0 relative flex items-center justify-center">
        {renderThumb()}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-bold uppercase tracking-wider mb-1"
          style={{ color: primaryColor }}
        >
          {ex.muscle_group}
        </p>
        <h3 className="font-semibold text-foreground leading-tight">
          {ex.name}
        </h3>
      </div>
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors mr-1">
        <Info className="w-4 h-4" />
      </div>
    </div>
  );
}

export function ClientExerciseCatalog({ byMuscle, primaryColor }: Props) {
  const [search, setSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<string>("Todos");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Detalle on-demand (instrucciones) — el listado no las trae para no inflar el payload.
  const [instructions, setInstructions] = useState<string[] | null>(null);
  const [loadingDetail, startDetail] = useTransition();

  const muscleGroups = ["Todos", ...Object.keys(byMuscle).sort()];
  const allExercises = Object.values(byMuscle).flat();
  const filteredExercises = filterExercises(allExercises, search, selectedMuscle);
  const displayed = filteredExercises.slice(0, visibleCount);
  const hasMore = visibleCount < filteredExercises.length;

  // Reset de la paginación cuando cambia el filtro/búsqueda.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedMuscle]);

  // Infinite scroll: carga otra tanda cuando el sentinel entra en viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, displayed.length]);

  const openExercise = (ex: Exercise) => {
    setSelectedExercise(ex);
    setInstructions(null);
    startDetail(async () => {
      const detail = await getExerciseInstructions(ex.id);
      setInstructions(detail?.instructions ?? []);
    });
  };

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
        {displayed.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            primaryColor={primaryColor}
            onSelect={() => openExercise(ex)}
          />
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

      {/* Infinite-scroll sentinel + contador */}
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50" />
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Ver más ({filteredExercises.length - displayed.length} restantes)
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog
        open={!!selectedExercise}
        onOpenChange={(open) => !open && setSelectedExercise(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="bg-card border-border rounded-3xl overflow-y-auto custom-scrollbar p-0 max-w-md w-[90vw] max-h-[85dvh] focus:outline-none"
        >
          {selectedExercise && (
            <>
              {(() => {
                if (selectedExercise.gif_url) {
                  return (
                    <div className="sticky top-0 z-10 relative w-full h-48 md:h-64 shrink-0 bg-white flex items-center justify-center border-b border-border/50">
                      <Image
                        src={selectedExercise.gif_url}
                        alt={selectedExercise.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vh"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  );
                }

                const url = selectedExercise.video_url;
                const isYouTube = url?.includes('youtube.com') || url?.includes('youtu.be');
                const getYouTubeId = (u: string) => {
                  const match = u.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
                  return match ? match[1] : null;
                };

                if (isYouTube) {
                  const ytId = getYouTubeId(url!);
                  const ex = selectedExercise as any
                  const embedUrl = ytId
                    ? exerciseEmbedUrl(ytId, {
                        start: ex.video_start_time,
                        end: ex.video_end_time,
                      }) ?? ''
                    : '';

                  return ytId ? (
                    <div className="sticky top-0 z-10 relative w-full h-48 md:h-64 shrink-0 bg-black/5 dark:bg-black/20 flex items-center justify-center border-b border-border/50">
                      <iframe
                        className="w-full h-full"
                        src={embedUrl}
                        title={selectedExercise.name}
                        referrerPolicy="strict-origin-when-cross-origin"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      />
                    </div>
                  ) : null;
                }

                if (selectedExercise.video_url) {
                  const urlLower = selectedExercise.video_url.toLowerCase();
                  const isMp4 = urlLower.includes('.mp4') || urlLower.includes('.mov') || urlLower.includes('.webm') || (urlLower.includes('supabase.co/storage') && !urlLower.includes('.gif') && !urlLower.includes('.jpg') && !urlLower.includes('.png'));

                  if (isMp4) {
                    return (
                      <div className="sticky top-0 z-10 relative w-full h-48 md:h-64 shrink-0 bg-white flex items-center justify-center border-b border-border/50">
                        <video
                          src={selectedExercise.video_url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      </div>
                    );
                  }

                  return (
                    <div className="sticky top-0 z-10 relative w-full h-48 md:h-64 shrink-0 bg-white flex items-center justify-center border-b border-border/50">
                      <Image
                        src={selectedExercise.video_url}
                        alt={selectedExercise.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vh"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  );
                }

                return null;
              })()}
              <div className="p-6 flex-1">
                <DialogHeader className="mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <DialogTitle className="text-xl font-bold">
                      {selectedExercise.name}
                    </DialogTitle>
                    <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-muted transition-colors shrink-0">
                      <X className="w-5 h-5 text-muted-foreground" />
                    </DialogClose>
                  </div>
                  <p
                    className="text-sm font-bold uppercase tracking-widest mt-1"
                    style={{ color: primaryColor }}
                  >
                    {selectedExercise.muscle_group}
                  </p>
                </DialogHeader>

                {loadingDetail ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando instrucciones…
                  </div>
                ) : instructions && instructions.length > 0 ? (
                  <div className="space-y-4 pr-2">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4" /> Instrucciones paso a paso
                    </h4>
                    <ol className="space-y-3">
                      {instructions.map((step, i) => (
                        <li
                          key={i}
                          className="flex gap-3 text-sm text-foreground/80"
                        >
                          <span
                            className="flex-shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs mt-0.5"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
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
                  className="w-full mt-8 py-3.5 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0"
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
