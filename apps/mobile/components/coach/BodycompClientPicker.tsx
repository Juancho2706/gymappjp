import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Search, UserPlus } from 'lucide-react-native'
import type { CardioClientRow } from '../../lib/cardio-coach'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../Button'
import { Input } from '../Input'

/**
 * Selector de alumno para Composición corporal (Ola de orden W3.3).
 *
 * Venía de `app/coach/tools.tsx` (`StudentPicker`), que W3.4 convirtió en redirect: la composición
 * corporal es el ÚNICO dominio sin pantalla propia — se mide a UNA persona a la vez, así que su
 * enlace «Abrir» de «Funciones» necesita elegir alumno antes de navegar. Mismo comportamiento que
 * tenía el launcher: búsqueda por nombre, y con 0 alumnos NUNCA crashea (CTA a crear alumno; el
 * bug web de módulos con 0 alumnos no se hereda).
 *
 * Colores por `useTheme()` / clases del DS: ningún hex de marca acá.
 */
export function BodycompClientPicker({
  clients,
  loading,
  onPick,
  onCreate,
}: {
  clients: CardioClientRow[]
  loading: boolean
  onPick: (id: string) => void
  onCreate: () => void
}) {
  const { theme } = useTheme()
  const [q, setQ] = useState('')

  const list = useMemo(
    () => clients.filter((c) => (c.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase())),
    [clients, q],
  )

  if (!loading && clients.length === 0) {
    // Empty-state 0 alumnos: NO crash — CTA a crear alumno.
    return (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
        <Text className="font-sans text-muted" style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>
          Aún no tienes alumnos. Agrega uno para tomar mediciones de composición corporal.
        </Text>
        <Button
          label="Crear alumno"
          variant="sport"
          leftIcon={UserPlus}
          onPress={onCreate}
          testID="funciones-picker-create"
        />
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <Input
        testID="funciones-picker-search"
        leftIcon={Search}
        placeholder="Buscar alumno…"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <Text className="font-sans text-muted" style={{ fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
          Cargando alumnos…
        </Text>
      ) : list.length === 0 ? (
        <Text className="font-sans text-muted" style={{ fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
          Sin resultados
        </Text>
      ) : (
        list.map((c) => (
          <Pressable
            key={c.id}
            testID={`funciones-picker-client-${c.id}`}
            accessibilityRole="button"
            onPress={() => onPick(c.id)}
            className="flex-row items-center"
            style={{ gap: 12, paddingVertical: 10 }}
          >
            <View className="items-center justify-center rounded-full bg-ink-900" style={{ width: 38, height: 38 }}>
              <Text className="font-display-bold text-sport-400" style={{ fontSize: 14 }}>
                {(c.full_name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text className="font-sans-bold text-strong" style={{ flex: 1, fontSize: 14.5 }} numberOfLines={1}>
              {c.full_name ?? 'Alumno'}
            </Text>
            <ChevronRight size={16} strokeWidth={2} color={theme.ink300} />
          </Pressable>
        ))
      )}
    </View>
  )
}
