import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { parsePlanBuilderOrigin, type NutritionClientDetailReadModel } from '@eva/nutrition-v2'
import { EvaLoaderScreen } from '../../../../components/EvaLoader'
import { NutritionMotionButton, NutritionStatePanel } from '../../../../components/nutrition-v2'
import {
  EDITOR_COPY,
  QuickEditMode,
  publishSuccessToast,
  type QuickEditEditorInput,
} from '../../../../components/nutrition-v2/quick-edit'
import { toast } from '../../../../components/Toast'
import { GuidedTaskBanner } from '../../../../components/coach/GuidedTaskBanner'
import { useCoachOnboarding } from '../../../../lib/coach-dashboard'
import { isGuidedEntry } from '../../../../lib/templates'
import { useEntitlements } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import { isUuid, reportInvalidRouteUuid } from '../../../../lib/safe-uuid'
import { getNutritionClientDetailV2, nutritionV2CoachScope } from '../../../../lib/nutrition-v2.api'
import { loadEditorSession } from '../../../../lib/nutrition-v2-editor'
import type { NutritionV2WriteClient } from '../../../../lib/nutrition-v2-builder'
import { NUTRITION_PRO_MODULE_KEY } from '../../../../lib/nutrition-v2-pro'
import { supabase } from '../../../../lib/supabase'

/**
 * EDITOR UNICO de nutricion — pantalla RN (T3.3b). Espejo de la ruta web
 * `/coach/nutrition-v2/[clientId]/editor`, incluida la puerta `?from=`:
 *
 *   /coach/nutrition-v2/editor/<clientId>                      → edita el plan vigente
 *   /coach/nutrition-v2/editor/<clientId>?from=template:<id>   → crea desde una plantilla
 *   /coach/nutrition-v2/editor/<clientId>?from=plan:<clientId> → crea copiando otro alumno
 *   (sin plan vigente y sin origen)                            → crea en blanco
 *
 * La pantalla solo ORQUESTA: resuelve prerrequisitos (workspace + entitlements + sesion), lee la
 * ficha y delega en `loadEditorSession` que arbol se edita. El lienzo es el MISMO `QuickEditMode`
 * (gramatica compartida `@eva/nutrition-v2`), con `editor` prendido.
 *
 * Fail-closed: sin scope de workspace no se lee nada; el gate comercial y el scope los re-valida
 * el servidor en cada mutacion (endpoint movil + RLS).
 */
export default function NutritionUnifiedEditorScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ clientId?: string; from?: string; primera?: string }>()
  const clientId = typeof params.clientId === 'string' ? params.clientId : ''
  // Paso 3 de la guía: la ruta llega marcada con `?primera=1` (@eva/onboarding).
  const guidedFirst = isGuidedEntry(params.primera)
  const onboarding = useCoachOnboarding()
  const origin = useMemo(
    () => parsePlanBuilderOrigin(typeof params.from === 'string' ? params.from : null),
    [params.from],
  )
  const insets = useSafeAreaInsets()
  // ¿La banda guiada está OCUPANDO el inset superior ahora mismo? Arranca en `false` (la banda lee
  // AsyncStorage antes de pintarse) y vuelve a `false` cuando el coach la cierra con la «×».
  const [guidedBannerVisible, setGuidedBannerVisible] = useState(false)
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()

  const [detail, setDetail] = useState<NutritionClientDetailReadModel | null>(null)
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

  // Guard de entrada: `/editor/null` entrega el STRING 'null' (truthy) y pasaria los guards de
  // abajo hasta el filtro uuid de PostgREST. `replace`, nunca `back()` (puede rebotar en loop).
  useEffect(() => {
    if (isUuid(clientId)) return
    reportInvalidRouteUuid('coach/nutrition-v2/editor/[clientId]', clientId)
    router.replace('/coach/home')
  }, [clientId, router])

  useEffect(() => {
    if (!gatesResolved || !scope || !isUuid(clientId)) return
    let active = true
    setFailed(false)
    void (async () => {
      try {
        const fresh = await getNutritionClientDetailV2({ clientId, scope, date })
        if (!active || !mountedRef.current) return
        const loaded = await loadEditorSession({
          db: supabase as unknown as NutritionV2WriteClient,
          scope,
          clientId,
          clientName: fresh.client.fullName,
          planModel: fresh.plan,
          origin,
          todayIso: date,
        })
        if (!active || !mountedRef.current) return
        setDetail(fresh)
        setSession(loaded)
      } catch {
        if (!active || !mountedRef.current) return
        // Sin ficha no hay nada que editar: pantalla de error con reintento (jamas un editor
        // vacio, que publicaria sobre un plan que no se pudo leer).
        setFailed(true)
      }
    })()
    return () => {
      active = false
    }
  }, [gatesResolved, scope, clientId, date, origin, reloadNonce])

  const reload = useCallback(() => {
    setDetail(null)
    setSession(null)
    setFailed(false)
    setReloadNonce((nonce) => nonce + 1)
  }, [])

  const exitToDetail = useCallback(() => {
    router.replace({ pathname: '/coach/nutrition-v2/[clientId]', params: { clientId } })
  }, [router, clientId])

  if (failed) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionStatePanel
          title="No se pudo abrir el editor"
          description={EDITOR_COPY.loadFailed}
          action={
            <NutritionMotionButton accessibilityLabel="Reintentar abrir el editor" onPress={reload}>
              Reintentar
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  if (!detail || !session || !scope) {
    return <EvaLoaderScreen subtitle={EDITOR_COPY.loading} />
  }

  const editor = (
    <QuickEditMode
      clientId={clientId}
      clientName={detail.client.fullName}
      planModel={detail.plan}
      scope={scope}
      todayIso={date}
      hasNutritionPro={hasNutritionPro}
      editor={session}
      onExit={exitToDetail}
      onPublished={() => {
        toast.success(publishSuccessToast(detail.client.fullName))
        exitToDetail()
      }}
      onStaleReload={reload}
    />
  )

  if (!guidedFirst) return editor

  // Entrada guiada del paso 3 (hallazgo 5 del QA del owner 22-08): la banda va ARRIBA del lienzo,
  // que es donde la web pone sus `GuidedTaskCards`. El nombre sale del demo del panel y cae al del
  // alumno de la ficha si la foto todavía no cargó.
  const demoName = onboarding?.onboardingV2.demoName?.trim() || detail.client.fullName
  return (
    <View className="flex-1 bg-surface-app">
      <GuidedTaskBanner
        coachId={onboarding?.coachId ?? null}
        surface="nutrition-editor"
        withTopInset
        onVisibilityChange={setGuidedBannerVisible}
        title={`Tu primera pauta para ${demoName}`}
        bullets={[
          'Cambia un alimento por otro que sí coma.',
          'Ajusta una porción y mira cómo se mueven los macros.',
          `Publica y mírala como ${demoName}.`,
        ]}
      />
      {/* Cuando la banda está pintada ella consume el inset superior. `QuickEditMode` pinta su barra
          con `paddingTop: insets.top + 8`, así que en ese caso se le entrega `top: 0` para que no
          quede un hueco del alto del status bar entre la banda y el editor (se hace acá, sin tocar
          `QuickEditMode`, que es de otra unidad de trabajo; el resto de los bordes viaja intacto).
          El `top` sigue al estado REAL de la banda —que arranca invisible mientras lee su memoria y
          desaparece con la «×»—: forzarlo a 0 incondicionalmente metía la barra «Editando» bajo la
          hora y la batería en el primer frame y para siempre después de cerrarla. */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: guidedBannerVisible ? 0 : insets.top }}>
        <View className="flex-1">{editor}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  )
}
