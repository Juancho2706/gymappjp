import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Trophy } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getSantiagoIsoYmdForUtcInstant } from '../../../lib/date-utils'
import { getPersonalRecords } from '../../../lib/history.queries'
import { Card } from '../../Card'
import { PRDetailSheet } from './PRDetailSheet'

interface PR { exerciseId: string; exerciseName: string; weightKg: number; achievedAt: string }

const FRESH_MS = 14 * 86400000

function fmtShort(iso: string): string {
  const ymd = getSantiagoIsoYmdForUtcInstant(iso)
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * §10 PersonalRecordsCard (web `records/PersonalRecordsCard.tsx` + List): card
 * OSCURA (inverse) "Records personales" (trophy) + grilla 2-col de PRs (kg grande
 * sport + lift + fecha + badge NUEVO reciente). Tap → PRDetailSheet (E1-04). Null
 * si no hay records.
 */
export function PersonalRecordsCard({ clientId, onTecnica }: { clientId: string; onTecnica: (name: string) => void }) {
  const { theme } = useTheme()
  const [prs, setPrs] = useState<PR[] | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PR | null>(null)

  useEffect(() => {
    getPersonalRecords(clientId).then((data) => setPrs(data as PR[]))
  }, [clientId])

  if (prs == null || prs.length === 0) return null

  return (
    <Card variant="inverse" padding="md">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Trophy size={13} color="#7FB2FF" strokeWidth={2.4} />
        <Text className="text-sport-400" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Records personales</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {prs.slice(0, 4).map((pr) => {
          const fresh = Date.now() - new Date(pr.achievedAt).getTime() < FRESH_MS
          return (
            <TouchableOpacity
              key={`${pr.exerciseId}-${pr.achievedAt}`}
              testID={`pr-tile-${pr.exerciseId}`}
              onPress={() => { setSelected(pr); setOpen(true) }}
              activeOpacity={0.8}
              style={{ width: '47.5%', flexGrow: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}
            >
              {fresh ? (
                <View className="bg-cta-fill" style={{ position: 'absolute', right: 8, top: 8, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ color: '#fff', fontFamily: FONT.displayBlack, fontSize: 8, letterSpacing: 0.3 }}>NUEVO</Text>
                </View>
              ) : null}
              <Text className="text-sport-500" style={{ fontFamily: FONT.displayBlack, fontSize: 19, fontVariant: ['tabular-nums'] }}>
                {pr.weightKg}<Text className="text-on-dark-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 10 }}> kg</Text>
              </Text>
              <Text className="text-on-dark-muted" numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 11 }}>{pr.exerciseName}</Text>
              <Text className="text-on-dark-muted" style={{ fontSize: 10, opacity: 0.7 }}>{fmtShort(pr.achievedAt)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <PRDetailSheet
        open={open}
        onClose={() => setOpen(false)}
        clientId={clientId}
        exerciseId={selected?.exerciseId ?? null}
        exerciseName={selected?.exerciseName ?? 'Ejercicio'}
        fallbackWeight={selected?.weightKg ?? null}
        onTecnica={onTecnica}
      />
    </Card>
  )
}
