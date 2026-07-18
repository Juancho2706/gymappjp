import { useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { ClipboardList, FileDown, MessageCircle, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { TYPE } from '../../../lib/typography'
import { Sheet } from '../../Sheet'
import { toast } from '../../Toast'
import {
  buildDayDetailText,
  buildDayShortText,
  exportNutritionDayPdf,
  resolveNutritionExportBrand,
  type ExportGoals,
  type ExportMeal,
} from '../../../lib/nutrition-day-export'

/**
 * ExportDayActions (E4-16) — sheet de export del día de nutrición del alumno.
 * Espejo del grid de 3 botones de la web (`NutritionShell`: Copiar detalle /
 * Resumen WhatsApp / Descargar PDF):
 *   • Copiar detalle → clipboard (macros por comida + subtotales), toast.
 *   • Resumen WhatsApp → Share nativo (texto corto con macros por comida).
 *   • Descargar PDF → PDF branded (expo-print) con logo/color del coach.
 *
 * Autocontenido: resuelve la marca del PDF desde `useTheme().branding` (free tier
 * / sin marca ⇒ EVA, igual que la web). El shell solo lo monta y le pasa los
 * datos del día ya derivados (mismo `normalizedMeals` + `goals` de las tarjetas).
 */

interface ActionRowProps {
  icon: LucideIcon
  title: string
  subtitle: string
  onPress: () => void
  testID: string
  busy?: boolean
  disabled?: boolean
}

function ActionRow({ icon: Icon, title, subtitle, onPress, testID, busy, disabled }: ActionRowProps) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.75}
      className="flex-row items-center gap-3 rounded-2xl border border-subtle bg-surface-sunken px-4 py-3.5"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-surface-card border border-subtle">
        {busy ? <ActivityIndicator size="small" color={theme.primary} /> : <Icon size={18} color={theme.foreground} strokeWidth={2} />}
      </View>
      <View className="flex-1">
        <Text style={TYPE.label} className="text-strong">
          {title}
        </Text>
        <Text style={TYPE.caption} className="text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export function ExportDayActions({
  open,
  onClose,
  planName,
  instructions,
  date,
  dateLabel,
  meals,
  goals,
}: {
  open: boolean
  onClose: () => void
  planName: string
  instructions?: string | null
  /** ISO `YYYY-MM-DD` (para el PDF). */
  date: string
  /** Etiqueta legible ("Hoy" / ISO) para el texto. */
  dateLabel?: string
  meals: ExportMeal[]
  goals: ExportGoals
}) {
  const { branding } = useTheme()
  const [pdfBusy, setPdfBusy] = useState(false)

  const params = { planName, instructions, date, dateLabel, meals, goals }
  const hasMeals = meals.length > 0

  async function handleCopyDetail() {
    try {
      await Clipboard.setStringAsync(buildDayDetailText(params))
      toast.success('Detalle del día copiado', { description: 'Listo para pegar en WhatsApp' })
      onClose()
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  async function handleShareWhatsapp() {
    try {
      await Share.share({ message: buildDayShortText(params) })
      onClose()
    } catch {
      /* usuario canceló el share — no-op */
    }
  }

  async function handleDownloadPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const brand = resolveNutritionExportBrand({
        displayName: branding?.displayName,
        primaryColor: branding?.primaryColor,
        logoUrl: branding?.logoUrl ?? null,
        subscriptionTier: branding?.subscriptionTier ?? null,
      })
      await exportNutritionDayPdf(params, brand)
      onClose()
    } catch {
      toast.error('No se pudo generar el PDF', { description: 'Intenta de nuevo' })
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Compartir el día" snapPoints={['42%']} scrollable={false}>
      <View className="gap-3 pt-1">
        <ActionRow
          testID="export-copy-detail"
          icon={ClipboardList}
          title="Copiar detalle"
          subtitle="Alimentos y macros por comida"
          onPress={handleCopyDetail}
          disabled={!hasMeals}
        />
        <ActionRow
          testID="export-share-whatsapp"
          icon={MessageCircle}
          title="Resumen para WhatsApp"
          subtitle="Resumen corto con macros"
          onPress={handleShareWhatsapp}
          disabled={!hasMeals}
        />
        <ActionRow
          testID="export-download-pdf"
          icon={FileDown}
          title="Descargar PDF"
          subtitle="Pauta del día con tu marca"
          onPress={handleDownloadPdf}
          busy={pdfBusy}
          disabled={!hasMeals}
        />
      </View>
    </Sheet>
  )
}
