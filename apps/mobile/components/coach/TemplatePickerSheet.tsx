import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, FileText } from 'lucide-react-native'
import { Sheet } from '../Sheet'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { TYPE } from '../../lib/typography'
import type { ClientActionWorkspace } from '../../lib/client-actions'
import { templateMatchesActionWorkspace } from '../../lib/client-action-workspace'

interface TemplateRow {
  id: string
  name: string
  client_id: string | null
  coach_id: string | null
  org_id: string | null
  updated_at: string | null
  weeks_to_repeat: number
  duration_type: string | null
  workout_plans: { id: string }[] | null
}

interface Props {
  open: boolean
  onClose: () => void
  hasExistingData: boolean
  workspace: ClientActionWorkspace | null
  coachId: string | null
  onSelect: (templateId: string) => Promise<void>
}

/** Lista las plantillas propias del workspace explicito (`client_id = null`). */
export function TemplatePickerSheet({ open, onClose, hasExistingData, workspace, coachId, onSelect }: Props) {
  const { theme } = useTheme()
  const [items, setItems] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems([])
    setError(null)
    setApplyingId(null)
    if (!workspace || !coachId) {
      setError('No se pudo resolver el espacio de trabajo activo.')
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('workout_programs')
        .select('id, name, client_id, coach_id, org_id, updated_at, weeks_to_repeat, duration_type, workout_plans(id)')
        .eq('coach_id', coachId)
        .is('client_id', null)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      if (workspace.kind === 'enterprise') {
        if (!workspace.orgId) throw new Error('Workspace enterprise inválido.')
        query = query.eq('org_id', workspace.orgId)
      } else {
        query = query.is('org_id', null)
      }

      const { data, error: queryError } = await query
      if (queryError) throw queryError
      setItems(((data as TemplateRow[]) ?? []).filter((row) => templateMatchesActionWorkspace(row, workspace, coachId)))
    } catch {
      setError('No se pudieron cargar las plantillas. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }, [coachId, workspace])

  useEffect(() => {
    if (open) void load()
  }, [load, open])

  async function applyTemplate(templateId: string) {
    if (applyingId) return
    setApplyingId(templateId)
    setError(null)
    try {
      await onSelect(templateId)
      onClose()
    } catch {
      setError('No se pudo aplicar la plantilla. Intenta nuevamente.')
    } finally {
      setApplyingId(null)
    }
  }

  function chooseTemplate(template: TemplateRow) {
    if (!hasExistingData) {
      void applyTemplate(template.id)
      return
    }
    Alert.alert(
      '¿Reemplazar?',
      `Se reemplazará el contenido actual por la plantilla “${template.name}”.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí', onPress: () => void applyTemplate(template.id) },
      ],
    )
  }

  function durationLabel(template: TemplateRow): string {
    if (template.duration_type === 'calendar_days') return `${template.weeks_to_repeat * 7} días`
    if (template.duration_type === 'async') return 'Ciclo asíncrono'
    return `${template.weeks_to_repeat} semana${template.weeks_to_repeat === 1 ? '' : 's'}`
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Biblioteca de plantillas"
      accessibilityLabel="Biblioteca de plantillas de entrenamiento"
      snapPoints={['70%']}
      nativeModal
    >
      {loading ? <ActivityIndicator color={theme.primary} className="mt-space-6" /> : null}

      {!loading && error ? (
        <View className="items-center gap-space-3 py-space-6">
          <Text style={TYPE.caption} className="text-center text-muted">{error}</Text>
          <TouchableOpacity
            onPress={() => void load()}
            activeOpacity={0.8}
            className="rounded-control border border-default bg-surface-card px-space-5 py-space-3"
            accessibilityRole="button"
          >
            <Text style={TYPE.label} className="text-strong">Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <View className="items-center py-space-8">
          <FileText size={32} color={theme.mutedForeground} />
          <Text style={TYPE.eyebrow} className="mt-space-4 text-center text-muted">Sin plantillas guardadas</Text>
          <Text style={TYPE.caption} className="mt-space-2 text-center text-subtle">
            Guarda un programa sin cliente para crear una plantilla.
          </Text>
        </View>
      ) : null}

      {!loading && !error ? items.map((template) => {
        const applying = applyingId === template.id
        const planCount = template.workout_plans?.length ?? 0
        return (
          <TouchableOpacity
            key={template.id}
            onPress={() => chooseTemplate(template)}
            disabled={applyingId !== null}
            activeOpacity={0.8}
            className="min-h-hit-min flex-row items-center gap-space-4 rounded-control border border-default bg-surface-sunken px-space-5 py-space-4 disabled:opacity-50"
            accessibilityRole="button"
            accessibilityLabel={`Aplicar plantilla ${template.name}, ${durationLabel(template)}, ${planCount} día${planCount === 1 ? '' : 's'}`}
            accessibilityState={{ busy: applying, disabled: applyingId !== null }}
          >
            <FileText size={18} color={theme.primary} />
            <View className="flex-1">
              <Text style={TYPE.label} className="text-strong" numberOfLines={1}>{template.name}</Text>
              <Text style={TYPE.caption} className="mt-space-1 text-muted">
                {durationLabel(template)} · {planCount} día{planCount === 1 ? '' : 's'}
              </Text>
            </View>
            {applying ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <View className="flex-row items-center gap-space-1">
                <Text style={TYPE.eyebrow} className="text-muted">Aplicar</Text>
                <ChevronRight size={14} color={theme.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>
        )
      }) : null}
    </Sheet>
  )
}
