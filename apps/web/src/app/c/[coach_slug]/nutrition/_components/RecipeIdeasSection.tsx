'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, Lightbulb, UtensilsCrossed } from 'lucide-react'
import { staggerContainer, fadeSlideUp, springsSheet } from '@/lib/animation-presets'
import type { RecipeRow } from '@/services/nutrition-recipes.service'

interface Props {
  recipes: RecipeRow[]
}

/**
 * Feature L (alumno): recetas-idea asignadas por el coach como inspiración.
 *
 * Sección SEPARADA del plan: solo lectura, SIN macros, SIN "marcar completada".
 * Visualmente distinta de las comidas del plan (estilo de tarjeta dashed + badge "Idea").
 * Tap en una tarjeta abre un bottom-sheet con ingredientes + instrucciones.
 */
export function RecipeIdeasSection({ recipes }: Props) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState<RecipeRow | null>(null)

  return (
    <section aria-label="Ideas de recetas" className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Ideas de recetas
        </h2>
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground">
          Tu coach aún no te compartió recetas. Cuando lo haga, aparecerán aquí como inspiración.
        </p>
      ) : (
        <motion.ul
          className="space-y-3"
          variants={staggerContainer(0.06)}
          initial={reduceMotion ? false : 'hidden'}
          animate="show"
        >
          {recipes.map((recipe) => (
            <motion.li key={recipe.id} variants={fadeSlideUp}>
              <button
                type="button"
                onClick={() => setActive(recipe)}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/[0.04] p-2.5 text-left transition-colors hover:bg-amber-500/[0.08] active:scale-[0.99] dark:border-amber-400/30 dark:bg-amber-400/[0.05]"
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
                      <UtensilsCrossed className="h-5 w-5" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{recipe.name}</p>
                  {recipe.ingredients_text && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {recipe.ingredients_text}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                  Idea
                </span>
              </button>
            </motion.li>
          ))}
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
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-hidden rounded-t-3xl border-t border-border bg-background pb-safe"
              initial={{ y: reduceMotion ? 0 : '100%' }}
              animate={{ y: 0 }}
              exit={{ y: reduceMotion ? 0 : '100%' }}
              transition={reduceMotion ? { duration: 0 } : springsSheet.enter}
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />

              {active.image_url && (
                <div className="relative mx-4 mt-3 h-40 overflow-hidden rounded-2xl bg-muted">
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

              <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                <div className="min-w-0 flex-1">
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                    <Lightbulb className="h-2.5 w-2.5" aria-hidden /> Idea
                  </span>
                  <h3 className="text-base font-black tracking-tight text-foreground">{active.name}</h3>
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

              <div className="space-y-5 overflow-y-auto px-4 pb-6" style={{ maxHeight: 'calc(85dvh - 16rem)' }}>
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
