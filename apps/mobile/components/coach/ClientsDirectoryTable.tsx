import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { ArrowUpDown, Apple, Eye, Pencil, Archive, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  defaultSortDir,
  type DirectoryClient,
  type DirectorySortKey,
  type PulseRow,
  type SortDir,
} from '../../lib/clients-directory'

// Vista TABLA (default web). Replica ClientsDirectoryTable.tsx 1:1:
// columnas Alumno · Estado · Score · Adh. · Peso · Último · Programa · Días · Acc.
// headers sortables (toggle asc/desc), scroll horizontal en una sola zona.

type ColId = 'name' | 'status' | 'score' | 'adherence' | 'weight' | 'last' | 'program' | 'days'

const COL_TO_SORT: Partial<Record<ColId, DirectorySortKey>> = {
  name: 'name_asc',
  score: 'attention_score',
  adherence: 'adherence_desc',
  weight: 'weight_delta',
  last: 'last_activity',
  days: 'plan_days',
}

// Anchos fijos (px) — el total define el min-width scrollable (≈ web min-w-[920px]).
const COL_W: Record<ColId | 'actions', number> = {
  name: 190,
  status: 88,
  score: 56,
  adherence: 120,
  weight: 90,
  last: 96,
  program: 130,
  days: 56,
  actions: 168,
}

function daysSinceLabel(date: string | null): { label: string; dot: string } {
  if (!date) return { label: '—', dot: '#71717A' }
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  const dot = days < 3 ? '#10B981' : days < 7 ? '#F59E0B' : '#EF4444'
  const label = days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days}d`
  return { label, dot }
}

function StatusCell({ client }: { client: DirectoryClient }) {
  let color = '#10B981'
  let label = 'Activo'
  if (client.isArchived) { color = '#71717A'; label = 'Archivado' }
  else if (!client.isActive) { color = '#EF4444'; label = 'Pausado' }
  else if (client.forcePwChange) { color = '#F59E0B'; label = 'Pend. sync' }
  return (
    <View style={[s.statusPill, { backgroundColor: color + '1A', borderColor: color + '33' }]}>
      <Text style={[s.statusTxt, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 50 ? '#EF4444' : score >= 25 ? '#F59E0B' : '#10B981'
  return (
    <View style={[s.scoreBadge, { backgroundColor: color + '26' }]}>
      <Text style={[s.scoreTxt, { color }]}>{score}</Text>
    </View>
  )
}

function HeaderCell({
  label, col, width, sortKey, sortDir, onSort, theme,
}: {
  label: string; col: ColId; width: number; sortKey: DirectorySortKey; sortDir: SortDir
  onSort: (k: DirectorySortKey, d: SortDir) => void; theme: any
}) {
  const sk = COL_TO_SORT[col]
  if (!sk) {
    return <View style={{ width }}><Text style={[s.headerTxt, { color: theme.mutedForeground }]} numberOfLines={1}>{label}</Text></View>
  }
  const active = sortKey === sk
  return (
    <TouchableOpacity
      style={{ width, flexDirection: 'row', alignItems: 'center', gap: 3 }}
      activeOpacity={0.7}
      onPress={() => onSort(sk, active ? (sortDir === 'asc' ? 'desc' : 'asc') : defaultSortDir(sk))}
    >
      <Text style={[s.headerTxt, { color: active ? theme.primary : theme.mutedForeground }]} numberOfLines={1}>{label}</Text>
      <ArrowUpDown size={11} color={active ? theme.primary : theme.mutedForeground} style={{ opacity: active ? 1 : 0.4 }} />
      {active ? <Text style={[s.headerArrow, { color: theme.primary }]}>{sortDir === 'asc' ? '↑' : '↓'}</Text> : null}
    </TouchableOpacity>
  )
}

// Umbral de virtualización (1:1 web: react-virtual con max-height cuando hay muchas filas).
// ≤20 filas → render directo (sin overhead de virtualización). >20 → FlashList con altura tope.
const VIRTUALIZE_THRESHOLD = 20
const ROW_HEIGHT = 56
// Altura tope de la zona scrollable de filas (≈ 60% del alto de pantalla), como el max-h web.
const VIRTUAL_BODY_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.6)

interface RowProps {
  client: DirectoryClient
  pulse?: PulseRow
  theme: any
  coachSlug: string
  onRowPress: (c: DirectoryClient) => void
  onProfile: (c: DirectoryClient) => void
  onWhatsApp: (c: DirectoryClient) => void
  onEdit: (c: DirectoryClient) => void
  onArchive: (c: DirectoryClient) => void
  onDelete: (c: DirectoryClient) => void
}

function TableRow({ client: c, pulse: p, theme, coachSlug, onRowPress, onProfile, onWhatsApp, onEdit, onArchive, onDelete }: RowProps) {
  const score = p?.attentionScore ?? c.attentionScore
  const adh = p?.percentage ?? 0
  const nutriRisk = p?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false
  const last = daysSinceLabel(p?.lastWorkoutDate ?? c.lastWorkoutDate)
  const planDays = c.planDaysRemaining
  return (
    <TouchableOpacity
      style={[s.row, { borderBottomColor: theme.border, height: ROW_HEIGHT }]}
      activeOpacity={0.7}
      onPress={() => onRowPress(c)}
    >
      {/* Alumno */}
      <View style={[s.cell, { width: COL_W.name, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <View style={[s.avatar, { backgroundColor: theme.secondary }]}>
          <Text style={[s.avatarTxt, { color: theme.foreground }]}>{c.fullName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.name, { color: theme.foreground }]}>{c.fullName}</Text>
          <Text numberOfLines={1} style={[s.email, { color: theme.mutedForeground }]}>{c.email}</Text>
        </View>
      </View>
      {/* Estado */}
      <View style={[s.cell, { width: COL_W.status }]}><StatusCell client={c} /></View>
      {/* Score */}
      <View style={[s.cell, { width: COL_W.score }]}><ScoreBadge score={score} /></View>
      {/* Adh. */}
      <View style={[s.cell, { width: COL_W.adherence, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        {nutriRisk ? (
          <View style={{ borderWidth: 1, borderColor: '#EF444466', backgroundColor: '#EF444426', borderRadius: 99, padding: 3 }}>
            <Apple size={12} color="#EF4444" />
          </View>
        ) : null}
        <View style={[s.barTrack, { backgroundColor: theme.border }]}>
          <View style={{ height: '100%', width: `${Math.min(100, adh)}%`, backgroundColor: theme.primary, borderRadius: 99 }} />
        </View>
        <Text style={[s.tnum, { color: theme.foreground }]}>{adh}%</Text>
      </View>
      {/* Peso */}
      <View style={[s.cell, { width: COL_W.weight }]}>
        <Text style={[s.tnum, { color: theme.foreground }]}>{p?.currentWeight != null ? `${p.currentWeight} kg` : '—'}</Text>
        {p?.weightDelta7d != null ? (
          <Text style={[s.dim, { color: theme.mutedForeground }]}>{p.weightDelta7d > 0 ? '+' : ''}{p.weightDelta7d} (7d)</Text>
        ) : null}
      </View>
      {/* Último */}
      <View style={[s.cell, { width: COL_W.last, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: last.dot }} />
        <Text style={[s.cellTxt, { color: theme.foreground }]} numberOfLines={1}>{last.label}</Text>
      </View>
      {/* Programa */}
      <View style={[s.cell, { width: COL_W.program }]}>
        <Text style={[s.cellTxt, { color: theme.mutedForeground }]} numberOfLines={1}>{c.activeProgramName ?? '—'}</Text>
      </View>
      {/* Días */}
      <View style={[s.cell, { width: COL_W.days }]}>
        <Text style={[s.tnum, { color: theme.foreground }]}>{planDays != null ? planDays : '—'}</Text>
      </View>
      {/* Acc. */}
      <View style={[s.cell, { width: COL_W.actions, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }]}>
        <TouchableOpacity hitSlop={6} style={s.iconAct} onPress={() => onProfile(c)}>
          <Eye size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
        {c.phone && coachSlug ? (
          <TouchableOpacity style={[s.waBtn]} onPress={() => onWhatsApp(c)}>
            <Text style={s.waTxt}>WA</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity hitSlop={6} style={s.iconAct} onPress={() => onEdit(c)}>
          <Pencil size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={6} style={s.iconAct} onPress={() => onArchive(c)}>
          <Archive size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={6} style={s.iconAct} onPress={() => onDelete(c)}>
          <Trash2 size={16} color={theme.destructive} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

interface Props {
  clients: DirectoryClient[]
  pulseById: Map<string, PulseRow>
  sortKey: DirectorySortKey
  sortDir: SortDir
  onSortChange: (k: DirectorySortKey, d: SortDir) => void
  onRowPress: (c: DirectoryClient) => void
  onProfile: (c: DirectoryClient) => void
  onWhatsApp: (c: DirectoryClient) => void
  onEdit: (c: DirectoryClient) => void
  onArchive: (c: DirectoryClient) => void
  onDelete: (c: DirectoryClient) => void
  coachSlug: string
}

export function ClientsDirectoryTable({
  clients, pulseById, sortKey, sortDir, onSortChange,
  onRowPress, onProfile, onWhatsApp, onEdit, onArchive, onDelete, coachSlug,
}: Props) {
  const { theme } = useTheme()
  const minWidth =
    COL_W.name + COL_W.status + COL_W.score + COL_W.adherence + COL_W.weight +
    COL_W.last + COL_W.program + COL_W.days + COL_W.actions + 9 * 8

  // Virtualización: con muchas filas la zona de filas se vuelve un FlashList vertical con altura
  // tope (espejo del react-virtual + max-height de la web). Pocas filas → render directo, sin
  // anidar listas (el FlatList del screen ya scrollea el conjunto). Las columnas siempre van en
  // el mismo ScrollView horizontal.
  const virtualize = clients.length > VIRTUALIZE_THRESHOLD

  const headerRow = (
    <View style={[s.headerRow, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
      <HeaderCell label="Alumno" col="name" width={COL_W.name} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <HeaderCell label="Estado" col="status" width={COL_W.status} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <HeaderCell label="Score" col="score" width={COL_W.score} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <HeaderCell label="Adh." col="adherence" width={COL_W.adherence} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <HeaderCell label="Peso" col="weight" width={COL_W.weight} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <HeaderCell label="Último" col="last" width={COL_W.last} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <View style={{ width: COL_W.program }}><Text style={[s.headerTxt, { color: theme.mutedForeground }]}>Programa</Text></View>
      <HeaderCell label="Días" col="days" width={COL_W.days} sortKey={sortKey} sortDir={sortDir} onSort={onSortChange} theme={theme} />
      <View style={{ width: COL_W.actions }}><Text style={[s.headerTxt, { color: theme.mutedForeground }]}>Acc.</Text></View>
    </View>
  )

  const renderRow = (c: DirectoryClient) => (
    <TableRow
      key={c.id}
      client={c}
      pulse={pulseById.get(c.id)}
      theme={theme}
      coachSlug={coachSlug}
      onRowPress={onRowPress}
      onProfile={onProfile}
      onWhatsApp={onWhatsApp}
      onEdit={onEdit}
      onArchive={onArchive}
      onDelete={onDelete}
    />
  )

  return (
    <View style={[s.wrap, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth }}>
        <View style={{ minWidth }}>
          {headerRow}
          {virtualize ? (
            <View style={{ height: VIRTUAL_BODY_MAX_HEIGHT }}>
              <FlashList
                data={clients}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => renderRow(item)}
                showsVerticalScrollIndicator
              />
            </View>
          ) : (
            clients.map(renderRow)
          )}
        </View>
      </ScrollView>
      <Text style={[s.hint, { color: theme.mutedForeground, borderTopColor: theme.border }]}>
        {virtualize
          ? `${clients.length} alumnos · desliza horizontal para ver columnas, vertical dentro de la tabla.`
          : 'Desliza horizontalmente para ver todas las columnas.'}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1 },
  headerTxt: { fontSize: 9.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  headerArrow: { fontSize: 9, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { justifyContent: 'center' },
  cellTxt: { fontSize: 11.5 },
  avatar: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 13, fontFamily: 'Montserrat_700Bold' },
  name: { fontSize: 12.5, fontFamily: 'Inter_700Bold' },
  email: { fontSize: 10 },
  statusPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 8.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  scoreBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  scoreTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  barTrack: { flex: 1, height: 6, borderRadius: 99, overflow: 'hidden' },
  tnum: { fontSize: 11.5, fontFamily: 'Inter_700Bold' },
  dim: { fontSize: 9.5 },
  iconAct: { padding: 6, borderRadius: 8 },
  waBtn: { backgroundColor: '#25D366', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  waTxt: { color: '#fff', fontSize: 9.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
})
