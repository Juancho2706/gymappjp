import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, TouchableOpacity, View } from 'react-native'
import { Share2, Trophy } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { useTheme } from '../../../context/ThemeContext'
import { resolveSportRamp } from '../../../lib/theme'
import { FONT } from '../../../lib/typography'
import { getSantiagoIsoYmdForUtcInstant } from '../../../lib/date-utils'
import { getPersonalRecords } from '../../../lib/history.queries'
import { Card } from '../../Card'
import { PRDetailSheet, RecordShareCard } from './PRDetailSheet'

// className→color del glyph Share2 del atajo de compartir (patron cssInterop del repo para
// lucide, mismo que PRDetailSheet.tsx:23 con Trophy): la card es `inverse` (oscura en ambos
// esquemas) ⇒ el icono usa el token on-dark, nunca un hex de esquema.
cssInterop(Share2, { className: { target: 'style', nativeStyleToProp: { color: true } } })

interface PR { exerciseId: string; exerciseName: string; weightKg: number; achievedAt: string }

// Ventana de frescura del badge NUEVO = ULTIMAS 24 h, espejo del data-layer web
// (dashboard.queries.ts:286,346,359 calcula `fresh` con dayMs = 24h). Antes 14 dias.
const FRESH_MS = 24 * 3600000

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
  const { branding } = useTheme()
  // El texto de al lado ya es `text-sport-400` (dinámico por marca); el glyph lucide toma `color`
  // literal, así que se resuelve el MISMO escalón de la rampa del coach con `resolveSportRamp`
  // (misma fuente que las vars --color-sport-* de NativeWind) en vez del azul EVA fijo.
  const sport400 = useMemo(() => resolveSportRamp(branding?.primaryColor).sport400, [branding?.primaryColor])
  const [prs, setPrs] = useState<PR[] | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PR | null>(null)
  // Atajo de 1 tap (QA-5 FIX-5): estado propio (dato pegajoso + flag de visibilidad, mismo par
  // `selected`/`open` del sheet) para que la tarjeta conserve su contenido durante el fade de
  // salida del preview y para no perturbar el PR seleccionado del PRDetailSheet.
  const [sharePr, setSharePr] = useState<PR | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    getPersonalRecords(clientId).then((data) => setPrs(data as PR[]))
  }, [clientId])

  if (prs == null || prs.length === 0) return null

  return (
    <Card variant="inverse" padding="md">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {/* Trophy hereda text-sport-400 del web (currentColor) con strokeWidth default 2. */}
        <Trophy size={13} color={sport400} />
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
              // flexBasis/maxWidth 47.5% (sin flexGrow) espeja `grid grid-cols-2`: un tile impar
              // ocupa media fila en vez de estirarse a 100%. rounded-control (14) via className.
              className="rounded-control"
              style={{ flexBasis: '47.5%', maxWidth: '47.5%', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}
            >
              {fresh ? (
                <View className="bg-cta-fill" style={{ position: 'absolute', right: 8, top: 8, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ color: '#fff', fontFamily: FONT.uiExtra, fontSize: 8, letterSpacing: 0.24 }}>NUEVO</Text>
                </View>
              ) : null}
              <Text className="text-sport-500" style={{ fontFamily: FONT.displayBlack, fontSize: 19, fontVariant: ['tabular-nums'] }}>
                {pr.weightKg}<Text className="text-on-dark-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 10 }}> kg</Text>
              </Text>
              <Text className="text-on-dark-muted" numberOfLines={2} style={{ fontFamily: FONT.uiSemibold, fontSize: 11, lineHeight: 14 }}>{pr.exerciseName}</Text>
              <Text className="text-on-dark-muted" style={{ fontFamily: FONT.ui, fontSize: 10, opacity: 0.7, fontVariant: ['tabular-nums'] }}>{fmtShort(pr.achievedAt)}</Text>

              {/* Atajo de 1 tap a la tarjeta compartible (CEO QA-5): salta el PRDetailSheet y abre
                  DIRECTO el preview de la share-card. El tap normal del tile sigue abriendo el
                  detalle. Esquina inferior derecha porque la superior la ocupa el badge NUEVO;
                  hitSlop 12 para llegar al mínimo táctil sin agrandar el glyph. Pressable anidado:
                  captura el toque antes que el TouchableOpacity del tile. */}
              <Pressable
                testID={`pr-share-${pr.exerciseId}`}
                accessibilityRole="button"
                accessibilityLabel={`Compartir record de ${pr.exerciseName}`}
                onPress={() => { setSharePr(pr); setShareOpen(true) }}
                hitSlop={12}
                style={({ pressed }) => ({ position: 'absolute', right: 6, bottom: 6, padding: 4, opacity: pressed ? 0.55 : 1 })}
              >
                <Share2 size={16} className="text-on-dark-muted" strokeWidth={2.2} />
              </Pressable>
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

      {/* Tarjeta compartible del atajo — MISMO componente que usa el sheet (cero lógica de tarjeta
          nueva) y mismo montaje: overlay hermano, nunca dentro de otro <Modal> RN. Sólo uno de los
          dos preview puede estar visible (el atajo vive en el tile, que queda detrás del sheet). */}
      <RecordShareCard
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        clientId={clientId}
        exerciseId={sharePr?.exerciseId ?? null}
        exerciseName={sharePr?.exerciseName ?? 'Ejercicio'}
        fallbackWeight={sharePr?.weightKg ?? null}
      />
    </Card>
  )
}
