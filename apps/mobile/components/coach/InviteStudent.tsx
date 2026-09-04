import { useCallback, useEffect, useRef, useState } from 'react'
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { cssInterop } from 'nativewind'
import { Check, Copy, Link2, Share2, type LucideIcon } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { toast } from '../Toast'
import { useTheme } from '../../context/ThemeContext'
import { normalizeInviteCode, studentAppUrl, studentLoginUrl } from '../../lib/student-links'
import { FONT } from '../../lib/typography'

/**
 * Invitar alumno — el código del coach en el dashboard (espejo del bloque web
 * `_components/invite/`). Vive en su propio archivo a propósito: `CoachDashboardSections`
 * ya pasa las 3.700 líneas y este bloque tiene estado, portapapeles y hoja propios.
 *
 * El código (5 caracteres, permanente) solo se veía en Ajustes → Mi Marca; el coach que
 * quería sumar un alumno tenía que salir del panel para leerlo. Acá queda a un toque:
 *  - `InviteCodePill`: pastilla siempre visible (código + copiar de un toque).
 *  - `InviteStudentSheet`: la hoja con el código en grande, link, compartir y QR.
 */

// El color del icono del chip lo maneja NativeWind (text-*) para que el estado copiado
// (success-700) flipee en dark igual que el resto del DS.
for (const Icon of [Check, Copy, Link2]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Cuánto dura el estado "Copiado" antes de volver a "Copiar". */
const COPIED_RESET_MS = 1600

/**
 * Superficie teñida con la marca del coach. Alfas en hex sobre `theme.primary` (mismo
 * recurso que el resto del dashboard) — 9%/26% en claro, 20%/34% en oscuro, donde el
 * tinte tiene que empujar más para separarse del fondo.
 */
function brandTint(primary: string, dark: boolean) {
  return {
    backgroundColor: primary + (dark ? '33' : '17'),
    borderColor: primary + (dark ? '57' : '42'),
  }
}

/**
 * Feedback de copiado INLINE (chip verde con check) en vez de toast: el toast sería doble
 * feedback sobre un botón que ya cambia solo. El toast queda reservado para el fallo.
 * `key` distingue qué se copió (código / link) para que dos botones no se enciendan juntos.
 */
function useCopyFeedback(onError?: (message: string) => void) {
  const [copied, setCopied] = useState<Record<string, true>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Un setState después del unmount es un warning real en RN: los timeouts se cancelan siempre.
  useEffect(
    () => () => {
      for (const t of Object.values(timers.current)) clearTimeout(t)
    },
    [],
  )

  const copy = useCallback(
    async (key: string, value: string, failMessage: string) => {
      try {
        await Clipboard.setStringAsync(value)
      } catch {
        // `onError` gana cuando el llamador vive dentro de un modal nativo: ahí el toast se
        // pinta en la ventana de la activity, DEBAJO del modal, y no lo ve nadie.
        if (onError) onError(failMessage)
        else toast.error(failMessage)
        return
      }
      // Un temporizador POR CLAVE: copiar el link no puede apagar el "Código copiado" que el
      // coach acaba de encender (la web mantiene los dos prendidos, `useCopiedFlag` ×2).
      setCopied((prev) => ({ ...prev, [key]: true }))
      if (timers.current[key]) clearTimeout(timers.current[key])
      timers.current[key] = setTimeout(() => {
        setCopied((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        delete timers.current[key]
      }, COPIED_RESET_MS)
    },
    [onError],
  )

  return { copied, copy }
}

/**
 * Pastilla del dashboard: etiqueta + código + chip de copiar. Tocar la zona del código
 * abre la hoja completa; el chip copia sin abrir nada.
 *
 * Sin código válido NO se pinta nada (ni placeholder ni pastilla vacía): solo pasa en el
 * primerísimo render de un coach recién creado, antes de que el layout de `/coach` le
 * genere el código con `ensureCoachPublicCode`.
 */
export function InviteCodePill({ inviteCode }: { inviteCode?: string | null }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const { copied, copy } = useCopyFeedback()

  const code = normalizeInviteCode(inviteCode)
  if (!code) return null

  const isCopied = !!copied.code
  const tint = brandTint(theme.primary, theme.scheme === 'dark')

  return (
    <>
      <View style={[styles.pill, tint]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Invitar alumno"
          style={styles.pillIdentity}
        >
          <Text style={[styles.pillLabel, { color: theme.primary }]}>TU CÓDIGO</Text>
          <Text className="text-strong" style={styles.pillCode} numberOfLines={1}>
            {code}
          </Text>
        </TouchableOpacity>

        {/* El área tocable es TODO el alto de la pastilla, no los 28px del chip: en RN el hitSlop
            nunca se extiende más allá del borde del padre, así que sumarle margen al chip no
            agrandaba nada — el toque caía en el ScrollView y no pasaba nada. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => void copy('code', code, 'No pudimos copiar el código.')}
          accessibilityRole="button"
          accessibilityLabel="Copiar tu código de invitación"
          hitSlop={{ left: 6, right: 6 }}
          style={styles.chipHit}
        >
          <View
            className={isCopied ? 'bg-success-100' : ''}
            style={[styles.chip, isCopied ? null : { backgroundColor: theme.primary }]}
          >
            {isCopied ? (
              <Check size={14} strokeWidth={2.1} className="text-success-700" />
            ) : (
              <Copy size={14} strokeWidth={2.1} className="text-on-sport" />
            )}
            <Text className={isCopied ? 'text-success-700' : 'text-on-sport'} style={styles.chipLabel}>
              {isCopied ? 'Copiado' : 'Copiar'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <InviteStudentSheet open={open} onClose={() => setOpen(false)} inviteCode={code} />
    </>
  )
}

/**
 * Hoja "Invitar alumno": el código en grande + las tres salidas (copiar código, copiar
 * link, compartir) + el QR para el que tiene al alumno al lado.
 */
export function InviteStudentSheet({
  open,
  onClose,
  inviteCode,
}: {
  open: boolean
  onClose: () => void
  inviteCode: string
}) {
  const { theme } = useTheme()
  // El aviso de fallo va INLINE, no por toast: esta hoja es `nativeModal`, o sea una ventana del
  // SO propia, y el <Toaster/> vive en el árbol raíz con `position:absolute; bottom:0` — el toast
  // se pinta DETRÁS del panel de la hoja y no lo ve nadie. El de la pastilla sí se ve porque la
  // pastilla no vive en un modal.
  const [error, setError] = useState<string | null>(null)
  const { copied, copy } = useCopyFeedback(setError)

  const code = inviteCode.trim()
  const loginUrl = studentLoginUrl(code)
  // El de compartir va SIN `/login`: es la portada del coach, que ya empuja a la app.
  const shareUrl = studentAppUrl(code)
  const tint = brandTint(theme.primary, theme.scheme === 'dark')

  async function share() {
    try {
      // El código viaja en SU PROPIA LINEA: pegado al final de la URL, el punto que cerraba
      // la frase se colaba DENTRO del enlace en varios clientes y al alumno le llegaba un
      // link roto (reporte de un coach, 2026-08-12). `url` además del texto porque iOS arma
      // la actividad de enlace con ese campo y Android lo ignora.
      await Share.share({ message: `Entrena conmigo: ${shareUrl}\nTu código: ${code}`, url: shareUrl })
    } catch {
      // Nunca mudo: si el menú no abre, el coach vería un botón que no hace nada.
      setError('No pudimos abrir el menú para compartir. Copia el link de arriba.')
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      accessibilityLabel="Invitar alumno"
    >
      {/* `paddingRight` = la X de cierre del Sheet flota arriba a la derecha. */}
      <View style={styles.sheetHead}>
        <Text className="text-strong" style={styles.sheetTitle}>
          Invitar alumno
        </Text>
        <Text className="text-muted" style={styles.sheetSubtitle}>
          Tu alumno entra desde el navegador con tu link o desde la app en iOS. No necesita instalar nada.
        </Text>
      </View>

      <View style={[styles.codeBox, tint, { borderRadius: theme.radius.control }]}>
        <Text className="text-strong" style={styles.codeBig} numberOfLines={1}>
          {code}
        </Text>
        <Text style={[styles.codeFoot, { color: theme.primary }]}>
          TU CÓDIGO ES PERMANENTE
        </Text>
      </View>

      {/* Los dos de copiar NO usan <Button>: su estado copiado tiene que ponerse verde igual que
          en la web, y el relleno del primario tiene que ser `theme.primary` (el mismo del chip de
          la pastilla) y no el `cta-fill` de la variante sport, que es un paso más oscuro de la
          rampa. Con dos azules distintos a un toque de distancia no parece la misma marca. */}
      <View style={styles.actions}>
        <SheetAction
          copied={!!copied.code}
          icon={copied.code ? Check : Copy}
          label={copied.code ? 'Código copiado' : 'Copiar código'}
          tone="primary"
          brand={theme.primary}
          onPress={() => void copy('code', code, 'No pudimos copiar el código.')}
        />
        <SheetAction
          copied={!!copied.link}
          icon={copied.link ? Check : Link2}
          label={copied.link ? 'Link copiado' : 'Copiar link'}
          tone="outline"
          brand={theme.primary}
          borderColor={theme.border}
          onPress={() => void copy('link', loginUrl, 'No pudimos copiar el link.')}
        />
        <Button variant="ghost" full leftIcon={Share2} label="Compartir" onPress={() => void share()} />
      </View>

      {error ? (
        <Text style={[styles.errorLine, { color: theme.destructive }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.qrRow}>
        {/* Fondo blanco EXPLICITO: en dark el QR sobre la superficie oscura no lo lee ninguna cámara. */}
        <View
          className="border-subtle"
          style={[styles.qrFrame, { borderRadius: theme.radius.sm }]}
        >
          <QRCode value={loginUrl} size={76} backgroundColor="#FFFFFF" color="#0F172A" />
        </View>
        <View style={styles.qrCopy}>
          <Text className="text-strong" style={styles.qrTitle}>
            O que lo escanee
          </Text>
          <Text className="text-muted" style={styles.qrText}>
            La cámara lo lleva a tu app con el código ya puesto.
          </Text>
        </View>
      </View>
    </Sheet>
  )
}

/**
 * Botón de la hoja. Existe porque `<Button>` pinta su relleno con `CONTAINER_CLASS[variant]` y no
 * deja pisarlo, así que no puede ponerse verde al copiar ni tomar `theme.primary` exacto.
 */
function SheetAction({
  copied,
  icon: Icon,
  label,
  tone,
  brand,
  borderColor,
  onPress,
}: {
  copied: boolean
  icon: LucideIcon
  label: string
  tone: 'primary' | 'outline'
  brand: string
  borderColor?: string
  onPress: () => void
}) {
  const fill = copied ? null : tone === 'primary' ? { backgroundColor: brand } : { borderWidth: 1, borderColor }
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={copied ? 'bg-success-100' : tone === 'outline' ? 'bg-surface-card' : ''}
      style={[styles.sheetAction, fill]}
    >
      <Icon size={17} strokeWidth={2.1} color={copied ? undefined : tone === 'primary' ? '#FFFFFF' : brand} className={copied ? 'text-success-700' : undefined} />
      <Text
        className={copied ? 'text-success-700' : tone === 'outline' ? 'text-body' : ''}
        style={[styles.sheetActionLabel, copied || tone === 'outline' ? null : { color: '#FFFFFF' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
  },
  sheetActionLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 15,
    letterSpacing: -0.15,
  },

  errorLine: {
    fontFamily: FONT.uiSemibold,
    fontSize: 12.5,
    lineHeight: 17,
    paddingTop: 10,
    textAlign: 'center',
  },

  // ── Pastilla ─────────────────────────────────────────────────────────────
  pill: {
    // Ancho completo como la web (`h-10 w-full`) y como el resto de las tarjetas de la columna.
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // 44 y no 40: es el mínimo tocable, y en RN el hitSlop del chip NUNCA se extiende más allá del
    // borde del padre — con 40 el área real del chip topaba en 38. La web usa el mismo alto (h-11).
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 13,
    paddingRight: 6,
  },
  pillIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    // La zona del código abre la hoja: el alto completo de la pastilla es tocable.
    height: '100%',
  },
  pillLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    letterSpacing: 0.63, // 0.06em · 10.5
    textTransform: 'uppercase',
  },
  pillCode: {
    fontFamily: FONT.monoBold,
    fontSize: 15,
    letterSpacing: 3, // 0.2em · 15
  },
  chipHit: {
    height: '100%',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 11,
  },
  chipLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 12.5,
  },

  // ── Hoja ─────────────────────────────────────────────────────────────────
  sheetHead: {
    gap: 6,
    paddingTop: 4,
    paddingRight: 44,
  },
  sheetTitle: {
    fontFamily: FONT.displayBlack,
    fontSize: 21,
    letterSpacing: -0.53, // -0.025em · 21
  },
  sheetSubtitle: {
    fontFamily: FONT.ui,
    fontSize: 13.5,
    lineHeight: 19,
  },
  codeBox: {
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  codeBig: {
    fontFamily: FONT.monoBold,
    fontSize: 36,
    letterSpacing: 8.64, // 0.24em · 36
    textAlign: 'center',
    // El letter-spacing de RN también se agrega DESPUES del último glifo, así que un texto
    // centrado queda corrido a la izquierda; el padding simétrico lo recentra.
    paddingLeft: 8.64,
  },
  codeFoot: {
    // 11.5 y teñido con la marca, igual que la web: acá era 10px en gris apagado y la misma hoja
    // no se leía como el mismo bloque en las dos superficies.
    fontFamily: FONT.uiExtra,
    fontSize: 11.5,
    letterSpacing: 0.69, // 0.06em · 11.5
    textTransform: 'uppercase',
  },
  actions: {
    gap: 10,
  },
  divider: {
    height: 1,
  },
  qrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    padding: 7,
    borderWidth: 1,
  },
  qrCopy: {
    flex: 1,
    gap: 4,
  },
  qrTitle: {
    fontFamily: FONT.uiBold,
    fontSize: 13,
  },
  qrText: {
    fontFamily: FONT.ui,
    fontSize: 12,
    lineHeight: 17,
  },
})
