'use client'

/**
 * Estado y orquestacion del modo edicion in-place (quick-edit) — web coach, movil-first.
 * Mantiene el arbol editable (reducer puro en quick-edit-state.ts), el contador de cambios
 * (contrato @eva/nutrition-v2: readModelToDraft + countDraftChanges) y el ciclo de publish
 * (quickEditPublishAction, contrato §2.3 del diseno QE): confirm sheet → publicar → exito /
 * STALE_BASE / UPGRADE_REQUIRED / error reintentable con la MISMA clave de idempotencia.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  buildNutritionIdempotencyKey,
  countDraftChanges,
  readModelToDraft,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import { quickEditPublishAction } from '../../_actions/quick-edit.actions'
import {
  loadExchangeGroupsForBuilderAction,
  type ExchangeGroupFoodCounts,
} from '../builder/_components/PortionsGroupsAction'
import {
  applyQuickEditToDraft,
  buildSubstitutionMap,
  catalogToPortionGroups,
  collectPortionGroups,
  countVariantHeaderChanges,
  mergePortionGroupChoices,
  qeExchangeGroups,
  quickEditReducer,
  readModelToEditState,
  validateQuickEdit,
  type QeExchangeGroup,
  type QePortionGroup,
  type QuickEditAction,
  type QuickEditState,
} from './quick-edit-state'
import { QE_COPY, formatIsoDateDdMmYyyy } from './microcopy'
import { ExitConfirmDialog, type QuickEditExitIntent } from './ExitConfirmDialog'
import {
  clearNutritionDraft,
  quickEditDraftKey,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  writeNutritionDraft,
} from '@/lib/nutrition-coach-draft-store'

/** Payload del respaldo local del quick-edit (localStorage): identifica plan + version base. */
interface QuickEditDraftPayload {
  clientId: string
  planId: string
  baseVersionId: string
  state: QuickEditState
}

export function genQuickEditKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface QuickEditContextValue {
  state: QuickEditState
  dispatch: (action: QuickEditAction) => void
  clientId: string
  clientName: string
  /**
   * Fecha local del alumno (YYYY-MM-DD) resuelta server-side. La usa la tira Lu-Do de cada
   * dia para marcar cual aplica HOY (QW-4): sin esto el coach edita "Día de entrenamiento"
   * sin saber a que dia de la semana corresponde.
   */
  today: string
  strategy: NutritionStrategy
  protocolNotes: string | null
  permissions: NutritionPlanReadModel['permissions']
  /**
   * Entitlement Nutricion Pro (resuelto server-side). Gobierna SOLO la afordancia de los
   * dias especificos: sin Pro el CTA "Agregar día" muestra candado + upsell. El gate real
   * es del servidor (`multi_variant` -> UPGRADE_REQUIRED), que rechaza igual.
   */
  hasNutritionPro: boolean
  /**
   * Grupos de porciones que el plan ya usa (snapshots congelados del read model), para el
   * picker de la seccion "Porciones a eleccion". [] = plan sin capa de porciones (la
   * seccion no se pinta — SPEC UX-c "capa invisible").
   */
  portionGroups: QePortionGroup[]
  /**
   * Grupos que ofrece el picker "Agregar grupo": los del plan MAS el catalogo vivo del coach
   * (mismo canal que ya alimenta `portionFoodCounts`). Sin esto el coach solo podia repetir
   * los grupos que el plan ya usaba y tenia que irse al creador para sumar uno nuevo. Si el
   * catalogo no llego, es exactamente `portionGroups` (degradacion invisible).
   */
  portionGroupChoices: QePortionGroup[]
  /**
   * Diccionario del engine reconstruido desde los snapshots congelados de los targets
   * (incluye las bases de los grupos compuestos): alimenta los subtotales que SUMAN las
   * porciones a eleccion. [] = plan sin porciones.
   */
  exchangeGroups: QeExchangeGroup[]
  /**
   * Cuantas equivalencias tiene cada grupo (`groupId -> n`) segun el catalogo VIVO del coach:
   * es lo que su alumno vera en "1 porción equivale a". `null` = el dato no viajo (plan sin
   * porciones, o la lectura fallo): la UI no pinta nada — callar, no mentir un cero.
   */
  portionFoodCounts: ExchangeGroupFoodCounts | null
  /**
   * NUT-008: la carga server-side de los reemplazos autorizados fallo. Publicar los
   * borraria (la publicacion reescribe el arbol completo), asi que "Publicar" queda
   * bloqueado hasta recargar.
   */
  substitutionsFailed: boolean
  /** Recarga el RSC para reintentar la lectura de reemplazos (conserva las ediciones). */
  retrySubstitutions: () => void
  /** dd-mm-yyyy si la version vigente arranca en el futuro; null = aplica desde hoy. */
  futureDateLabel: string | null
  changeCount: number
  /** Errores de validacion local; visibles solo tras un intento de publicar invalido. */
  errors: Record<string, string>
  showErrors: boolean
  isPending: boolean
  publishError: string | null
  upgradeRequired: boolean
  confirmOpen: boolean
  staleOpen: boolean
  openConfirm: () => void
  closeConfirm: () => void
  publishNow: () => void
  retryPublish: () => void
  discardChanges: () => void
  requestExit: () => void
  reloadAfterStale: () => void
  /** Hay un respaldo local de una sesion anterior (mismo plan y version) que se puede restaurar. */
  pendingRestore: boolean
  restoreDraft: () => void
  dismissRestore: () => void
}

const QuickEditContext = createContext<QuickEditContextValue | null>(null)

export function useQuickEdit(): QuickEditContextValue {
  const ctx = useContext(QuickEditContext)
  if (!ctx) throw new Error('useQuickEdit debe usarse dentro de QuickEditProvider')
  return ctx
}

export function QuickEditProvider({
  clientId,
  clientName,
  planModel,
  itemSubstitutions,
  substitutionsLoadFailed = false,
  today,
  hasNutritionPro = false,
  onExit,
  children,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  /**
   * Reemplazos autorizados de la version base (F-02), fetcheados server-side (RLS-scoped). Se
   * inyectan en la hidratacion por prescriptionItemId para que republicar NO los borre. El
   * read-model no los transporta; sin esto, publicar un quick-edit los perderia.
   */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /**
   * NUT-008: la lectura server-side de los reemplazos fallo (no es "sin reemplazos").
   * Bloquea el publish: republicar con el mapa vacio borraria los reemplazos del alumno.
   */
  substitutionsLoadFailed?: boolean
  today: string
  /** Entitlement Nutricion Pro server-side: gobierna la afordancia multi-dia. Default fail-closed. */
  hasNutritionPro?: boolean
  /** Cierra el modo edicion (vuelve a la ficha normal). */
  onExit: () => void
  children: ReactNode
}) {
  const router = useRouter()

  // Hidratacion una sola vez por montaje del modo edicion (el Entry desmonta al salir,
  // asi que reabrir re-hidrata desde el read model fresco tras router.refresh()).
  const substitutionsByItemId = useMemo(() => buildSubstitutionMap(itemSubstitutions), [itemSubstitutions])
  const initialState = useMemo(
    () => readModelToEditState(planModel, substitutionsByItemId),
    [planModel, substitutionsByItemId],
  )
  // El server pisa effectiveFrom (max(hoy, base)) y las notas protocolo/privadas (carry-over
  // §2.3); las visibles viajan editadas desde el estado.
  const baseDraft = useMemo(() => readModelToDraft(planModel, clientId), [planModel, clientId])
  const portionGroups = useMemo(() => collectPortionGroups(planModel), [planModel])

  if (!initialState || !baseDraft) {
    throw new Error('QuickEditProvider requiere un plan vigente en el read model')
  }

  // Identidad del respaldo local: una sesion de quick-edit por alumno; el payload lleva el
  // plan y la version base para descartar borradores calculados contra una base obsoleta.
  const draftKey = quickEditDraftKey(clientId)
  const planId = planModel.plan?.id ?? null
  const planVersionId = planModel.plan?.versionId ?? null

  const [state, rawDispatch] = useReducer(quickEditReducer, initialState)
  const [showErrors, setShowErrors] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [staleOpen, setStaleOpen] = useState(false)
  // Guard de salida con cambios sin publicar: reemplaza los window.confirm() nativos por el
  // dialogo del DS (ver ExitConfirmDialog). La intencion se conserva al cerrar (solo baja
  // `exitConfirmOpen`) para que el copy no salte durante la animacion de cierre.
  const [exitIntent, setExitIntent] = useState<QuickEditExitIntent>('leave')
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  // Arbol de una sesion anterior recuperado del respaldo local; alimenta el banner "Restaurar".
  const [pendingRestore, setPendingRestore] = useState<QuickEditState | null>(null)
  // Equivalencias por grupo (catalogo vivo). Informativo puro: null hasta que llegue, y null
  // para siempre si la lectura falla — jamas bloquea ni retrasa la edicion.
  const [portionFoodCounts, setPortionFoodCounts] = useState<ExchangeGroupFoodCounts | null>(null)
  // Catalogo vivo de grupos del coach (misma respuesta que trae los conteos). null = todavia
  // no llego o la lectura fallo: el picker vuelve a ofrecer solo los grupos del plan.
  const [portionGroupCatalog, setPortionGroupCatalog] = useState<QePortionGroup[] | null>(null)
  const [isPending, startTransition] = useTransition()
  // Grupos ofrecidos por el picker: plan primero, catalogo despues (ver `mergePortionGroupChoices`).
  const portionGroupChoices = useMemo(
    () => mergePortionGroupChoices(portionGroups, portionGroupCatalog),
    [portionGroups, portionGroupCatalog],
  )
  // Diccionario del engine (grupos directos + bases de compuestos) para sumar las porciones
  // a eleccion en los subtotales de franja y en el total prescrito. Se arma sobre la lista
  // COMPLETA para que un grupo recien agregado desde el catalogo tambien sume en vivo; los
  // snapshots del plan van primero, asi que siguen mandando ellos donde hay id repetido.
  const exchangeGroups = useMemo(() => qeExchangeGroups(portionGroupChoices), [portionGroupChoices])
  // Clave de idempotencia por "intencion de publicar": se fija al abrir el confirm sheet y
  // se REUSA en todos los reintentos de esa intencion (§2.5). Editar despues de un fallo
  // arranca una intencion nueva (clave nueva) para que el retry no resucite un draft viejo.
  const idempotencyKeyRef = useRef<string | null>(null)
  // Guard para no escribir el respaldo local en la hidratacion inicial (evita un borrador vacio).
  const isFirstRender = useRef(true)

  // Baseline y draft actual pasan por la MISMA proyeccion → cero ediciones = cero cambios,
  // sin depender de detalles de normalizacion del paquete.
  const baselineDraft = useMemo(() => applyQuickEditToDraft(baseDraft, initialState), [baseDraft, initialState])
  const currentDraft = useMemo(() => applyQuickEditToDraft(baseDraft, state), [baseDraft, state])
  // FD5: el contador del paquete no mira el ENCABEZADO de la variante (etiqueta / dia de
  // semana), asi que renombrar o mover un dia quedaria en "0 cambios" y sin barra de
  // publicar. Se suma el delta de encabezados calculado sobre los MISMOS drafts.
  const changeCount = useMemo(
    () => countDraftChanges(baselineDraft, currentDraft) + countVariantHeaderChanges(baselineDraft, currentDraft),
    [baselineDraft, currentDraft],
  )
  const validation = useMemo(() => validateQuickEdit(state), [state])

  const dispatch = useCallback(
    (action: QuickEditAction) => {
      // Una edicion tras un fallo de publish = intencion nueva: limpia el error y la clave.
      setPublishError((prev) => {
        if (prev !== null) idempotencyKeyRef.current = null
        return null
      })
      setUpgradeRequired(false)
      rawDispatch(action)
    },
    [rawDispatch],
  )

  const dirty = changeCount > 0

  // Guard de salida del navegador (cerrar pestana / recargar) con cambios sin publicar.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = QE_COPY.leaveGuard
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Al montar el modo edicion: barre borradores vencidos y evalua si hay un respaldo local
  // restaurable para ESTE plan y version base. Si el borrador es de otra version (alguien
  // publico entremedio via otra pestana / RN / el builder) se descarta: restaurar contra una
  // base obsoleta seria peor que nada (mismo espiritu que el STALE_BASE del servidor).
  useEffect(() => {
    const now = Date.now()
    sweepStaleNutritionDrafts(now)
    const record = readNutritionDraft<QuickEditDraftPayload>(draftKey, now)
    if (!record) return
    const { payload } = record
    if (
      payload.planId === planId &&
      payload.baseVersionId === planVersionId &&
      Array.isArray(payload.state?.variants)
    ) {
      setPendingRestore(payload.state)
    } else {
      clearNutritionDraft(draftKey)
    }
  }, [draftKey, planId, planVersionId])

  // Autosave debounced del arbol editable: escribe el respaldo local solo si hay cambios reales;
  // si el coach vuelve al baseline (0 cambios) borra el borrador (ya no aporta). El guard de
  // primer render evita crear un borrador vacio al hidratar.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!planId || !planVersionId) return
    const timer = setTimeout(() => {
      if (changeCount > 0) {
        writeNutritionDraft<QuickEditDraftPayload>(
          draftKey,
          { clientId, planId, baseVersionId: planVersionId, state },
          Date.now(),
        )
      } else {
        clearNutritionDraft(draftKey)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [state, changeCount, draftKey, clientId, planId, planVersionId])

  // Equivalencias por grupo Y catalogo de grupos: una sola lectura al montar el modo edicion,
  // y SOLO si el plan usa porciones (sin capa de porciones la seccion ni se pinta, asi que el
  // viaje sobra). Reusa la server action del builder tal cual (mismo scope de tenant que vera
  // el alumno). Degradacion en silencio: !ok o excepcion => ambos quedan en null, ninguna fila
  // dice nada y el picker sigue ofreciendo los grupos del plan.
  const hasPortionsLayer = portionGroups.length > 0
  useEffect(() => {
    if (!hasPortionsLayer) return
    let alive = true
    void (async () => {
      try {
        const res = await loadExchangeGroupsForBuilderAction({ clientId })
        if (!alive || !res.ok) return
        setPortionFoodCounts(res.foodCounts)
        setPortionGroupCatalog(catalogToPortionGroups(res.groups))
      } catch {
        // Informativo: el quick-edit sigue funcionando sin la linea de apoyo.
      }
    })()
    return () => {
      alive = false
    }
  }, [clientId, hasPortionsLayer])

  const futureDateLabel = useMemo(() => {
    const effectiveFrom = planModel.plan?.effectiveFrom ?? null
    if (!effectiveFrom || effectiveFrom <= today) return null
    return formatIsoDateDdMmYyyy(effectiveFrom)
  }, [planModel.plan, today])

  const openConfirm = useCallback(() => {
    // NUT-008: sin los reemplazos de la version base, publicar los borraria (el publish
    // reescribe el arbol completo). Fail-closed: no se abre el confirm.
    if (substitutionsLoadFailed) {
      setPublishError(QE_COPY.substitutionsFailed)
      return
    }
    if (!validation.ok) {
      setShowErrors(true)
      setPublishError(QE_COPY.invalidDraft)
      return
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = buildNutritionIdempotencyKey({
        clientId,
        deviceId: 'web-quick-edit',
        operationId: genQuickEditKey(),
        kind: 'publish',
      })
    }
    setConfirmOpen(true)
  }, [validation.ok, clientId, substitutionsLoadFailed])

  const closeConfirm = useCallback(() => {
    if (isPending) return
    setConfirmOpen(false)
  }, [isPending])

  const runPublish = useCallback(() => {
    const baseVersionId = planModel.plan?.versionId
    const idempotencyKey = idempotencyKeyRef.current
    if (!baseVersionId || !idempotencyKey) return
    // Segunda barrera del guard NUT-008 (por si el retry entra sin pasar por openConfirm).
    if (substitutionsLoadFailed) {
      setConfirmOpen(false)
      setPublishError(QE_COPY.substitutionsFailed)
      return
    }
    setPublishError(null)
    setUpgradeRequired(false)
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof quickEditPublishAction>>
      try {
        res = await quickEditPublishAction({
          clientId,
          baseVersionId,
          draft: currentDraft,
          idempotencyKey,
        })
      } catch {
        // Red caida / server action inalcanzable: el draft NO se pierde y el reintento
        // reusa la MISMA clave de idempotencia.
        setConfirmOpen(false)
        setPublishError(typeof navigator !== 'undefined' && !navigator.onLine ? QE_COPY.offline : QE_COPY.publishFailed)
        return
      }
      if (res.ok) {
        idempotencyKeyRef.current = null
        clearNutritionDraft(draftKey)
        setConfirmOpen(false)
        toast.success(QE_COPY.success(clientName))
        router.refresh()
        onExit()
        return
      }
      setConfirmOpen(false)
      if (res.code === 'STALE_BASE' || res.code === 'EFFECTIVE_DATE') {
        setStaleOpen(true)
        return
      }
      if (res.code === 'UPGRADE_REQUIRED') {
        setUpgradeRequired(true)
        return
      }
      if (res.code === 'VALIDATION') {
        setShowErrors(true)
        setPublishError(QE_COPY.invalidDraft)
        return
      }
      setPublishError(QE_COPY.publishFailed)
    })
  }, [clientId, clientName, currentDraft, draftKey, onExit, planModel.plan, router, substitutionsLoadFailed])

  // Reintento de la lectura de reemplazos: refresca el RSC (vuelve a correr el data-loader)
  // sin desmontar el modo edicion, asi que las ediciones sin publicar se conservan.
  const retrySubstitutions = useCallback(() => {
    setPublishError(null)
    router.refresh()
  }, [router])

  const publishNow = useCallback(() => {
    if (isPending) return
    runPublish()
  }, [isPending, runPublish])

  // Reintento desde la barra tras un error: misma intencion, misma clave, sin re-confirmar.
  const retryPublish = useCallback(() => {
    if (isPending) return
    if (!idempotencyKeyRef.current) {
      openConfirm()
      return
    }
    runPublish()
  }, [isPending, openConfirm, runPublish])

  // Al salir, el respaldo local solo se borra si el coach descarto ediciones PROPIAS (dirty
  // confirmado) o si no queda un respaldo anterior sin restaurar: salir limpio con el banner
  // "Restaurar" todavia pendiente NO debe destruir ese respaldo en silencio.
  const finalizeExit = useCallback(
    (hadChanges: boolean) => {
      idempotencyKeyRef.current = null
      if (hadChanges || pendingRestore === null) clearNutritionDraft(draftKey)
      onExit()
    },
    [draftKey, pendingRestore, onExit],
  )

  // Con cambios sin publicar el guard abre el dialogo del DS (ExitConfirmDialog) en vez del
  // window.confirm() nativo; sin cambios se sale directo.
  const discardChanges = useCallback(() => {
    if (isPending) return
    if (dirty) {
      setExitIntent('discard')
      setExitConfirmOpen(true)
      return
    }
    finalizeExit(false)
  }, [isPending, dirty, finalizeExit])

  const requestExit = useCallback(() => {
    if (isPending) return
    if (dirty) {
      setExitIntent('leave')
      setExitConfirmOpen(true)
      return
    }
    finalizeExit(false)
  }, [isPending, dirty, finalizeExit])

  const cancelExit = useCallback(() => setExitConfirmOpen(false), [])

  const confirmExit = useCallback(() => {
    setExitConfirmOpen(false)
    finalizeExit(true)
  }, [finalizeExit])

  const reloadAfterStale = useCallback(() => {
    idempotencyKeyRef.current = null
    setStaleOpen(false)
    router.refresh()
    onExit()
  }, [onExit, router])

  // Aplica el respaldo local (reemplazo total del arbol) y baja el banner.
  const restoreDraft = useCallback(() => {
    if (!pendingRestore) return
    dispatch({ type: 'RESTORE_DRAFT', state: pendingRestore })
    setPendingRestore(null)
  }, [pendingRestore, dispatch])

  // Descarta el respaldo local ofrecido y baja el banner sin tocar el estado actual.
  const dismissRestore = useCallback(() => {
    clearNutritionDraft(draftKey)
    setPendingRestore(null)
  }, [draftKey])

  const value: QuickEditContextValue = {
    state,
    dispatch,
    clientId,
    clientName,
    today,
    strategy: planModel.plan?.strategy ?? 'flexible',
    protocolNotes: planModel.protocolNotes,
    permissions: planModel.permissions,
    hasNutritionPro,
    portionGroups,
    portionGroupChoices,
    exchangeGroups,
    portionFoodCounts,
    substitutionsFailed: substitutionsLoadFailed,
    retrySubstitutions,
    futureDateLabel,
    changeCount,
    errors: validation.errors,
    showErrors,
    isPending,
    publishError,
    upgradeRequired,
    confirmOpen,
    staleOpen,
    openConfirm,
    closeConfirm,
    publishNow,
    retryPublish,
    discardChanges,
    requestExit,
    reloadAfterStale,
    pendingRestore: pendingRestore !== null,
    restoreDraft,
    dismissRestore,
  }

  return (
    <QuickEditContext.Provider value={value}>
      {children}
      <ExitConfirmDialog
        open={exitConfirmOpen}
        intent={exitIntent}
        changeCount={changeCount}
        onCancel={cancelExit}
        onConfirm={confirmExit}
      />
    </QuickEditContext.Provider>
  )
}
