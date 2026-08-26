import { Text, View } from 'react-native'
import { cssInterop } from 'nativewind'
import { Check, EyeOff } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  DOMAIN_ENABLED_KEY,
  FEATURE_DOMAIN_KEYS,
  resolvePersonaPrefs,
  type FeatureDomain,
} from '@eva/feature-prefs'
import type { Persona } from '@eva/schemas'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { MI_PANEL_DOMAINS } from '../../lib/mi-panel'

/**
 * «Tu panel quedó listo 💪» — el acuse de recibo de «¿A qué te dedicas?» en la APP. Gemelo de
 * `apps/web/src/app/coach/guia/_components/PanelListoModal.tsx`: mismo copy, mismos chips, misma
 * matriz.
 *
 * Momento (pedido literal del owner): aparece INMEDIATAMENTE DESPUÉS de la elección, o sea al
 * aterrizar en la primera pantalla tras «Armar mi panel» — NO al terminar los cinco pasos. El coach
 * acaba de ver que el menú se le achicó y ésta es la única pantalla donde eso se explica antes de
 * que se lo pregunte. Una sola vez: el param que la abre muere con la navegación.
 *
 * Solo se muestra si la elección APAGÓ algo: con el escape `other` (panel completo) no hay nada que
 * avisar y el componente se borra solo. El guard vive también en quien arma el param
 * (`onboarding/persona.tsx`); acá es defensa en profundidad.
 *
 * Los chips salen de la MISMA matriz que se persistió en `coach_feature_prefs`
 * (`resolvePersonaPrefs`), no de una lista paralela que se desincronice, y las etiquetas de
 * `MI_PANEL_DOMAINS` — las mismas que el coach va a ver en Opciones › Mi panel cuando siga el CTA.
 *
 * Se monta sobre `Sheet` con `nativeModal`: esta hoja se presenta EN EL MISMO FRAME en que aterriza
 * una pantalla nueva, que es exactamente el cold-start donde el contenedor de @gorhom todavía mide
 * -999 y el sheet nace fuera de pantalla (ver el bloque `nativeModal` de `components/Sheet.tsx`).
 * Un aviso que no se ve es peor que no darlo.
 */

for (const Icon of [Check, EyeOff]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Etiqueta humana por dominio — la MISMA que pinta Opciones › Mi panel. */
const DOMAIN_LABEL: Record<FeatureDomain, string> = Object.fromEntries(
  MI_PANEL_DOMAINS.map((meta) => [meta.domain, meta.label]),
) as Record<FeatureDomain, string>

/** «A», «A y B», «A, B y C» — enumeración latam sin coma de Oxford. */
export function enumerate(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export function PanelReadySheet({
  open,
  persona,
  alsoOther,
  onClose,
  onGoMiPanel,
}: {
  open: boolean
  persona: Persona
  /** `coaches.persona_also_other`: la segunda pregunta de la pantalla de persona. */
  alsoOther: boolean
  onClose: () => void
  /** «Ir a Mi panel» — el host cierra y navega a Opciones › Mi panel. */
  onGoMiPanel: () => void
}) {
  const prefs = resolvePersonaPrefs(persona, alsoOther)
  const shown = FEATURE_DOMAIN_KEYS.filter((domain) => prefs[domain][DOMAIN_ENABLED_KEY])
  const hidden = FEATURE_DOMAIN_KEYS.filter((domain) => !prefs[domain][DOMAIN_ENABLED_KEY])

  // Nada apagado (el escape `other`) ⇒ no hay noticia que dar.
  if (hidden.length === 0 || shown.length === 0) return null

  const shownLabels = shown.map((domain) => DOMAIN_LABEL[domain])
  const hiddenLabels = hidden.map((domain) => DOMAIN_LABEL[domain])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      showCloseButton={false}
      accessibilityLabel="Tu panel quedó listo"
      snapPoints={['85%']}
      footer={
        // Botones APILADOS: dos `full` en una fila se desbordan (gotcha shrink-0 del DS).
        <View style={{ gap: 10 }}>
          <Button testID="panel-listo-ok" label="Entendido" variant="sport" full onPress={onClose} />
          <Button
            testID="panel-listo-mi-panel"
            label="Ir a Mi panel"
            variant="outline"
            full
            onPress={onGoMiPanel}
          />
        </View>
      }
    >
      {/* El título va en el cuerpo y no en `title` del Sheet: ese prop pinta SIEMPRE en mayúsculas
          (contrato del DS) y el copy aprobado por el owner es «Tu panel quedó listo 💪». */}
      <Text
        accessibilityRole="header"
        testID="panel-listo-title"
        className="font-display-black text-strong"
        style={{ fontSize: 19, lineHeight: 25, letterSpacing: -0.4 }}
      >
        Tu panel quedó listo 💪
      </Text>
      <Text className="font-sans text-muted" style={{ fontSize: 13.5, lineHeight: 19 }}>
        Dejamos {enumerate(shownLabels)} a la vista, que es lo tuyo. {enumerate(hiddenLabels)}{' '}
        quedaron guardadas, no borradas.
      </Text>

      <ChipRow icon={Check} title="A la vista" labels={shownLabels} tone="on" />
      <ChipRow icon={EyeOff} title="Apagados" labels={hiddenLabels} tone="off" />

      <Text className="font-sans text-subtle" style={{ fontSize: 12.5, lineHeight: 18 }}>
        Actívalas cuando quieras en Opciones → Mi panel.
      </Text>
    </Sheet>
  )
}

/**
 * Una fila de chips con su rótulo. `tone` separa lo que quedó a la vista de lo apagado.
 *
 * El acento de marca es SOLO el borde del chip: `bg-sport-100` con `text-sport-700` encima es
 * exactamente lo que el owner no pudo leer en dark (QA 22-08, hallazgo 2 — en dark `sport-100` es el
 * azul SÓLIDO), así que la superficie va con la opacidad del DS y el texto con los tokens de
 * siempre, que ya tienen contraste en los dos temas.
 */
function ChipRow({
  icon: Icon,
  title,
  labels,
  tone,
}: {
  icon: LucideIcon
  title: string
  labels: readonly string[]
  tone: 'on' | 'off'
}) {
  const on = tone === 'on'
  return (
    <View style={{ gap: 7 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Icon size={13} strokeWidth={2.4} className={on ? 'text-strong' : 'text-subtle'} />
        <Text
          className={`font-sans-extra ${on ? 'text-strong' : 'text-subtle'}`}
          style={{ fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' }}
        >
          {title}
        </Text>
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {labels.map((label) => (
          <View
            key={label}
            className={
              on
                ? 'rounded-pill border border-sport-500/30 bg-sport-100 dark:bg-sport-100/20'
                : 'rounded-pill border border-dashed border-subtle bg-surface-sunken'
            }
            style={{ paddingHorizontal: 10, paddingVertical: 4 }}
          >
            <Text
              className={`font-sans-bold ${on ? 'text-strong' : 'text-muted'}`}
              style={{ fontSize: 12 }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
