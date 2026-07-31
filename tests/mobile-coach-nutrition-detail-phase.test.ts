import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  DETAIL_ERROR_COPY,
  classifyDetailError,
  resolveDetailErrorKind,
  resolveDetailPhase,
  type DetailPhaseInput,
} from '../apps/mobile/lib/coach-nutrition-detail-phase'

/**
 * Réplica de la forma de `ApiError` (`apps/mobile/lib/api.ts:23`). No se importa la clase real
 * porque ese módulo arrastra react-native/Sentry y revienta el transform de Vitest; `classifyDetailError`
 * clasifica por forma (`name` + `status`) justamente para no depender de `instanceof`.
 */
class ApiErrorLike extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function phaseInput(overrides: Partial<DetailPhaseInput> = {}): DetailPhaseInput {
  return {
    gatesResolved: true,
    gatesStalled: false,
    enabled: true,
    hasDetail: false,
    errorKind: null,
    ...overrides,
  }
}

describe('ficha nutrición coach · fase de apertura', () => {
  it('con prerrequisitos a medias sigue RESOLVIENDO (nunca el panel ámbar)', () => {
    // El bug original: `session.resolved=false` apagaba `loading` y pintaba "No pudimos abrir la ficha".
    expect(resolveDetailPhase(phaseInput({ gatesResolved: false }))).toBe('resolving')
  })

  it('con gates resueltos y habilitado, sin data ni error, está CARGANDO (jamás failed)', () => {
    expect(resolveDetailPhase(phaseInput())).toBe('loading')
  })

  it('con gates resueltos y rollout apagado da el veredicto BLOCKED', () => {
    expect(resolveDetailPhase(phaseInput({ enabled: false }))).toBe('blocked')
  })

  it('un error real sin copia local es FAILED', () => {
    expect(resolveDetailPhase(phaseInput({ errorKind: 'network' }))).toBe('failed')
  })

  it('un error con la ficha ya en pantalla NO la tumba: sigue READY', () => {
    expect(resolveDetailPhase(phaseInput({ errorKind: 'network', hasDetail: true }))).toBe('ready')
  })

  it('un store que resolvió y falló cae en FAILED, no en loader infinito', () => {
    expect(resolveDetailPhase(phaseInput({ gatesResolved: false, gatesStalled: true }))).toBe('failed')
    expect(resolveDetailErrorKind({ errorKind: null, gatesStalled: true })).toBe('workspace')
    // El error del fetch siempre gana sobre el fallback de workspace.
    expect(resolveDetailErrorKind({ errorKind: 'permission', gatesStalled: true })).toBe('permission')
  })

  it('la data manda incluso si los gates todavía no resolvieron (cache local pintada)', () => {
    expect(resolveDetailPhase(phaseInput({ gatesResolved: false, hasDetail: true }))).toBe('ready')
  })
})

describe('ficha nutrición coach · clasificación del error', () => {
  it('distingue red, permisos, sesión, servidor y contrato roto', () => {
    expect(classifyDetailError(new ApiErrorLike('forbidden', 403))).toBe('permission')
    expect(classifyDetailError(new ApiErrorLike('not found', 404))).toBe('permission')
    expect(classifyDetailError(new ApiErrorLike('unauthorized', 401))).toBe('session')
    expect(classifyDetailError(new ApiErrorLike('boom', 500))).toBe('server')
    expect(classifyDetailError(new TypeError('Network request failed'))).toBe('network')

    const zodError = z.object({ id: z.string() }).safeParse({ id: 1 }).error
    expect(zodError).toBeInstanceOf(z.ZodError)
    expect(classifyDetailError(zodError)).toBe('contract')
  })

  it('todo kind tiene copy con icono soportado por NutritionStatePanel', () => {
    for (const kind of ['network', 'permission', 'server', 'contract', 'session', 'workspace'] as const) {
      const copy = DETAIL_ERROR_COPY[kind]
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.description.length).toBeGreaterThan(0)
      expect(['offline', 'error', 'permission']).toContain(copy.icon)
    }
    // Solo la caída de red habla de conectividad: el 403/500/Zod ya no miente con copy offline.
    expect(DETAIL_ERROR_COPY.network.icon).toBe('offline')
    expect(DETAIL_ERROR_COPY.permission.icon).not.toBe('offline')
  })
})
