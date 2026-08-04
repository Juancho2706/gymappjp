import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Plus, RotateCcw, Search, X } from 'lucide-react-native'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { formatPortionSentence } from '@eva/nutrition-v2'
import { NutritionHeader, NutritionStatePanel } from '../../../components/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { nutritionV2CoachScope } from '../../../lib/nutrition-v2-scope'
import { fetchNutritionV2ExchangeGroups } from '../../../lib/nutrition-v2-exchange-groups.api'
import {
  excludeExchangeListEntry,
  fetchExchangeList,
  fetchExchangeListCandidates,
  restoreExchangeListEntry,
  saveExchangeListEntry,
  type ExchangeListCandidate,
  type ExchangeListRow,
} from '../../../lib/nutrition-v2-exchange-lists.api'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'

const COPY = PORTIONS_COPY.exchangeList

/**
 * Porciones del coach en RN (F4, paridad de F2) — "¿Qué cuenta como 1 porción?".
 *
 * Misma decisión de fondo que la web: el buscador barre TODO el catálogo visible (no solo los
 * alimentos propios) y los gramos vienen SUGERIDOS por el servidor desde los macros del alimento
 * y los de referencia del grupo. La sugerencia se muestra como tal y es editable: el número del
 * coach manda.
 *
 * Toda escritura pasa por `/api/mobile/nutrition/exchanges/group-foods` (lección NUT-005): cero
 * escrituras Supabase directas nuevas desde el teléfono.
 */
export default function CoachPortionsScreen() {
  const { theme } = useTheme()
  const { ready: workspaceReady, kind, teamId, orgId } = useWorkspace()

  const scope = useMemo(
    () => (workspaceReady ? nutritionV2CoachScope({ kind, teamId, orgId }) : null),
    [workspaceReady, kind, teamId, orgId]
  )

  const [groups, setGroups] = useState<ExchangeGroup[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [rows, setRows] = useState<ExchangeListRow[]>([])
  const [search, setSearch] = useState('')
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const group = useMemo(() => groups.find((entry) => entry.id === groupId) ?? null, [groups, groupId])

  useEffect(() => {
    if (!scope) return
    let alive = true
    setLoadingGroups(true)
    fetchNutritionV2ExchangeGroups(scope)
      .then((list) => {
        if (!alive) return
        setGroups(list)
        setGroupId((current) => current ?? list[0]?.id ?? null)
      })
      .catch(() => {
        if (alive) setError(PORTIONS_COPY.builder.pickerError)
      })
      .finally(() => {
        if (alive) setLoadingGroups(false)
      })
    return () => {
      alive = false
    }
  }, [scope])

  const loadRows = useCallback(
    async (id: string, term: string) => {
      setLoadingRows(true)
      try {
        setRows(await fetchExchangeList({ groupId: id, search: term || null }))
        setError(null)
      } catch {
        setRows([])
        setError(COPY.loadFailed)
      } finally {
        setLoadingRows(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!groupId) return
    const timer = setTimeout(() => void loadRows(groupId, search.trim()), 300)
    return () => clearTimeout(timer)
  }, [groupId, search, loadRows])

  async function onExclude(row: ExchangeListRow) {
    if (!groupId) return
    const result = await excludeExchangeListEntry({ exchangeGroupId: groupId, foodId: row.foodId })
    if (!result.ok) {
      setError(result.error)
      return
    }
    void loadRows(groupId, search.trim())
  }

  async function onRestore(row: ExchangeListRow) {
    if (!groupId) return
    const result = await restoreExchangeListEntry({ exchangeGroupId: groupId, foodId: row.foodId })
    if (!result.ok) {
      setError(result.error)
      return
    }
    void loadRows(groupId, search.trim())
  }

  if (!workspaceReady || loadingGroups) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
        <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  // Enterprise no tiene scope de coach V2 (fail-closed en `nutritionV2CoachScope`).
  if (!scope) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
        <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />
        <NutritionStatePanel
          title="No disponible en este espacio"
          description="Cambia a tu espacio de coach para administrar las porciones."
          icon="permission"
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <NutritionHeader title={COPY.manageEntry} description={COPY.manageEntryHint} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
      >
        {groups.map((entry) => {
          const active = entry.id === groupId
          return (
            <Pressable
              key={entry.id}
              onPress={() => setGroupId(entry.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: 'center',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
                backgroundColor: active ? `${theme.primary}1A` : theme.card,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                {entry.code} · {entry.name}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            borderRadius: 12,
            paddingHorizontal: 12,
            minHeight: 44,
          }}
        >
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={COPY.searchPlaceholder}
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel={COPY.searchAria}
            style={{ flex: 1, color: theme.text, paddingVertical: 10 }}
          />
          {loadingRows ? <ActivityIndicator size="small" color={theme.primary} /> : null}
        </View>

        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          disabled={!groupId}
          style={{
            minHeight: 44,
            borderRadius: 12,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            opacity: groupId ? 1 : 0.5,
          }}
        >
          <Plus size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800' }}>{COPY.addFood}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {rows.map((row) => (
          <View
            key={row.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                {row.foodName}
              </Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                {formatPortionSentence({
                  foodName: row.foodName,
                  portionGrams: row.portionGrams,
                  portionLabel: row.portionLabel,
                })}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                color: row.isOwn ? theme.primary : theme.mutedForeground,
              }}
            >
              {row.isOwn ? COPY.badgeOwn : COPY.badgeCatalog}
            </Text>
            <Pressable
              onPress={() => void (row.isOwn ? onRestore(row) : onExclude(row))}
              accessibilityRole="button"
              accessibilityLabel={row.isOwn ? COPY.restoreAria(row.foodName) : COPY.excludeAria(row.foodName)}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              {row.isOwn ? (
                <RotateCcw size={16} color={theme.mutedForeground} />
              ) : (
                <X size={16} color={theme.mutedForeground} />
              )}
            </Pressable>
          </View>
        ))}

        {rows.length === 0 && !loadingRows ? (
          <NutritionStatePanel
            title={search.trim() ? COPY.emptySearch : COPY.empty}
            description={search.trim() ? 'Prueba con otro nombre.' : PORTIONS_COPY.builder.groupFoodsEmptyHint}
            icon="empty"
          />
        ) : null}

        {error ? (
          <Text style={{ color: theme.destructive, fontWeight: '700', textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {adding && groupId ? (
        <AddEntrySheet
          groupId={groupId}
          groupName={group?.name ?? ''}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void loadRows(groupId, search.trim())
          }}
        />
      ) : null}
    </SafeAreaView>
  )
}

/**
 * Alta de una equivalencia. La sugerencia de gramos la trae el servidor ya resuelta: el teléfono
 * no lleva una copia de la fórmula, así que jamás puede sugerir algo distinto del navegador.
 */
function AddEntrySheet({
  groupId,
  groupName,
  onClose,
  onSaved,
}: {
  groupId: string
  groupName: string
  onClose: () => void
  onSaved: () => void
}) {
  const { theme } = useTheme()
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<ExchangeListCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ExchangeListCandidate | null>(null)
  const [grams, setGrams] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selected) return
    setLoading(true)
    const timer = setTimeout(() => {
      fetchExchangeListCandidates({ groupId, search: search.trim() || null })
        .then(setCandidates)
        .catch(() => setError(COPY.loadFailed))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [groupId, search, selected])

  const parsedGrams = useMemo(() => {
    const raw = grams.trim().replace(',', '.')
    if (raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
  }, [grams])

  async function save() {
    if (!selected || parsedGrams == null) {
      setError(PORTIONS_COPY.foodEquivalence.gramsRequired)
      return
    }
    setSaving(true)
    const result = await saveExchangeListEntry({
      exchangeGroupId: groupId,
      foodId: selected.id,
      portionGrams: parsedGrams,
      portionLabel: label.trim() || null,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSaved()
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
      }}
    >
      <View
        style={{
          backgroundColor: theme.background,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 16,
          gap: 12,
          maxHeight: '85%',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, flex: 1 }}>
            {COPY.sectionTitle}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color={theme.mutedForeground} />
          </Pressable>
        </View>
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {groupName ? `${COPY.sectionHint} · ${groupName}` : COPY.sectionHint}
        </Text>

        {selected ? (
          <View style={{ gap: 10 }}>
            <Pressable onPress={() => setSelected(null)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>← {selected.name}</Text>
            </Pressable>

            <Text style={{ color: theme.mutedForeground, fontSize: 11, fontWeight: '800' }}>
              {COPY.gramsLabel}
            </Text>
            <TextInput
              value={grams}
              onChangeText={setGrams}
              keyboardType="decimal-pad"
              placeholder={PORTIONS_COPY.foodEquivalence.gramsPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                borderRadius: 12,
                paddingHorizontal: 12,
                minHeight: 44,
                color: theme.text,
              }}
            />
            {selected.suggestedGrams != null && String(selected.suggestedGrams) !== grams.trim() ? (
              <Pressable
                onPress={() => setGrams(String(selected.suggestedGrams))}
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>
                  {COPY.suggestedApply} · {selected.suggestedGrams} g
                </Text>
              </Pressable>
            ) : null}

            <Text style={{ color: theme.mutedForeground, fontSize: 11, fontWeight: '800' }}>
              {COPY.labelLabel}
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              maxLength={40}
              placeholder={COPY.labelPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                borderRadius: 12,
                paddingHorizontal: 12,
                minHeight: 44,
                color: theme.text,
              }}
            />

            <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: theme.mutedForeground, fontSize: 10, fontWeight: '800' }}>
                {COPY.previewTitle}
              </Text>
              <Text style={{ color: theme.text, fontWeight: '700', marginTop: 4 }}>
                {formatPortionSentence({
                  foodName: selected.name,
                  portionGrams: parsedGrams,
                  portionLabel: label,
                })}
              </Text>
            </View>

            <Pressable
              onPress={() => void save()}
              disabled={saving}
              accessibilityRole="button"
              style={{
                minHeight: 48,
                borderRadius: 12,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>{saving ? COPY.saving : COPY.save}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                borderRadius: 12,
                paddingHorizontal: 12,
                minHeight: 44,
              }}
            >
              <Search size={16} color={theme.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={COPY.searchPlaceholder}
                placeholderTextColor={theme.mutedForeground}
                accessibilityLabel={COPY.searchAria}
                style={{ flex: 1, color: theme.text, paddingVertical: 10 }}
              />
              {loading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
            </View>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 6 }}>
              {candidates.map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => {
                    setSelected(candidate)
                    setGrams(candidate.suggestedGrams != null ? String(candidate.suggestedGrams) : '')
                    setError(null)
                  }}
                  accessibilityRole="button"
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>
                    {candidate.name}
                    {candidate.alreadyInList ? ' ✓' : ''}
                  </Text>
                  {candidate.suggestedGrams != null ? (
                    <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>
                      {COPY.suggested(String(candidate.suggestedGrams))}
                    </Text>
                  ) : (
                    <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>{COPY.suggestedNone}</Text>
                  )}
                </Pressable>
              ))}
              {candidates.length === 0 && !loading ? (
                <Text style={{ color: theme.mutedForeground, textAlign: 'center', paddingVertical: 16 }}>
                  {COPY.emptySearch}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        )}

        {error ? (
          <Text style={{ color: theme.destructive, fontWeight: '700', textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
