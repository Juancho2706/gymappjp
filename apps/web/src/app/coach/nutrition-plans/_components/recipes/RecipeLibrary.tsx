'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { ChefHat, Clock3, Users, Pencil, Trash2, Loader2, Search, Scale, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CreateRecipeDialog } from './CreateRecipeDialog'
import { StructuredRecipeDialog } from './StructuredRecipeDialog'
import { AssignRecipeModal, type RecipeAssignClient } from './AssignRecipeModal'
import { deleteRecipeAction } from '../../_actions/recipes.actions'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { TierBadge } from '@/components/nutrition/TierBadge'

type Props = {
  recipes: RecipeRow[]
  clients: RecipeAssignClient[]
  nutritionProEnabled: boolean
}

export function RecipeLibrary({ recipes, clients, nutritionProEnabled }: Props) {
  const [assignTarget, setAssignTarget] = useState<RecipeRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CL')
    if (!normalized) return recipes
    return recipes.filter((recipe) =>
      recipe.name.toLocaleLowerCase('es-CL').includes(normalized)
      || (recipe.ingredients_text?.toLocaleLowerCase('es-CL').includes(normalized) ?? false)
      || (recipe.category?.toLocaleLowerCase('es-CL').includes(normalized) ?? false),
    )
  }, [recipes, query])

  function handleDelete(recipe: RecipeRow) {
    setDeletingId(recipe.id)
    startTransition(async () => {
      const result = await deleteRecipeAction({ recipeId: recipe.id })
      setDeletingId(null)
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo eliminar la receta.')
        return
      }
      toast.success('Receta eliminada')
    })
  }

  const createActions = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <CreateRecipeDialog />
      {nutritionProEnabled && <StructuredRecipeDialog />}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="max-w-lg space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier="base" />
            {nutritionProEnabled && <TierBadge tier="pro" />}
            <InfoTooltip content="Las ideas Base sirven como inspiración. Las recetas Pro usan ingredientes del catálogo, calculan macros por porción y pueden formar parte de la prescripción profesional." />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Crea ideas rápidas o preparaciones cuantificables con porciones y macros consistentes.
          </p>
        </div>
        {createActions}
      </div>

      {recipes.length > 0 && (
        <div className="space-y-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              placeholder="Buscar receta, ingrediente o categoría…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 rounded-control border-default bg-surface-card pl-10 pr-10 text-base shadow-sm placeholder:text-muted md:text-sm"
              aria-label="Buscar receta"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="eva-press absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-[var(--text-muted)]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          {query.trim() && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)]">
                {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
              </span>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="eva-press inline-flex items-center gap-1 text-xs font-bold text-[var(--sport-600)]"
              >
                <X className="size-3" />
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="rounded-card border border-dashed border-default bg-surface-card p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ember-100)] text-[var(--ember-600)]">
            <ChefHat className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-strong">Todavía no tienes recetas</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-xs leading-relaxed text-muted">
            Empieza con una idea Base o crea una receta profesional calculada desde tus alimentos.
          </p>
          <div className="flex justify-center">{createActions}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-default bg-surface-card px-6 py-10 text-center">
          <p className="font-display text-[15px] font-extrabold text-strong">Sin recetas</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Ninguna receta coincide con «{query.trim()}».
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => {
            const structured = recipe.recipe_mode === 'structured'
            return (
              <article
                key={recipe.id}
                className="group flex flex-col overflow-hidden rounded-card border border-border bg-card transition-all hover:border-[color:var(--ember-300)] hover:shadow-lg"
              >
                {recipe.image_url ? (
                  <div className="relative aspect-[16/9] w-full bg-muted">
                    <Image
                      src={recipe.image_url}
                      alt={recipe.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-[var(--ember-100)] to-card">
                    {structured ? (
                      <Scale className="h-8 w-8 text-[var(--ember-400)]" />
                    ) : (
                      <ChefHat className="h-8 w-8 text-[var(--ember-300)]" />
                    )}
                  </div>
                )}

                <div className="flex flex-1 flex-col space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-base font-black leading-tight tracking-tight text-foreground">
                        {recipe.name}
                      </h3>
                      {recipe.category && (
                        <p className="mt-1 truncate text-[11px] font-semibold text-muted">{recipe.category}</p>
                      )}
                    </div>
                    <TierBadge tier={structured ? 'pro' : 'base'} />
                  </div>

                  {structured ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-pill bg-ember-100 px-2.5 py-1 font-mono text-[11px] font-black tabular-nums text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
                          {Math.round(recipe.calories_per_serving ?? 0)} kcal
                        </span>
                        <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums text-muted">
                          P {Math.round(recipe.protein_g_per_serving ?? 0)}g
                        </span>
                        <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums text-muted">
                          C {Math.round(recipe.carbs_g_per_serving ?? 0)}g
                        </span>
                        <span className="rounded-pill bg-surface-sunken px-2.5 py-1 font-mono text-[10.5px] font-bold tabular-nums text-muted">
                          G {Math.round(recipe.fats_g_per_serving ?? 0)}g
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
                        <span>{recipe.servings} {recipe.servings === 1 ? 'porción' : 'porciones'}</span>
                        {recipe.prep_time_minutes != null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {recipe.prep_time_minutes} min
                          </span>
                        )}
                      </div>
                    </>
                  ) : recipe.ingredients_text ? (
                    <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                      {recipe.ingredients_text}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">Idea de receta sin ingredientes detallados.</p>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-9 flex-1 gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                      onClick={() => setAssignTarget(recipe)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Compartir
                    </Button>

                    {structured ? (
                      nutritionProEnabled && (
                        <StructuredRecipeDialog
                          recipe={recipe}
                          trigger={(
                            <button
                              type="button"
                              aria-label="Editar receta profesional"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background transition-colors hover:bg-muted"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                        />
                      )
                    ) : (
                      <CreateRecipeDialog
                        recipe={recipe}
                        trigger={(
                          <button
                            type="button"
                            aria-label="Editar idea de receta"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background transition-colors hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      />
                    )}

                    <button
                      type="button"
                      aria-label="Eliminar receta"
                      disabled={pending && deletingId === recipe.id}
                      onClick={() => handleDelete(recipe)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background transition-colors hover:border-[color:var(--danger-500)] hover:bg-[var(--danger-100)] disabled:opacity-50"
                    >
                      {pending && deletingId === recipe.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--danger-500)]" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-[var(--danger-500)]" />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <AssignRecipeModal
        open={assignTarget !== null}
        onOpenChange={(value) => !value && setAssignTarget(null)}
        recipe={assignTarget}
        clients={clients}
      />
    </div>
  )
}
