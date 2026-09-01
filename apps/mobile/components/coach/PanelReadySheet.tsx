import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { cssInterop } from 'nativewind'
import { Apple, Dumbbell, HeartPulse, PersonStanding, Ruler } from 'lucide-react-native'
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
import { Switch } from '../Switch'
import { useTheme } from '../../context/ThemeContext'
import { getCoachProfile } from '../../lib/coach'
import { refreshEntitlements } from '../../lib/entitlements'
import { saveFeaturePrefs, type FeaturePrefsScope } from '../../lib/feature-prefs.queries'
import { MI_PANEL_DOMAINS, buildDomainSwitchPayload, loadMiPanelDomains, type MiPanelDomainRow } from '../../lib/mi-panel'

/**
 * «Tu panel quedó listo 💪» — el cierre de «¿A qué te dedicas?» en la APP, INTERACTIVO. Gemelo de
 * `apps/web/src/app/coach/guia/_components/PanelListoModal.tsx`: mismo copy, mismos switches, misma
 * matriz.
 *
 * Momento (pedido literal del owner): aparece INMEDIATAMENTE DESPUÉS de la elección, o sea al
 * aterrizar en la primera pantalla tras «Armar mi panel» — NO al terminar los cinco pasos. Una sola
 * vez: el param que la abre muere con la navegación.
 *
 * Qué cambió (pedido del owner, 26-08): dejó de ser un aviso con chips y un «Entendido». Los 5
 * dominios vienen con SWITCH, sembrados con lo que dejó la matriz de la persona, y el coach los
 * prende o apaga ACÁ, antes de seguir su guía («lo que no quiero es que luego diga ¿y mi nutrición?
 * ¿y mi cardio?»). «Continuar» persiste SOLO lo que difiere de lo sembrado y cierra; si no tocó
 * nada, cierra sin escribir.
 *
 * Solo se muestra si la elección APAGÓ algo: con el escape `other` (panel completo) no hay nada que
 * decidir y el componente se borra solo. El guard vive también en quien arma el param
 * (`onboarding/persona.tsx`); acá es defensa en profundidad.
 *
 * El write es EXACTAMENTE el de «Opciones › Funciones» (`app/coach/settings/funciones.tsx`):
 * `buildDomainSwitchPayload` (preserva preset y toggles finos, solo pisa `_enabled`) →
 * `saveFeaturePrefs` → `refreshEntitlements()`, porque la barra de tabs lee el store de
 * entitlements y no esta tabla. Apagar es una PREFERENCIA: no compra módulos ni borra datos.
 *
 * Se monta sobre `Sheet` con `nativeModal`: esta hoja se presenta EN EL MISMO FRAME en que aterriza
 * una pantalla nueva, que es exactamente el cold-start donde el contenedor de @gorhom todavía mide
 * -999 y el sheet nace fuera de pantalla (ver el bloque `nativeModal` de `components/Sheet.tsx`).
 * Un aviso que no se ve es peor que no darlo.
 *
 * El error de guardado se pinta DENTRO de la hoja, no con `toast`: sobre un modal nativo el toast
 * del root queda tapado y el coach vería un fallo silencioso.
 */

for (const Icon of [Apple, Dumbbell, HeartPulse, PersonStanding, Ruler]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Etiqueta humana por dominio — la MISMA que pinta Opciones › Mi panel. */
const DOMAIN_LABEL: Record<FeatureDomain, string> = Object.fromEntries(
  MI_PANEL_DOMAINS.map((meta) => [meta.domain, meta.label]),
) as Record<FeatureDomain, string>

/** Ícono por dominio — el MISMO mapeo que `mi-panel.tsx` y que la web. */
const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
  nutrition: Apple,
  training: Dumbbell,
  cardio: HeartPulse,
  movement: PersonStanding,
  bodycomp: Ruler,
}

const SAVE_ERROR =
  'No pudimos guardar todos los cambios. Inténtalo de nuevo o cámbialo después en Opciones → Mi panel.'

export function PanelReadySheet({
  open,
  persona,
  alsoOther,
  onClose,
}: {
  open: boolean
  persona: Persona
  /** `coaches.persona_also_other`: la segunda pregunta de la pantalla de persona. */
  alsoOther: boolean
  onClose: () => void
}) {
  const { theme } = useTheme()

  /** Lo que la matriz de la persona dejó escrito. Es el punto de comparación del diff. */
  const seeded = useMemo(() => {
    const prefs = resolvePersonaPrefs(persona, alsoOther)
    return Object.fromEntries(
      FEATURE_DOMAIN_KEYS.map((domain) => [domain, prefs[domain][DOMAIN_ENABLED_KEY]]),
    ) as Record<FeatureDomain, boolean>
  }, [persona, alsoOther])

  const [state, setState] = useState<Record<FeatureDomain, boolean>>(seeded)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [rows, setRows] = useState<MiPanelDomainRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las filas CRUDAS (preset + secciones) se precargan al abrir: son lo que hay que preservar al
  // escribir `_enabled`. Si el coach no toca ningún switch nunca se usan.
  useEffect(() => {
    if (!open) return
    let alive = true
    void (async () => {
      const profile = await getCoachProfile().catch(() => null)
      if (!alive) return
      setCoachId(profile?.id ?? null)
      const loaded = await loadMiPanelDomains(profile?.id ?? null)
      if (alive) setRows(loaded)
    })()
    return () => {
      alive = false
    }
  }, [open])

  const changes = FEATURE_DOMAIN_KEYS.filter((domain) => state[domain] !== seeded[domain]).map(
    (domain) => ({ domain, enabled: state[domain] }),
  )

  /** Filas crudas al día. Si la precarga no alcanzó a terminar, se espera acá. */
  async function ensureRows(): Promise<{ id: string | null; rows: MiPanelDomainRow[] }> {
    if (rows != null) return { id: coachId, rows }
    const profile = await getCoachProfile().catch(() => null)
    const id = profile?.id ?? coachId
    const loaded = await loadMiPanelDomains(id)
    setCoachId(id)
    setRows(loaded)
    return { id, rows: loaded }
  }

  /** «Continuar»: guarda lo que difiere y cierra. Sin cambios ⇒ cierra sin escribir. */
  async function submit() {
    if (saving) return
    if (changes.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)

    const current = await ensureRows()
    const ctx: FeaturePrefsScope = { scope: 'coach', coachId: current.id, teamId: null }
    let saved = 0
    let failed = 0
    for (const change of changes) {
      const row = current.rows.find((candidate) => candidate.domain === change.domain)
      if (row == null) {
        failed += 1
        continue
      }
      const result = await saveFeaturePrefs(ctx, buildDomainSwitchPayload(row, change.enabled))
      if ('ok' in result) {
        saved += 1
        continue
      }
      failed += 1
    }

    if (saved > 0) {
      // La barra de tabs lee el store de entitlements, no esta tabla: sin esta revalidación el tab
      // recién prendido no vuelve hasta el próximo foreground.
      await refreshEntitlements().catch(() => {})
      // Reintentar tiene que partir de las secciones ya guardadas, no de la foto vieja.
      setRows(await loadMiPanelDomains(current.id))
    }

    setSaving(false)
    if (failed > 0) {
      // No se traba la salida: la hoja ofrece reintentar o seguir sin guardar (el panel queda como
      // lo dejó la matriz, que es lo que ya está en la base).
      setError(SAVE_ERROR)
      return
    }
    onClose()
  }

  const hidden = FEATURE_DOMAIN_KEYS.filter((domain) => !seeded[domain])
  const shown = FEATURE_DOMAIN_KEYS.filter((domain) => seeded[domain])

  // Nada apagado (el escape `other`) ⇒ no hay nada que decidir.
  if (hidden.length === 0 || shown.length === 0) return null

  return (
    <Sheet
      open={open}
      // Deslizar o tocar fuera vale lo mismo que «Continuar»: guardar lo que tocó, no perderlo.
      // Con un error a la vista, salir es salir (ya se le ofreció reintentar).
      onClose={() => {
        if (saving) return
        if (error) {
          onClose()
          return
        }
        void submit()
      }}
      nativeModal
      showCloseButton={false}
      accessibilityLabel="Tu panel quedó listo"
      snapPoints={['85%']}
      footer={
        // Botones APILADOS: dos `full` en una fila se desbordan (gotcha shrink-0 del DS).
        <View style={{ gap: 10 }}>
          <Button
            testID="panel-listo-ok"
            label={error ? 'Reintentar' : 'Continuar'}
            variant="sport"
            full
            loading={saving}
            disabled={saving}
            onPress={() => {
              void submit()
            }}
          />
          {error ? (
            <Button
              testID="panel-listo-skip"
              label="Continuar sin guardar"
              variant="ghost"
              full
              disabled={saving}
              onPress={onClose}
            />
          ) : null}
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
        Esto quedó según lo que elegiste. Préndelo o apágalo a tu gusto — también puedes cambiarlo
        después en Opciones → Mi panel.
      </Text>

      <View className="rounded-card border border-subtle bg-surface-card">
        {FEATURE_DOMAIN_KEYS.map((domain, index) => {
          const Icon = DOMAIN_ICONS[domain]
          const label = DOMAIN_LABEL[domain]
          return (
            <View
              key={domain}
              testID={`panel-listo-domain-${domain}`}
              className="flex-row items-center"
              style={{
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.border,
              }}
            >
              <Icon size={18} strokeWidth={2} className="text-sport-600" />
              <Text
                className="font-sans-bold text-strong"
                style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}
              >
                {label}
              </Text>
              <Switch
                value={state[domain]}
                disabled={saving}
                onValueChange={(next) => setState((current) => ({ ...current, [domain]: next }))}
              />
            </View>
          )
        })}
      </View>

      <Text className="font-sans text-subtle" style={{ fontSize: 12.5, lineHeight: 18 }}>
        Lo que apagues se oculta del menú, no se borra.
      </Text>

      {error ? (
        <View
          accessibilityRole="alert"
          testID="panel-listo-error"
          className="rounded-card border border-subtle bg-surface-sunken"
          style={{ paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
            {error}
          </Text>
        </View>
      ) : null}
    </Sheet>
  )
}
