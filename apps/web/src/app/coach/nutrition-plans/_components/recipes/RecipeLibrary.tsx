'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { ChefHat, Users, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateRecipeDialog } from './CreateRecipeDialog'
import { AssignRecipeModal, type RecipeAssignClient } from './AssignRecipeModal'
import { deleteRecipeAction } from '../../_actions/recipes.actions'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
import { toast } from 'sonner'

type Props = {
  recipes: RecipeRow[]
  clients: RecipeAssignClient[]
}

export function RecipeLibrary({ recipes, clients }: Props) {
  const [assignTarget, setAssignTarget] = useState<RecipeRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleDelete = (recipe: RecipeRow) => {
    setDeletingId(recipe.id)
    startTransition(async () => {
      const res = await deleteRecipeAction({ recipeId: recipe.id })
      setDeletingId(null)
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo eliminar la receta.')
        return
      }
      toast.success('Receta eliminada')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
          Ideas de recetas — inspiración para tus alumnos. No afectan macros ni adherencia.
        </p>
        <CreateRecipeDialog />
      </div>

      {recipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <ChefHat className="h-6 w-6 text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-foreground">Todavía no tienes recetas</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-xs mx-auto">
            Crea ideas de recetas para inspirar a tus alumnos. Toma unos 30 segundos.
          </p>
          <CreateRecipeDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="group flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-emerald-500/30 hover:shadow-lg"
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
                <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-emerald-500/10 to-card">
                  <ChefHat className="h-8 w-8 text-emerald-500/40" />
                </div>
              )}

              <div className="flex flex-1 flex-col p-4 space-y-3">
                <h3 className="font-black text-base leading-tight tracking-tight text-foreground line-clamp-2">
                  {recipe.name}
                </h3>

                {recipe.ingredients_text && (
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">
                    {recipe.ingredients_text}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1 h-9 gap-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 font-bold uppercase tracking-widest text-[10px]"
                    onClick={() => setAssignTarget(recipe)}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Compartir
                  </Button>
                  <CreateRecipeDialog
                    recipe={recipe}
                    trigger={
                      <button
                        type="button"
                        aria-label="Editar receta"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border bg-background hover:bg-muted transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    }
                  />
                  <button
                    type="button"
                    aria-label="Eliminar receta"
                    disabled={pending && deletingId === recipe.id}
                    onClick={() => handleDelete(recipe)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border bg-background hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors disabled:opacity-50"
                  >
                    {pending && deletingId === recipe.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AssignRecipeModal
        open={assignTarget !== null}
        onOpenChange={(o) => !o && setAssignTarget(null)}
        recipe={assignTarget}
        clients={clients}
      />
    </div>
  )
}
