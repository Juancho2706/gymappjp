import { Text, View } from 'react-native'
import { Button } from '../../Button'
import { Input } from '../../Input'
import { FONT, textStyle } from '../../../lib/typography'

const T_DESC = textStyle('xs', FONT.ui, { lh: 'normal' })

export function DuplicateForm({
  name,
  busy,
  onChangeName,
  onCancel,
  onConfirm,
}: {
  name: string
  busy: boolean
  onChangeName: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <View className="gap-space-4">
      <Text style={T_DESC} className="text-muted">
        Crea una copia reutilizable sin alumno asignado.
      </Text>
      <Input
        label="Nombre"
        value={name}
        onChangeText={onChangeName}
        placeholder="Nombre de la plantilla"
        autoCapitalize="sentences"
      />
      <View className="flex-row gap-space-3 pt-[2px]">
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button label={busy ? 'Duplicando...' : 'Duplicar'} variant="sport" onPress={onConfirm} disabled={busy} style={{ flex: 1 }} />
      </View>
    </View>
  )
}
