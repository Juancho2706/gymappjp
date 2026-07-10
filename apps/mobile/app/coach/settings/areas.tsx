import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import { Check, ChevronLeft, LayoutGrid, Lock, Pencil, Plus, Trash2, X } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { WorkoutArea } from '@eva/workout-engine'
import { AppBackground } from '../../../components/AppBackground'
import { Card, EmptyState } from '../../../components'
import { toast } from '../../../components/Toast'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { getCoachProfile } from '../../../lib/coach'
import {
  createBuilderArea,
  deleteBuilderArea,
  listBuilderAreas,
  updateBuilderArea,
  type BuilderAreaScope,
} from '../../../lib/workout-areas'
import { buildMobileAreaVMs } from '../../../lib/builder-area-vm'

/**
 * E7-05 · Áreas del builder (CRUD). Espejo mobile de AreasManager (web, coach/settings/areas):
 * lista system (solo lectura) + propias, crear/renombrar/reordenar/eliminar (confirmación 2 pasos).
 * Scope por WORKSPACE ACTIVO (useWorkspace, única fuente): team ⇒ áreas del team (gestiona solo
 * owner/co-gestor → miembro read-only); standalone ⇒ propias; enterprise/gestionada ⇒ solo system
 * read-only. El write-path (lib/workout-areas) va por PostgREST directo con RLS wst_* como techo.
 * El builder (E5) ya CONSUME estas áreas; esto solo las administra.
 */

for (const Icon of [Check, ChevronLeft, LayoutGrid, Lock, Pencil, Plus, Trash2, X]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const SPORT_600 = '#EA580C' // fallback badge tint del área "main" cuando no hay color de marca resuelto

export default function CoachAreasScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const ws = useWorkspace()

  const [coachId, setCoachId] = useState<string | null>(null)
  const [areas, setAreas] = useState<WorkoutArea[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editOrder, setEditOrder] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  const isEnterprise = ws.kind === 'enterprise' || ws.isManaged

  // Scope del listado/write según el workspace activo (separación estricta, igual que web).
  const scope: BuilderAreaScope = isTeam
    ? { coachId: null, teamId: ws.teamId }
    : isEnterprise
      ? { coachId: null, teamId: null }
      : { coachId, teamId: null }

  const canEdit = isEnterprise ? false : isTeam ? ws.canManageTeam : true

  useEffect(() => {
    let alive = true
    getCoachProfile()
      .then((c) => { if (alive) setCoachId(c?.id ?? null) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Carga las áreas del scope activo. Standalone necesita el coachId resuelto primero (si no, solo
  // vería system); team/enterprise no. Re-corre al cambiar de workspace o al resolver el coachId.
  const needsCoachId = !isTeam && !isEnterprise
  useEffect(() => {
    if (!ws.ready) return
    if (needsCoachId && coachId === null) return
    let alive = true
    setAreas(null)
    setLoadError(false)
    listBuilderAreas(scope)
      .then((a) => { if (alive) setAreas(a) })
      .catch(() => { if (alive) setLoadError(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.ready, ws.teamId, ws.kind, coachId, needsCoachId])

  const ordered = useMemo(
    () => [...(areas ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [areas],
  )
  const vmById = useMemo(() => new Map(buildMobileAreaVMs(ordered).map((v) => [v.id, v])), [ordered])

  function badgeColor(id: string): string {
    const vm = vmById.get(id)
    return vm?.color ?? theme.primary ?? SPORT_600
  }

  async function handleCreate() {
    const name = newName.trim()
    if (busy || name.length < 2) return
    setBusy(true)
    const res = await createBuilderArea(scope, { name }, areas ?? [])
    setBusy(false)
    if (res.area) {
      setAreas((prev) => [...(prev ?? []), res.area!])
      setNewName('')
      toast.success(`Área "${res.area.name}" creada`)
    } else {
      toast.error(res.error ?? 'No se pudo crear el área')
    }
  }

  function startEdit(area: WorkoutArea) {
    setEditingId(area.id)
    setEditName(area.name)
    setEditOrder(String(area.sort_order))
    setConfirmDeleteId(null)
  }

  async function handleUpdate(area: WorkoutArea) {
    if (busy) return
    const name = editName.trim()
    const sort = Number.parseInt(editOrder, 10)
    const payload: { name?: string; sort_order?: number } = {}
    if (name && name !== area.name) payload.name = name
    if (Number.isFinite(sort) && sort !== area.sort_order) payload.sort_order = sort
    if (payload.name === undefined && payload.sort_order === undefined) {
      setEditingId(null)
      return
    }
    setBusy(true)
    const res = await updateBuilderArea(area.id, payload)
    setBusy(false)
    if (res.area) {
      setAreas((prev) => (prev ?? []).map((a) => (a.id === area.id ? res.area! : a)))
      setEditingId(null)
      toast.success('Área actualizada')
    } else {
      toast.error(res.error ?? 'No se pudo actualizar el área')
    }
  }

  async function handleDelete(area: WorkoutArea) {
    if (busy) return
    setBusy(true)
    const res = await deleteBuilderArea(area.id)
    setBusy(false)
    if (!res.error) {
      setAreas((prev) => (prev ?? []).filter((a) => a.id !== area.id))
      setConfirmDeleteId(null)
      toast.success(`Área "${area.name}" eliminada. Sus ejercicios vuelven al área Principal.`)
    } else {
      toast.error(res.error)
    }
  }

  const loading = areas === null && !loadError

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Back header */}
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="areas-back"
            accessibilityRole="button"
            accessibilityLabel="Volver a Opciones"
            onPress={() => router.back()}
            hitSlop={10}
            className="flex-row items-center"
            style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
            <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>Opciones</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ paddingTop: 8, paddingBottom: 16 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              Áreas del builder
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
              Organizá los días de entrenamiento con tus propias áreas (Movilidad, Core, HYROX…).
              {isTeam ? ' Son las áreas compartidas del equipo.' : ''}
            </Text>
          </View>

          {/* Lock banner (miembro sin gestión / cuenta gestionada) */}
          {!canEdit && (
            <View
              className="flex-row items-center rounded-2xl border border-subtle bg-surface-sunken/60"
              style={{ gap: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }}
            >
              <Lock size={16} strokeWidth={2} className="text-muted" />
              <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
                {isEnterprise
                  ? 'No disponible en cuentas gestionadas por una organización.'
                  : isTeam
                    ? 'Solo el owner o co-gestor del equipo gestiona las áreas del pool. Podés usarlas en el builder.'
                    : 'No tenés permiso para editar las áreas.'}
              </Text>
            </View>
          )}

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : loadError || ordered.length === 0 ? (
            <Card testID="areas-empty" variant="default" padding="lg" style={{ marginTop: 8 }}>
              <EmptyState
                icon={LayoutGrid}
                title={loadError ? 'No pudimos cargar las áreas' : 'Aún no hay áreas'}
                subtitle={
                  loadError
                    ? 'Revisá tu conexión e intentá de nuevo.'
                    : canEdit
                      ? 'Creá tu primera área abajo para ordenar los días del planificador.'
                      : 'Todavía no hay áreas configuradas.'
                }
              />
            </Card>
          ) : (
            <Card variant="default" padding="none" style={{ overflow: 'hidden' }}>
              {ordered.map((area, i) => {
                const isEditing = editingId === area.id
                const isConfirming = confirmDeleteId === area.id
                const color = badgeColor(area.id)
                const short = vmById.get(area.id)?.shortLabel ?? '—'
                return (
                  <View
                    key={area.id}
                    className={i > 0 ? 'border-t border-subtle' : ''}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
                  >
                    {isEditing ? (
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          testID={`area-name-input-${area.id}`}
                          value={editName}
                          onChangeText={setEditName}
                          maxLength={40}
                          autoFocus
                          placeholder="Nombre del área"
                          placeholderTextColor={theme.mutedForeground}
                          className="rounded-xl border border-default bg-surface-card font-sans text-strong"
                          style={{ flex: 1, minWidth: 0, height: 42, paddingHorizontal: 12, fontSize: 14 }}
                        />
                        <TextInput
                          testID={`area-order-input-${area.id}`}
                          value={editOrder}
                          onChangeText={(t) => setEditOrder(t.replace(/[^0-9]/g, ''))}
                          keyboardType="number-pad"
                          maxLength={4}
                          placeholder="Orden"
                          placeholderTextColor={theme.mutedForeground}
                          className="rounded-xl border border-default bg-surface-card font-sans text-strong"
                          style={{ width: 62, height: 42, paddingHorizontal: 8, fontSize: 14, textAlign: 'center' }}
                        />
                        <Pressable
                          testID={`area-save-${area.id}`}
                          onPress={() => handleUpdate(area)}
                          disabled={busy}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Guardar cambios del área"
                          className="items-center justify-center rounded-xl bg-sport-100"
                          style={{ width: 40, height: 40, opacity: busy ? 0.5 : 1 }}
                        >
                          {busy ? <ActivityIndicator size="small" color={theme.primary} /> : <Check size={18} strokeWidth={2.4} className="text-sport-600" />}
                        </Pressable>
                        <Pressable
                          testID={`area-cancel-edit-${area.id}`}
                          onPress={() => setEditingId(null)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Cancelar edición"
                          className="items-center justify-center rounded-xl"
                          style={{ width: 40, height: 40 }}
                        >
                          <X size={18} strokeWidth={2.2} className="text-muted" />
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <View
                          style={{ borderWidth: 1, borderColor: color, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, minWidth: 38, alignItems: 'center' }}
                        >
                          <Text className="font-display-black" style={{ color, fontSize: 10, letterSpacing: 0.2 }}>{short}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }} numberOfLines={1}>{area.name}</Text>
                          <Text className="font-sans text-muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                            Orden {area.sort_order}
                            {area.is_system ? ' · Área del sistema (solo lectura)' : ''}
                          </Text>
                        </View>
                        {canEdit && !area.is_system && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {isConfirming ? (
                              <>
                                <Pressable
                                  testID={`area-delete-confirm-${area.id}`}
                                  onPress={() => handleDelete(area)}
                                  disabled={busy}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Confirmar eliminación de ${area.name}`}
                                  className="flex-row items-center rounded-xl bg-destructive/10"
                                  style={{ gap: 5, paddingHorizontal: 11, height: 38, opacity: busy ? 0.5 : 1 }}
                                >
                                  {busy ? <ActivityIndicator size="small" color={theme.destructive} /> : <Trash2 size={15} strokeWidth={2.2} color={theme.destructive} />}
                                  <Text className="font-sans-bold" style={{ color: theme.destructive, fontSize: 12.5 }}>Confirmar</Text>
                                </Pressable>
                                <Pressable
                                  testID={`area-delete-cancel-${area.id}`}
                                  onPress={() => setConfirmDeleteId(null)}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  accessibilityLabel="Cancelar eliminación"
                                  className="items-center justify-center rounded-xl"
                                  style={{ width: 38, height: 38 }}
                                >
                                  <X size={17} strokeWidth={2.2} className="text-muted" />
                                </Pressable>
                              </>
                            ) : (
                              <>
                                <Pressable
                                  testID={`area-edit-${area.id}`}
                                  onPress={() => startEdit(area)}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Editar área ${area.name}`}
                                  className="items-center justify-center rounded-xl"
                                  style={{ width: 38, height: 38 }}
                                >
                                  <Pencil size={16} strokeWidth={2.2} className="text-muted" />
                                </Pressable>
                                <Pressable
                                  testID={`area-delete-${area.id}`}
                                  onPress={() => setConfirmDeleteId(area.id)}
                                  hitSlop={6}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Eliminar área ${area.name}`}
                                  className="items-center justify-center rounded-xl"
                                  style={{ width: 38, height: 38 }}
                                >
                                  <Trash2 size={16} strokeWidth={2.2} className="text-muted" />
                                </Pressable>
                              </>
                            )}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )
              })}
            </Card>
          )}

          {/* Crear área */}
          {canEdit && !loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <TextInput
                testID="area-create-input"
                value={newName}
                onChangeText={setNewName}
                maxLength={40}
                placeholder='Nueva área (ej: "Core", "HYROX")'
                placeholderTextColor={theme.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                className="rounded-xl border border-default bg-surface-card font-sans text-strong"
                style={{ flex: 1, minWidth: 0, height: 46, paddingHorizontal: 14, fontSize: 14 }}
              />
              <Pressable
                testID="area-create-submit"
                onPress={handleCreate}
                disabled={busy || newName.trim().length < 2}
                accessibilityRole="button"
                accessibilityLabel="Crear área"
                className={newName.trim().length >= 2 && !busy ? 'flex-row items-center rounded-xl bg-cta-fill' : 'flex-row items-center rounded-xl bg-surface-sunken'}
                style={{ gap: 6, paddingHorizontal: 16, height: 46 }}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={newName.trim().length >= 2 ? '#FFFFFF' : theme.mutedForeground} />
                ) : (
                  <Plus size={17} strokeWidth={2.4} color={newName.trim().length >= 2 ? '#FFFFFF' : theme.mutedForeground} />
                )}
                <Text
                  className="font-sans-bold"
                  style={{ fontSize: 14, color: newName.trim().length >= 2 && !busy ? '#FFFFFF' : theme.mutedForeground }}
                >
                  Crear
                </Text>
              </Pressable>
            </View>
          )}

          <Text className="font-sans text-muted" style={{ fontSize: 11.5, lineHeight: 18, marginTop: 16 }}>
            Las áreas ordenan los ejercicios de cada día en el builder (orden menor = primero). Al
            eliminar un área, los ejercicios que la usaban no se pierden: vuelven a verse bajo el área
            Principal.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
