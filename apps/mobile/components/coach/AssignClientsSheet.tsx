import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Check } from 'lucide-react-native'
import { Sheet } from '../Sheet'
import { Switch } from '../Switch'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { TYPE } from '../../lib/typography'
import type { ClientActionWorkspace } from '../../lib/client-actions'
import { filterClientsForActionWorkspace } from '../../lib/client-action-workspace'
import { getSantiagoIsoYmdForUtcInstant } from '../../lib/date-utils'
import {
  ASSIGN_CLIENT_DAY_OPTIONS,
  clampAssignDurationWeeks,
  defaultAssignClientsOptions,
  isValidIsoYmd,
  normalizeAssignClientsOptions,
  type AssignClientsOptions,
} from '../../lib/assign-clients-options'

export type { AssignClientsOptions } from '../../lib/assign-clients-options'

interface ClientRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  coach_id: string | null
  team_id: string | null
  org_id: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  programName: string
  workspace: ClientActionWorkspace | null
  coachId: string | null
  onAssign: (
    clientIds: string[],
    workspace: ClientActionWorkspace,
    options: AssignClientsOptions,
  ) => void
  saving?: boolean
}

const PAGE_SIZE = 50

/** Multi-select de clientes activos del workspace explicito para asignar el programa. */
export function AssignClientsSheet({ open, onClose, programName, workspace, coachId, onAssign, saving }: Props) {
  const { theme } = useTheme()
  const initialOptions = defaultAssignClientsOptions(getSantiagoIsoYmdForUtcInstant(new Date().toISOString()))
  const [items, setItems] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [startDateFlexible, setStartDateFlexible] = useState(initialOptions.startDateFlexible)
  const [startDate, setStartDate] = useState(initialOptions.startDate)
  const [durationWeeks, setDurationWeeks] = useState(String(initialOptions.durationWeeks))
  const [selectedDays, setSelectedDays] = useState<number[]>(initialOptions.selectedDays)
  const requestId = useRef(0)

  const loadPage = useCallback(async (pageIndex: number, replace: boolean) => {
    const currentRequest = ++requestId.current
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    if (!workspace || !coachId) {
      setLoading(false)
      setLoadingMore(false)
      setError('No se pudo resolver el espacio de trabajo activo.')
      return
    }

    try {
      let query = supabase
        .from('clients')
        .select('id, full_name, avatar_url, coach_id, team_id, org_id')
        .eq('is_active', true)
        .order('full_name')
        .order('id')

      const normalizedSearch = search.trim()
      if (normalizedSearch) query = query.ilike('full_name', `%${normalizedSearch}%`)

      if (workspace.kind === 'standalone') {
        query = query.eq('coach_id', coachId).is('team_id', null).is('org_id', null)
      } else if (workspace.kind === 'enterprise') {
        if (!workspace.orgId) throw new Error('Workspace enterprise invalido.')
        query = query.eq('org_id', workspace.orgId).is('team_id', null)
      } else {
        if (!workspace.teamId) throw new Error('Workspace de equipo invalido.')
        query = query.eq('team_id', workspace.teamId).is('org_id', null)
      }

      const from = pageIndex * PAGE_SIZE
      const { data, error: queryError } = await query.range(from, from + PAGE_SIZE)
      if (queryError) throw queryError
      if (currentRequest !== requestId.current) return
      const rows = filterClientsForActionWorkspace((data as ClientRow[]) ?? [], workspace, coachId)
      const visibleRows = rows.slice(0, PAGE_SIZE)
      setItems((previous) => replace ? visibleRows : [...previous, ...visibleRows])
      setPage(pageIndex)
      setHasMore(rows.length > PAGE_SIZE)
    } catch {
      if (currentRequest !== requestId.current) return
      setError('No se pudieron cargar los clientes. Intenta nuevamente.')
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [coachId, search, workspace])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => void loadPage(0, true), 250)
    return () => clearTimeout(timer)
  }, [loadPage, open])

  useEffect(() => {
    if (!open) return
    const defaults = defaultAssignClientsOptions(getSantiagoIsoYmdForUtcInstant(new Date().toISOString()))
    setSelected(new Set())
    setSearch('')
    setStartDateFlexible(defaults.startDateFlexible)
    setStartDate(defaults.startDate)
    setDurationWeeks(String(defaults.durationWeeks))
    setSelectedDays(defaults.selectedDays)
  }, [open])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDay(day: number) {
    setSelectedDays((previous) => previous.includes(day)
      ? previous.filter((item) => item !== day)
      : [...previous, day])
  }

  const dateIsValid = startDateFlexible || isValidIsoYmd(startDate)
  const disabled = selected.size === 0 || saving || !workspace || !dateIsValid
  const footer = (
    <TouchableOpacity
      onPress={() => {
        if (disabled || !workspace) return
        const todaySantiagoIso = getSantiagoIsoYmdForUtcInstant(new Date().toISOString())
        onAssign([...selected], workspace, normalizeAssignClientsOptions({
          startDateFlexible,
          startDate,
          durationWeeks: clampAssignDurationWeeks(durationWeeks),
          selectedDays,
        }, todaySantiagoIso))
      }}
      disabled={disabled}
      activeOpacity={0.85}
      className="h-control-md items-center justify-center rounded-control bg-primary disabled:opacity-50"
      accessibilityRole="button"
      accessibilityLabel={selected.size === 0
        ? 'Selecciona clientes'
        : `Asignar a ${selected.size} cliente${selected.size === 1 ? '' : 's'}`}
      accessibilityState={{ disabled }}
    >
      {saving ? (
        <View className="flex-row items-center gap-space-3">
          <ActivityIndicator size="small" color={theme.primaryForeground} />
          <Text style={TYPE.label} className="text-primary-foreground">Asignando...</Text>
        </View>
      ) : (
        <Text style={TYPE.label} className="text-primary-foreground">
          {selected.size === 0
            ? 'Selecciona clientes'
            : `Asignar a ${selected.size} cliente${selected.size === 1 ? '' : 's'}`}
        </Text>
      )}
    </TouchableOpacity>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Asignar a clientes"
      description={programName}
      accessibilityLabel="Asignar programa a clientes"
      snapPoints={['88%']}
      nativeModal
      footer={footer}
    >
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar cliente..."
        placeholderTextColor={theme.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        className="h-control-md rounded-control border border-default bg-surface-sunken px-space-4 text-strong"
        style={TYPE.body}
        accessibilityLabel="Buscar cliente"
      />

      {loading ? <ActivityIndicator color={theme.primary} className="mt-space-6" /> : null}

      {!loading && error ? (
        <View className="items-center gap-space-3 py-space-6">
          <Text style={TYPE.caption} className="text-center text-muted">{error}</Text>
          <TouchableOpacity
            onPress={() => void loadPage(0, true)}
            activeOpacity={0.8}
            className="rounded-control border border-default bg-surface-card px-space-5 py-space-3"
            accessibilityRole="button"
          >
            <Text style={TYPE.label} className="text-strong">Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <Text style={TYPE.caption} className="py-space-6 text-center text-muted">
          {search.trim() ? 'Sin resultados.' : 'Sin clientes'}
        </Text>
      ) : null}

      {!loading && !error ? items.map((client) => {
        const selectedNow = selected.has(client.id)
        return (
          <TouchableOpacity
            key={client.id}
            onPress={() => toggle(client.id)}
            activeOpacity={0.8}
            className={`flex-row items-center gap-space-3 rounded-control border px-space-4 py-space-3 ${selectedNow ? 'border-primary bg-primary/10' : 'border-default bg-transparent'}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedNow }}
          >
            <View className="h-icon-xl w-icon-xl shrink-0 items-center justify-center overflow-hidden rounded-pill border border-default bg-surface-sunken">
              {client.avatar_url ? (
                <Image
                  source={{ uri: client.avatar_url }}
                  contentFit="cover"
                  className="h-full w-full"
                  accessible={false}
                />
              ) : (
                <Text style={TYPE.caption} className="text-muted">
                  {client.full_name?.charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <Text style={TYPE.label} className={`flex-1 ${selectedNow ? 'text-primary' : 'text-strong'}`} numberOfLines={1}>
              {client.full_name || 'Sin nombre'}
            </Text>
            {selectedNow ? <Check size={16} color={theme.primary} strokeWidth={2.5} /> : null}
          </TouchableOpacity>
        )
      }) : null}

      {!loading && !error && hasMore ? (
        <TouchableOpacity
          onPress={() => void loadPage(page + 1, false)}
          disabled={loadingMore}
          activeOpacity={0.8}
          className="min-h-hit-min items-center justify-center rounded-control border border-default bg-surface-card disabled:opacity-50"
          accessibilityRole="button"
        >
          {loadingMore ? <ActivityIndicator size="small" color={theme.primary} /> : (
            <Text style={TYPE.label} className="text-strong">Cargar más clientes</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <View className="gap-space-4 border-t border-subtle pt-space-5">
        <TouchableOpacity
          onPress={() => setStartDateFlexible((current) => !current)}
          activeOpacity={0.8}
          className="min-h-hit-min flex-row items-center justify-between gap-space-4"
          accessibilityRole="switch"
          accessibilityLabel="Inicio flexible (el cliente decide)"
          accessibilityState={{ checked: startDateFlexible }}
        >
          <Text style={TYPE.caption} className="flex-1 text-muted">
            Inicio flexible (el cliente decide)
          </Text>
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <Switch value={startDateFlexible} onValueChange={setStartDateFlexible} haptic={false} />
          </View>
        </TouchableOpacity>

        {!startDateFlexible ? (
          <View className="gap-space-2">
            <Text style={TYPE.eyebrow} className="text-muted">Fecha de inicio</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              className="h-control-md rounded-control border border-default bg-surface-card px-space-4 text-strong"
              style={TYPE.label}
              accessibilityLabel="Fecha de inicio, formato año mes día"
              accessibilityHint="Escribe la fecha con el formato YYYY-MM-DD"
            />
            {!dateIsValid ? (
              <Text style={TYPE.caption} className="text-danger-600">Usa el formato YYYY-MM-DD.</Text>
            ) : null}
          </View>
        ) : null}

        <View className="flex-row items-start gap-space-4">
          <View className="flex-1 gap-space-2">
            <Text style={TYPE.eyebrow} className="text-muted">Duración (semanas)</Text>
            <TextInput
              value={durationWeeks}
              onChangeText={(value) => setDurationWeeks(value.replace(/[^0-9]/g, ''))}
              onBlur={() => setDurationWeeks(String(clampAssignDurationWeeks(durationWeeks)))}
              keyboardType="number-pad"
              maxLength={2}
              className="h-control-md rounded-control border border-default bg-surface-card px-space-4 text-strong"
              style={TYPE.label}
              accessibilityLabel="Duración en semanas, entre 1 y 52"
            />
          </View>

          <View className="flex-1 gap-space-2">
            <Text style={TYPE.eyebrow} className="text-muted">Días a asignar</Text>
            <View className="flex-row flex-wrap gap-space-2">
              {ASSIGN_CLIENT_DAY_OPTIONS.map((day) => {
                const selectedDay = selectedDays.includes(day.id)
                return (
                  <TouchableOpacity
                    key={day.id}
                    onPress={() => toggleDay(day.id)}
                    activeOpacity={0.8}
                    className={`min-h-hit-min min-w-hit-min items-center justify-center rounded-md border px-space-2 ${selectedDay ? 'border-primary bg-primary/10' : 'border-default bg-surface-sunken'}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={day.label}
                    accessibilityState={{ checked: selectedDay }}
                  >
                    <Text style={TYPE.caption} className={selectedDay ? 'text-primary' : 'text-muted'}>
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>
      </View>
    </Sheet>
  )
}
