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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dumbbell, Search, X, Info, Loader2, ChevronDown } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { filterExercises } from "@/lib/utils";
import { extractYoutubeVideoId } from "@/lib/youtube";
import { ExerciseVideo } from "@/components/exercise/ExerciseVideo";
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
      className={`object-cover transition-transform transition-opacity duration-500 group-hover/card:scale-110 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      unoptimized
    />
  );
}

/** A single exercise card: media banner + muscle badge + name + equipment. */
function ExerciseCard({ ex, onSelect }: { ex: Exercise; onSelect: () => void }) {
  const renderThumb = () => {
    if (ex.gif_url) {
      return <FadeImage src={ex.gif_url} alt={ex.name} />;
    }

    const url = ex.video_url;
    const ytId = url ? extractYoutubeVideoId(url) : null;

    if (ytId) {
      return (
        <FadeImage
          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
          alt={ex.name}
        />
      );
    }

    const isYouTube = url?.includes("youtube.com") || url?.includes("youtu.be");
    if (url && !isYouTube) {
      return <FadeImage src={url} alt={ex.name} />;
    }

    return <Dumbbell className="h-7 w-7 text-white/30" />;
  };

  return (
    <div
      onClick={onSelect}
      className="group/card cursor-pointer overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1B2129] to-[#0B0E13]">
        {renderThumb()}
        <span className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-sport-300">
          {ex.muscle_group}
        </span>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-[13.5px] font-bold leading-tight text-strong">
          {ex.name}
        </h3>
        {ex.equipment && (
          <p className="mt-0.5 text-[11.5px] text-muted">{ex.equipment}</p>
        )}
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
    <div className="space-y-5">
      {/* Filters */}
      <div className="space-y-3">
        <Input
          iconLeft={<Search className="h-5 w-5" />}
          placeholder="Buscar por nombre de ejercicio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="hide-scrollbar flex snap-x gap-2 overflow-x-auto pb-1">
          {muscleGroups.map((m) => {
            const on = selectedMuscle === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMuscle(m)}
                className={`h-9 flex-none snap-start whitespace-nowrap rounded-pill px-[15px] text-[13px] font-bold transition-all ${
                  on
                    ? "text-on-sport"
                    : "border-[1.5px] border-default bg-surface-card text-body hover:bg-surface-sunken"
                }`}
                style={on ? { backgroundColor: primaryColor } : undefined}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Grid */}
      {filteredExercises.length === 0 ? (
        <div className="py-12 text-center text-subtle">
          <Dumbbell className="mx-auto mb-3 h-9 w-9 opacity-40" />
          <p className="text-sm">
            No encontramos ejercicios que coincidan con tu búsqueda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              onSelect={() => openExercise(ex)}
            />
          ))}
        </div>
      )}

      {/* Infinite-scroll sentinel + contador */}
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted opacity-60" />
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card text-[13.5px] font-bold text-strong transition-colors hover:bg-surface-sunken"
          >
            <ChevronDown className="h-4 w-4" />
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
          className="custom-scrollbar w-[90vw] max-w-md overflow-y-auto rounded-[28px] border-subtle bg-surface-card p-0 max-h-[85dvh] focus:outline-none"
        >
          {selectedExercise && (
            <>
              {(() => {
                if (selectedExercise.gif_url) {
                  return (
                    <div className="sticky top-0 z-10 flex h-48 w-full shrink-0 items-center justify-center border-b border-subtle bg-white md:h-64">
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
                if (isYouTube) {
                  const ytId = extractYoutubeVideoId(url!);
                  const ex = selectedExercise as any
                  return ytId ? (
                    <div className="sticky top-0 z-10 flex h-48 w-full shrink-0 items-center justify-center border-b border-subtle bg-gradient-to-br from-[#1B2129] to-[#0B0E13] md:h-64">
                      <ExerciseVideo
                        videoId={ytId}
                        start={ex.video_start_time}
                        end={ex.video_end_time}
                        className="w-full h-full"
                        title={selectedExercise.name}
                      />
                    </div>
                  ) : null;
                }

                if (selectedExercise.video_url) {
                  const urlLower = selectedExercise.video_url.toLowerCase();
                  const isMp4 = urlLower.includes('.mp4') || urlLower.includes('.mov') || urlLower.includes('.webm') || (urlLower.includes('supabase.co/storage') && !urlLower.includes('.gif') && !urlLower.includes('.jpg') && !urlLower.includes('.png'));

                  if (isMp4) {
                    return (
                      <div className="sticky top-0 z-10 flex h-48 w-full shrink-0 items-center justify-center border-b border-subtle bg-white md:h-64">
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
                    <div className="sticky top-0 z-10 flex h-48 w-full shrink-0 items-center justify-center border-b border-subtle bg-white md:h-64">
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
              <div className="flex-1 p-6">
                <DialogHeader className="mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-strong">
                      {selectedExercise.name}
                    </DialogTitle>
                    <DialogClose className="-mr-2 -mt-2 shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-surface-sunken">
                      <X className="h-5 w-5" />
                    </DialogClose>
                  </div>
                  <p className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-sport-600">
                    {selectedExercise.muscle_group}
                    {selectedExercise.equipment
                      ? ` · ${selectedExercise.equipment}`
                      : ""}
                  </p>
                </DialogHeader>

                {loadingDetail ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando instrucciones…
                  </div>
                ) : instructions && instructions.length > 0 ? (
                  <div className="space-y-4 pr-2">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
                      <Info className="h-4 w-4" /> Instrucciones paso a paso
                    </h4>
                    <ol className="space-y-3">
                      {instructions.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-body">
                          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sport-100 text-xs font-extrabold text-sport-600">
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
                  <p className="text-sm text-muted">
                    El entrenador aún no ha añadido instrucciones específicas
                    para este ejercicio.
                  </p>
                )}

                <Button
                  variant="sport"
                  size="lg"
                  onClick={() => setSelectedExercise(null)}
                  className="mt-8 w-full"
                >
                  <X className="h-5 w-5" />
                  Cerrar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
