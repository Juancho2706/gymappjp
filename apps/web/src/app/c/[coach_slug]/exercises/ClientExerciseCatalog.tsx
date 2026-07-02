"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dumbbell, Search, X, Play, Loader2, ChevronDown } from "lucide-react";
import { extractYoutubeVideoId } from "@/lib/youtube";
import { ExerciseVideo } from "@/components/exercise/ExerciseVideo";
import {
  exerciseGridThumb,
  type CatalogExercise,
} from "@/lib/exercises/exercise-thumb";
import {
  getExerciseInstructions,
  loadClientExercisesAction,
} from "./_actions/exercises.actions";

type Exercise = CatalogExercise;

interface Props {
  /** Primera página (paginada server-side); el resto llega vía loadClientExercisesAction. */
  initialExercises: Exercise[];
  initialHasMore: boolean;
  initialTotal: number;
  /** Grupos musculares del scope (sin "Todos"), ya ordenados. */
  muscleGroups: string[];
  /** Deep-link ?q= — la primera página ya viene filtrada por este término. */
  initialSearch: string;
  primaryColor: string;
}

/** Debounce de la búsqueda para no disparar un fetch por tecla. */
const SEARCH_DEBOUNCE_MS = 250;

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
  const thumb = exerciseGridThumb(ex, 640);
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
              loading="lazy"
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

/** Image that fades in once the next-image thumbnail has finished loading. */
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
  const thumb = exerciseGridThumb(ex, 256);
  return (
    <div
      onClick={onSelect}
      className="group/card cursor-pointer overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-px hover:shadow-md active:scale-[0.98]"
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-[#1B2129] to-[#0B0E13] md:h-[116px]">
        {thumb ? (
          <FadeImage src={thumb} alt={ex.name} />
        ) : (
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover/card:bg-sport-500 md:h-[42px] md:w-[42px]">
            <Play className="h-[17px] w-[17px]" />
          </span>
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-sport-300 md:bottom-2 md:left-2 md:px-[7px]">
          {ex.muscle_group}
        </span>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-[13.5px] font-bold leading-tight text-strong md:text-sm">
          {ex.name}
        </h3>
        {ex.equipment && (
          <p className="mt-0.5 text-[11.5px] text-muted md:mt-[3px] md:text-xs">{ex.equipment}</p>
        )}
      </div>
    </div>
  );
}

export function ClientExerciseCatalog({
  initialExercises,
  initialHasMore,
  initialTotal,
  muscleGroups,
  initialSearch,
  primaryColor,
}: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [selectedMuscle, setSelectedMuscle] = useState<string>("Todos");
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, startLoad] = useTransition();

  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null,
  );
  // Detalle on-demand (instrucciones) — el listado no las trae para no inflar el payload.
  const [instructions, setInstructions] = useState<string[] | null>(null);
  const [loadingDetail, startDetail] = useTransition();

  const muscleChips = ["Todos", ...muscleGroups];

  // Ejercicio "Destacado": el primero con media utilizable de la página cargada. Solo se muestra
  // en la vista por defecto (sin búsqueda ni filtro de músculo).
  const isDefaultView = !search.trim() && selectedMuscle === "Todos";
  const featured = isDefaultView
    ? (exercises.find((e) => exerciseGridThumb(e) !== null) ?? null)
    : null;

  // Secuencia de requests: descarta respuestas viejas cuando cambia el filtro. `exercisesRef`
  // da el offset actual sin recrear el callback de load-more en cada append.
  const reqSeq = useRef(0);
  const exercisesRef = useRef(initialExercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  // Refetch server-side al cambiar búsqueda (debounced) o músculo (offset 0, reemplaza la lista).
  // Se salta el primer render: la página inicial ya viene filtrada por `initialSearch`/"Todos".
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const seq = ++reqSeq.current;
    const timer = setTimeout(() => {
      startLoad(async () => {
        const res = await loadClientExercisesAction({
          search,
          muscle: selectedMuscle,
          offset: 0,
        });
        if (seq !== reqSeq.current) return; // respuesta vieja
        setExercises(res.exercises);
        setHasMore(res.hasMore);
        setTotal(res.total);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, selectedMuscle]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const seq = reqSeq.current;
    startLoad(async () => {
      const res = await loadClientExercisesAction({
        search,
        muscle: selectedMuscle,
        offset: exercisesRef.current.length,
      });
      if (seq !== reqSeq.current) return; // cambió el filtro mientras cargaba
      setExercises((prev) => [...prev, ...res.exercises]);
      setHasMore(res.hasMore);
      setTotal(res.total);
    });
  }, [isLoading, hasMore, search, selectedMuscle]);

  // Infinite scroll REAL: pide la siguiente página cuando el sentinel entra en viewport.
  // Mientras `isLoading`, el observer se desconecta (evita disparos duplicados).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const openExercise = (ex: Exercise) => {
    setSelectedExercise(ex);
    setInstructions(null);
    startDetail(async () => {
      const detail = await getExerciseInstructions(ex.id);
      setInstructions(detail?.instructions ?? []);
    });
  };

  const remaining = Math.max(total - exercises.length, 0);

  return (
    <div className="space-y-5">
      {/* Filters — móvil: search + chips apilados; desktop: barra inline (.dt-aprender-bar) */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
        {/* Mobile: field 48px (espeja el Input rich del DS). Desktop: compact .dt-md-search
            (36px · surface-sunken · borde 1px · 13.5px) inline con los chips. */}
        <div className="md:max-w-[360px] md:flex-1">
          <div className="flex h-12 items-center gap-2 rounded-control border-[1.5px] border-border-default bg-surface-card px-3.5 [transition:border-color_var(--dur-fast)_var(--ease-out),box-shadow_var(--dur-fast)_var(--ease-out)] focus-within:border-sport-600 focus-within:shadow-[var(--ring-focus)] md:h-9 md:border md:bg-surface-sunken md:px-3">
            <span className="inline-flex size-[18px] shrink-0 items-center justify-center text-text-muted [&_svg]:size-[18px] md:size-4 md:[&_svg]:size-4">
              <Search className="h-5 w-5" />
            </span>
            <input
              type="text"
              placeholder="Buscar ejercicio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent font-ui text-[15px] font-medium text-text-strong outline-none placeholder:text-text-muted md:text-[13.5px]"
            />
          </div>
        </div>

        <div className="hide-scrollbar flex snap-x gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {muscleChips.map((m) => {
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
      {exercises.length === 0 ? (
        isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted opacity-60" />
          </div>
        ) : (
          <div className="py-12 text-center text-subtle">
            <Dumbbell className="mx-auto mb-3 h-9 w-9 opacity-40" />
            <p className="text-sm">
              No encontramos ejercicios que coincidan con tu búsqueda.
            </p>
          </div>
        )
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

          <div
            className={`grid grid-cols-2 gap-3 transition-opacity md:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] ${
              isLoading ? "opacity-70" : ""
            }`}
            aria-busy={isLoading}
          >
            {exercises.map((ex) => (
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
            onClick={loadMore}
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card text-[13.5px] font-bold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-60"
          >
            <ChevronDown className="h-4 w-4" />
            Ver más{remaining > 0 ? ` (${remaining} restantes)` : ""}
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
          className="custom-scrollbar bottom-0 left-0 top-auto w-full max-w-full translate-x-0 translate-y-0 flex flex-col overflow-y-auto rounded-t-[28px] rounded-b-none border-subtle bg-surface-card p-0 max-h-[85dvh] focus:outline-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[90vw] md:max-w-[620px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]"
        >
          {selectedExercise && (
            <>
              {/* Media banner */}
              <div className="relative h-[180px] w-full shrink-0 md:h-[190px]">
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
                    const ex = selectedExercise;
                    if (ytId) {
                      return (
                        <div className="flex h-full w-full items-center justify-center border-b border-subtle bg-gradient-to-br from-[#1B2129] to-[#0B0E13]">
                          <ExerciseVideo
                            videoId={ytId}
                            start={ex.video_start_time ?? undefined}
                            end={ex.video_end_time ?? undefined}
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
                      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white/[0.12] text-white md:h-[60px] md:w-[60px]">
                        <Play className="h-6 w-6" />
                      </span>
                    </div>
                  );
                })()}
                <DialogClose
                  aria-label="Cerrar"
                  className="absolute right-3 top-3 z-20 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/55 md:right-3.5 md:top-3.5 md:h-9 md:w-9"
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
