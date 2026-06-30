'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { sendSupportMessage } from './_actions/support.actions'
import { toast } from 'sonner'
import { Loader2, Send, Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const supportFormSchema = z.object({
  type: z.enum(['help', 'bug', 'idea']),
  subject: z.string().min(3, 'El asunto es requerido').max(200),
  description: z.string().min(10, 'Describe tu consulta con al menos 10 caracteres').max(5000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  attachmentUrl: z.string().optional(),
})

type SupportFormValues = z.infer<typeof supportFormSchema>

const TYPE_LABELS: Record<string, string> = {
  help: 'Necesito ayuda',
  bug: 'Reportar bug',
  idea: 'Sugerir mejora',
}

export function SupportForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  const form = useForm<SupportFormValues>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      type: 'help',
      subject: '',
      description: '',
      priority: undefined,
      attachmentUrl: '',
    },
  })

  const selectedType = form.watch('type')

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('El archivo no puede superar los 2MB')
      return
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Solo se permiten imágenes (PNG, JPG) o PDF')
      return
    }

    setUploadingFile(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `support/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error } = await supabase.storage.from('support-attachments').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(path)
      form.setValue('attachmentUrl', publicUrl)
      setUploadedFileName(file.name)
      toast.success('Archivo adjunto listo')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('No se pudo subir el archivo')
    } finally {
      setUploadingFile(false)
    }
  }, [form])

  const removeAttachment = useCallback(() => {
    form.setValue('attachmentUrl', '')
    setUploadedFileName(null)
  }, [form])

  async function onSubmit(values: SupportFormValues) {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.set('type', values.type)
      formData.set('subject', values.subject)
      formData.set('description', values.description)
      if (values.priority) formData.set('priority', values.priority)
      if (values.attachmentUrl) formData.set('attachmentUrl', values.attachmentUrl)
      formData.set('metadataUrl', typeof window !== 'undefined' ? window.location.href : '')
      formData.set('metadataUserAgent', typeof window !== 'undefined' ? navigator.userAgent : '')

      const result = await sendSupportMessage(null, formData)

      if (result.success) {
        toast.success('Mensaje enviado. Te responderemos a la brevedad.')
        form.reset()
        setUploadedFileName(null)
      } else {
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as any, { message: messages[0] })
          })
        }
        toast.error(result.error || 'Ocurrió un error')
      }
    } catch (error) {
      toast.error('Error inesperado')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Tipo */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de consulta</FormLabel>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(['help', 'bug', 'idea'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => field.onChange(t)}
                    className={cn(
                      'shrink-0 rounded-control border px-4 py-2 text-sm font-semibold transition-colors',
                      field.value === t
                        ? 'border-transparent bg-[var(--sport-500)] text-[var(--text-on-sport)]'
                        : 'border-transparent bg-surface-sunken text-muted hover:text-strong'
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Asunto */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asunto *</FormLabel>
              <FormControl>
                <Input placeholder="Ej: No puedo asignar programa a alumno" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Prioridad (solo bug) */}
        {selectedType === 'bug' && (
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridad</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona prioridad" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Descripción */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe tu consulta con el mayor detalle posible..."
                  rows={6}
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Adjunto */}
        <FormField
          control={form.control}
          name="attachmentUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adjunto (opcional)</FormLabel>
              <FormControl>
                <div className="flex items-center gap-3">
                  {!uploadedFileName ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-default bg-surface-sunken px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-strong">
                      <Paperclip className="h-4 w-4" />
                      {uploadingFile ? 'Subiendo...' : 'Subir imagen o PDF'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={uploadingFile}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-sm">
                      <span className="max-w-[200px] truncate text-strong">{uploadedFileName}</span>
                      <button
                        type="button"
                        onClick={removeAttachment}
                        className="text-muted transition-colors hover:text-[var(--danger-600)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </FormControl>
              <p className="text-[11px] text-muted-foreground mt-1">Máximo 2MB. No adjuntes información sensible de terceros sin su consentimiento.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Disclaimer */}
        <p className="text-[11px] text-muted">
          Al enviar, aceptas nuestras condiciones de uso.
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-control text-sm font-bold transition-all bg-[var(--sport-500)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[var(--cta-fill)] disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar consulta
        </button>
      </form>
    </Form>
  )
}
