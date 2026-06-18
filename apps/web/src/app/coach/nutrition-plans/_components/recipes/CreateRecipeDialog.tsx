'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Loader2, Save, ChefHat, ImagePlus, X, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createRecipeAction, updateRecipeAction } from '../../_actions/recipes.actions'
import { uploadRecipePhotoAction } from '../../_actions/recipe-photo.actions'
import type { RecipeRow } from '@/services/nutrition-recipes.service'
import { toast } from 'sonner'

type Props = {
  /** Si viene, el dialog edita esa receta; si no, crea una nueva. */
  recipe?: RecipeRow
  /** Trigger custom. Por defecto un botón "Nueva receta". */
  trigger?: React.ReactNode
  onSaved?: () => void
}

export function CreateRecipeDialog({ recipe, trigger, onSaved }: Props) {
  const isEdit = Boolean(recipe)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState(recipe?.ingredients_text ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [imageUrl, setImageUrl] = useState(recipe?.image_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    if (isEdit && recipe) {
      setName(recipe.name)
      setIngredients(recipe.ingredients_text ?? '')
      setInstructions(recipe.instructions ?? '')
      setImageUrl(recipe.image_url ?? '')
    } else {
      setName('')
      setIngredients('')
      setInstructions('')
      setImageUrl('')
    }
    setShowUrlInput(false)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // reset el input para permitir re-seleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    setUploading(true)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadRecipePhotoAction(fd)
        if (!res.success) {
          toast.error(res.error)
          return
        }
        setImageUrl(res.url)
        toast.success('Imagen subida')
      } finally {
        setUploading(false)
      }
    })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        ingredients_text: ingredients.trim() || null,
        instructions: instructions.trim() || null,
        image_url: imageUrl.trim() || null,
      }
      const res =
        isEdit && recipe
          ? await updateRecipeAction({ recipeId: recipe.id, ...payload })
          : await createRecipeAction(payload)
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar la receta.')
        return
      }
      toast.success(isEdit ? 'Receta actualizada' : 'Receta creada')
      setOpen(false)
      if (!isEdit) reset()
      onSaved?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <button
              type="button"
              className="h-12 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] gap-2 px-6 shadow-lg shadow-primary/20 flex items-center justify-center w-full md:w-auto"
            >
              <ChefHat className="w-4 h-4" />
              Nueva receta
            </button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg bg-white dark:bg-zinc-950 border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-emerald-500" />
            {isEdit ? 'Editar receta' : 'Nueva receta'}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ideas de recetas — inspiración para tus alumnos. No afectan macros ni adherencia.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Bowl de pollo y quinoa"
              maxLength={160}
              required
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Ingredientes
            </Label>
            <Textarea
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder={'Ej:\n- 150 g pechuga de pollo\n- 1 taza de quinoa cocida\n- 1/2 palta'}
              maxLength={8000}
              rows={4}
              className="rounded-xl resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Instrucciones
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Pasos para preparar la receta…"
              maxLength={8000}
              rows={4}
              className="rounded-xl resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Imagen (opcional)
            </Label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={handleFilePick}
            />

            {imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/30">
                <div className="relative aspect-video w-full">
                  <Image
                    src={imageUrl}
                    alt="Vista previa de la receta"
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 512px"
                    className="object-cover"
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  disabled={uploading}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-50"
                  aria-label="Quitar imagen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || pending}
                className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground transition hover:border-primary/50 hover:bg-muted/40 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[11px] font-semibold">Subiendo…</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[11px] font-semibold">Subir imagen</span>
                  </>
                )}
              </button>
            )}

            <p className="text-[10px] text-muted-foreground/80">
              Se optimiza a WebP automáticamente. JPG, PNG, WebP o HEIC, hasta 8 MB.
            </p>

            {!imageUrl && (
              <div className="pt-0.5">
                {showUrlInput ? (
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                    type="url"
                    maxLength={2048}
                    className="h-10 rounded-xl"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 transition hover:text-foreground"
                  >
                    <Link2 className="h-3 w-3" />
                    o pega una URL
                  </button>
                )}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={pending || uploading}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear receta'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
