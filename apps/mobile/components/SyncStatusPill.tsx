import { ActivityIndicator, Text, View } from 'react-native'
import { CheckCircle2, RefreshCw } from 'lucide-react-native'
import { FONT, textStyle } from '../lib/typography'

/**
 * SyncStatusPill — offline-queue status chip (EVA DS re-skin, patron A).
 *
 * Pending state = brand/sport accent, synced state = success accent. Fills and
 * borders use DS token utilities (className) so light/dark resolve at runtime;
 * no `theme` object. lucide/ActivityIndicator need literal color strings, so
 * they use the DS hex mirrors of sport-500 / success-500.
 */
const SPORT_500 = '#2680FF' // DS --color-sport-500 / --color-brand (rgb 38 128 255)
const SUCCESS_500 = '#1FB877' // DS --color-success-500 (rgb 31 184 119)

interface SyncStatusPillProps {
  pending?: number
  syncing?: boolean
}

export function SyncStatusPill({ pending = 0, syncing }: SyncStatusPillProps) {
  const hasPending = pending > 0

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
        hasPending ? 'border-sport-500/40 bg-sport-500/10' : 'border-success-500/25 bg-success-500/10'
      }`}
    >
      {syncing ? (
        <ActivityIndicator size="small" color={SPORT_500} />
      ) : hasPending ? (
        <RefreshCw size={13} color={SPORT_500} />
      ) : (
        <CheckCircle2 size={13} color={SUCCESS_500} />
      )}
      <Text
        className={hasPending ? 'text-sport-700' : 'text-success-700'}
        style={[textStyle('3xs', FONT.uiBold), { letterSpacing: 0.2 }]}
      >
        {syncing ? 'Sync' : hasPending ? `${pending} pendientes` : 'Sincronizado'}
      </Text>
    </View>
  )
}
