'use client'

import { useState, useCallback, useRef } from 'react'
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
import { createNewsItemAction, updateNewsItemAction } from '../_actions/novedades-actions'
import { toast } from 'sonner'
import { Loader2, Plus, Save, Upload, X, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Image from 'next/image'

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
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const imageUrl = form.watch('image_url')

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no puede superar los 2MB')
      return
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Solo se permiten imágenes PNG, JPG o WebP')
      return
    }

    setUploadingImage(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `news/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error } = await supabase.storage.from('news').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('news').getPublicUrl(path)
      form.setValue('image_url', publicUrl)
      toast.success('Imagen subida correctamente')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('No se pudo subir la imagen')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [form])

  const removeImage = useCallback(() => {
    form.setValue('image_url', '')
  }, [form])

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
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
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

            {/* Image Upload */}
            <FormField
              control={form.control}
              name="image_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagen (opcional)</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      {imageUrl ? (
                        <div className="relative rounded-lg border border-border overflow-hidden bg-black/20">
                          <Image
                            src={imageUrl}
                            alt="Preview"
                            width={400}
                            height={200}
                            className="w-full h-auto object-cover max-h-48"
                          />
                          <button
                            type="button"
                            onClick={removeImage}
                            className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors"
                            title="Eliminar imagen"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/[0.02]',
                            uploadingImage && 'opacity-60 pointer-events-none'
                          )}
                        >
                          {uploadingImage ? (
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                          <p className="text-xs text-muted-foreground text-center">
                            {uploadingImage ? 'Subiendo...' : 'Haz clic o arrastra una imagen'}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP · Max 2MB</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      {!imageUrl && (
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] text-muted-foreground uppercase">o pegar URL</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      {!imageUrl && (
                        <Input
                          placeholder="https://..."
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      )}
                    </div>
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
