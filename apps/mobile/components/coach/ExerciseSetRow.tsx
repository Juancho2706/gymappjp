import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { GripVertical, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

export interface ExerciseBlock {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  sets: string
  reps: string
  restTime: string
}

interface ExerciseSetRowProps {
  block: ExerciseBlock
  index: number
  onChange: (index: number, field: keyof ExerciseBlock, value: string) => void
  onRemove: (index: number) => void
}

export function ExerciseSetRow({ block, index, onChange, onRemove }: ExerciseSetRowProps) {
  const { theme } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.header}>
        <GripVertical size={16} color={theme.mutedForeground} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[styles.name, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} numberOfLines={1}>
            {block.exerciseName}
          </Text>
          <Text style={[styles.muscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {block.muscleGroup}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onRemove(index)} hitSlop={8} activeOpacity={0.7}>
          <X size={18} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.inputs}>
        <FieldInput
          label="Series"
          value={block.sets}
          onChangeText={(v) => onChange(index, 'sets', v)}
          keyboardType="number-pad"
          placeholder="3"
          theme={theme}
        />
        <FieldInput
          label="Reps"
          value={block.reps}
          onChangeText={(v) => onChange(index, 'reps', v)}
          placeholder="8-10"
          theme={theme}
        />
        <FieldInput
          label="Descanso"
          value={block.restTime}
          onChangeText={(v) => onChange(index, 'restTime', v)}
          placeholder="60s"
          theme={theme}
        />
      </View>
    </View>
  )
}

function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  theme,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  keyboardType?: 'number-pad' | 'default'
  theme: any
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboardType ?? 'default'}
        style={[styles.fieldInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, fontFamily: theme.fontSans }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14 },
  muscle: { fontSize: 11 },
  inputs: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  fieldInput: { height: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, fontSize: 13, textAlign: 'center' },
})
