import type { Persona } from '@eva/schemas'
import { evaluateAutomatedEmailQuota, isWithinSendWindow } from '../automated-email-policy'

/**
 * Motor de los «correos por comportamiento» del onboarding v2 (W6 / F6.1).
 *
 * QUÉ REEMPLAZA: el drip por calendario (`send-drip-sequence.ts`) le escribía al coach por el
 * almanaque —D+1, D+2, D+7, D+14— sin mirar una sola vez qué había hecho. D11 = A (owner 22-08):
 * ese drip MUERE y estos seis gatillos ocupan su lugar (SPEC §8 de coach-onboarding-v2).
 *
 * ESTE ARCHIVO ES PURO: recibe un snapshot ya leído y devuelve qué correos corresponden. Cero
 * Supabase, cero Resend, cero `process.env`. Todo lo que decide se puede probar con un objeto y una
 * fecha, que es lo que hace auditable el copy antes de encenderlo (el flag vive en el cron).
 *
 * SEIS SEÑALES (SPEC §8, con los momentos del plan «Correos y activación» del 01-10):
 *   día 1 sin alumno real · día 3 sin su primera rutina/pauta · +48 h alumno invitado que no entró ·
 *   aha (primer entreno/comida de un alumno real) · +7 d sin activar (ayuda humana) · corte a 90 d.
 * El corte no manda correo: apaga a todos los demás.
 *
 * SEIS INVARIANTES:
 *
 * · **DEDUPE por `(coach_id, template_key)`** — el snapshot trae `alreadySent` (las keys vivas del
 *   ledger `coach_email_ledger`) y el motor no vuelve a proponerlas. `scheduleCoachEmail` deduplica
 *   igual en la base; acá se hace ANTES para no gastar un envío por hora por coach hasta el día 90.
 *
 * · **CORTE DE LANZAMIENTO** (`BehaviorPolicy.launchCutover`, env `ONBOARDING_BEHAVIOR_EMAILS_SINCE`)
 *   — W6 solo existe para las cuentas creadas desde el día en que se enciende. Sin corte legible no
 *   sale nada (fail-closed).
 *
 * · **CUPO COMPARTIDO Y HORARIO** (`lib/email/automated-email-policy.ts`) — el dedupe es por correo,
 *   no por persona: sin un piso por coach, uno mismo junta tres correos DISTINTOS en tres corridas
 *   horarias. Máximo 1 correo automático cada 24 h y 3 por semana, contando también el aviso de cupo
 *   y el carrito abandonado; solo entre 09:00 y 20:00 de Chile. El aha atraviesa el cupo, no el
 *   horario.
 *
 * · **BAJA** — la marca de baja del ledger (`EMAIL_OPT_OUT_TEMPLATE_KEY`) apaga la serie entera.
 *
 * · **UNO POR CORRIDA.** La lista sale ORDENADA por prioridad y el barrido manda solo la primera.
 *   Un coach de 8 días que nunca cargó a nadie matchea 2 h, 24 h y 7 d a la vez: mandarle los tres
 *   juntos es exactamente el spam que este rediseño vino a matar.
 *
 * · **FAIL-CLOSED.** Sin `createdAt` legible, sin email o con la cuenta de prueba, la respuesta es
 *   lista vacía. El error barato es un correo que no sale; el caro es escribirle a un padrón entero.
 */

/** Las cinco keys que este motor puede proponer. Mitad de la clave de dedupe del ledger. */
export const BEHAVIOR_TEMPLATE_KEYS = [
    'behavior_aha',
    'behavior_client_not_entered_48h',
    'behavior_no_client_2h',
    'behavior_no_return_24h',
    'behavior_help_7d',
] as const

export type BehaviorTemplateKey = (typeof BEHAVIOR_TEMPLATE_KEYS)[number]

/**
 * Prefijo de TODAS las keys. Vive acá para que nada del drip viejo (`day1_value`…) pueda colisionar
 * con una key de comportamiento en el índice único del ledger.
 */
export const BEHAVIOR_TEMPLATE_KEY_PREFIX = 'behavior_'

/**
 * Orden de PRIORIDAD, de la más urgente a la menos. Es el orden de `BEHAVIOR_TEMPLATE_KEYS` y el
 * que decide qué correo sale cuando matchean varios:
 *
 * 1. `behavior_aha` — es una felicitación por algo que YA pasó; cualquier otro correo encima de un
 *    aha («todavía no invitaste a nadie») sería directamente falso.
 * 2. `behavior_client_not_entered_48h` — el coach hizo su parte y el trabajo está trabado del otro
 *    lado; es el único correo que le da algo accionable de inmediato.
 * 3. `behavior_no_client_2h` — el primer empujón del día 1.
 * 4. `behavior_no_return_24h` — más blando que el anterior y sirve igual al día siguiente.
 * 5. `behavior_help_7d` — último toque, el más caro (abre una conversación humana).
 */
export const BEHAVIOR_PRIORITY: readonly BehaviorTemplateKey[] = BEHAVIOR_TEMPLATE_KEYS

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * «Cuenta creada, sin alumno real» — el correo del DÍA 1 (plan 01-10; antes salía a las 2 h, a veces
 * de noche y encima de la bienvenida). 20 h deja pasar la noche y, con la ventana de 09–20 h, llega en
 * horario hábil del día siguiente.
 *
 * La key sigue siendo `behavior_no_client_2h`: es la identidad de dedupe del ledger, no una promesa
 * de horario.
 */
export const NO_CLIENT_AFTER_MS = 20 * HOUR_MS
/**
 * «Todavía no armó su primera rutina/pauta» — el correo del DÍA 3. Reemplaza al viejo «+24 h sin
 * volver al panel», que leía `coaches.last_active_at`: esa columna la escribe solo la web, así que a
 * los coaches que viven en la app RN les llegaba «no volviste» por error. La key sigue siendo
 * `behavior_no_return_24h` por la misma razón que la anterior.
 */
export const FIRST_ARTIFACT_NUDGE_AFTER_MS = 3 * DAY_MS
/** «Alumno invitado, no entró» (SPEC §8, fila 3). */
export const CLIENT_NOT_ENTERED_AFTER_MS = 48 * HOUR_MS
/** «7 d sin activar» (SPEC §8, fila 5). */
export const HELP_AFTER_MS = 7 * DAY_MS
/** Corte del onboarding: pasado esto no sale ningún correo más (SPEC §8, fila 6). */
export const ONBOARDING_CUTOFF_MS = 90 * DAY_MS

/**
 * Instante desde el cual `clients.first_login_at` es una señal CONFIABLE. Una fila anterior al
 * deploy que empezó a escribir la columna llega sin timestamp por VEJEZ, no porque el alumno no
 * haya entrado, y mandarle al coach «tu alumno todavía no entró» sobre un alumno que entrena hace
 * meses es mentirle.
 *
 * DUPLICADO A PROPÓSITO de `app/coach/clients/_lib/client-status.ts:29`
 * (`FIRST_LOGIN_SIGNAL_CUTOVER`), que es la fuente canónica: este módulo es `lib/` y no puede
 * importar de `app/` (Clean Architecture). Mismo precedente que la copia en RN
 * (`apps/mobile/components/coach/directory/directory-shared.ts`). Si allá cambia, cambia acá.
 */
export const FIRST_LOGIN_SIGNAL_CUTOVER = '2026-08-26T06:00:00Z'

/**
 * Configuración del encendido que NO es foto del coach: entra por parámetro para que el motor siga
 * siendo puro y cada regla se pruebe con un objeto.
 *
 * `launchCutover` — solo los coaches creados EN O DESPUÉS de este instante reciben W6. El ensayo del
 * 06-09 dio `wouldSend=83` en la primera hora porque el barrido cubría al padrón entero; desde el plan
 * del 01-10 el corte es la fecha de ENCENDIDO (env `ONBOARDING_BEHAVIOR_EMAILS_SINCE`, se fija sin
 * redeploy) y los coaches anteriores no reciben la serie atrasada. `null` = sin corte legible ⇒ nadie
 * entra (fail-closed: escribirle a un padrón entero es el error caro).
 */
export interface BehaviorPolicy {
    launchCutover: string | null
}

/**
 * Cuenta de QA que ATRAVIESA la exclusión de cuentas de prueba (W8.4.4). `qa-free-v3@evatest.cl` es
 * la cuenta con la que el owner recorre las 5 personas, y sin este bypass explícito
 * `isTestCoachEmail` (dominio `evatest.cl`) haría que W6 sea imposible de probar de punta a punta:
 * el único QA posible sería leer el HTML en un test.
 */
export const BEHAVIOR_TEST_ACCOUNT_BYPASS = 'qa-free-v3@evatest.cl'

/** ¿Este email atraviesa la exclusión de cuentas de prueba? Puro, case-insensitive. */
export function isBehaviorTestBypass(email: string | null | undefined): boolean {
    return (email ?? '').trim().toLowerCase() === BEHAVIOR_TEST_ACCOUNT_BYPASS
}

/**
 * Foto del coach en el instante del barrido. La arma `behavior-emails.ts` con service-role; acá
 * entra como DATO para que cada regla se pueda probar sin base.
 */
export interface CoachBehaviorSnapshot {
    coachId: string
    /** Email real (vive en `auth.users`, no en `coaches`). `null` ⇒ no hay a quién escribirle. */
    email: string | null
    persona: Persona | null
    /** `coaches.created_at` — ancla de TODAS las ventanas y del corte a 90 d. */
    createdAt: string | null
    /**
     * ¿Ya armó su primera rutina/pauta/semana? (`resolveFirstArtifact`, sin contar lo sembrado del
     * demo). `null` = no se leyó —el correo del día 3 ya salió o todavía no toca— o la lectura falló:
     * en los dos casos el correo del día 3 NO sale.
     */
    hasFirstArtifact: boolean | null
    /** Alumnos REALES: `is_demo = false` y `is_archived = false`. El demo no cuenta jamás. */
    realClientCount: number
    /** ¿Algún alumno real ya entró alguna vez? (`clients.first_login_at`). */
    anyRealClientLoggedIn: boolean
    /**
     * `created_at` del alumno real MÁS VIEJO que sigue sin entrar, contando SOLO filas posteriores
     * a `FIRST_LOGIN_SIGNAL_CUTOVER`. `null` = no hay ninguna invitación pendiente medible.
     */
    oldestPendingInviteAt: string | null
    /** El aha: `workout_logs` o `nutrition_intake_entries` de un alumno REAL (nunca del demo). */
    hasRealStudentActivity: boolean
    /** Keys VIVAS del ledger para este coach: el dedupe por `(coach_id, template_key)`. */
    alreadySent: readonly string[]
    /**
     * Instantes de los correos automáticos que ya recibió (o tiene agendados), de LOS DOS registros:
     * W6 y carrito en `coach_email_ledger`, aviso de cupo en `admin_audit_logs`. Alimenta el cupo
     * compartido. `null` = historial ilegible ⇒ no sale nada en esta corrida (fail-closed).
     */
    recentAutomatedSentAts: readonly string[] | null
    /** Marca de baja viva en el ledger: pidió no recibir más. */
    optedOut: boolean
    /** Cuenta de prueba según `lib/test-accounts` (el bypass de QA se resuelve acá adentro). */
    isTestAccount: boolean
    /**
     * `coaches.active_org_id != null`. Un coach que opera dentro de una organización no recorre
     * este onboarding —su cupo, su marca y su alta las manda la org— y el gate de persona ya lo
     * excluye (`shouldAskPersonaOnMobile`). Escribirle «invitá a tu primer alumno» sería ruido.
     */
    isOrgManaged: boolean
}

/** Motivo del disparo. Slug estable y SIN PII: va al log y al `payload` del ledger. */
export type BehaviorTriggerReason =
    | 'real_student_activity'
    | 'invite_pending_48h'
    | 'no_real_client_day1'
    | 'no_first_artifact_day3'
    | 'not_activated_7d'

export interface BehaviorTrigger {
    template_key: BehaviorTemplateKey
    reason: BehaviorTriggerReason
}

/** Por qué un coach quedó fuera. Se cuenta en el resumen del cron; nunca lleva email ni nombre. */
export type BehaviorSkipReason =
    | 'no_recipient'
    | 'test_account'
    | 'org_managed'
    | 'opted_out'
    | 'no_created_at'
    | 'past_cutoff'
    | 'before_launch'
    | 'history_unreadable'
    | 'outside_hours'
    | 'cooldown'
    | 'weekly_max'

export type BehaviorEvaluation =
    | { eligible: false; skipped: BehaviorSkipReason }
    | { eligible: true; triggers: BehaviorTrigger[] }

function msSince(iso: string | null, now: Date): number | null {
    if (!iso) return null
    const t = new Date(iso).getTime()
    return Number.isFinite(t) ? now.getTime() - t : null
}

/**
 * ¿La cuenta nació antes del encendido de W6? Ver `BehaviorPolicy.launchCutover`. Sin corte legible
 * responde `true`: nadie entra.
 */
function isBeforeBehaviorLaunch(createdAt: string | null, launchCutover: string | null): boolean {
    const launch = launchCutover ? new Date(launchCutover).getTime() : NaN
    if (!Number.isFinite(launch)) return true
    const created = createdAt ? new Date(createdAt).getTime() : NaN
    if (!Number.isFinite(created)) return false // sin fecha legible manda `no_created_at`, no esto
    return created < launch
}

/**
 * Precondiciones del coach, antes de mirar una sola señal.
 *
 * EL CORTE A 90 d SE MIDE CONTRA `created_at`, NO CONTRA `persona_set_at` (decisión de W8.4.4). La
 * pregunta que contesta el corte es «¿esta cuenta sigue siendo nueva?», y anclarlo a la persona haría
 * que un coach de dos años que elige especialidad hoy vuelva a entrar al onboarding completo —
 * «invitá a tu primer alumno» a alguien con cartera es el peor correo posible. `persona_set_at`
 * gobierna el CONTENIDO (qué copy sale), no la vigencia.
 */
export function evaluateBehaviorEligibility(
    snapshot: CoachBehaviorSnapshot,
    now: Date,
    policy: BehaviorPolicy
): BehaviorSkipReason | null {
    if (!snapshot.email) return 'no_recipient'
    if (snapshot.isTestAccount && !isBehaviorTestBypass(snapshot.email)) return 'test_account'
    if (snapshot.isOrgManaged) return 'org_managed'
    if (snapshot.optedOut) return 'opted_out'

    const age = msSince(snapshot.createdAt, now)
    // Fail-closed: sin ancla no se puede probar NINGUNA ventana (ni el corte).
    if (age === null) return 'no_created_at'
    // El corte de lanzamiento va ANTES del de 90 d: para una cuenta de julio las dos cosas son
    // ciertas, y la que explica por qué no le escribimos es que W6 no existía cuando se creó.
    if (isBeforeBehaviorLaunch(snapshot.createdAt, policy.launchCutover)) return 'before_launch'
    if (age >= ONBOARDING_CUTOFF_MS) return 'past_cutoff'
    if (snapshot.recentAutomatedSentAts === null) return 'history_unreadable'
    return null
}

/**
 * Qué correos de comportamiento corresponden HOY, ordenados por prioridad y ya deduplicados.
 *
 * Devuelve la lista completa (la usa el dry-run para auditar); el barrido manda SOLO la primera.
 */
export function computeBehaviorTriggers(
    snapshot: CoachBehaviorSnapshot,
    now: Date,
    policy: BehaviorPolicy
): BehaviorEvaluation {
    const skipped = evaluateBehaviorEligibility(snapshot, now, policy)
    if (skipped) return { eligible: false, skipped }

    const age = msSince(snapshot.createdAt, now) as number
    const sent = new Set(snapshot.alreadySent)
    const matched = new Map<BehaviorTemplateKey, BehaviorTriggerReason>()

    // ── Aha: inmediato, sin ventana. Lo dispara el alumno, no el reloj. ──
    if (snapshot.hasRealStudentActivity) matched.set('behavior_aha', 'real_student_activity')

    // ── +48 h: el coach invitó y del otro lado no entró nadie. ──
    // Solo cuando NINGÚN alumno real entró todavía: con uno adentro el coach ya vio el producto
    // funcionando y este correo pasa a ser ruido.
    if (!snapshot.anyRealClientLoggedIn) {
        const pendingFor = msSince(snapshot.oldestPendingInviteAt, now)
        if (pendingFor !== null && pendingFor >= CLIENT_NOT_ENTERED_AFTER_MS) {
            matched.set('behavior_client_not_entered_48h', 'invite_pending_48h')
        }
    }

    // ── Día 1: cuenta creada y todavía sin un alumno real. ──
    if (age >= NO_CLIENT_AFTER_MS && snapshot.realClientCount === 0) {
        matched.set('behavior_no_client_2h', 'no_real_client_day1')
    }

    // ── Día 3: todavía no armó su primera rutina/pauta (solo con la lectura confirmada en `false`). ──
    if (age >= FIRST_ARTIFACT_NUDGE_AFTER_MS && snapshot.hasFirstArtifact === false) {
        matched.set('behavior_no_return_24h', 'no_first_artifact_day3')
    }

    // ── +7 d sin ACTIVAR: activar = que un alumno real haya hecho algo (el aha). ──
    if (age >= HELP_AFTER_MS && !snapshot.hasRealStudentActivity) {
        matched.set('behavior_help_7d', 'not_activated_7d')
    }

    const triggers: BehaviorTrigger[] = []
    for (const key of BEHAVIOR_PRIORITY) {
        const reason = matched.get(key)
        if (!reason) continue
        if (sent.has(key)) continue // dedupe por (coach_id, template_key)
        triggers.push({ template_key: key, reason })
    }

    if (triggers.length === 0) return { eligible: true, triggers }

    // ── Horario de Chile (09–20 h), para TODOS, aha incluido. ──
    // Va DESPUÉS del dedupe a propósito, igual que el cupo: los contadores cuentan solo a los coaches
    // que hoy tenían algo real que recibir, y «no había nada» no se mezcla con «había, y espera». La
    // señal sigue ahí en la corrida de las 09:00.
    if (!isWithinSendWindow(now)) return { eligible: false, skipped: 'outside_hours' }

    // ── Cupo compartido: 1 cada 24 h y 3 por semana, contando los dos registros. ──
    // El aha lo atraviesa: es la única señal que dispara el ALUMNO y no el reloj, felicita algo que
    // acaba de pasar, y llegar días tarde la vuelve ruido.
    const block = evaluateAutomatedEmailQuota(snapshot.recentAutomatedSentAts ?? [], now)
    if (block) {
        const allowed = triggers.filter((t) => t.template_key === 'behavior_aha')
        // Skip EXPLÍCITO en vez de caer a `no_trigger`: «no había nada que decirle» y «había, y lo
        // estamos espaciando» son dos cosas distintas, y solo la segunda se recupera sola.
        if (allowed.length === 0) {
            return { eligible: false, skipped: block === 'gap_24h' ? 'cooldown' : 'weekly_max' }
        }
        return { eligible: true, triggers: allowed }
    }

    return { eligible: true, triggers }
}

/** El correo que sale en esta corrida (el de mayor prioridad), o `null` si no corresponde ninguno. */
export function pickBehaviorTrigger(evaluation: BehaviorEvaluation): BehaviorTrigger | null {
    return evaluation.eligible ? (evaluation.triggers[0] ?? null) : null
}
