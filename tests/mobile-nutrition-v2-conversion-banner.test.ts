// Banner de conversión SMAE → chileno en RN (W3.6, SPEC §7.2): el CONTRATO DEL HOST, o sea
// `QuickEditMode.tsx`. La decisión pura ya vive en el paquete y tiene sus propios casos
// (`packages/nutrition-v2/exchange-conversion.test.ts`, 31-35 para `draftUsesLegacySmae` y el 30
// para `hasClDestinations`); lo que este archivo fija es la COMPOSICIÓN que el host arma con
// ellas —las tres preguntas del banner en el orden en que el host las hace— y el «Ahora no».
//
// Por qué se replica y no se importa: `QuickEditMode.tsx` arrastra `react-native`, cuyo
// `index.js` usa `import typeof` (Flow) y Rollup no lo parsea («Expected 'from', got 'typeOf'»).
// Los tests de `tests/*.test.ts` corren en el project `web-node`, sin el preset de Metro. Mismo
// trato que `tests/mobile-nutrition-v2-targets-switch.test.ts`, que replica el bucle de
// `handleTargetsSwitchOff` en vez de montar el componente. Si el host cambia su composición y
// este archivo no, el que miente es el host: acá está escrito lo que promete SPEC §7.2.
import { describe, expect, it } from 'vitest'
import {
  draftUsesLegacySmae,
  hasClDestinations,
  type PortionSystem,
  type QePickerGroup,
  type QePortionGroup,
  type QePortionTarget,
  type QeSlot,
  type QeVariant,
} from '@eva/nutrition-v2'

// ── Copia literal de las constantes del host (`QuickEditMode.tsx`) ────────────────────────────
// Storage local a propósito (§C.3 de RESOLUCIONES-2): una columna nueva por un descarte de UI no
// vale una migración. La clave es POR PLAN — descartar el banner en un plan no puede callarlo en
// los otros seis del coach.
const PORTION_CONVERT_DISMISS_PREFIX = 'nutrition-v2:portion-conversion-dismissed:'
const PORTION_CONVERT_DISMISS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * EXACTAMENTE `legacyCheckGroups` de `QuickEditMode.tsx`: el BORDE donde el host decide qué
 * significa un `isSystem` ausente, y significa `false`. `QePickerGroup` lo declara opcional y
 * `applyCatalogMetaToPickerGroups` devuelve `{...group}` sin él cuando el catálogo vivo no cargó
 * o no cubre al grupo (uno creado en la sesión); el paquete exige el booleano, así que la
 * decisión se toma acá una sola vez y falla CERRADO.
 */
function normalizeLegacyGroups(
  groups: readonly QePickerGroup[],
): readonly (QePickerGroup & { isSystem: boolean })[] {
  return groups.map((group) => ({ ...group, isSystem: group.isSystem ?? false }))
}

/**
 * EXACTAMENTE la composición de `showConvertBanner` en `QuickEditMode.tsx`:
 *   `planUsesLegacy && convertHasClTargets && convertDismissed === false`
 * con `planUsesLegacy = draftUsesLegacySmae(variants, portionGroups, coachSystem)` y
 * `convertHasClTargets = hasClDestinations(convertCatalog)`.
 *
 * `dismissed` es TRI-ESTADO en el host: `null` = el storage todavía no respondió y el banner NO
 * se pinta (uno que aparece y desaparece medio segundo después es peor que uno que tarda).
 */
function showConvertBanner(params: {
  variants: readonly QeVariant[]
  pickerGroups: readonly QePickerGroup[]
  catalog: readonly QePortionGroup[]
  coachSystem: PortionSystem
  dismissed: boolean | null
}): boolean {
  if (params.dismissed !== false) return false
  const groups = normalizeLegacyGroups(params.pickerGroups)
  if (!draftUsesLegacySmae(params.variants, groups, params.coachSystem)) return false
  return hasClDestinations(params.catalog)
}

/** El host normaliza el set del coach igual en las dos puertas: sin dato, el default 'cl'. */
function coachSystemOf(raw: PortionSystem | undefined): PortionSystem {
  return raw === 'smae' ? 'smae' : 'cl'
}

/** Clave del descarte. Sin `planId` (creación / plantilla) no hay clave estable y no se finge. */
function dismissKeyOf(planId: string | null): string | null {
  return planId == null ? null : `${PORTION_CONVERT_DISMISS_PREFIX}${planId}`
}

/** El efecto que lee el storage: basura, ausencia o vencimiento ⇒ el banner se muestra. */
function dismissAlive(raw: string | null, now: number): boolean {
  const savedAt = raw == null ? Number.NaN : Number(raw)
  return Number.isFinite(savedAt) && now - savedAt < PORTION_CONVERT_DISMISS_MS
}

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

function group(
  exchangeGroupId: string,
  groupCode: string,
  extra: Partial<QePortionGroup> = {},
): QePortionGroup {
  return {
    exchangeGroupId,
    groupCode,
    groupName: `Grupo ${groupCode}`,
    color: null,
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
    composedOf: null,
    macrosConfirmed: true,
    ...extra,
  }
}

/** `C` del SISTEMA: es el que cuenta como legado (E1). */
const SYSTEM_C = group('id-C', 'C', { portionSystem: 'smae' })
/** `PCT` chileno del sistema: el destino vivo que el guard exige. */
const SYSTEM_PCT = group('id-PCT', 'PCT', { portionSystem: 'cl' })
/**
 * Grupo PROPIO del coach. Su fila trae `portion_system = 'smae'` porque ese es el DEFAULT de la
 * columna (W0.1), no porque el coach eligiera el set viejo: nunca cuenta como legado.
 */
const CUSTOM = group('id-propio', 'CARB', {
  groupName: 'Carbohidratos de la casa',
  portionSystem: 'smae',
})

/** Grupo del picker = el del catálogo con los metadatos que solo trae el catálogo VIVO. */
function picker(source: QePortionGroup, meta: Partial<QePickerGroup> = {}): QePickerGroup {
  return { ...source, ...meta }
}

function targetOf(source: QePortionGroup, portions: string): QePortionTarget {
  return {
    key: `t-${source.exchangeGroupId}`,
    id: `row-${source.exchangeGroupId}`,
    exchangeGroupId: source.exchangeGroupId,
    groupCode: source.groupCode,
    groupName: source.groupName,
    color: source.color,
    macrosConfirmed: source.macrosConfirmed,
    portions,
    notes: null,
  }
}

function slotWith(portionTargets: QePortionTarget[]): QeSlot {
  return {
    key: 's1',
    id: null,
    code: 'BREAKFAST',
    name: 'Desayuno',
    startTime: '',
    endTime: null,
    mode: 'flexible',
    required: false,
    instructions: null,
    targets: {},
    items: [],
    portionTargets,
  }
}

function variantWith(portionTargets: QePortionTarget[]): QeVariant {
  return {
    key: 'v1',
    id: null,
    variantKey: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: '', proteinG: '', carbsG: '', fatsG: '' },
    passthroughTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots: [slotWith(portionTargets)],
  }
}

// ── Tabla del banner ──────────────────────────────────────────────────────────────────────────

type BannerCase = {
  name: string
  variants: QeVariant[]
  pickerGroups: QePickerGroup[]
  catalog: QePortionGroup[]
  coachSystem: PortionSystem
  expected: boolean
}

const CASES: BannerCase[] = [
  {
    // (a) El caso Pame Cid al revés: un coach 'cl' que armó su plan con SUS grupos. Antes del
    // remate, la copia local de `planUsesLegacy` los contaba como SMAE y le pintaba «Este plan
    // usa las porciones anteriores»; al tocar el banner se le abría un sheet sin una sola fila.
    name: 'a · plan SOLO con grupos propios (smae por default de columna) ⇒ SIN banner',
    variants: [variantWith([targetOf(CUSTOM, '2')])],
    pickerGroups: [picker(CUSTOM, { isSystem: false })],
    catalog: [SYSTEM_PCT],
    coachSystem: 'cl',
    expected: false,
  },
  {
    name: 'b · plan con C del SISTEMA + destino cl vivo ⇒ banner',
    variants: [variantWith([targetOf(SYSTEM_C, '2')])],
    pickerGroups: [picker(SYSTEM_C, { isSystem: true })],
    catalog: [SYSTEM_C, SYSTEM_PCT],
    coachSystem: 'cl',
    expected: true,
  },
  {
    // (c) Hasta W6.8 los 13 grupos `cl` viven APAGADOS en LIVE (`deleted_at`). Sin el guard, el
    // banner ofrecía una conversión imposible: todo caía a `unresolved` y el CTA quedaba muerto.
    name: 'c · plan con C del SISTEMA pero sin destinos cl en el catálogo ⇒ SIN banner (guard)',
    variants: [variantWith([targetOf(SYSTEM_C, '2')])],
    pickerGroups: [picker(SYSTEM_C, { isSystem: true })],
    catalog: [SYSTEM_C],
    coachSystem: 'cl',
    expected: false,
  },
  {
    // Un plan mixto sigue siendo legado: basta UN grupo del sistema en SMAE.
    name: 'b2 · plan mixto (propio + C del sistema) ⇒ banner',
    variants: [variantWith([targetOf(CUSTOM, '1'), targetOf(SYSTEM_C, '2')])],
    pickerGroups: [picker(CUSTOM, { isSystem: false }), picker(SYSTEM_C, { isSystem: true })],
    catalog: [SYSTEM_C, SYSTEM_PCT],
    coachSystem: 'cl',
    expected: true,
  },
  {
    // El caso que RN produce de verdad cuando el catálogo vivo no cargó: `portionGroups` NO
    // queda vacío —`mergePortionGroupChoices` siempre trae los grupos del PLAN—, queda con los
    // ids y SIN `isSystem`. El borde baja ese hueco a `false` y el banner calla: sin evidencia
    // de que el grupo sea del sistema no se afirma que lo sea (R18/E1). Falla CERRADO, y coincide
    // con lo que hace el otro guard —sin catálogo tampoco hay destinos chilenos—.
    name: 'd0 · catálogo caído: grupos del plan sin `isSystem` ⇒ SIN banner (fail-closed)',
    variants: [variantWith([targetOf(SYSTEM_C, '2')])],
    pickerGroups: [picker(SYSTEM_C)],
    catalog: [SYSTEM_C, SYSTEM_PCT],
    coachSystem: 'cl',
    expected: false,
  },
  {
    // Borde degenerado: el grupo prescrito ni siquiera está en la lista. Mismo veredicto.
    name: 'd1 · picker vacío ⇒ SIN banner',
    variants: [variantWith([targetOf(SYSTEM_C, '2')])],
    pickerGroups: [],
    catalog: [SYSTEM_C, SYSTEM_PCT],
    coachSystem: 'cl',
    expected: false,
  },
]

describe('banner de conversión SMAE → chileno (contrato del host RN)', () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      expect(
        showConvertBanner({
          variants: testCase.variants,
          pickerGroups: testCase.pickerGroups,
          catalog: testCase.catalog,
          coachSystem: testCase.coachSystem,
          dismissed: false,
        }),
      ).toBe(testCase.expected)
    })
  }

  it('el banner NO se pinta mientras el storage no respondió (dismissed === null)', () => {
    const params = {
      variants: [variantWith([targetOf(SYSTEM_C, '2')])],
      pickerGroups: [picker(SYSTEM_C, { isSystem: true })],
      catalog: [SYSTEM_C, SYSTEM_PCT],
      coachSystem: 'cl' as PortionSystem,
    }
    expect(showConvertBanner({ ...params, dismissed: null })).toBe(false)
    expect(showConvertBanner({ ...params, dismissed: false })).toBe(true)
  })

  it('el set del coach ausente cae a `cl`, nunca a `smae` (normalización del host)', () => {
    expect(coachSystemOf(undefined)).toBe('cl')
    expect(coachSystemOf('cl')).toBe('cl')
    expect(coachSystemOf('smae')).toBe('smae')
  })
})

// ── (d) «Ahora no»: clave por plan, timestamp y 30 días ───────────────────────────────────────

describe('«Ahora no» del banner — clave por plan y vigencia de 30 días', () => {
  it('la clave lleva el prefijo del proyecto y el planId', () => {
    expect(dismissKeyOf('plan-123')).toBe('nutrition-v2:portion-conversion-dismissed:plan-123')
    expect(PORTION_CONVERT_DISMISS_PREFIX.endsWith(':')).toBe(true)
  })

  it('sin planId (creación / plantilla) no hay clave: el descarte dura la sesión', () => {
    expect(dismissKeyOf(null)).toBe(null)
  })

  it('lo que se guarda es un timestamp en milisegundos', () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0)
    const guardado = String(now)
    expect(Number(guardado)).toBe(now)
    expect(dismissAlive(guardado, now)).toBe(true)
  })

  it('vigencia = 30 días exactos, y el borde vencido vuelve a mostrar el banner', () => {
    expect(PORTION_CONVERT_DISMISS_MS).toBe(30 * 24 * 60 * 60 * 1000)
    const guardado = Date.UTC(2026, 8, 9, 12, 0, 0)
    const raw = String(guardado)
    // Día 29: sigue descartado.
    expect(dismissAlive(raw, guardado + 29 * 24 * 60 * 60 * 1000)).toBe(true)
    // Un milisegundo antes de los 30 días: todavía descartado.
    expect(dismissAlive(raw, guardado + PORTION_CONVERT_DISMISS_MS - 1)).toBe(true)
    // A los 30 días clavados: vencido ⇒ el banner vuelve.
    expect(dismissAlive(raw, guardado + PORTION_CONVERT_DISMISS_MS)).toBe(false)
  })

  it('ausencia o basura en el storage ⇒ el banner se muestra, nunca al revés', () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0)
    expect(dismissAlive(null, now)).toBe(false)
    expect(dismissAlive('abc', now)).toBe(false)
    expect(dismissAlive('', now)).toBe(false)
  })

  it('un descarte con fecha FUTURA (reloj movido) no esconde el banner para siempre', () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0)
    // `now - savedAt` negativo sigue siendo < 30 días: el descarte se respeta, y cuando el reloj
    // vuelve a su lugar vence solo. Queda escrito para que nadie lo lea como un bug.
    expect(dismissAlive(String(now + 60_000), now)).toBe(true)
  })

  it('el descarte de un plan no calla el banner de otro', () => {
    expect(dismissKeyOf('plan-a')).not.toBe(dismissKeyOf('plan-b'))
  })
})

// ── (e) El COPY VACÍO del sheet: `draftUsesSmae` en `PortionConversionSheet.tsx` ───────────────
// El banner es una puerta; adentro hay una segunda decisión con la misma pregunta. Cuando el
// preview no trae ni una sección, el sheet elige entre «ya migraste» (`empty`) y «hay targets
// SMAE sin cantidad legible» (`emptyNoAmount`) con `draftUsesLegacySmae`. Nada la miraba: el
// sheet recibía el catálogo proyectado (`catalogToPortionGroups`, SIN `isSystem`) y un plan de
// puros grupos propios se leía como legado. Se fija acá la MISMA composición que hace el sheet.

/**
 * EXACTAMENTE `draftUsesSmae` de `PortionConversionSheet.tsx` (prop `pickerGroups`), con el borde
 * del host delante: la hoja recibe la lista YA normalizada (`legacyCheckGroups`), nunca cruda.
 */
function sheetDraftUsesSmae(params: {
  variants: readonly QeVariant[]
  pickerGroups: readonly QePickerGroup[]
  coachSystem: PortionSystem
}): boolean {
  return draftUsesLegacySmae(
    params.variants,
    normalizeLegacyGroups(params.pickerGroups),
    params.coachSystem,
  )
}

describe('copy vacío del sheet de conversión (contrato del host RN)', () => {
  it('plan SOLO con grupos propios ⇒ `draftUsesSmae` false (ni se lo felicita ni se lo alarma)', () => {
    expect(
      sheetDraftUsesSmae({
        variants: [variantWith([targetOf(CUSTOM, '2')])],
        pickerGroups: [picker(CUSTOM, { isSystem: false })],
        coachSystem: 'cl',
      }),
    ).toBe(false)
  })

  it('plan con C del SISTEMA ⇒ `draftUsesSmae` true (el preview vacío es «sin cantidad»)', () => {
    expect(
      sheetDraftUsesSmae({
        variants: [variantWith([targetOf(SYSTEM_C, '')])],
        pickerGroups: [picker(SYSTEM_C, { isSystem: true })],
        coachSystem: 'cl',
      }),
    ).toBe(true)
  })

  it('sin metadato del catálogo el veredicto es `false`, igual que con `isSystem: false`', () => {
    // Por qué el sheet recibe `pickerGroups` y no `catalog`: el TIPO lo exige. El paquete pide
    // `isSystem` en cada grupo y `catalogToPortionGroups` no lo declara, así que el catálogo
    // proyectado ni entra. Y el hueco que sí existe —la lista del picker cuando el catálogo vivo
    // no cargó— lo cierra el borde del host en `false`: un plan de puros grupos propios (que
    // traen 'smae' por el default de columna de W0.1) NO vuelve «legado» por falta de dato.
    const variants = [variantWith([targetOf(CUSTOM, '2')])]
    const sinMeta: QePickerGroup[] = [picker(CUSTOM)]
    expect(sheetDraftUsesSmae({ variants, pickerGroups: sinMeta, coachSystem: 'cl' })).toBe(false)
    expect(
      sheetDraftUsesSmae({
        variants,
        pickerGroups: [picker(CUSTOM, { isSystem: false })],
        coachSystem: 'cl',
      }),
    ).toBe(false)
    // Y el mismo plan con el grupo declarado DEL SISTEMA sí es legado: el dato manda, no la
    // ausencia. Sin esta contraparte el caso de arriba pasaría con la función devolviendo
    // siempre `false`.
    expect(
      sheetDraftUsesSmae({
        variants: [variantWith([targetOf(SYSTEM_C, '2')])],
        pickerGroups: [picker(SYSTEM_C, { isSystem: true })],
        coachSystem: 'cl',
      }),
    ).toBe(true)
  })
})
