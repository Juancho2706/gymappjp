import { getTierMaxClients, studentCountLabel } from '@eva/tiers'

/**
 * Verdad de cupo del coach — lógica PURA (sin react-native, sin expo) compartida por el medidor
 * (`components/coach/ClientCapMeter.tsx`), el banner del home y el muro de cupo del alta
 * (`components/coach/directory/CreateClientModal.tsx`).
 *
 * Acá vive también el PREDICADO de quién ocupa cupo (`occupiesCap` / `countCapClients`): toda
 * cuenta local que alimente un medidor o un pre-check pasa por él, para que ninguna pantalla
 * vuelva a inventar su propio filtro.
 *
 * Embudo Free→Pro (W6, SPEC `docs/specs/embudo-free-pro/SPEC.md`): la app dice la VERDAD de su
 * propio plan y la hace visible; nunca vende. Por eso acá no hay precios, ni tiers ajenos, ni
 * links: el único texto sensible es el caption de Android, que Google publica como aceptable para
 * apps consumption-only («Go to our website to upgrade…»). En iOS ese caption NO existe —
 * guideline 3.1.1: cero botón, link, URL, precio o tier ajeno que lleve a pagar.
 *
 * El split va SIEMPRE por `Platform.OS`, jamás por storefront (decisión cerrada del owner 21-08).
 *
 * Vive en `lib/` y no en el componente porque es la parte testeable del contrato
 * (`tests/mobile/client-cap.test.ts` pinnea el plural, el tono y la ausencia del caption en iOS).
 */

/** Tono semántico del medidor: marca (<80 %), ámbar (≥80 %) y lleno (100 %). */
export type CapTone = 'brand' | 'warning' | 'full'

/**
 * Ámbar del medidor de cupo — mismo hex que `--warning-500` en ambos temas (excepción documentada
 * de TOKENS.md §1: la rampa de marca NO pisa los semáforos).
 *
 * Vive acá, y no en cada componente, porque el medidor (`ClientCapMeter`) y el banner Free del home
 * (`CoachDashboardSections`) tienen que pintar EL MISMO ámbar: dos copias del hex divergen al
 * primer ajuste del DS. Cuando exista un módulo de tokens de color en `lib/`, se muda ahí.
 */
export const WARNING_500 = '#F5A524'

/** Umbral ámbar: el medidor avisa ANTES de que el próximo alumno rebote contra el muro. */
export const CAP_WARNING_RATIO = 0.8

/** Etiqueta del estado lleno (no es un CTA: es estado). */
export const CAP_FULL_LABEL = 'Cupo completo'

/**
 * Fracción ocupada del cupo, 0..1. Cupo no positivo o no finito ⇒ 1 (lleno): sin cupo utilizable
 * el medidor tiene que leerse lleno, nunca vacío.
 */
export function capRatio(active: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const safeActive = Number.isFinite(active) && active > 0 ? active : 0
  return Math.min(1, safeActive / max)
}

export function capTone(active: number, max: number): CapTone {
  const ratio = capRatio(active, max)
  if (ratio >= 1) return 'full'
  if (ratio >= CAP_WARNING_RATIO) return 'warning'
  return 'brand'
}

/**
 * «3 de 25 alumnos activos» · «1 de 1 alumno activo». El sustantivo sale de `studentCountLabel`
 * (catálogo compartido) y el adjetivo CONCUERDA con él: con Free = 1 el interpolado a mano decía
 * «1 de 1 alumnos activos».
 *
 * Con 0 alumnos (W0.4, `docs/specs/flujo-coach-nuevo/SPEC.md` §6) el medidor dejó de arrancar en
 * «0 de 1 alumno activo»: un coach recién registrado leía su plan como si ya estuviera vacío en
 * vez de leer lo que trae. El texto pasa a «Tu plan gratis incluye 1 alumno», también interpolado
 * con `studentCountLabel` — nunca a mano. Acotado a `max === 1` (Free): el copy dice «plan
 * gratis», y esta función también pinta el anillo de `subscription.tsx` para Pro/Elite, donde un
 * coach con 0 alumnos debe seguir leyendo «0 de 25 alumnos activos», no una mentira de tier.
 */
export function capMeterLabel(active: number, max: number): string {
  const safeActive = Number.isFinite(active) && active > 0 ? Math.floor(active) : 0
  if (safeActive === 0 && max === 1) {
    return `Tu plan gratis incluye ${studentCountLabel(max)}`
  }
  return `${safeActive} de ${studentCountLabel(max)} ${max === 1 ? 'activo' : 'activos'}`
}

/** Única línea que Android admite (texto plano, sin link, sin precio). iOS jamás la ve. */
export const STORE_PLAN_CHANGE_CAPTION = 'Los cambios de plan se hacen en eva-app.cl'

/**
 * La caption de tienda por plataforma. `undefined` fuera de Android — y la AUSENCIA es el
 * requisito, no un detalle de UI: en iOS el nodo ni se monta (guideline 3.1.1).
 *
 * Es la ÚNICA fábrica del literal en toda la app: `planCaption` (lib/plan-change.ts) delega acá y
 * las pantallas la llaman en vez de escribir la frase. `tests/mobile/store-copy.test.ts` barre el
 * árbol para que siga siendo así.
 */
export function storePlanChangeCaption(platform: string): string | undefined {
  return platform === 'android' ? STORE_PLAN_CHANGE_CAPTION : undefined
}

/**
 * Beneficios del plan Free que ve el coach recién registrado (`app/(auth)/verify-email.tsx`).
 *
 * Es la MISMA lista en iOS y Android: el beneficio es «puedes cambiar de plan cuando quieras», un
 * hecho del producto. El DÓNDE (que solo Android puede nombrar) no se mete adentro del beneficio —
 * va aparte, como caption de tienda, para que exista UNA sola línea canónica de compliance y no
 * una variante de ella escondida en cada pantalla.
 */
export function freePlanBenefits(): string[] {
  return [
    `${studentCountLabel(getTierMaxClients('free'))} sin costo, con tu marca`,
    'Planes de entrenamiento ilimitados',
    'Tu propia app para alumnos',
    'Cambia de plan cuando quieras',
  ]
}

/**
 * Forma MÍNIMA que necesita el conteo de cupo. Se tipa acá —y no con `DirectoryClient`— para que
 * este módulo siga siendo puro: `lib/clients-directory.ts` importa `./supabase`, y con esa
 * dependencia el helper dejaría de poder testearse sin react-native.
 */
export interface CapCountable {
  isArchived: boolean
  /**
   * `clients.is_demo`. Ausente/`null` = lectura de una DB anterior a la columna (fallback de
   * compatibilidad): se trata como NO demo, que es el comportamiento viejo.
   */
  isDemo?: boolean | null
}

/**
 * ¿ESTE alumno ocupa cupo? Predicado ÚNICO del gate, espejo del server
 * (`countActiveStandaloneClients`, `apps/web/src/services/billing/capacity.service.ts`):
 * `is_archived = false AND is_demo = false`.
 *
 * El alumno de EJEMPLO del onboarding v2 no ocupa cupo. Con Free = 1 (pricing v3), contarlo hacía
 * nacer lleno al coach nuevo: el pre-check local abría el muro «Alcanzaste el cupo de tu plan» en
 * «Nuevo alumno» y en el paso 4 de la guía, mientras el selector de archivado —que sí lo excluía—
 * le decía «Tus alumnos de ejemplo no ocupan cupo» (QA del owner en Android, 22-08). Dos verdades
 * distintas del mismo número: por eso el predicado vive en UN solo lugar.
 *
 * NO usa `is_active`: un alumno pausado sigue ocupando cupo (igual que en el server).
 */
export function occupiesCap(client: CapCountable | null | undefined): boolean {
  return !!client && client.isArchived !== true && client.isDemo !== true
}

/**
 * Alumnos que OCUPAN CUPO en una cartera ya cargada. Es la ÚNICA cuenta local que puede alimentar
 * un pre-check de cupo (`shouldOpenAtCapWall`, el medidor, la importación).
 *
 * Sigue siendo optimista, no una autorización: el 402 `UPGRADE_REQUIRED` del server es la verdad.
 * Lista vacía/ausente ⇒ 0, que es el default PERMISIVO (deja pasar al formulario).
 */
export function countCapClients(clients: readonly CapCountable[] | null | undefined): number {
  if (!clients) return 0
  return clients.reduce((total, client) => (occupiesCap(client) ? total + 1 : total), 0)
}

/**
 * ¿El alta tiene que ABRIR directo en el muro, sin mostrar el formulario?
 *
 * QA del owner en Android (22-08): con el cupo lleno, «+ agregar alumno» abría el formulario
 * completo y el muro aparecía recién al enviar — el coach escribía nombre, correo, teléfono y
 * contraseña para que se los rechazaran. El muro tiene que llegar ANTES del primer campo.
 *
 * Es un PRE-CHECK optimista sobre el conteo que la pantalla ya tiene cargado, no una autorización:
 * el 402 `UPGRADE_REQUIRED` del server sigue siendo la verdad y cubre el caso contrario (conteo
 * local desactualizado ⇒ el formulario se abre igual y rebota al enviar). Por eso el default es
 * PERMISIVO: cualquier dato ausente, no finito o sin cupo utilizable devuelve `false` y deja pasar
 * al formulario — bloquear un alta legítima por una lectura incompleta es peor que un rebote.
 */
export function shouldOpenAtCapWall({
  activeCount,
  maxClients,
}: {
  activeCount?: number | null
  maxClients?: number | null
}): boolean {
  if (typeof activeCount !== 'number' || !Number.isFinite(activeCount)) return false
  if (typeof maxClients !== 'number' || !Number.isFinite(maxClients)) return false
  if (maxClients <= 0) return false
  return activeCount >= maxClients
}

export interface CapWallCopy {
  title: string
  body: string
  /** Solo Android. `undefined` en iOS (y en cualquier otra plataforma). */
  caption?: string
}

/**
 * Copy del muro de cupo (fase (C) del alta). `platform` es `Platform.OS` tal cual — el llamador no
 * decide nada más.
 */
export function capWallCopy({
  limit,
  platform,
}: {
  limit?: number | null
  platform: string
}): CapWallCopy {
  const hasLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0
  const allowance = hasLimit
    ? `Tu plan actual permite ${studentCountLabel(limit)} ${limit === 1 ? 'activo' : 'activos'}.`
    : 'Tu plan actual no permite sumar más alumnos activos.'

  return {
    title: 'Alcanzaste el cupo de tu plan',
    body: `${allowance} Para dejar espacio puedes archivar un alumno: su historial se mantiene intacto.`,
    ...(storePlanChangeCaption(platform) ? { caption: STORE_PLAN_CHANGE_CAPTION } : {}),
  }
}
