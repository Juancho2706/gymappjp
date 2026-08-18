import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { EvaLoaderScreen } from '../../../../components/EvaLoader'
import { NutritionMotionButton, NutritionStatePanel } from '../../../../components/nutrition-v2'
import {
  EDITOR_COPY,
  QuickEditMode,
  type QuickEditEditorInput,
} from '../../../../components/nutrition-v2/quick-edit'
import { toast } from '../../../../components/Toast'
import { useEntitlements } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import { nutritionV2CoachScope } from '../../../../lib/nutrition-v2.api'
import {
  TEMPLATE_MODE_CLIENT_ID,
  buildTemplatePlanModel,
  loadTemplateEditorSession,
} from '../../../../lib/nutrition-v2-editor'
import { NUTRITION_PRO_MODULE_KEY } from '../../../../lib/nutrition-v2-pro'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * EDITOR UNICO en modo PLANTILLA — pantalla RN (T3.3b). Espejo de
 * `/coach/nutrition-v2/plantillas/editor` en web: crear y editar material reutilizable del coach
 * SIN alumno, sobre el mismo lienzo del editor de planes.
 *
 *   /coach/nutrition-v2/plantillas/editor                 → plantilla nueva
 *   /coach/nutrition-v2/plantillas/editor?template=<id>   → editar esa plantilla
 *
 * Una plantilla ilegible (o de otro coach, via RLS) degrada a editor en blanco CON AVISO y con
 * `templateId` null: guardar ahi CREA una nueva y jamas pisa a ciegas la que no abrio.
 *
 * No hay alumno: el picker de porciones va coach-scoped, la porcion pegajosa no lee ni escribe,
 * y "publicar" es GUARDAR. La tenencia la decide la RLS de `nutrition_plan_templates_v2`.
 */
export default function CoachNutritionV2TemplateEditorScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ template?: string }>()
  const rawTemplateId = typeof params.template === 'string' ? params.template : null
  const templateId = rawTemplateId && UUID_RE.test(rawTemplateId) ? rawTemplateId : null

  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()

  const [session, setSession] = useState<QuickEditEditorInput | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const mountedRef = useRef(true)

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    [],
  )
  const planModel = useMemo(() => buildTemplatePlanModel(date), [date])

  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)
  const gatesResolved = entitlements.ready && workspaceReady

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!gatesResolved || !scope) return
    let active = true
    setFailed(false)
    void (async () => {
      try {
        const loaded = await loadTemplateEditorSession({ scope, templateId })
        if (!active || !mountedRef.current) return
        setSession({
          itemSubstitutions: [],
          substitutionsLoadFailed: false,
          creation: null,
          template: loaded.template,
          templateUnavailable: loaded.templateUnavailable,
          originUnavailable: false,
          rememberedQuantities: {},
        })
        if (loaded.templateUnavailable) toast.error(EDITOR_COPY.templateUnavailable)
      } catch {
        if (!active || !mountedRef.current) return
        setFailed(true)
      }
    })()
    return () => {
      active = false
    }
  }, [gatesResolved, scope, templateId, reloadNonce])

  const reload = useCallback(() => {
    setSession(null)
    setFailed(false)
    setReloadNonce((nonce) => nonce + 1)
  }, [])

  /**
   * Salida a la pestaña de la que se vino, no al hub pelado: `/coach/nutrition-v2` cae en "Alumnos",
   * así que guardar una plantilla dejaba al coach en otra superficie y sin ver lo que acababa de
   * hacer. La web sale a `?tab=plantillas` y el parser RN ya acepta ese slug español
   * (`resolveNutritionHubInitialTab`).
   */
  const exitToHub = useCallback(() => {
    router.replace('/coach/nutrition-v2?tab=plantillas')
  }, [router])

  if (failed) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionStatePanel
          title="No se pudo abrir la plantilla"
          description={EDITOR_COPY.loadFailed}
          action={
            <NutritionMotionButton accessibilityLabel="Reintentar abrir la plantilla" onPress={reload}>
              Reintentar
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  if (!session || !scope) {
    return <EvaLoaderScreen subtitle={EDITOR_COPY.templateLoading} />
  }

  return (
    <QuickEditMode
      // Relleno del modo plantilla: no autoriza nada y el guardado lo strippea server-side.
      clientId={TEMPLATE_MODE_CLIENT_ID}
      clientName={EDITOR_COPY.templateTitle}
      planModel={planModel}
      scope={scope}
      todayIso={date}
      hasNutritionPro={hasNutritionPro}
      editor={session}
      onExit={exitToHub}
      onPublished={() => {
        toast.success(EDITOR_COPY.templateSuccess)
        exitToHub()
      }}
      onStaleReload={reload}
    />
  )
}
