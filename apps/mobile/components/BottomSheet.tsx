import { forwardRef, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import BottomSheetPrimitive, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet'
import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface BottomSheetProps {
  title?: string
  children: ReactNode
  snapPoints?: string[]
}

export const BottomSheet = forwardRef<BottomSheetModal, BottomSheetProps>(function BottomSheet(
  { title, children, snapPoints },
  ref
) {
  const { theme } = useTheme()
  const points = useMemo(() => snapPoints ?? ['45%', '85%'], [snapPoints])

  return (
    <BottomSheetPrimitive
      ref={ref}
      index={-1}
      snapPoints={points}
      enablePanDownToClose
      backdropComponent={(props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.42} />
      )}
      backgroundStyle={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {title ? (
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {title}
            </Text>
          </View>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheetPrimitive>
  )
})

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 32, gap: 14 },
  header: { paddingTop: 6 },
  title: { fontSize: 20, letterSpacing: -0.3 },
})
