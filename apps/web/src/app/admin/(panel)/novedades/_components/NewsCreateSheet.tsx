'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
import { Loader2, Plus, Upload, X, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export const NEWS_TYPES = ['feature', 'improvement', 'fix', 'announcement'] as const
export type NewsType = (typeof NEWS_TYPES)[number]

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

const formSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum(NEWS_TYPES),
  content: z.string().min(10).max(10000),
  image_url: z.string().url().optional().or(z.literal('')),
  cta_url: z.string().max(500).optional().or(z.literal('')),
  cta_label: z.string().max(100).optional().or(z.literal('')),
  is_pinned: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

export type NewsFormItem = {
  id: string
  title: string
  type: string
  content: string
  image_url: string | null
  cta_url: string | null
  cta_label: string | null
  is_pinned: boolean | null
}

interface Props {
  newsItem?: NewsFormItem | null
  onSuccess?: () => void
  /**
   * Modo controlado: la lista monta UN solo sheet para las N filas y le pasa cual editar
   * (antes cada fila montaba su propio formulario: 30 novedades = 30 forms en el DOM).
   * Sin `open` el sheet es autonomo y dibuja su propio boton "Crear novedad".
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const EMPTY_VALUES: FormValues = {
  title: '',
  type: 'feature',
  content: '',
  image_url: '',
  cta_url: '',
  cta_label: '',
  is_pinned: false,
}

function toFormValues(item?: NewsFormItem | null): FormValues {
  if (!item) return EMPTY_VALUES
  return {
    title: item.title,
    // `type` viene como string suelto de la DB: si trae un valor fuera del enum, el resolver
    // bloquearia el submit sin explicar por que. Caemos a 'feature' en vez de castear a any.
    type: (NEWS_TYPES as readonly string[]).includes(item.type) ? (item.type as NewsType) : 'feature',
    content: item.content,
    image_url: item.image_url ?? '',
    cta_url: item.cta_url ?? '',
    cta_label: item.cta_label ?? '',
    is_pinned: item.is_pinned ?? false,
  }
}

export function NewsCreateSheet({
  newsItem,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const isControlled = controlledOpen !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isControlled ? controlledOpen : internalOpen

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editingId = newsItem?.id ?? null
  const isEditing = editingId !== null

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(newsItem),
  })

  // Un solo sheet sirve a todas las filas, asi que los valores se cargan al abrirlo (o al
  // saltar de una novedad a otra). La sincronizacion va por id y NO por identidad del objeto:
  // un router.refresh() con el sheet abierto no puede pisar lo que el admin esta escribiendo.
  const newsItemRef = useRef(newsItem)
  newsItemRef.current = newsItem
  useEffect(() => {
    if (!open) return
    form.reset(toFormValues(newsItemRef.current))
  }, [open, editingId, form])

  const imageUrl = form.watch('image_url')

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error('La imagen no puede superar los 2MB')
        return
      }

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
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
    },
    [form]
  )

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void uploadFile(file)
    },
    [uploadFile]
  )

  // La zona decia "arrastra una imagen" pero no escuchaba drop: sin preventDefault el browser
  // navega al archivo soltado y se pierde el formulario entero.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // dragleave tambien dispara al cruzar los hijos: solo apagamos el resalte cuando el
    // cursor sale de la zona completa.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (uploadingImage) return
      const file = e.dataTransfer.files?.[0]
      if (file) void uploadFile(file)
    },
    [uploadFile, uploadingImage]
  )

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

      const result = editingId
        ? await updateNewsItemAction(editingId, null, formData)
        : await createNewsItemAction(null, formData)

      if (result.success) {
        toast.success(editingId ? 'Novedad actualizada' : 'Novedad creada')
        setOpen(false)
        if (!editingId) form.reset(EMPTY_VALUES)
        onSuccess?.()
      } else {
        toast.error(result.error || 'Error')
      }
    } catch {
      toast.error('Error inesperado')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Crear novedad
        </Button>
      )}
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
                  <Select value={field.value} onValueChange={field.onChange}>
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
                        <div className="relative rounded-lg border border-subtle overflow-hidden bg-[var(--ink-950)]/20">
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
                            className="absolute top-2 right-2 p-1 rounded-full bg-[var(--danger-500)] text-white hover:bg-[var(--danger-500)]/90 transition-colors"
                            title="Eliminar imagen"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => fileInputRef.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              fileInputRef.current?.click()
                            }
                          }}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors hover:border-[var(--sport-500)]/50 hover:bg-[var(--sport-500)]/[0.02] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                            isDragging
                              ? 'border-[var(--sport-500)] bg-[var(--sport-500)]/[0.06]'
                              : 'border-subtle',
                            uploadingImage && 'opacity-60 pointer-events-none'
                          )}
                        >
                          {uploadingImage ? (
                            <Loader2 className="h-6 w-6 animate-spin text-muted" />
                          ) : isDragging ? (
                            <Upload className="h-6 w-6 text-[var(--sport-500)]" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted" />
                          )}
                          <p className="text-xs text-muted text-center">
                            {uploadingImage
                              ? 'Subiendo...'
                              : isDragging
                                ? 'Suelta la imagen aquí'
                                : 'Haz clic o arrastra una imagen'}
                          </p>
                          <p className="text-[10px] text-subtle">PNG, JPG, WebP · Max 2MB</p>
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
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                          <span className="text-[10px] text-muted uppercase">o pegar URL</span>
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
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
                      className="h-4 w-4 rounded border-subtle text-[var(--sport-500)]"
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
