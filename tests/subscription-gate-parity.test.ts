import { describe, expect, it } from 'vitest'
import { hasEffectiveAccess as webHasEffectiveAccess } from '@/lib/coach-subscription-gate'
import { navHasEffectiveAccess } from '@eva/coach-nav'
import { hasEffectiveAccess as mobileHasEffectiveAccess } from '../apps/mobile/lib/workspace-core'

/**
 * Test de CONTRATO de la política de acceso efectivo del coach.
 *
 * POR QUE EXISTE (incidente 2026-09-18, coach JB fitness)
 * ------------------------------------------------------
 * La regla «un coach en dunning conserva el acceso hasta `current_period_end`» vive escrita en
 * CINCO lugares: el gate de ruta de la web, su espejo en RN, el registro de nav, el SET de estados
 * bloqueados y una función SQL. En septiembre se corrigió la regla en DOS de esos lugares. Los
 * otros quedaron con la versión vieja, y el resultado fue que el proxy dejaba entrar a un coach al
 * que el nav le borraba el menú entero: entraba a un panel vacío con 8 días pagados por delante y
 * lo reportó como «no puedo entrar».
 *
 * Cada copia tenía su propio test y TODOS pasaban. Lo que no existía era un test que las comparara
 * ENTRE SÍ — que es la única forma de detectar que una se quedó atrás.
 *
 * QUE CUBRE Y QUE NO
 * ------------------
 * · CUBRE las 3 implementaciones TS: si alguien toca una sola, este test se cae.
 * · La columna SQL es un SNAPSHOT: los veredictos de `private.coach_has_effective_access` se leyeron
 *   contra la base de producción (proyecto jikjeokundmaafuytdcx) el 2026-09-19 y están fijados acá
 *   como literales. Eso NO detecta un cambio futuro de la función SQL — para eso hay que volver a
 *   correr la consulta de abajo y actualizar la tabla. Está declarado a propósito en vez de fingir
 *   una verificación viva que este runner no puede hacer (no tiene credenciales de base).
 *
 * COMO REFRESCAR LA COLUMNA SQL
 * -----------------------------
 *   with estados(st) as (values ('active'),('trialing'),('canceled'),('paused'),('past_due'),
 *                               ('pending_payment'),('expired'),('org_managed'),('team_managed'),
 *                               (null),(''),('un_estado_que_no_existe')),
 *        fechas(fe) as (values (null::timestamptz),
 *                              ('2026-09-26T15:14:13Z'::timestamptz),
 *                              ('2026-09-10T00:00:00Z'::timestamptz))
 *   select st, fe, private.coach_has_effective_access(st, fe)
 *   from estados cross join fechas order by st, fe;
 *
 * Las dos fechas son deliberadas: una FUTURA (el corte real de Joaquín, 26-09) y una PASADA. El
 * `NOW` de abajo tiene que quedar entre ambas para que la tabla siga significando lo mismo.
 */

/** Instante de referencia: posterior a la fecha PASADA y anterior a la FUTURA. */
const NOW = Date.parse('2026-09-19T02:25:00Z')

const FUTURO = '2026-09-26T15:14:13Z'
const PASADO = '2026-09-10T00:00:00Z'

/**
 * Veredictos de `private.coach_has_effective_access` leídos en producción el 2026-09-19.
 * [estado, fecha de corte, ¿tiene acceso?]
 */
const TABLA_SQL: Array<[string | null, string | null, boolean]> = [
    // Sin estado / estado desconocido ⇒ acceso (fail-OPEN deliberado: un coach sin fila de billing
    // no es un coach bloqueado; el bloqueo real lo deciden RLS y los endpoints).
    ['', null, true], ['', PASADO, true], ['', FUTURO, true],
    [null, null, true], [null, PASADO, true], [null, FUTURO, true],
    ['un_estado_que_no_existe', null, true], ['un_estado_que_no_existe', PASADO, true], ['un_estado_que_no_existe', FUTURO, true],

    // Activo ⇒ acceso, mire o no la fecha.
    ['active', null, true], ['active', PASADO, true], ['active', FUTURO, true],

    // Managed (org / team): el billing lo lleva el tenant, la fecha no participa.
    ['org_managed', null, true], ['org_managed', PASADO, true], ['org_managed', FUTURO, true],
    ['team_managed', null, true], ['team_managed', PASADO, true], ['team_managed', FUTURO, true],

    // GRACIA hasta el corte: cancel voluntario, trial y dunning involuntario.
    // La fila que importa es `past_due` + FUTURO ⇒ true: es EXACTAMENTE el caso del incidente.
    ['canceled', null, false], ['canceled', PASADO, false], ['canceled', FUTURO, true],
    ['trialing', null, false], ['trialing', PASADO, false], ['trialing', FUTURO, true],
    ['paused', null, false], ['paused', PASADO, false], ['paused', FUTURO, true],
    ['past_due', null, false], ['past_due', PASADO, false], ['past_due', FUTURO, true],

    // Estados duros SIN gracia: una fecha futura NO los desbloquea.
    ['expired', null, false], ['expired', PASADO, false], ['expired', FUTURO, false],
    ['pending_payment', null, false], ['pending_payment', PASADO, false], ['pending_payment', FUTURO, false],
]

describe('contrato: las 3 implementaciones TS coinciden con la función SQL', () => {
    for (const [estado, fecha, esperado] of TABLA_SQL) {
        it(`${estado ?? '<null>'} + ${fecha ? (fecha === FUTURO ? 'corte futuro' : 'corte pasado') : 'sin corte'} ⇒ ${esperado}`, () => {
            expect(webHasEffectiveAccess(estado, fecha, NOW), 'gate de ruta (web)').toBe(esperado)
            expect(navHasEffectiveAccess(estado, fecha, NOW), 'gate del nav').toBe(esperado)
            expect(mobileHasEffectiveAccess(estado, fecha, NOW), 'gate de ruta (RN)').toBe(esperado)
        })
    }

    it('la tabla cubre las 12 × 3 combinaciones (que no se caiga una fila en silencio)', () => {
        expect(TABLA_SQL).toHaveLength(36)
    })

    it('el caso del incidente está fijado explícitamente', () => {
        // Si alguna implementación vuelve a decir `false` acá, un coach al día pierde su panel.
        expect(webHasEffectiveAccess('past_due', FUTURO, NOW)).toBe(true)
        expect(navHasEffectiveAccess('past_due', FUTURO, NOW)).toBe(true)
        expect(mobileHasEffectiveAccess('past_due', FUTURO, NOW)).toBe(true)
    })
})
