import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Check, Search } from 'lucide-react-native'
import { Button } from '../../Button'
import { Input } from '../../Input'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { clampAssignDurationWeeks } from '../../../lib/assign-clients-options'
import { themedIcon } from './themed-icon'
import {
  assignTemplateButtonLabel,
  filterAssignClients,
  showsAssignClientSearch,
  type ClientLite,
  type ProgramItem,
} from './program-model'

const IconCheck = themedIcon(Check)

const T_DESC = textStyle('xs', FONT.ui, { lh: 'normal' })
const T_NAME = textStyle('xs', FONT.uiBold)
const T_META = textStyle('2xs', FONT.ui, { lh: 'snug' })

/**
 * Asignar una plantilla a alumnos (biblioteca de programas).
 *
 * Orden = web (`WorkoutProgramsClient.tsx`): alumnos primero (buscador si hay más de 5, lista
 * con checkbox), duración al pie. La selección vive en el padre y NO se pierde al filtrar: el
 * contador del botón cuenta marcados, no visibles.
 *
 * Focus-hop (ver `Input.tsx`): el buscador es el `Input` del DS con ícono fijo; nada cambia de
 * forma al enfocar ni al escribir (el botón de limpiar es el nativo de iOS, `clearButtonMode`).
 */
export function AssignTemplateForm({
  program,
  clients,
  selectedClientIds,
  durationWeeks,
  busy,
  onToggleClient,
  onDurationChange,
  onCancel,
  onConfirm,
}: {
  program: ProgramItem
  clients: ClientLite[]
  selectedClientIds: string[]
  durationWeeks: string
  busy: boolean
  onToggleClient: (clientId: string) => void
  onDurationChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const [search, setSearch] = useState('')
  const showSearch = showsAssignClientSearch(clients.length)
  const visibleClients = showSearch ? filterAssignClients(clients, search) : clients
  const selectedCount = selectedClientIds.length

  return (
    <View className="gap-space-4">
      <Text style={T_DESC} className="text-muted">
        Copia la plantilla como programa activo para cada alumno. Si ya tiene un plan activo, se desactiva y se conserva el historial.
      </Text>

      <View className="gap-space-2">
        <Text style={TYPE.eyebrow} className="text-muted">Alumnos</Text>
        {showSearch ? (
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar alumno…"
            leftIcon={Search}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Buscar alumno"
            testID="assign-client-search"
          />
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {visibleClients.length === 0 ? (
          <Text style={T_DESC} className="py-space-4 text-center text-muted">
            {clients.length === 0 ? 'Sin alumnos.' : 'No se encontraron alumnos.'}
          </Text>
        ) : null}
        {visibleClients.map((client) => {
          const selected = selectedClientIds.includes(client.id)
          const activePlan = (client.workout_programs ?? []).find((p) => p.is_active)
          return (
            <Pressable
              key={client.id}
              onPress={() => onToggleClient(client.id)}
              testID={`assign-client-${client.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              className={`flex-row items-center gap-space-3 rounded-lg border p-space-3 active:opacity-80 ${
                selected ? 'border-sport-500/55 bg-sport-100 dark:bg-sport-100/20' : 'border-subtle bg-surface-sunken'
              }`}
            >
              <View
                className={`h-6 w-6 items-center justify-center rounded-md border ${
                  selected ? 'border-sport-500 bg-sport-500' : 'border-default'
                }`}
              >
                {selected ? <IconCheck size={15} className="text-on-sport" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} style={T_NAME} className="text-strong">
                  {client.full_name}
                </Text>
                <Text numberOfLines={1} style={T_META} className={activePlan ? 'text-warning-600' : 'text-muted'}>
                  {activePlan ? `Sobrescribe: ${activePlan.name}` : 'Sin programa activo'}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      <View className="flex-row items-center justify-between gap-space-3 border-t border-subtle pt-space-3">
        <View className="min-w-0 flex-1">
          <Text style={TYPE.label} className="text-strong">Duración (semanas)</Text>
          <Text style={T_META} className="text-muted">Entre 1 y 52</Text>
        </View>
        <Input
          value={durationWeeks}
          onChangeText={(value) => onDurationChange(value.replace(/[^0-9]/g, ''))}
          onBlur={() => onDurationChange(String(clampAssignDurationWeeks(durationWeeks)))}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="4"
          textAlign="center"
          accessibilityLabel="Duración en semanas, entre 1 y 52"
          containerStyle={{ width: 96 }}
          testID="assign-duration-weeks"
        />
      </View>

      <View className="flex-row gap-space-3 pt-[2px]">
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button
          label={assignTemplateButtonLabel(selectedCount, busy)}
          variant="sport"
          onPress={onConfirm}
          disabled={busy || selectedCount === 0 || !program.workout_plans?.length}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  )
}
