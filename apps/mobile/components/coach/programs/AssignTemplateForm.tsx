import { Pressable, ScrollView, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { Button } from '../../Button'
import { Input } from '../../Input'
import { FONT, textStyle } from '../../../lib/typography'
import { themedIcon } from './themed-icon'
import type { ClientLite, ProgramItem } from './program-model'

const IconCheck = themedIcon(Check)

const T_DESC = textStyle('xs', FONT.ui, { lh: 'normal' })
const T_NAME = textStyle('xs', FONT.uiBold)
const T_META = textStyle('2xs', FONT.ui, { lh: 'snug' })

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
  return (
    <View className="gap-space-4">
      <Text style={T_DESC} className="text-muted">
        Copia la plantilla como programa activo para cada alumno. Si ya tiene un plan activo, se desactiva y se conserva el historial.
      </Text>

      <Input
        label="Duracion (semanas)"
        value={durationWeeks}
        onChangeText={onDurationChange}
        keyboardType="number-pad"
        placeholder="4"
      />

      <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {clients.map((client) => {
          const selected = selectedClientIds.includes(client.id)
          const activePlan = (client.workout_programs ?? []).find((p) => p.is_active)
          return (
            <Pressable
              key={client.id}
              onPress={() => onToggleClient(client.id)}
              testID={`assign-client-${client.id}`}
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

      <View className="flex-row gap-space-3 pt-[2px]">
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button
          label={busy ? 'Asignando...' : `Asignar ${selectedClientIds.length || ''}`.trim()}
          variant="sport"
          onPress={onConfirm}
          disabled={busy || !selectedClientIds.length || !program.workout_plans?.length}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  )
}
