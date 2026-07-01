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
import { Dumbbell, Search, X, Play, Loader2, ChevronDown } from "lucide-react";
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

/**
 * Best-effort thumbnail URL for an exercise, or `null` when it has no usable
 * media. Mirrors the priority order of `ExerciseCard.renderThumb`:
 * gif → YouTube poster → direct image/video URL.
 */
function getThumbSrc(ex: Exercise): string | null {
  if (ex.gif_url) return ex.gif_url;

  const url = ex.video_url;
  const ytId = url ? extractYoutubeVideoId(url) : null;
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;

  const isYouTube = url?.includes("youtube.com") || url?.includes("youtu.be");
  if (url && !isYouTube) return url;

  return null;
}

/**
 * Hero "Destacado" card (CD parity — Aprender.jsx). Bigger media banner + name
 * + muscle/equipment. Tapping opens the same detail modal as the grid cards.
 */
function FeaturedExerciseCard({
  ex,
  primaryColor,
  onSelect,
}: {
  ex: Exercise;
  primaryColor: string;
  onSelect: () => void;
}) {
  const thumb = getThumbSrc(ex);
  return (
    <div
      onClick={onSelect}
      className="group/feat cursor-pointer overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
    >
      <div className="relative flex h-[150px] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#1B2129] to-[#0B0E13] md:h-[200px]">
        {thumb && (
          <>
            <Image
              src={thumb}
              alt={ex.name}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover transition-transform duration-500 group-hover/feat:scale-105"
              unoptimized
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
          </>
        )}
        <span
          className="relative z-10 flex h-[60px] w-[60px] items-center justify-center rounded-full text-white transition-transform group-hover/feat:scale-105"
          style={{ backgroundColor: primaryColor, boxShadow: "var(--glow-sport)" }}
        >
          <Play className="h-[26px] w-[26px]" />
        </span>
        <span
          className="absolute left-3 top-3 z-10 rounded-pill px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.05em] text-on-sport"
          style={{ backgroundColor: primaryColor }}
        >
          Destacado
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-display text-lg font-extrabold leading-tight text-strong">
          {ex.name}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted">
          {ex.muscle_group}
          {ex.equipment ? ` · ${ex.equipment}` : ""}
        </p>
      </div>
    </div>
  );
}

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

    return (
      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover/card:bg-sport-500 md:h-[42px] md:w-[42px]">
        <Play className="h-[17px] w-[17px]" />
      </span>
    );
  };

  return (
    <div
      onClick={onSelect}
      className="group/card cursor-pointer overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1B2129] to-[#0B0E13] md:h-[116px]">
        {renderThumb()}
        <span className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-sport-300 md:bottom-2 md:left-2">
          {ex.muscle_group}
        </span>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-[13.5px] font-bold leading-tight text-strong md:text-sm">
          {ex.name}
        </h3>
        {ex.equipment && (
          <p className="mt-0.5 text-[11.5px] text-muted md:text-xs">{ex.equipment}</p>
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

  // Ejercicio "Destacado": el primero con media utilizable. Solo se muestra en
  // la vista por defecto (sin búsqueda ni filtro de músculo) y degrada a null si
  // ningún ejercicio tiene gif/video.
  const featured =
    !search.trim() && selectedMuscle === "Todos"
      ? (allExercises.find((e) => getThumbSrc(e) !== null) ?? null)
      : null;

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
      {/* Filters — móvil: search + chips apilados; desktop: barra inline (.dt-aprender-bar) */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
        <div className="md:max-w-[360px] md:flex-1">
          <Input
            iconLeft={<Search className="h-5 w-5" />}
            placeholder="Buscar ejercicio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="hide-scrollbar flex snap-x gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {muscleGroups.map((m) => {
            const on = selectedMuscle === m;
            return (
              <button
                key={m}
                onClick={() => setSelectedMuscle(m)}
                className={`h-[34px] flex-none snap-start whitespace-nowrap rounded-pill px-[15px] text-[13px] font-bold transition-all ${
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
        <>
          {featured && (
            <FeaturedExerciseCard
              ex={featured}
              primaryColor={primaryColor}
              onSelect={() => openExercise(featured)}
            />
          )}

          {featured && (
            <h2 className="font-display text-base font-black tracking-[-0.01em] text-strong">
              Biblioteca
            </h2>
          )}

          <div className="grid grid-cols-2 gap-3 md:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {displayed.map((ex) => (
              <ExerciseCard
                key={ex.id}
                ex={ex}
                onSelect={() => openExercise(ex)}
              />
            ))}
          </div>
        </>
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
          className="custom-scrollbar bottom-0 left-0 top-auto w-full max-w-full translate-x-0 translate-y-0 flex flex-col overflow-y-auto rounded-t-[28px] rounded-b-none border-subtle bg-surface-card p-0 max-h-[85dvh] focus:outline-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[90vw] md:max-w-[600px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]"
        >
          {selectedExercise && (
            <>
              {/* Media banner */}
              <div className="relative h-[180px] w-full shrink-0 md:h-64">
                {(() => {
                  if (selectedExercise.gif_url) {
                    return (
                      <div className="flex h-full w-full items-center justify-center border-b border-subtle bg-white">
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
                  const isYouTube =
                    url?.includes("youtube.com") || url?.includes("youtu.be");
                  if (isYouTube) {
                    const ytId = extractYoutubeVideoId(url!);
                    const ex = selectedExercise as any;
                    if (ytId) {
                      return (
                        <div className="flex h-full w-full items-center justify-center border-b border-subtle bg-gradient-to-br from-[#1B2129] to-[#0B0E13]">
                          <ExerciseVideo
                            videoId={ytId}
                            start={ex.video_start_time}
                            end={ex.video_end_time}
                            className="h-full w-full"
                            title={selectedExercise.name}
                          />
                        </div>
                      );
                    }
                  }

                  if (selectedExercise.video_url) {
                    const urlLower = selectedExercise.video_url.toLowerCase();
                    const isMp4 =
                      urlLower.includes(".mp4") ||
                      urlLower.includes(".mov") ||
                      urlLower.includes(".webm") ||
                      (urlLower.includes("supabase.co/storage") &&
                        !urlLower.includes(".gif") &&
                        !urlLower.includes(".jpg") &&
                        !urlLower.includes(".png"));

                    if (isMp4) {
                      return (
                        <div className="flex h-full w-full items-center justify-center border-b border-subtle bg-white">
                          <video
                            src={selectedExercise.video_url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-full w-full object-contain"
                          />
                        </div>
                      );
                    }

                    return (
                      <div className="flex h-full w-full items-center justify-center border-b border-subtle bg-white">
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

                  // Sin media: banner de fallback con ícono play (diseño)
                  return (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1B2129] to-[#0B0E13]">
                      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white/[0.12] text-white">
                        <Play className="h-6 w-6" />
                      </span>
                    </div>
                  );
                })()}
                <DialogClose
                  aria-label="Cerrar"
                  className="absolute right-3 top-3 z-20 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/55"
                >
                  <X className="h-[18px] w-[18px]" />
                </DialogClose>
              </div>

              <div className="flex-1 px-5 pb-6 pt-[18px]">
                <DialogHeader className="mb-0 gap-0">
                  <DialogTitle className="font-display text-[22px] font-black tracking-[-0.02em] text-strong">
                    {selectedExercise.name}
                  </DialogTitle>
                  <p className="mt-[5px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-sport-600">
                    {selectedExercise.muscle_group}
                    {selectedExercise.equipment
                      ? ` · ${selectedExercise.equipment}`
                      : ""}
                  </p>
                </DialogHeader>

                <div className="mt-[18px]">
                  {loadingDetail ? (
                    <div className="flex items-center gap-2.5 py-2 text-sm text-muted">
                      <Loader2 className="h-[18px] w-[18px] animate-spin text-sport-500" />
                      Cargando instrucciones…
                    </div>
                  ) : instructions && instructions.length > 0 ? (
                    <ol className="space-y-3">
                      {instructions.map((step, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-[14.5px] text-body"
                        >
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sport-100 font-display text-[13px] font-extrabold text-sport-600">
                            {i + 1}
                          </span>
                          <span className="pt-px leading-[1.45]">
                            {step.replace(/^Step:\d+\s*/i, "")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm leading-relaxed text-muted">
                      El entrenador aún no ha añadido instrucciones específicas
                      para este ejercicio.
                    </p>
                  )}
                </div>

                <Button
                  variant="sport"
                  size="lg"
                  onClick={() => setSelectedExercise(null)}
                  className="mt-[22px] w-full"
                >
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
