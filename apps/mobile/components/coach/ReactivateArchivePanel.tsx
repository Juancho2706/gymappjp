import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Archive, Check, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../Button'
import { Card } from '../Card'
import { TYPE, textStyle, FONT } from '../../lib/typography'
import { deleteClient, setClientStatus, type ClientActionWorkspace } from '../../lib/client-actions'
import type { ReactivateArchiveClient } from '../../lib/coach-subscription'

interface Props {
  clients: ReactivateArchiveClient[]
  activeClientCount: number
  freeLimit: number
  workspace: ClientActionWorkspace
  /** Se llama tras archivar/eliminar para que la pantalla recomponga el conteo. */
  onChanged: () => void
}

/**
 * Panel de archivado dentro del muro de reactivacion — espejo RN de `ReactivateArchivePanel` web.
 *
 * Salida del deadlock de cupo: un coach bloqueado con MAS de `freeLimit` alumnos activos no puede
 * bajar a Free (el endpoint rechaza por cupo) y en mobile su unica alternativa era pagar desde el
 * navegador. Aca baja a <= freeLimit sin salir de la app y habilita "Continuar gratis".
 *
 * Dos salidas sobre la MISMA seleccion: archivar (reversible, default) o eliminar definitivamente
 * (borra cuenta + datos). El borrado exige confirmacion explicita.
 *
 * Ambas acciones reusan los endpoints mobile que ya existian (`PATCH`/`DELETE`
 * /api/mobile/coach/clients/[clientId]): no se agrega superficie de mutacion nueva.
 */
export function ReactivateArchivePanel({ clients, activeClientCount, freeLimit, workspace, onChanged }: Props) {
  const { theme } = useTheme()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toArchive = Math.max(0, activeClientCount - freeLimit)
  const remainingAfter = activeClientCount - selected.size
  const missing = Math.max(0, remainingAfter - freeLimit)

  const sorted = useMemo(
    () => [...clients].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
    [clients],
  )

  const toggle = (id: string) => {
    setError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Secuencial a proposito: cada PATCH dispara un correo transaccional al alumno y cada DELETE toca
  // GoTrue Admin + Storage. En paralelo un lote grande se comeria el rate limit.
  const runOverSelection = async (
    kind: 'archive' | 'delete',
    action: (id: string) => Promise<void>,
    failCopy: string,
  ) => {
    const targets = [...selected]
    if (targets.length === 0) return
    setBusy(kind)
    setError(null)
    let done = 0
    try {
      for (const id of targets) {
        await action(id)
        done += 1
      }
      setSelected(new Set())
      onChanged()
    } catch (err) {
      const base = err instanceof Error ? err.message : failCopy
      setError(`${base}${done > 0 ? ` (se completaron ${done} de ${targets.length}).` : ''}`)
      // Los ya procesados salen de la seleccion: reintentar no debe repetirlos (un DELETE repetido
      // responde 404 y volveria a cortar el lote en el mismo punto).
      if (done > 0) {
        setSelected(new Set(targets.slice(done)))
        onChanged()
      }
    } finally {
      setBusy(null)
    }
  }

  const handleArchive = () =>
    runOverSelection(
      'archive',
      (id) => setClientStatus(id, { is_archived: true }, workspace),
      'No se pudieron archivar los alumnos.',
    )

  const confirmDelete = () => {
    const n = selected.size
    Alert.alert(
      `¿Eliminar ${n} alumno${n !== 1 ? 's' : ''} definitivamente?`,
      'Se eliminarán sus cuentas y todos sus datos: rutinas, check-ins, fotos y progreso. A diferencia de archivar, esto no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, eliminar',
          style: 'destructive',
          onPress: () =>
            void runOverSelection(
              'delete',
              (id) => deleteClient(id, workspace),
              'No se pudieron eliminar los alumnos.',
            ),
        },
      ],
    )
  }

  return (
    <Card variant="default" padding={16} radius="card" style={styles.card}>
      <View style={styles.headerRow}>
        <Archive size={16} color={theme.primary} />
        <Text style={textStyle('md', FONT.uiBold)} className="text-strong">
          Volver al plan gratuito sin pagar
        </Text>
      </View>

      <Text style={[TYPE.caption, styles.intro]} className="text-muted">
        El plan gratuito cubre hasta {freeLimit} alumnos. Archiva {toArchive} alumno{toArchive !== 1 ? 's' : ''} para
        bajar a {freeLimit} y seguir gratis. Archivar no borra nada: puedes desarchivarlos cuando quieras. Si ya no
        vas a entrenarlos, también puedes eliminarlos definitivamente.
      </Text>

      <View style={styles.list}>
        {sorted.map((c) => {
          const checked = selected.has(c.id)
          return (
            <Pressable
              key={c.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={c.fullName}
              disabled={busy !== null}
              onPress={() => toggle(c.id)}
              style={[
                styles.row,
                {
                  borderColor: checked ? theme.primary : theme.border,
                  backgroundColor: checked ? `${theme.primary}1A` : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: checked ? theme.primary : theme.border,
                    backgroundColor: checked ? theme.primary : 'transparent',
                  },
                ]}
              >
                {checked ? <Check size={14} color={theme.primaryForeground} strokeWidth={3} /> : null}
              </View>
              <Text style={TYPE.body} className="text-strong" numberOfLines={1}>
                {c.fullName}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={[TYPE.caption, styles.counter]} className="text-muted">
        Seleccionados: {selected.size} · Quedarán {remainingAfter} activos
        {missing > 0 ? ` — te falta${missing !== 1 ? 'n' : ''} ${missing} para llegar a ${freeLimit}` : ''}
      </Text>

      {error ? (
        <View className="bg-danger-100" style={styles.errorBox}>
          <Text style={TYPE.caption} className="text-strong">
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          testID="reactivate-archive"
          label={busy === 'archive' ? 'Archivando…' : `Archivar ${selected.size > 0 ? `${selected.size} ` : ''}alumnos`}
          variant="primary"
          leftIcon={Archive}
          loading={busy === 'archive'}
          disabled={busy !== null || selected.size === 0}
          onPress={handleArchive}
          full
        />
        <Button
          testID="reactivate-delete"
          label="Eliminar seleccionados"
          variant="destructive"
          leftIcon={Trash2}
          loading={busy === 'delete'}
          disabled={busy !== null || selected.size === 0}
          onPress={confirmDelete}
          full
        />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intro: { lineHeight: 19 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { marginTop: 2 },
  errorBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { gap: 10 },
})
