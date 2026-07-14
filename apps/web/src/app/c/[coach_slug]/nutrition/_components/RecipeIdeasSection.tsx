'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Clock3, Lightbulb, Scale, UtensilsCrossed, X } from 'lucide-react'
import { staggerContainer, fadeSlideUp, springsSheet } from '@/lib/animation-presets'
import type { RecipeRow } from '@/services/nutrition-recipes.service'

interface Props {
  recipes: RecipeRow[]
}

/**
 * Recetas asignadas al alumno:
 * - idea Base: inspiración, sin impacto nutricional calculado;
 * - structured: preparación cuantificable con macros por porción.
 */
export function RecipeIdeasSection({ recipes }: Props) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState<RecipeRow | null>(null)

  return (
    <section aria-label="Recetas compartidas" className="space-y-3">
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="h-4 w-4 shrink-0 text-ember-500" aria-hidden />
        <h2 className="font-display text-[17px] font-extrabold tracking-tight text-foreground">
          Recetas
        </h2>
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
          Tu profesional todavía no te compartió recetas.
        </p>
      ) : (
        <motion.ul
          className="space-y-3"
          variants={staggerContainer(0.06)}
          initial={reduceMotion ? false : 'hidden'}
          animate="show"
        >
          {recipes.map((recipe) => {
            const structured = recipe.recipe_mode === 'structured'
            return (
              <motion.li key={recipe.id} variants={fadeSlideUp}>
                <button
                  type="button"
                  onClick={() => setActive(recipe)}
                  className={`flex min-h-20 w-full items-center gap-3 rounded-card border p-2.5 text-left transition-colors active:scale-[0.99] ${
                    structured
                      ? 'border-ember-500/30 bg-ember-500/[0.05] hover:bg-ember-500/[0.09]'
                      : 'border-dashed border-amber-500/40 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] dark:border-amber-400/30'
                  }`}
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {recipe.image_url ? (
                      <Image
                        src={recipe.image_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                        {structured ? <Scale className="h-5 w-5 text-ember-500" /> : <Lightbulb className="h-5 w-5" />}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{recipe.name}</p>
                    {structured ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] font-bold tabular-nums text-muted-foreground">
                        <span className="text-ember-700 dark:text-ember-300">
                          {Math.round(recipe.calories_per_serving ?? 0)} kcal
                        </span>
                        <span>P {Math.round(recipe.protein_g_per_serving ?? 0)}g</span>
                        <span>C {Math.round(recipe.carbs_g_per_serving ?? 0)}g</span>
                        <span>G {Math.round(recipe.fats_g_per_serving ?? 0)}g</span>
                      </div>
                    ) : recipe.ingredients_text ? (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {recipe.ingredients_text}
                      </p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                    structured
                      ? 'bg-ember-500/15 text-ember-700 dark:text-ember-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}>
                    {structured ? 'Calculada' : 'Idea'}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      <AnimatePresence>
        {active && (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar"
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              onClick={() => setActive(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={active.name}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-lg overflow-hidden rounded-t-3xl border-t border-border bg-background pb-safe md:bottom-4 md:rounded-3xl md:border"
              initial={{ y: reduceMotion ? 0 : '100%' }}
              animate={{ y: 0 }}
              exit={{ y: reduceMotion ? 0 : '100%' }}
              transition={reduceMotion ? { duration: 0 } : springsSheet.enter}
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />

              {active.image_url && (
                <div className="relative mx-4 mt-3 h-40 overflow-hidden rounded-card bg-muted">
                  <Image
                    src={active.image_url}
                    alt=""
                    fill
                    sizes="(max-width: 512px) 100vw, 512px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}

              <div className="flex items-start gap-3 px-4 pb-2 pt-3">
                <div className="min-w-0 flex-1">
                  <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                    active.recipe_mode === 'structured'
                      ? 'bg-ember-500/15 text-ember-700 dark:text-ember-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}>
                    {active.recipe_mode === 'structured' ? (
                      <><Scale className="h-2.5 w-2.5" /> Receta calculada</>
                    ) : (
                      <><Lightbulb className="h-2.5 w-2.5" /> Idea</>
                    )}
                  </span>
                  <h3 className="text-base font-black tracking-tight text-foreground">{active.name}</h3>
                  {active.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{active.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Cerrar"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 overflow-y-auto px-4 pb-6" style={{ maxHeight: 'calc(85dvh - 12rem)' }}>
                {active.recipe_mode === 'structured' && (
                  <div className="rounded-card border border-ember-500/20 bg-ember-500/[0.06] p-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-ember-700 dark:text-ember-300">Por porción</p>
                        <p className="mt-1 font-mono text-2xl font-black tabular-nums text-foreground">
                          {Math.round(active.calories_per_serving ?? 0)} kcal
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-x-3 text-right font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                        <span>P {Math.round(active.protein_g_per_serving ?? 0)}g</span>
                        <span>C {Math.round(active.carbs_g_per_serving ?? 0)}g</span>
                        <span>G {Math.round(active.fats_g_per_serving ?? 0)}g</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                      <span>{active.servings} {active.servings === 1 ? 'porción' : 'porciones'}</span>
                      {active.prep_time_minutes != null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" /> {active.prep_time_minutes} min
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {active.ingredients_text && (
                  <div>
                    <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Ingredientes
                    </h4>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {active.ingredients_text}
                    </p>
                  </div>
                )}
                {active.instructions && (
                  <div>
                    <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Preparación
                    </h4>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {active.instructions}
                    </p>
                  </div>
                )}
                {!active.ingredients_text && !active.instructions && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Esta receta no tiene detalles adicionales.
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  )
}
