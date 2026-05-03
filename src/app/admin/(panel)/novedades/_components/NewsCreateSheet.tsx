'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createNewsItemAction, updateNewsItemAction } from '../_actions/novedades-actions'
import { toast } from 'sonner'
import { Loader2, Plus, Save } from 'lucide-react'

const formSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum(['feature', 'improvement', 'fix', 'announcement']),
  content: z.string().min(10).max(10000),
  image_url: z.string().url().optional().or(z.literal('')),
  cta_url: z.string().max(500).optional().or(z.literal('')),
  cta_label: z.string().max(100).optional().or(z.literal('')),
  is_pinned: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  newsItem?: {
    id: string
    title: string
    type: string
    content: string
    image_url: string | null
    cta_url: string | null
    cta_label: string | null
    is_pinned: boolean | null
  } | null
  onSuccess?: () => void
}

export function NewsCreateSheet({ newsItem, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!newsItem

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: newsItem?.title ?? '',
      type: (newsItem?.type as any) ?? 'feature',
      content: newsItem?.content ?? '',
      image_url: newsItem?.image_url ?? '',
      cta_url: newsItem?.cta_url ?? '',
      cta_label: newsItem?.cta_label ?? '',
      is_pinned: newsItem?.is_pinned ?? false,
    },
  })

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.set('title', values.title)
      formData.set('type', values.type)
      formData.set('content', values.content)
      formData.set('image_url', values.image_url || '')
      formData.set('cta_url', values.cta_url || '')
      formData.set('cta_label', values.cta_label || '')
      formData.set('is_pinned', values.is_pinned ? 'on' : 'off')

      const result = isEditing
        ? await updateNewsItemAction(newsItem.id, null, formData)
        : await createNewsItemAction(null, formData)

      if (result.success) {
        toast.success(isEditing ? 'Novedad actualizada' : 'Novedad creada')
        setOpen(false)
        if (!isEditing) form.reset()
        onSuccess?.()
      } else {
        toast.error(result.error || 'Error')
      }
    } catch (err) {
      toast.error('Error inesperado')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant={isEditing ? 'outline' : 'default'}
        size={isEditing ? 'sm' : 'default'}
        onClick={() => setOpen(true)}
        className={isEditing ? '' : 'gap-2'}
      >
        {isEditing ? (
          <Save className="h-4 w-4" />
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Crear novedad
          </>
        )}
      </Button>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle>{isEditing ? 'Editar novedad' : 'Crear novedad'}</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Título de la novedad" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="feature">Nueva función</SelectItem>
                      <SelectItem value="improvement">Mejora</SelectItem>
                      <SelectItem value="fix">Corrección</SelectItem>
                      <SelectItem value="announcement">Anuncio</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenido</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe la novedad..." rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de imagen (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="cta_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CTA URL (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="/coach/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cta_label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CTA Label (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Probar ahora" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_pinned"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Fijar como importante</FormLabel>
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEditing ? 'Guardar cambios' : 'Crear novedad'}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
