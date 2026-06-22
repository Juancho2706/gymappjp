import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, ChevronDown, Plus, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { searchFoods, type FoodRow } from '../../../lib/nutrition-builder'
import {
  getClientFoodRestrictions,
  setClientFoodRestriction,
  type ClientFoodRestriction,
  type ClientFoodRestrictionType,
} from '../../../lib/coach-client-extras'

/**
 * Restricciones alimentarias del alumno — paridad con ClientFoodRestrictionsCard (web).
 * El coach marca alimentos como Alergia / Intolerancia / No le gusta; el builder los respeta.
 * Escribe SOLO client_food_preferences via la sesión coach (RLS coach-scoped). Optimista.
 */

const TYPE_META: Record<ClientFoodRestrictionType, { label: string; color: string }> = {
  allergy: { label: 'Alergia', color: '#F43F5E' },
  intolerance: { label: 'Intolerancia', color: '#F59E0B' },
  dislike: { label: 'No le gusta', color: '#94A3B8' },
}
const TYPE_ORDER: ClientFoodRestrictionType[] = ['allergy', 'intolerance', 'dislike']

export function ClientFoodRestrictionsCard({ clientId }: { clientId: string }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ClientFoodRestriction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [addType, setAddType] = useState<ClientFoodRestrictionType>('allergy')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [searching, setSearching] = useState(false)
  const lastTerm = useRef('')

  useEffect(() => {
    let cancelled = false
    getClientFoodRestrictions(clientId).then((rows) => {
      if (!cancelled) { setItems(rows); setLoaded(true) }
    })
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    if (!open) return
    const q = term.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    lastTerm.current = q
    const t = setTimeout(async () => {
      try {
        const foods = await searchFoods(q, { limit: 20 })
        if (!cancelled && lastTerm.current === q) setResults(foods)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [term, open])

  const restrictedIds = new Set(items.map((i) => i.food_id))

  const add = useCallback(
    (food: FoodRow, type: ClientFoodRestrictionType) => {
      const prev = items
      setItems((cur) => [...cur.filter((i) => i.food_id !== food.id), { food_id: food.id, name: food.name, preference_type: type }])
      setTerm('')
      setResults([])
      setBusy(true)
      setError(null)
      setClientFoodRestriction({ clientId, foodId: food.id, preferenceType: type }).then((res) => {
        setBusy(false)
        if (!res.ok) { setItems(prev); setError(res.error ?? 'No se pudo guardar.') }
      })
    },
    [clientId, items]
  )

  const remove = useCallback(
    (foodId: string) => {
      const prev = items
      setItems((cur) => cur.filter((i) => i.food_id !== foodId))
      setBusy(true)
      setClientFoodRestriction({ clientId, foodId, preferenceType: null }).then((res) => {
        setBusy(false)
        if (!res.ok) { setItems(prev); setError(res.error ?? 'No se pudo quitar.') }
      })
    },
    [clientId, items]
  )

  const allergyCount = items.filter((i) => i.preference_type === 'allergy').length

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => setOpen((o) => !o)} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBox, { backgroundColor: (allergyCount > 0 ? '#F43F5E' : theme.mutedForeground) + '22' }]}>
            <AlertTriangle size={16} color={allergyCount > 0 ? '#F43F5E' : theme.mutedForeground} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Restricciones alimentarias</Text>
              {loaded && items.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: theme.secondary }]}>
                  <Text style={[styles.countTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{items.length}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Alergias / intolerancias que el plan debe respetar</Text>
          </View>
        </View>
        <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 200 }}>
          <ChevronDown size={18} color={theme.mutedForeground} />
        </MotiView>
      </TouchableOpacity>

      {open ? (
        <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 200 }} style={styles.body}>
          {/* Tipo a agregar */}
          <View style={styles.typeRow}>
            {TYPE_ORDER.map((t) => {
              const on = addType === t
              const c = TYPE_META[t].color
              return (
                <TouchableOpacity key={t} activeOpacity={0.8} onPress={() => setAddType(t)} style={[styles.typeBtn, { borderColor: on ? c : theme.border, backgroundColor: on ? c + '1A' : theme.background, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.typeTxt, { color: on ? c : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{TYPE_META[t].label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Búsqueda */}
          <View style={[styles.searchWrap, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.lg }]}>
            <Search size={16} color={theme.mutedForeground} />
            <TextInput
              value={term}
              onChangeText={setTerm}
              placeholder={`Buscar alimento para marcar como ${TYPE_META[addType].label.toLowerCase()}…`}
              placeholderTextColor={theme.mutedForeground}
              style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            />
            {term ? (
              <TouchableOpacity onPress={() => setTerm('')} hitSlop={8}><X size={16} color={theme.mutedForeground} /></TouchableOpacity>
            ) : null}
          </View>

          {term.trim().length >= 2 ? (
            <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.lg }]}>
              {searching ? (
                <View style={{ paddingVertical: 14 }}><ActivityIndicator color={theme.mutedForeground} /></View>
              ) : results.length === 0 ? (
                <Text style={[styles.noResults, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin resultados.</Text>
              ) : (
                results.map((f) => {
                  const already = restrictedIds.has(f.id)
                  return (
                    <TouchableOpacity key={f.id} activeOpacity={already ? 1 : 0.7} disabled={already || busy} onPress={() => add(f, addType)} style={styles.resultRow}>
                      <View style={{ flexShrink: 1 }}>
                        <Text numberOfLines={1} style={[styles.resultName, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                          {f.name}{f.brand ? `  ${f.brand}` : ''}
                        </Text>
                      </View>
                      {already ? (
                        <Text style={[styles.alreadyTxt, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Ya marcado</Text>
                      ) : (
                        <Plus size={18} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  )
                })
              )}
            </View>
          ) : null}

          {error ? <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: theme.fontSans }}>{error}</Text> : null}

          {/* Chips actuales agrupados por tipo */}
          {loaded && items.length === 0 ? (
            <Text style={[styles.emptyChips, { color: theme.mutedForeground, borderColor: theme.border, fontFamily: theme.fontSans }]}>
              Sin restricciones. Marca alergias o intolerancias para que el plan las respete.
            </Text>
          ) : null}
          {TYPE_ORDER.map((t) => {
            const group = items.filter((i) => i.preference_type === t)
            if (group.length === 0) return null
            const c = TYPE_META[t].color
            return (
              <View key={t} style={{ gap: 7 }}>
                <View style={styles.groupHead}>
                  <View style={[styles.dot, { backgroundColor: c }]} />
                  <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{TYPE_META[t].label}</Text>
                </View>
                <View style={styles.chipWrap}>
                  {group.map((i) => (
                    <View key={i.food_id} style={[styles.chip, { backgroundColor: c + '14', borderColor: c + '44' }]}>
                      <Text numberOfLines={1} style={[styles.chipTxt, { color: c, fontFamily: 'Inter_600SemiBold' }]}>{i.name}</Text>
                      <TouchableOpacity onPress={() => remove(i.food_id)} disabled={busy} hitSlop={6}><X size={13} color={c} /></TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
        </MotiView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  countBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  countTxt: { fontSize: 10 },
  subtitle: { fontSize: 10.5, marginTop: 2 },
  body: { gap: 12, paddingBottom: 14, paddingTop: 2 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  typeTxt: { fontSize: 11 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 13.5 },
  results: { borderWidth: 1, padding: 6, gap: 2, maxHeight: 240 },
  noResults: { fontSize: 12.5, textAlign: 'center', paddingVertical: 14 },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8, paddingVertical: 9 },
  resultName: { fontSize: 13.5 },
  alreadyTxt: { fontSize: 10.5 },
  emptyChips: { fontSize: 12, lineHeight: 17, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.7 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', borderWidth: 1, borderRadius: 999, paddingLeft: 11, paddingRight: 8, paddingVertical: 6 },
  chipTxt: { fontSize: 12, flexShrink: 1 },
})
