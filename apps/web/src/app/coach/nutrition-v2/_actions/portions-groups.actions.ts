'use server'

/**
 * Server action del picker de grupos de porciones (T1.1). Carga los grupos de
 * intercambio VIVOS del coach (9 system + custom por scope 3-vías) SERVER-SIDE,
 * reusando el servicio V1 `getExchangeGroupsForCoach` — permitido: los services V1
 * son reutilizables; lo prohibido es montarlos en el bundle CLIENTE (boundary F4).
 * Este archivo es 'use server': sus imports jamás llegan al cliente.
 *
 * Vive junto a los componentes del builder (no en `_actions/`) porque esa carpeta
 * pertenece a otras tareas de la ola — regla de archivos disjuntos del build.
 *
 * Fail-closed como el resto del builder: authorizeCoach re-verifica sesión, rate
 * limit (cupo laxo de catálogo: es una lectura), rollout V2 y scope del workspace.
 * Sin gate de módulo nuevo: porciones viene con todo plan pago (SPEC, decisión CEO).
 */

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { PortionSystem } from '@eva/nutrition-v2'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { getExchangeGroupsForCoach } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { countExchangeListRowsByGroup } from '@/infrastructure/db/exchange-group-foods.repository'
import {
  findCoachPortionSystem,
  findUsedPortionSystemsForCoach,
} from '@/infrastructure/db/exchanges.repository'
import {
  authorizeCoach,
  fail,
  type ActionFailure,
  type AuthorizedCoach,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

const InputSchema = z.object({ clientId: z.string().uuid() })

/**
 * Cuantos alimentos equivalentes tiene cada grupo (`groupId -> n`), con el MISMO alcance de
 * tenant que el sheet del alumno (global sin dueno / del coach / de su org — espejo de
 * `20260803194000_nutrition_v2_exchange_foods_tenant_scope.sql`).
 *
 * Sin este dato el coach elige grupos a ciegas y, sobre todo, no se entera de que el grupo
 * propio que acaba de crear nace VACIO: su alumno abre el sheet "1 porcion equivale a" y no
 * ve ningun ejemplo. Ese silencio es la razon por la que la funcion existia desde julio y
 * nadie la usaba.
 */
export type ExchangeGroupFoodCounts = Record<string, number>

export type LoadExchangeGroupsResult =
  | {
      ok: true
      /**
       * Catálogo COMPLETO del coach (system de los dos sets + propios + team activo), tal cual lo
       * devuelve el servicio y con el `portionSystem?` que ya trae cada fila desde el mapeador del
       * repo. Acá se MARCA, jamás se filtra (ver el JSDoc de `loadGroupsForAuthorizedCoach`), y
       * ninguna fila lleva `legacy`: esa marca es de presentación y la pone el consumidor.
       */
      groups: ExchangeGroup[]
      foodCounts: ExchangeGroupFoodCounts
      /**
       * `true` ⇒ el conteo se corto y el mapa NO es exhaustivo: una clave ausente puede ser un
       * grupo con equivalencias. Quien pinte «sin alimentos» a partir de una clave ausente DEBE
       * callarse (mismo contrato que `countExchangeListRowsByGroup`). Ausente = mapa denso.
       */
      foodCountsTruncated?: true
      /** Set del coach (`coaches.portion_system`); `'cl'` si no se pudo leer. */
      portionSystem: PortionSystem
      /** Sets EN USO que no son el propio; `[]` si no usa ninguno o si no se pudo leer. */
      legacySystems: PortionSystem[]
      /**
       * `true` ⇒ MODO DEGRADADO (R14 punto 4): alguna de las dos lecturas de SET fallo,
       * asi que `portionSystem` es el default `'cl'` y `legacySystems` es `[]` por falta de dato,
       * no porque el coach no use nada. Sin esta llave las dos situaciones se veian identicas y
       * quien particione secciones (W2) no podia saber que el dato es inventado. Ausente = lei
       * bien. Espejo del contrato de la ruta movil, que en degradado OMITE las llaves (§7.1.1).
       */
      degraded?: true
    }
  | ActionFailure

/**
 * Catálogo de grupos elegibles como target de porciones para el builder.
 * Solo lectura; el orden para el picker (system primero) lo aplica el cliente
 * (`sortGroupsForPicker`). El freeze del snapshot NO ocurre aquí: lo hace la
 * persistencia del draft (Ola 0, T0.3) resolviendo los grupos de nuevo server-side.
 */
/**
 * Cuantas equivalencias VIVAS tiene cada grupo, con `countExchangeListRowsByGroup` — la lista curada
 * de `exchange_group_foods`, con las lapidas ya descontadas y la precedencia resuelta.
 *
 * Antes se contaban filas de `foods` por `exchange_group_id` (la columna vieja de F1), y por
 * eso los grupos del set chileno —cuyas equivalencias viven SOLO en la lista curada— decian
 * «0 equivalencias» aunque tuvieran decenas (W1.9). El alcance de tenant es el mismo que ve el
 * alumno, asi que el numero no miente.
 *
 * Sigue siendo informativo: si falla vuelve `{}` y el picker funciona sin la linea de apoyo.
 *
 * Se llama al repo (`countExchangeListRowsByGroup`) y no al helper `getExchangeListCounts`
 * porque ese helper TIRA el flag `truncated`, y sin el flag el borde no puede distinguir «este
 * grupo tiene 0 equivalencias» de «no alcance a contarlo». Esa confusion es exactamente el bug
 * de «0 equivalencias» que W1.9 viene a matar, en su otra forma: al truncar, el mapa vuelve
 * SPARSE y una clave ausente NO significa vacio.
 */
async function loadExchangeFoodCounts(
  db: SupabaseClient<Database>,
  groupIds: string[],
): Promise<{ counts: ExchangeGroupFoodCounts; truncated: boolean }> {
  if (groupIds.length === 0) return { counts: {}, truncated: false }
  try {
    return await countExchangeListRowsByGroup(db, groupIds)
  } catch {
    // Una lectura fallida no es un catalogo vacio: mapa vacio + `truncated` para que nadie
    // acuse de «sin alimentos» a un grupo que ni se llego a contar.
    return { counts: {}, truncated: true }
  }
}

/**
 * Cuerpo compartido: los grupos son del COACH (system + propios + team activo), nunca del
 * alumno, asi que con o sin ficha se resuelve exactamente el mismo catalogo.
 *
 * ACA SE MARCA, NO SE FILTRA (decision del jefe, 09-09) — espejo exacto de la ruta movil
 * `app/api/mobile/nutrition-v2/exchange-groups/route.ts` y de RN (R17). Este loader alimenta SEIS
 * superficies: `plantillas/editor/page.tsx`, `FoodCatalogBrowser.tsx`, builder `PortionsSection.tsx`
 * y `FreeFoodFields.tsx`, `[clientId]/editor/page.tsx` y `QuickEditProvider.tsx`. Y no todas son
 * pickers: `FoodCatalogBrowser → ClassifyFoodFlow` RESUELVE ids ya asignados
 * (`groups.find((g) => g.id === current.groupId)`), asi que con el catalogo recortado un coach `cl`
 * sin targets SMAE veria «sin clasificar» un alimento que SI esta clasificado — la misma clase de
 * bug que R13. Por eso el server devuelve el catalogo entero, con el `portionSystem?` de cada fila
 * y sin `legacy` por fila, y la particion por set (set propio / «Legado» / propios) vive en el
 * consumidor del picker (`EditablePortionsCard.tsx`, W2.7), que es donde el recorte no le esconde
 * datos a nadie mas.
 *
 * Corolario que se mantiene: los caminos que ya leian el catalogo COMPLETO por su cuenta
 * —unicidad de codigos (`findExchangeGroupConflict`), la ruta `group-foods`,
 * `findExchangeGroupsByIdsForTenant` y el freeze del draft— siguen sin pasar por aca (R13/T-01).
 */
async function loadGroupsForAuthorizedCoach(auth: AuthorizedCoach): Promise<LoadExchangeGroupsResult> {
  const workspace = auth.workspace
  const scope = {
    orgId: workspace?.type === 'enterprise_coach' ? workspace.orgId : null,
    activeTeamId: workspace?.type === 'coach_team' ? workspace.teamId : null,
  }

  try {
    const db = auth.db as unknown as SupabaseClient<Database>
    // El servicio NO se toca (R13/T-01) y su catalogo sale entero. Las dos lecturas de set son
    // INDEPENDIENTES del catalogo, asi que van en el MISMO `Promise.all`: encadenarlas sumaba un
    // round-trip a un picker que se abre en cada tarjeta. El conteo queda despues porque es el
    // unico que depende de los ids ya resueltos.
    //
    // FAIL-OPEN (R14 punto 4): si cualquiera de las dos lecturas de set no responde, el resultado
    // sale `degraded` y el consumidor particiona con `usedSystems: undefined`, o sea pinta los dos
    // sets SIN marcar legado. Esconder un grupo que el plan del coach usa lo deja sin poder editar
    // su propio plan; mostrar uno de mas, no. `findCoachPortionSystem` ya devuelve `null` cuando
    // falla (la columna tiene default y es `not null`, asi que un `null` nunca es un dato bueno),
    // pero eso cubre solo el error que PostgREST reporta en `error`: si la promesa RECHAZA (red
    // caida, cliente que tira), el `Promise.all` propaga, cae al catch de abajo y el picker vuelve
    // GROUPS_LOAD_FAILED — o sea CERO grupos, el opuesto exacto del fail-open. El `.catch` de esas
    // dos ramas cierra ese hueco; el catalogo NO lo lleva, porque sin catalogo no hay picker y ahi
    // si corresponde fallar cerrado.
    const [groups, coachSystem, used] = await Promise.all([
      getExchangeGroupsForCoach(db, auth.userId, scope),
      findCoachPortionSystem(db, auth.userId).catch(() => null),
      findUsedPortionSystemsForCoach(db, auth.userId).catch(() => undefined),
    ])
    const { counts: foodCounts, truncated } = await loadExchangeFoodCounts(
      db,
      groups.map((group) => group.id),
    )

    const degraded = coachSystem == null || used === undefined
    const usedSystems = degraded ? undefined : used
    const portionSystem: PortionSystem = coachSystem ?? 'cl'
    // Dedupe: `findUsedPortionSystemsForCoach` puede repetir un set si lo arma por fila, y un
    // «Legado» duplicado pintaria la seccion dos veces en el consumidor.
    const legacySystems = [...new Set(usedSystems ?? [])].filter((system) => system !== portionSystem)

    return {
      ok: true,
      groups,
      foodCounts,
      portionSystem,
      legacySystems,
      // Llaves solo-cuando-true: quien no las mire ve el mismo contrato de siempre.
      ...(truncated ? { foodCountsTruncated: true as const } : {}),
      ...(degraded ? { degraded: true as const } : {}),
    }
  } catch {
    // El picker muestra estado de error con reintento (SPEC UX-c); los items fijos
    // de la franja nunca se bloquean por esta falla.
    return fail('GROUPS_LOAD_FAILED', PORTIONS_COPY.builder.pickerError)
  }
}

export async function loadExchangeGroupsForBuilderAction(input: unknown): Promise<LoadExchangeGroupsResult> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Solicitud invalida.')
  }

  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  return loadGroupsForAuthorizedCoach(auth)
}

/**
 * Mismo catalogo, SIN alumno: lo pide el builder de PLANTILLAS. Una plantilla es material
 * interno del coach, asi que no hay ficha que autorizar y el `clientId` no tendria a que
 * apuntar. El gate (sesion + rate limit de catalogo + workspace con scope V2) es el mismo.
 */
export async function loadExchangeGroupsForCoachAction(): Promise<LoadExchangeGroupsResult> {
  const auth = await authorizeCoach(null, 'catalog-search')
  if (!auth.ok) return auth

  return loadGroupsForAuthorizedCoach(auth)
}
