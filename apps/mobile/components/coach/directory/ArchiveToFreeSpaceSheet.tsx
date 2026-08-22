import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Archive, Check, Users, X } from 'lucide-react-native'
import { Avatar } from '../../Avatar'
import { Button } from '../../Button'
import { EmptyState } from '../../EmptyState'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { TYPE, textStyle, FONT } from '../../../lib/typography'
import { archiveClient, type ClientActionWorkspace } from '../../../lib/client-actions'
import { getCoachDirectoryClients, type DirectoryClient } from '../../../lib/clients-directory'
import { lastInfo } from './directory-shared'

interface Props {
  open: boolean
  /** Cierre sin haber liberado cupo (backdrop, botón X). */
  onClose: () => void
  workspace: ClientActionWorkspace
  /** Se archivó al menos un alumno: el muro se cierra y el alta vuelve al formulario. */
  onFreed: () => void
}

/**
 * Selector «Archivar un alumno» del muro de cupo (embudo Free→Pro, W6.2).
 *
 * Es la ÚNICA acción real que el coach puede tomar dentro de la app cuando su cupo está lleno:
 * archivar es reversible, no borra nada y libera cupo al instante (el server no cuenta a los
 * archivados). No hay aquí ninguna superficie de pago — ni link, ni precio, ni tier ajeno
 * (guideline 3.1.1 / política de pagos de Play; ver `lib/client-cap.ts`).
 *
 * NO usa `<Sheet nativeModal>` (ni ningún `<Modal>` propio) A PROPÓSITO: esta hoja se monta DENTRO
 * del `<Modal>` de `CreateClientModal`, y dos ventanas nativas anidadas son el precedente exacto
 * del «pantalla gris» al volver de una Activity en Android (QA-5; ver `components/ShareCard.tsx`
 * y `components/alumno/workout/v3/ImportWatchSheet.tsx`, que ya vive con esta misma restricción).
 * Se renderiza como overlay absoluto en la MISMA ventana: backdrop propio, safe area por
 * `useSafeAreaInsets` (la hoja se dibuja pegada al borde inferior) y cierre por backdrop o botón.
 * Tampoco monta un segundo `KeyboardAvoidingView`: el del host ya envuelve esta ventana y acá no
 * hay ningún campo de texto que empujar.
 *
 * La lista sale del MISMO fetch del directorio (`getCoachDirectoryClients`) para no inventar una
 * segunda verdad de «quién está activo», pero EXCLUYE a los alumnos de ejemplo (`isDemo`): el gate
 * del server no los cuenta (`api/mobile/coach/clients/route.ts:201`, `is_demo = false`), así que
 * archivarlos no libera ni un cupo — ofrecerlos sería mandar al coach a una acción inútil.
 * Archivar usa el endpoint de ciclo de vida (`archiveClient`), con sus efectos de acceso y
 * asignaciones server-side.
 */
export function ArchiveToFreeSpaceSheet({ open, onClose, workspace, onFreed }: Props) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const [rows, setRows] = useState<DirectoryClient[]>([])
  /** Hubo alumnos de ejemplo en la lectura: cambia el vacío («no ocupan cupo») en vez de mentir. */
  const [demoOnly, setDemoOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const all = await getCoachDirectoryClients({
        kind: workspace.kind,
        orgId: workspace.orgId,
        teamId: workspace.teamId,
      })
      const live = all.filter((c) => !c.isArchived)
      const occupying = live.filter((c) => !c.isDemo)
      setRows(occupying)
      setDemoOnly(occupying.length === 0 && live.length > 0)
    } catch {
      setRows([])
      setDemoOnly(false)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [workspace.kind, workspace.orgId, workspace.teamId])

  useEffect(() => {
    if (!open) return
    setConfirmingId(null)
    setBusyId(null)
    setRowError(null)
    setArchivedIds(new Set())
    void load()
  }, [load, open])

  const freed = archivedIds.size

  // Cerrar habiendo archivado ya liberó cupo: volver al formulario es la continuación natural.
  const handleClose = useCallback(() => {
    if (busyId) return
    if (freed > 0) onFreed()
    else onClose()
  }, [busyId, freed, onClose, onFreed])

  async function handleArchive(client: DirectoryClient) {
    if (busyId) return
    setBusyId(client.id)
    setRowError(null)
    try {
      await archiveClient(client.id, workspace)
      setArchivedIds((prev) => new Set(prev).add(client.id))
      setConfirmingId(null)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'No se pudo archivar el alumno.')
    } finally {
      setBusyId(null)
    }
  }

  if (!open) return null

  return (
    // `accessibilityViewIsModal` en el contenedor: mientras la hoja está abierta el lector no debe
    // poder salirse a la pantalla de atrás, que sigue montada en esta misma ventana.
    <View
      accessibilityViewIsModal
      accessibilityLabel="Archivar un alumno para liberar cupo"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, elevation: 60, justifyContent: 'flex-end' }}
    >
      <Pressable
        testID="archive-free-space-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        onPress={handleClose}
        className="bg-black/60"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <MotiView
        from={{ translateY: motion.reduced ? 0 : 320 }}
        animate={{ translateY: 0 }}
        transition={{ type: 'timing', duration: motion.duration('slow') }}
        className="border-subtle bg-surface-card"
        style={{
          maxHeight: '85%',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: 1,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 16,
          gap: 12,
        }}
      >
        {/* Mismo handle que el modal host (`CreateClientModal`): la hoja se lee como una capa más
            de esa ventana, no como otra ventana. */}
        <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: theme.border }} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={textStyle('lg', FONT.displayBold)} className="text-strong">
              Archivar un alumno
            </Text>
            <Text style={TYPE.caption} className="text-muted">
              Archivar deja al alumno fuera del cupo. No se borra nada: puedes desarchivarlo cuando quieras.
            </Text>
          </View>
          <TouchableOpacity
            testID="archive-free-space-close"
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            accessibilityState={{ disabled: busyId !== null }}
            disabled={busyId !== null}
            onPress={handleClose}
            hitSlop={8}
          >
            <X size={20} color={theme.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? <ActivityIndicator color={theme.primary} className="mt-space-6" /> : null}

          {!loading && loadError ? (
            <View style={{ minHeight: 220 }}>
              <EmptyState
                icon={Users}
                title="No pudimos cargar tus alumnos"
                subtitle="Revisa tu conexión e inténtalo otra vez."
                action={
                  <Button
                    testID="archive-free-space-retry"
                    label="Reintentar"
                    variant="secondary"
                    onPress={() => void load()}
                  />
                }
              />
            </View>
          ) : null}

          {!loading && !loadError && rows.length === 0 ? (
            <View style={{ minHeight: 220 }}>
              {demoOnly ? (
                <EmptyState
                  icon={Users}
                  title="Tus alumnos de ejemplo no ocupan cupo"
                  subtitle="Los alumnos de ejemplo no cuentan para el límite de tu plan, así que archivarlos no libera espacio."
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No tienes alumnos activos"
                  subtitle="Cuando tengas alumnos activos vas a poder liberar cupo archivándolos desde acá."
                />
              )}
            </View>
          ) : null}

          {!loading && !loadError && rowError ? (
            <View className="rounded-control border border-danger-500/30 bg-danger-100 px-space-4 py-space-3">
              <Text style={TYPE.caption} className="text-strong">
                {rowError}
              </Text>
            </View>
          ) : null}

          {!loading && !loadError
            ? rows.map((client) => {
                const done = archivedIds.has(client.id)
                const confirming = confirmingId === client.id
                const busy = busyId === client.id
                const last = lastInfo(client.lastWorkoutDate)

                return (
                  <View
                    key={client.id}
                    className={`gap-space-3 rounded-control border px-space-4 py-space-3 ${done ? 'border-subtle bg-surface-sunken' : 'border-default bg-transparent'}`}
                  >
                    <View className="flex-row items-center gap-space-3">
                      <Avatar name={client.fullName} size="sm" />
                      <View className="min-w-0 flex-1">
                        <Text style={TYPE.label} className={done ? 'text-muted' : 'text-strong'} numberOfLines={1}>
                          {client.fullName}
                        </Text>
                        <View className="flex-row items-center gap-space-2">
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: last.dot }} />
                          {/* La lectura del directorio solo trae entrenos de los últimos 7 días, así
                              que «sin dato» NO puede decirse como «nunca entrenó». */}
                          <Text style={TYPE.caption} className="text-muted" numberOfLines={1}>
                            {last.label === 'Sin entrenos' ? 'Sin entrenos esta semana' : `Último entreno: ${last.label}`}
                          </Text>
                        </View>
                      </View>

                      {done ? (
                        <View className="flex-row shrink-0 items-center gap-space-2">
                          <Check size={16} color={theme.success} strokeWidth={2.5} />
                          <Text style={TYPE.caption} className="text-muted">
                            Archivado
                          </Text>
                        </View>
                      ) : confirming ? null : (
                        <TouchableOpacity
                          testID={`archive-free-space-row-${client.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Archivar a ${client.fullName}`}
                          activeOpacity={0.82}
                          disabled={busyId !== null}
                          onPress={() => {
                            setRowError(null)
                            setConfirmingId(client.id)
                          }}
                          className="min-h-hit-min shrink-0 flex-row items-center justify-center gap-space-2 rounded-control border border-default bg-surface-card px-space-4"
                          style={busyId !== null ? { opacity: 0.5 } : null}
                        >
                          <Archive size={14} color={theme.foreground} />
                          <Text style={TYPE.label} className="text-strong">
                            Archivar
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Confirmación INLINE (no `Alert` nativo): el sheet vive dentro del modal del alta y
                        un diálogo del sistema encima de dos ventanas es una trampa de foco. */}
                    {confirming && !done ? (
                      <View className="gap-space-3 border-t border-subtle pt-space-3">
                        <Text style={TYPE.caption} className="text-muted">
                          {client.fullName} dejará de contar en tu cupo y perderá el acceso a su app. Su historial queda
                          intacto y puedes desarchivarlo cuando quieras.
                        </Text>
                        <View className="flex-row gap-space-3">
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Cancelar"
                            activeOpacity={0.82}
                            disabled={busy}
                            onPress={() => setConfirmingId(null)}
                            className="min-h-hit-min flex-1 items-center justify-center rounded-control border border-default bg-surface-card"
                            style={busy ? { opacity: 0.5 } : null}
                          >
                            <Text style={TYPE.label} className="text-strong">
                              Cancelar
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`archive-free-space-confirm-${client.id}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Confirmar archivar a ${client.fullName}`}
                            accessibilityState={{ busy }}
                            activeOpacity={0.82}
                            disabled={busyId !== null}
                            onPress={() => void handleArchive(client)}
                            className="min-h-hit-min flex-1 flex-row items-center justify-center gap-space-2 rounded-control bg-cta-fill"
                            style={busyId !== null ? { opacity: 0.5 } : null}
                          >
                            {busy ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : null}
                            <Text style={TYPE.label} className="text-on-sport">
                              {busy ? 'Archivando…' : 'Sí, archivar'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )
              })
            : null}
        </ScrollView>

        {freed > 0 ? (
          <Button
            testID="archive-free-space-back"
            label="Volver a agregar alumno"
            variant="sport"
            full
            disabled={busyId !== null}
            onPress={onFreed}
          />
        ) : null}
      </MotiView>
    </View>
  )
}
