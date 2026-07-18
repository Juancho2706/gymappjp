import { useEffect, useState } from 'react'
import { FlatList, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Battery, Camera, CheckCircle2, Loader2, Scale, StickyNote } from 'lucide-react-native'
import { MotiView } from 'moti'
import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { signCheckinPhotos } from '../../../lib/api'
import { markCoachCheckInReviewed } from '../../../lib/coach-client-detail'
import { isMissingColumnError } from '../../../lib/db-compat'
import { formatRelativeDate } from '../../../lib/date-utils'
import { useTheme } from '../../../context/ThemeContext'
import { TYPE, FONT, textStyle } from '../../../lib/typography'
import { EmptyState, ScreenHeader, Card, HapticPressable } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { PhotoLightbox } from '../../../components/PhotoLightbox'

// Fixed DS accent (ember-500 is a constant hue; sport follows the brand via
// theme.primary). Mirrors the literal-neutral pattern in StatCard/Button.
const EMBER_500 = '#FF6A3D'

interface CheckIn {
  id: string
  client_id: string
  date: string
  weight: number | null
  energy_level: number | null
  front_photo_url: string | null
  side_photo_url: string | null
  back_photo_url: string | null
  notes: string | null
  reviewed_at: string | null
  clients: { full_name: string } | null
}

/** Energía 0-10 → 0-5 estrellas (mismo mapeo que la web ProfileCheckInSnapshot). */
function EnergyStars({ level }: { level: number | null }) {
  const stars = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
  return (
    <View
      style={{ flexDirection: 'row', gap: 2 }}
      accessibilityLabel={`Energía ${level ?? 0} de 10`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Text
          key={i}
          style={{ fontSize: 14, lineHeight: 16 }}
          className={i <= stars ? 'text-ember-500' : 'text-ink-200'}
        >
          ★
        </Text>
      ))}
    </View>
  )
}

function MetricRow({
  icon: Icon,
  iconColor,
  label,
  children,
  last = false,
}: {
  icon: LucideIcon
  iconColor: string
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <View
      className={last ? '' : 'border-b border-subtle'}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 }}
    >
      <Icon size={16} color={iconColor} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text className="text-muted" style={TYPE.eyebrow}>
          {label}
        </Text>
        {children}
      </View>
    </View>
  )
}

export default function CheckInsScreen() {
  const { theme } = useTheme()
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }

    const { data: clientRows } = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)

    const clientIds = (clientRows ?? []).map((c) => c.id)
    if (!clientIds.length) { setLoading(false); return }

    const baseCols =
      'id, client_id, date, weight, energy_level, front_photo_url, back_photo_url, notes, clients ( full_name )'
    const fetchRows = (extra: string) =>
      supabase
        .from('check_ins')
        .select(`${baseCols}${extra}`)
        .in('client_id', clientIds)
        .order('date', { ascending: false })
        .limit(40)
    // Tiers defensivos por columnas opcionales, de mayor a menor (una columna faltante
    // hace 400 al select entero → hay que degradar en orden):
    //  1) reviewed_at + side_photo_url  (side = 3ra foto, columna futura/opcional que hoy
    //     no existe en prod → normalmente cae al tier 2, igual que la web que la lee con `*`)
    //  2) reviewed_at                    (prod actual)
    //  3) base                           (DB legacy sin reviewed_at)
    let res = await fetchRows(', reviewed_at, side_photo_url')
    if (res.error && isMissingColumnError(res.error)) res = await fetchRows(', reviewed_at')
    if (res.error && isMissingColumnError(res.error)) res = await fetchRows('')
    // El select con relacion embebida (`clients ( full_name )`) via string dinamico hace que
    // supabase-js infiera un tipo de error de parseo → se normaliza a filas planas manualmente.
    const rawRows: Record<string, unknown>[] = (res.data as unknown as Record<string, unknown>[] | null) ?? []

    const rows: CheckIn[] = rawRows.map((row) => {
      const c = (row.clients as { full_name: string }[] | { full_name: string } | null) ?? null
      return {
        id: String(row.id),
        client_id: String(row.client_id),
        date: String(row.date),
        weight: (row.weight as number | null) ?? null,
        energy_level: (row.energy_level as number | null) ?? null,
        front_photo_url: (row.front_photo_url as string | null) ?? null,
        side_photo_url: (row.side_photo_url as string | null) ?? null,
        back_photo_url: (row.back_photo_url as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        reviewed_at: (row.reviewed_at as string | null) ?? null,
        clients: Array.isArray(c) ? c[0] ?? null : c,
      }
    })

    // Las columnas front/back_photo_url guardan el PATH del objeto (bucket privado). Se
    // resuelven a signed URLs server-side agrupando por alumno. Best-effort: si la firma
    // falla, la foto se omite (queda null) pero el resto del check-in se muestra igual.
    const refsByClient = new Map<string, Set<string>>()
    for (const r of rows) {
      const refs = [r.front_photo_url, r.side_photo_url, r.back_photo_url].filter(Boolean) as string[]
      if (!refs.length) continue
      const set = refsByClient.get(r.client_id) ?? new Set<string>()
      refs.forEach((ref) => set.add(ref))
      refsByClient.set(r.client_id, set)
    }
    const signedByRef = new Map<string, string>()
    await Promise.all(
      [...refsByClient.entries()].map(async ([clientId, refs]) => {
        try {
          const { urls } = await signCheckinPhotos(clientId, [...refs])
          for (const [ref, url] of Object.entries(urls)) if (url) signedByRef.set(ref, url)
        } catch { /* best-effort: sin URL firmada la foto se omite */ }
      })
    )
    const resolved = rows.map((r) => ({
      ...r,
      front_photo_url: r.front_photo_url ? signedByRef.get(r.front_photo_url) ?? null : null,
      side_photo_url: r.side_photo_url ? signedByRef.get(r.side_photo_url) ?? null : null,
      back_photo_url: r.back_photo_url ? signedByRef.get(r.back_photo_url) ?? null : null,
    }))

    setReviewedIds(new Set(resolved.filter((r) => r.reviewed_at).map((r) => r.id)))
    setCheckIns(resolved as CheckIn[])
    setLoading(false)
  }

  // Toggle optimista de "revisado" (paridad web). Mark reusa la acción de lib
  // (maneja columna ausente); unmark hace el update inverso inline. Revierte en error.
  function handleToggleReviewed(item: CheckIn) {
    const isReviewed = reviewedIds.has(item.id)
    setPendingId(item.id)
    setReviewedIds((prev) => {
      const next = new Set(prev)
      if (isReviewed) next.delete(item.id)
      else next.add(item.id)
      return next
    })
    ;(async () => {
      try {
        if (isReviewed) {
          const { error } = await supabase
            .from('check_ins')
            .update({ reviewed_at: null, reviewed_by: null })
            .eq('id', item.id)
            .eq('client_id', item.client_id)
          if (error) throw error
        } else {
          const r = await markCoachCheckInReviewed(item.client_id, item.id)
          if (!r.ok) throw new Error(r.error)
        }
      } catch {
        setReviewedIds((prev) => {
          const next = new Set(prev)
          if (isReviewed) next.add(item.id)
          else next.delete(item.id)
          return next
        })
      } finally {
        setPendingId((cur) => (cur === item.id ? null : cur))
      }
    })()
  }

  function renderCheckIn({ item, index }: { item: CheckIn; index: number }) {
    const photos = [item.front_photo_url, item.side_photo_url, item.back_photo_url].filter(Boolean) as string[]
    const reviewed = reviewedIds.has(item.id)
    const pending = pendingId === item.id

    return (
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 350, delay: Math.min(index * 50, 400) }}
      >
        <Card padding="md" style={{ gap: 12 }}>
          {/* Cabecera: alumno + fecha relativa */}
          <View>
            <Text
              className="text-strong"
              style={textStyle('md', FONT.uiBold, { ls: 'tight' })}
              numberOfLines={1}
            >
              {item.clients?.full_name ?? '-'}
            </Text>
            <Text className="text-muted" style={[TYPE.eyebrow, { marginTop: 2 }]}>
              {formatRelativeDate(item.date)}
            </Text>
          </View>

          {/* Fotos (front/back) — visor DS con carrusel + pinch-zoom */}
          {photos.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {photos.map((url, i) => (
                <HapticPressable
                  key={i}
                  testID="checkin-photo-thumb"
                  accessibilityRole="imagebutton"
                  onPress={() => setViewer({ photos, index: i })}
                >
                  <View
                    className="rounded-control border border-subtle bg-surface-sunken overflow-hidden"
                    style={{ width: 64, height: 80 }}
                  >
                    <Image
                      source={{ uri: url }}
                      style={{ width: 64, height: 80 }}
                      contentFit="cover"
                      transition={150}
                    />
                  </View>
                </HapticPressable>
              ))}
            </View>
          )}

          {/* Métricas: peso, energía (estrellas), notas */}
          <View>
            <MetricRow icon={Scale} iconColor={theme.primary} label="Peso">
              <Text className="text-strong" style={textStyle('sm', FONT.monoMedium)}>
                {item.weight != null ? `${item.weight} kg` : '—'}
              </Text>
            </MetricRow>
            <MetricRow icon={Battery} iconColor={theme.primary} label="Energía">
              {item.energy_level != null ? (
                <EnergyStars level={item.energy_level} />
              ) : (
                <Text className="text-muted" style={TYPE.body}>—</Text>
              )}
            </MetricRow>
            <MetricRow icon={StickyNote} iconColor={theme.primary} label="Notas" last>
              {item.notes?.trim() ? (
                <Text className="text-body" style={TYPE.body} numberOfLines={3}>
                  {item.notes}
                </Text>
              ) : (
                <Text className="text-muted" style={TYPE.body}>Sin notas</Text>
              )}
            </MetricRow>
          </View>

          {/* Toggle revisado (optimista) — paridad con la web */}
          <HapticPressable
            testID="toggle-reviewed"
            accessibilityRole="button"
            accessibilityState={{ selected: reviewed, disabled: pending }}
            accessibilityLabel={
              reviewed ? 'Check-in revisado. Tocar para des-marcar.' : 'Marcar check-in como revisado.'
            }
            disabled={pending}
            onPress={() => handleToggleReviewed(item)}
          >
            <View
              className={
                reviewed
                  ? 'flex-row items-center justify-center rounded-control'
                  : 'flex-row items-center justify-center rounded-control border-[1.5px] border-default'
              }
              style={{ height: 40, gap: 8, opacity: pending ? 0.6 : 1 }}
            >
              {pending ? (
                <MotiView
                  from={{ rotate: '0deg' }}
                  animate={{ rotate: '360deg' }}
                  transition={{ type: 'timing', duration: 700, loop: true, repeatReverse: false }}
                >
                  <Loader2 size={16} color={reviewed ? theme.success : theme.mutedForeground} />
                </MotiView>
              ) : (
                <CheckCircle2 size={16} color={reviewed ? theme.success : theme.mutedForeground} />
              )}
              <Text
                className={reviewed ? 'text-success-600' : 'text-strong'}
                style={textStyle('xs', FONT.uiBold, { ls: 'wide' })}
              >
                {reviewed ? 'Revisado' : 'Marcar como revisado'}
              </Text>
            </View>
          </HapticPressable>
        </Card>
      </MotiView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={{ flex: 1 }} className="bg-surface-app">
      <AppBackground />
      <ScreenHeader
        title="Check-ins"
        subtitle={!loading ? `${checkIns.length} ${checkIns.length === 1 ? 'reciente' : 'recientes'}` : undefined}
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando check-ins..." />
      ) : checkIns.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sin check-ins aun"
          subtitle="Cuando tus alumnos registren su check-in semanal apareceran aca."
        />
      ) : (
        <FlatList
          data={checkIns}
          keyExtractor={(c) => c.id}
          renderItem={renderCheckIn}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <PhotoLightbox
        photos={viewer?.photos ?? []}
        index={viewer?.index ?? 0}
        visible={!!viewer}
        onClose={() => setViewer(null)}
      />
    </SafeAreaView>
  )
}
