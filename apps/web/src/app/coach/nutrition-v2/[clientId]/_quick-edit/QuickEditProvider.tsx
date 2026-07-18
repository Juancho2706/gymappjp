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
  type NutritionPlanReadModel,
  type NutritionStrategy,
} from '@eva/nutrition-v2'
import { quickEditPublishAction } from '../../_actions/quick-edit.actions'
import {
  applyQuickEditToDraft,
  collectPortionGroups,
  quickEditReducer,
  readModelToEditState,
  validateQuickEdit,
  type QePortionGroup,
  type QuickEditAction,
  type QuickEditState,
} from './quick-edit-state'
import { QE_COPY, formatIsoDateDdMmYyyy } from './microcopy'

export function genQuickEditKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface QuickEditContextValue {
  state: QuickEditState
  dispatch: (action: QuickEditAction) => void
  clientId: string
  clientName: string
  strategy: NutritionStrategy
  visibleNotes: string | null
  protocolNotes: string | null
  permissions: NutritionPlanReadModel['permissions']
  /**
   * Grupos de porciones que el plan ya usa (snapshots congelados del read model), para el
   * picker de la seccion "Porciones a eleccion". [] = plan sin capa de porciones (la
   * seccion no se pinta — SPEC UX-c "capa invisible").
   */
  portionGroups: QePortionGroup[]
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
  today,
  onExit,
  children,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  today: string
  /** Cierra el modo edicion (vuelve a la ficha normal). */
  onExit: () => void
  children: ReactNode
}) {
  const router = useRouter()

  // Hidratacion una sola vez por montaje del modo edicion (el Entry desmonta al salir,
  // asi que reabrir re-hidrata desde el read model fresco tras router.refresh()).
  const initialState = useMemo(() => readModelToEditState(planModel), [planModel])
  // El server pisa effectiveFrom (max(hoy, base)) y las notas (carry-over §2.3).
  const baseDraft = useMemo(() => readModelToDraft(planModel, clientId), [planModel, clientId])
  const portionGroups = useMemo(() => collectPortionGroups(planModel), [planModel])

  if (!initialState || !baseDraft) {
    throw new Error('QuickEditProvider requiere un plan vigente en el read model')
  }

  const [state, rawDispatch] = useReducer(quickEditReducer, initialState)
  const [showErrors, setShowErrors] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [upgradeRequired, setUpgradeRequired] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [staleOpen, setStaleOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Clave de idempotencia por "intencion de publicar": se fija al abrir el confirm sheet y
  // se REUSA en todos los reintentos de esa intencion (§2.5). Editar despues de un fallo
  // arranca una intencion nueva (clave nueva) para que el retry no resucite un draft viejo.
  const idempotencyKeyRef = useRef<string | null>(null)

  // Baseline y draft actual pasan por la MISMA proyeccion → cero ediciones = cero cambios,
  // sin depender de detalles de normalizacion del paquete.
  const baselineDraft = useMemo(() => applyQuickEditToDraft(baseDraft, initialState), [baseDraft, initialState])
  const currentDraft = useMemo(() => applyQuickEditToDraft(baseDraft, state), [baseDraft, state])
  const changeCount = useMemo(() => countDraftChanges(baselineDraft, currentDraft), [baselineDraft, currentDraft])
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

  const futureDateLabel = useMemo(() => {
    const effectiveFrom = planModel.plan?.effectiveFrom ?? null
    if (!effectiveFrom || effectiveFrom <= today) return null
    return formatIsoDateDdMmYyyy(effectiveFrom)
  }, [planModel.plan, today])

  const openConfirm = useCallback(() => {
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
  }, [validation.ok, clientId])

  const closeConfirm = useCallback(() => {
    if (isPending) return
    setConfirmOpen(false)
  }, [isPending])

  const runPublish = useCallback(() => {
    const baseVersionId = planModel.plan?.versionId
    const idempotencyKey = idempotencyKeyRef.current
    if (!baseVersionId || !idempotencyKey) return
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
  }, [clientId, clientName, currentDraft, onExit, planModel.plan, router])

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

  const discardChanges = useCallback(() => {
    if (isPending) return
    if (dirty && !window.confirm(QE_COPY.discardConfirm(changeCount))) return
    idempotencyKeyRef.current = null
    onExit()
  }, [isPending, dirty, changeCount, onExit])

  const requestExit = useCallback(() => {
    if (isPending) return
    if (dirty && !window.confirm(QE_COPY.leaveGuard)) return
    idempotencyKeyRef.current = null
    onExit()
  }, [isPending, dirty, onExit])

  const reloadAfterStale = useCallback(() => {
    idempotencyKeyRef.current = null
    setStaleOpen(false)
    router.refresh()
    onExit()
  }, [onExit, router])

  const value: QuickEditContextValue = {
    state,
    dispatch,
    clientId,
    clientName,
    strategy: planModel.plan?.strategy ?? 'flexible',
    visibleNotes: planModel.visibleNotes,
    protocolNotes: planModel.protocolNotes,
    permissions: planModel.permissions,
    portionGroups,
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
  }

  return <QuickEditContext.Provider value={value}>{children}</QuickEditContext.Provider>
}
