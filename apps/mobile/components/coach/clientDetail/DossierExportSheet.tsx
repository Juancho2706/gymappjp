import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { formatMonthLabel, monthRangeFrom } from '@eva/client-dossier'
import { Sheet } from '../../Sheet'
import { SegmentedTabs } from '../../SegmentedTabs'
import { Switch } from '../../Switch'
import { useTheme } from '../../../context/ThemeContext'
import { TYPE } from '../../../lib/typography'
import { fetchClientReportBounds, MAX_EXPORT_MONTHS } from '../../../lib/client-month-reports'

/**
 * «Exportar dossier» — la hoja que abre el botón de descarga del hero de la ficha (R21).
 *
 * Dos modos: «Estado actual» (el dossier de hoy de siempre, preseleccionado ⇒ el caso frecuente
 * sigue siendo dos toques) y «Por meses» (informes mensuales, SIEMPRE un solo PDF: no hay
 * interruptor junto/separado). Los meses seleccionables salen de `get_client_report_bounds`, que
 * se pide al ABRIR la hoja — no en cada render de la ficha.
 *
 * La hoja es dueña de la selección y del estado de generación; la pantalla pone las dos acciones
 * (`onExportCurrent` / `onExportMonths`). Un error del handler se muestra INLINE acá, no en un
 * `Alert` que tape la hoja.
 */

type Mode = 'today' | 'months'

interface Props {
  open: boolean
  onClose: () => void
  clientId: string
  clientName: string
  /**
   * Dossier «de hoy» (el `handleExportPdf` de la ficha). `true` = se generó y compartió ⇒ la hoja
   * se cierra; `false` = no se hizo nada (p. ej. ya había una exportación en curso) ⇒ sigue
   * abierta. Un error se muestra inline acá.
   */
  onExportCurrent: () => Promise<boolean>
  /** Informes mensuales, en orden cronológico ascendente. Mismo contrato de retorno. */
  onExportMonths: (monthKeys: string[], opts: { includePhotos: boolean }) => Promise<boolean>
}

export function DossierExportSheet({ open, onClose, clientId, clientName, onExportCurrent, onExportMonths }: Props) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<Mode>('today')
  const [months, setMonths] = useState<string[]>([])
  const [currentMonthKey, setCurrentMonthKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [includePhotos, setIncludePhotos] = useState(true)
  /** `clientId` cuyos meses ya están en estado: el caché vive lo que vive el componente. */
  const [boundsLoadedFor, setBoundsLoadedFor] = useState<string | null>(null)
  const [loadingBounds, setLoadingBounds] = useState(false)
  const [boundsError, setBoundsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const loadBounds = useCallback(async () => {
    setLoadingBounds(true)
    setBoundsError(null)
    try {
      const bounds = await fetchClientReportBounds(clientId)
      const keys = monthRangeFrom(bounds.firstMonthKey, bounds.currentMonthKey)
      setMonths(keys)
      setCurrentMonthKey(bounds.currentMonthKey)
      // El mes en curso viene preseleccionado: «Por meses» → «Generar y compartir» son dos toques.
      setSelected(bounds.currentMonthKey ? [bounds.currentMonthKey] : [])
      setBoundsLoadedFor(clientId)
    } catch (e) {
      setMonths([])
      setSelected([])
      setBoundsLoadedFor(null)
      setBoundsError(e instanceof Error ? e.message : 'No se pudieron cargar los meses disponibles.')
    } finally {
      setLoadingBounds(false)
    }
  }, [clientId])

  // Cambió el alumno ⇒ el caché de meses no sirve.
  useEffect(() => {
    setBoundsLoadedFor(null)
    setMonths([])
    setCurrentMonthKey(null)
    setSelected([])
    setBoundsError(null)
  }, [clientId])

  // Abrir resetea la UI pero NO el caché de meses: la exportación frecuente es «Estado actual» y
  // no tiene por qué pagar un RPC en cada apertura. Sí se limpia el error, para que volver a
  // entrar reintente una vez (además del botón «Reintentar»).
  useEffect(() => {
    if (!open) return
    setMode('today')
    setIncludePhotos(true)
    setError(null)
    setBoundsError(null)
  }, [open])

  // Los meses se piden la PRIMERA vez que se entra a «Por meses» (R19: al abrir el diálogo de
  // meses, no antes) y quedan cacheados mientras la hoja viva para este alumno.
  useEffect(() => {
    if (!open || mode !== 'months') return
    if (boundsLoadedFor === clientId || loadingBounds || boundsError) return
    void loadBounds()
  }, [open, mode, boundsLoadedFor, clientId, loadingBounds, boundsError, loadBounds])

  // Chips del más reciente al más viejo: el mes que el coach quiere casi siempre es el de arriba.
  const chips = useMemo(() => [...months].reverse(), [months])
  const selectedCount = selected.length

  function toggleMonth(key: string) {
    setError(null)
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= MAX_EXPORT_MONTHS) {
        setError(`Podés exportar hasta ${MAX_EXPORT_MONTHS} meses por vez.`)
        return prev
      }
      return [...prev, key]
    })
  }

  /** «Últimos N»: los N meses más recientes disponibles (el último es el mes en curso). */
  function selectLast(n: number) {
    setError(null)
    setSelected(months.slice(-n))
  }

  async function handleGenerate() {
    if (generating) return
    setError(null)
    setGenerating(true)
    try {
      // Solo se cierra con un éxito REAL: `false` = no se generó nada (la hoja queda abierta).
      const exported = mode === 'today'
        ? await onExportCurrent()
        // Orden cronológico ascendente: el informe «1 de N» es el mes más viejo.
        : await onExportMonths([...selected].sort(), { includePhotos })
      if (exported) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el dossier. Intenta de nuevo.')
    } finally {
      setGenerating(false)
    }
  }

  const disabled = generating || (mode === 'months' && (selectedCount === 0 || loadingBounds || !!boundsError))

  const footer = (
    <TouchableOpacity
      onPress={handleGenerate}
      disabled={disabled}
      activeOpacity={0.85}
      className="h-control-md items-center justify-center rounded-control bg-primary disabled:opacity-50"
      accessibilityRole="button"
      accessibilityLabel="Generar y compartir"
      accessibilityState={{ disabled, busy: generating }}
      testID="dossier-export-cta"
    >
      {generating ? (
        <View className="flex-row items-center gap-space-3">
          <ActivityIndicator size="small" color={theme.primaryForeground} />
          <Text style={TYPE.label} className="text-primary-foreground">Generando…</Text>
        </View>
      ) : (
        <Text style={TYPE.label} className="text-primary-foreground">Generar y compartir</Text>
      )}
    </TouchableOpacity>
  )

  return (
    <Sheet
      open={open}
      onClose={() => { if (!generating) onClose() }}
      title="Exportar dossier"
      description={clientName}
      accessibilityLabel="Exportar dossier del alumno"
      snapPoints={['70%']}
      nativeModal
      footer={footer}
    >
      <SegmentedTabs
        size="sm"
        value={mode}
        onChange={(next) => { setError(null); setMode(next) }}
        items={[
          { value: 'today', label: 'Estado actual' },
          { value: 'months', label: 'Por meses' },
        ]}
      />

      {mode === 'today' ? (
        <Text style={TYPE.caption} className="text-muted">
          Un PDF con la foto de hoy: indicadores, programa, récords, volumen, nutrición y check-ins.
        </Text>
      ) : (
        <View className="gap-space-4">
          {loadingBounds ? <ActivityIndicator color={theme.primary} className="mt-space-4" /> : null}

          {!loadingBounds && boundsError ? (
            <View className="items-center gap-space-3 py-space-4">
              <Text style={TYPE.caption} className="text-center text-muted">{boundsError}</Text>
              <TouchableOpacity
                onPress={() => void loadBounds()}
                activeOpacity={0.8}
                className="rounded-control border border-default bg-surface-card px-space-5 py-space-3"
                accessibilityRole="button"
              >
                <Text style={TYPE.label} className="text-strong">Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!loadingBounds && !boundsError ? (
            <>
              <Text style={TYPE.eyebrow} className="text-muted">Meses</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="flex-row gap-space-2 pr-space-4"
              >
                {chips.map((key) => {
                  const on = selected.includes(key)
                  const label = key === currentMonthKey
                    ? `${formatMonthLabel(key)} · hasta hoy`
                    : formatMonthLabel(key)
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => toggleMonth(key)}
                      disabled={generating}
                      activeOpacity={0.8}
                      className={`min-h-hit-min items-center justify-center rounded-control border px-space-4 ${on ? 'border-primary bg-primary/10' : 'border-default bg-surface-sunken'}`}
                      accessibilityRole="checkbox"
                      accessibilityLabel={label}
                      accessibilityState={{ checked: on, disabled: generating }}
                    >
                      <Text style={TYPE.caption} className={on ? 'text-primary' : 'text-muted'}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <View className="flex-row items-center gap-space-2">
                {[3, 6].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => selectLast(n)}
                    disabled={generating || months.length === 0}
                    activeOpacity={0.8}
                    className="min-h-hit-min items-center justify-center rounded-control border border-default bg-surface-card px-space-4 disabled:opacity-50"
                    accessibilityRole="button"
                    accessibilityLabel={`Últimos ${n} meses`}
                  >
                    <Text style={TYPE.caption} className="text-strong">Últimos {n}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={TYPE.caption} className="flex-1 text-right text-muted">
                  {selectedCount === 0
                    ? 'Sin meses'
                    : `${selectedCount} ${selectedCount === 1 ? 'mes' : 'meses'} · 1 PDF`}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setIncludePhotos((v) => !v)}
                disabled={generating}
                activeOpacity={0.8}
                className="min-h-hit-min flex-row items-center justify-between gap-space-4 border-t border-subtle pt-space-4"
                accessibilityRole="switch"
                accessibilityLabel="Incluir fotos de check-in"
                accessibilityState={{ checked: includePhotos, disabled: generating }}
              >
                <View className="flex-1">
                  <Text style={TYPE.label} className="text-strong">Incluir fotos de check-in</Text>
                  <Text style={TYPE.caption} className="text-muted">Hasta 3 por mes; el PDF pesa más.</Text>
                </View>
                <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
                  <Switch value={includePhotos} onValueChange={setIncludePhotos} haptic={false} disabled={generating} />
                </View>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}

      {error ? (
        <Text style={TYPE.caption} className="text-danger-600">{error}</Text>
      ) : null}
    </Sheet>
  )
}
