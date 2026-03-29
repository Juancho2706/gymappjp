'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Loader2, Save } from 'lucide-react'
import { saveRecipe } from './actions'
import { toast } from 'sonner'

const recipeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  instructions: z.string().min(10, "Las instrucciones deben tener al menos 10 caracteres"),
  prep_time_minutes: z.coerce.number().min(1, "El tiempo de preparación es requerido"),
  calories: z.coerce.number().min(0),
  protein_g: z.coerce.number().min(0),
  carbs_g: z.coerce.number().min(0),
  fats_g: z.coerce.number().min(0),
  category: z.enum(["Desayuno", "Almuerzo", "Cena", "Snack/Merienda", "Postre"]),
  image_url: z.string().url("URL de imagen inválida").optional().or(z.literal("")),
})

type RecipeFormValues = z.infer<typeof recipeSchema>

interface RecipeModalProps {
  coachId: string
  recipe?: any // Para edición
  onSuccess?: () => void
}

export function RecipeModal({ coachId, recipe, onSuccess }: RecipeModalProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: recipe ? {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description || "",
      instructions: recipe.instructions || "",
      prep_time_minutes: recipe.prep_time_minutes || 0,
      calories: recipe.calories || 0,
      protein_g: recipe.protein_g || 0,
      carbs_g: recipe.carbs_g || 0,
      fats_g: recipe.fats_g || 0,
      category: recipe.category || "Desayuno",
      image_url: recipe.image_url || "",
    } : {
      name: "",
      description: "",
      instructions: "",
      prep_time_minutes: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fats_g: 0,
      category: "Desayuno",
      image_url: "",
    },
  })

  async function onSubmit(values: RecipeFormValues) {
    setIsSubmitting(true)
    try {
      const result = await saveRecipe(values, coachId)
      if (result.success) {
        toast.success(recipe ? "Receta actualizada" : "Receta creada")
        setOpen(false)
        if (!recipe) form.reset()
        onSuccess?.()
      } else {
        toast.error(result.error || "Ocurrió un error")
      }
    } catch (error) {
      toast.error("Error inesperado")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {recipe ? (
          <Button variant="outline" size="sm">Editar</Button>
        ) : (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Receta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipe ? "Editar Receta" : "Crear Nueva Receta"}</DialogTitle>
          <DialogDescription>
            Completa los detalles de la receta para guardarla en tu biblioteca.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Receta</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Pollo con Quinoa y Vegetales" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Desayuno">Desayuno</SelectItem>
                        <SelectItem value="Almuerzo">Almuerzo</SelectItem>
                        <SelectItem value="Cena">Cena</SelectItem>
                        <SelectItem value="Snack/Merienda">Snack/Merienda</SelectItem>
                        <SelectItem value="Postre">Postre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prep_time_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tiempo (min)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción Corta</FormLabel>
                  <FormControl>
                    <Input placeholder="Breve resumen del plato" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instrucciones</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Pasos para preparar la receta..." 
                      className="min-h-[100px]" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="calories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calorías</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="protein_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proteínas (g)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="carbs_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carbs (g)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fats_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grasas (g)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de Imagen (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://ejemplo.com/imagen.jpg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {recipe ? "Guardar Cambios" : "Crear Receta"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
