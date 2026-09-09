/**
 * Que grupos de intercambio ve un coach en el picker (D1-A, S1/S2).
 *
 * PURO y UNICO: hay varias superficies que PINTAN el catalogo (picker web, sheet
 * RN sobre la lista mergeada, respuesta de la ruta movil V2) y si la regla se
 * copia en cada una, el picker miente en alguna. Todas llaman a esta funcion.
 *
 * DONDE NO VA (R13 + S-01, §7.3): NUNCA dentro de `findExchangeGroupsForScope`
 * NI de `getExchangeGroupsForCoach`. Los dos son el catalogo de AUTORIZACION:
 * alimentan `findExchangeGroupConflict` (unicidad de `code`, T-02) desde
 * `nutrition-exchanges.service.ts:188-193` y `:215-221`, y la ruta
 * `api/mobile/nutrition/exchanges/group-foods/route.ts:74-82`, que devuelve 404
 * si el grupo pedido no esta en esa lista. Esta funcion es de PRESENTACION y vive
 * en los bordes.
 *
 * Regla: UNION, nunca exclusion.
 *   visibles(coach) = custom del coach/team
 *                   ∪ system con portionSystem = coachSystem
 *                   ∪ (si el coach tiene targets vivos en el otro set) ese set,
 *                     marcado legacy: true
 *
 * El coach que convierte todos sus planes deja de tener targets en el set viejo y
 * el legado desaparece de su picker SIN NINGUN WRITE — que es exactamente lo que
 * pide S1, y por eso NO hace falta backfillear a nadie (R14-bis).
 */

import type { ExchangeGroup } from '@eva/nutrition-engine'

export type PortionSystem = 'smae' | 'cl'

/** Los 13 codigos del set chileno (§0). Son nuevos: no colisionan con los 9 SMAE. */
export const CL_CODES: ReadonlySet<string> = new Set([
  'LD', 'LS', 'LE', 'CB', 'CA', 'LGS', 'VG', 'VL', 'FR', 'PCT', 'AG', 'AZ', 'SCP',
])

/** Grupo del catalogo con la marca de «legado» resuelta para ESTE coach. */
export type VisibleExchangeGroup = ExchangeGroup & {
  readonly portionSystem: PortionSystem
  /** true ⇒ chip «Legado (SMAE)» y seccion colapsada en el picker. */
  readonly legacy: boolean
}

/**
 * Forma minima que resuelve `systemOf`: sirve para `ExchangeGroup` (que trae
 * `code`) y para `QePortionGroup` (que trae `groupCode` y puede no traer el set,
 * porque el snapshot congelado no lo guarda). R18.
 */
export type SystemResolvable = {
  readonly portionSystem?: PortionSystem
  readonly code?: string
  readonly groupCode?: string
}

export type VisibilityInput = {
  /** Catalogo completo YA acotado por RLS (custom ajenos jamas llegan aca). */
  readonly groups: readonly (ExchangeGroup & { portionSystem?: PortionSystem })[]
  /** `coaches.portion_system`. Ausente/desconocido ⇒ 'cl' (default de la columna). */
  readonly coachSystem: PortionSystem | null | undefined
  /**
   * Sets con al menos un target VIVO en los planes del coach. NO se adivina ni se
   * deriva de `coachSystem`: la calcula `findUsedPortionSystemsForCoach` (§7.1) y
   * la pasan los bordes de presentacion.
   *
   * FAIL-OPEN (R14 punto 4): `undefined` = «no se pudo leer» ⇒ se muestran AMBOS
   * sets sin marcar legado. `[]` = «se leyo y no usa nada» ⇒ solo el set propio.
   * La diferencia importa: el catalogo ya es best-effort en el borde RN
   * (`QuickEditMode.tsx:641-647` traga el error), y esconder un grupo que el plan
   * del coach usa es peor que mostrar uno de mas.
   */
  readonly usedSystems: readonly PortionSystem[] | undefined
}

const DEFAULT_SYSTEM: PortionSystem = 'cl'

/**
 * Set de un grupo, con el ausente resuelto (R18):
 *
 *   group.portionSystem ?? (CL_CODES.has(code) ? 'cl' : coachSystem)
 *
 * El ausente NO cae a 'smae'. Los grupos que salen del plan
 * (`collectPortionGroups`, editor-state.ts:549-568) se reconstruyen del snapshot
 * congelado, que no guarda el set: con el default 'smae', un grupo CHILENO ya
 * prescrito quedaria con el chip «Legado (SMAE)» dentro de la seccion colapsada.
 * Con este orden —dato explicito, luego codigo, luego set del coach— un grupo sin
 * dato nunca se marca legado ni se esconde.
 */
export function systemOf(group: SystemResolvable, coachSystem: PortionSystem): PortionSystem {
  if (group.portionSystem === 'cl' || group.portionSystem === 'smae') return group.portionSystem
  const code = group.groupCode ?? group.code
  if (code != null && CL_CODES.has(code)) return 'cl'
  return coachSystem
}

/**
 * ¿El grupo es «del set chileno» para ESTE coach? (R18, fix consistencia X-07.)
 *
 * Vive ACA, no en `exchange-conversion.ts`: los dos helpers —`systemOf` e
 * `isClGroup`— nacen juntos en **W1.4** y el conversor de W3 los importa. Si
 * naciera en W3, W1 estaria usando un simbolo que nadie escribio todavia.
 *
 * Firma canonica de DOS parametros: `QePortionGroup` NO declara `isSystem` y su
 * `portionSystem?` puede faltar (los grupos que salen del plan los reconstruye
 * `collectPortionGroups`, editor-state.ts:549-568, desde el snapshot congelado,
 * que no guarda el set). Por eso el ausente NO cae a 'smae': cae al set del
 * coach, con el fallback por codigo antes.
 *
 *   isClGroup(g, coachSystem) = systemOf(g, coachSystem) === 'cl'
 *
 * ⚠ Consecuencia del fallback, y hay que tenerla presente al armar fixtures: un
 * grupo SIN `portionSystem` y con un code SMAE ('C') cae al set del coach, asi
 * que para un coach 'cl' devuelve true. En produccion no pasa —el catalogo llega
 * de `catalogToPortionGroups`, que SI propaga la columna—, pero un test que arme
 * grupos SMAE a mano tiene que ponerles `portionSystem: 'smae'` o estara probando
 * otra cosa. Es el precio de no marcar legado a los grupos del plan.
 */
export function isClGroup(group: SystemResolvable, coachSystem: PortionSystem): boolean {
  return systemOf(group, coachSystem) === 'cl'
}

/**
 * PISO DEFENSIVO (decision del jefe, 2026-09-09): si entraron grupos `isSystem` y
 * NINGUNO sobrevivio al filtro, se devuelven TODOS los de entrada con
 * `legacy: false`.
 *
 * Por que: entre W0 y W6.8 los 13 grupos chilenos viven con `deleted_at` y no
 * llegan al catalogo. Un coach 'cl' sin targets SMAE vivos veria un picker VACIO
 * —los 9 SMAE quedan fuera por set y los chilenos ni siquiera existen todavia—.
 * Con el piso ve los 9 SMAE sin chip, que es EXACTAMENTE lo que ve hoy en
 * produccion. Despues de W6.8 (los chilenos publicados) el piso nunca dispara,
 * porque siempre queda al menos un grupo del set propio.
 *
 * Mismo espiritu que el fail-open de `usedSystems`: esconder el catalogo entero
 * es peor que mostrar un set de mas.
 */
export function visibleExchangeGroupsForCoach(input: VisibilityInput): VisibleExchangeGroup[] {
  const coachSystem: PortionSystem = input.coachSystem === 'smae' ? 'smae' : DEFAULT_SYSTEM
  const otherSystem: PortionSystem = coachSystem === 'cl' ? 'smae' : 'cl'
  // FAIL-OPEN: sin el dato se muestra todo, sin marcar legado. Se liga a una const
  // para que TS estreche el `undefined` sin un `!` (mismo comportamiento que DATA §7).
  const used = input.usedSystems
  const unknownUsage = used == null
  const showsOther = unknownUsage || used.includes(otherSystem)

  const out: VisibleExchangeGroup[] = []
  for (const group of input.groups) {
    const system = systemOf(group, coachSystem)

    // Los CUSTOM no se filtran nunca por set: su visibilidad la decide su dueno
    // (policy xg_select, 20260611093001:166-173). Un custom con portion_system
    // 'smae' por default seguiria siendo del coach y debe verse siempre.
    if (!group.isSystem) {
      out.push({ ...group, portionSystem: system, legacy: false })
      continue
    }
    if (system === coachSystem) {
      out.push({ ...group, portionSystem: system, legacy: false })
      continue
    }
    if (system === otherSystem && showsOther) {
      // Sin el dato no se AFIRMA que sea legado: se muestra sin chip.
      out.push({ ...group, portionSystem: system, legacy: !unknownUsage })
    }
  }

  // Piso defensivo (ver el JSDoc): entraron grupos del sistema y no quedo ninguno.
  if (input.groups.some((g) => g.isSystem) && !out.some((g) => g.isSystem)) {
    return input.groups.map((group) => ({
      ...group,
      portionSystem: systemOf(group, coachSystem),
      legacy: false,
    }))
  }
  return out
}

/**
 * Comparador de CATALOGO (sobre `ExchangeGroup`): set propio primero, legado
 * despues; dentro de cada bloque, system antes que custom, luego sort_order y code.
 *
 * OJO, y es el fix B-05: este comparador NO decide el orden del picker. El picker
 * recibe lo que devuelve `mergePortionGroupChoices` (editor-state.ts:641-650,
 * «plan primero, catalogo despues», fijado por `quick-edit-state.test.ts:578`), que
 * NO se toca. La particion por seccion la hace el consumidor (§7.3) con
 * `comparePickerGroups`. `compareCatalogGroups` (editor-state.ts:571-575) y sus dos
 * copias tampoco se tocan: ordenan el catalogo vivo, no el sheet.
 *
 * Nada de `sort_order` negativo en la DB: el orden es una decision de UI.
 */
export function compareVisibleGroups(a: VisibleExchangeGroup, b: VisibleExchangeGroup): number {
  if (a.legacy !== b.legacy) return a.legacy ? 1 : -1
  if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.code.localeCompare(b.code)
}
