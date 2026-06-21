import { useEffect, useMemo, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Check,
  ChevronLeft,
  LayoutList,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import {
  buildAreaVMs,
  createArea,
  deleteArea,
  listAreas,
  updateArea,
  type AreaVM,
  type WorkoutArea,
} from '../../../lib/areas'

export default function AreasScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [areas, setAreas] = useState<WorkoutArea[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOrder, setEditOrder] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setAreas(await listAreas())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const vms = useMemo<AreaVM[]>(() => buildAreaVMs(areas), [areas])

  async function handleCreate() {
    const name = newName.trim()
    if (saving || name.length < 2) return
    setSaving(true)
    setError(null)
    try {
      const res = await createArea({ name }, areas)
      if (res.area) {
        setAreas((prev) => [...prev, res.area!])
        setNewName('')
      } else {
        setError(res.error ?? 'No se pudo crear el área')
      }
    } finally {
      setSaving(false)
    }
  }

  function startEdit(area: WorkoutArea) {
    setEditingId(area.id)
    setEditName(area.name)
    setEditOrder(String(area.sort_order))
    setConfirmDeleteId(null)
    setError(null)
  }

  async function handleUpdate(area: WorkoutArea) {
    if (saving) return
    const name = editName.trim()
    const sort = Number.parseInt(editOrder, 10)
    const payload: { id: string; name?: string; sort_order?: number } = { id: area.id }
    if (name && name !== area.name) payload.name = name
    if (Number.isFinite(sort) && sort !== area.sort_order) payload.sort_order = sort
    if (payload.name === undefined && payload.sort_order === undefined) {
      setEditingId(null)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await updateArea(payload)
      if (res.area) {
        setAreas((prev) => prev.map((a) => (a.id === area.id ? res.area! : a)))
        setEditingId(null)
      } else {
        setError(res.error ?? 'No se pudo actualizar el área')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(area: WorkoutArea) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await deleteArea(area.id)
      if (!res.error) {
        setAreas((prev) => prev.filter((a) => a.id !== area.id))
        setConfirmDeleteId(null)
      } else {
        setError(res.error)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando áreas…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Áreas del builder" subtitle="Organizá los días con tus propias áreas" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headIntro}>
          <View style={[styles.headIcon, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius.xl }]}>
            <LayoutList size={20} color={theme.primary} />
          </View>
          <Text style={[styles.introText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Organizá los días de entrenamiento con tus propias áreas (Movilidad, Core, HYROX…).
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.destructive + '12', borderColor: theme.destructive, borderRadius: theme.radius.lg }]}>
            <Text style={[styles.errorText, { color: theme.destructive, fontFamily: theme.fontSans }]}>{error}</Text>
          </View>
        ) : null}

        {/* ── Lista de áreas ── */}
        <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
          {vms.map((vm, idx) => {
            const isEditing = editingId === vm.id
            const isConfirming = confirmDeleteId === vm.id
            return (
              <View
                key={vm.id}
                style={[styles.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
              >
                {isEditing ? (
                  <View style={styles.editWrap}>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      maxLength={40}
                      autoFocus
                      placeholder="Nombre del área"
                      placeholderTextColor={theme.mutedForeground}
                      style={[styles.editInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                    />
                    <TextInput
                      value={editOrder}
                      onChangeText={(v) => setEditOrder(v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="Orden"
                      placeholderTextColor={theme.mutedForeground}
                      style={[styles.orderInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                    />
                    <TouchableOpacity
                      onPress={() => handleUpdate(vm)}
                      disabled={saving}
                      style={[styles.iconBtn, { backgroundColor: theme.primary + '1A' }]}
                      activeOpacity={0.8}
                    >
                      <Check size={18} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditingId(null)}
                      style={styles.iconBtn}
                      activeOpacity={0.8}
                    >
                      <X size={18} color={theme.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.rowMain}>
                      <View style={[styles.badge, { borderColor: vm.color + '66', backgroundColor: vm.color + '1F' }]}>
                        <Text style={[styles.badgeText, { color: vm.color, fontFamily: 'Montserrat_800ExtraBold' }]}>{vm.shortLabel}</Text>
                      </View>
                      <View style={styles.rowText}>
                        <Text numberOfLines={1} style={[styles.areaName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                          {vm.name}
                        </Text>
                        <Text style={[styles.areaMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          Orden {vm.sort_order}
                          {vm.is_system ? ' · Área del sistema (solo lectura)' : ''}
                        </Text>
                      </View>
                    </View>

                    {!vm.is_system ? (
                      <View style={styles.actions}>
                        {isConfirming ? (
                          <>
                            <TouchableOpacity
                              onPress={() => handleDelete(vm)}
                              disabled={saving}
                              style={[styles.confirmBtn, { backgroundColor: theme.destructive + '14' }]}
                              activeOpacity={0.8}
                            >
                              <Trash2 size={14} color={theme.destructive} />
                              <Text style={[styles.confirmText, { color: theme.destructive, fontFamily: 'Montserrat_700Bold' }]}>Confirmar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setConfirmDeleteId(null)} style={styles.iconBtn} activeOpacity={0.8}>
                              <X size={18} color={theme.mutedForeground} />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity onPress={() => startEdit(vm)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Pencil size={17} color={theme.mutedForeground} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setConfirmDeleteId(vm.id)} style={styles.iconBtn} activeOpacity={0.8}>
                              <Trash2 size={17} color={theme.mutedForeground} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    ) : (
                      <Lock size={15} color={theme.mutedForeground} />
                    )}
                  </>
                )}
              </View>
            )
          })}
        </View>

        {/* ── Crear área ── */}
        <View style={styles.createRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            maxLength={40}
            placeholder='Nueva área (ej: "Core", "HYROX")'
            placeholderTextColor={theme.mutedForeground}
            onSubmitEditing={handleCreate}
            returnKeyType="done"
            style={[styles.createInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans, borderRadius: theme.radius.lg }]}
          />
          <Button
            label="Crear"
            leftIcon={Plus}
            onPress={handleCreate}
            loading={saving}
            disabled={newName.trim().length < 2}
          />
        </View>

        <Text style={[styles.footnote, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Las áreas ordenan los ejercicios de cada día en el builder (orden menor = primero). Al eliminar
          un área, los ejercicios que la usaban no se pierden: vuelven a verse bajo el área Principal.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  headIntro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  introText: { flex: 1, fontSize: 13, lineHeight: 18 },
  errorBox: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
  list: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, minWidth: 38, alignItems: 'center' },
  badgeText: { fontSize: 10, letterSpacing: 0.5 },
  rowText: { flex: 1, minWidth: 0 },
  areaName: { fontSize: 15 },
  areaMeta: { fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: 10 },
  confirmText: { fontSize: 12 },
  editWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  editInput: { flex: 1, minWidth: 0, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14 },
  orderInput: { width: 56, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, fontSize: 14, textAlign: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  createInput: { flex: 1, minWidth: 0, height: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  footnote: { fontSize: 12, lineHeight: 17 },
})
