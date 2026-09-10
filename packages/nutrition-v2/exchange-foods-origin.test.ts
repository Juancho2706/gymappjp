import { describe, expect, it } from 'vitest'
import {
  photoCreditNeeded,
  photoSourceLabel,
  splitExchangeFoodsByOrigin,
} from './exchange-foods-origin'
import {
  PORTIONS_EVENT_EQUIVALENCES_OPENED,
  equivalencesOpenedPayload,
  portionRowsBucket,
} from './portions-analytics'
import { PORTIONS_COPY } from './nutrition-portions-copy'

type Row = {
  readonly name: string
  readonly brand?: string | null
  readonly isGeneric?: boolean
  readonly imageLicense?: string | null
}

describe('splitExchangeFoodsByOrigin (W5.5)', () => {
  it('manda a genéricos la fila con isGeneric true y a marcas la que lo trae en false', () => {
    const { generic, brands } = splitExchangeFoodsByOrigin<Row>([
      { name: 'Marraqueta', brand: null, isGeneric: true },
      { name: 'Pan Ideal', brand: 'Ideal', isGeneric: false },
    ])
    expect(generic.map((r) => r.name)).toEqual(['Marraqueta'])
    expect(brands.map((r) => r.name)).toEqual(['Pan Ideal'])
  })

  it('cae a brand == null cuando la llave isGeneric NO viene (RPC viejo / cache anterior a W5)', () => {
    const { generic, brands } = splitExchangeFoodsByOrigin<Row>([
      { name: 'Arroz', brand: null },
      { name: 'Arroz Tucapel', brand: 'Tucapel' },
      { name: 'Quinoa' },
    ])
    expect(generic.map((r) => r.name)).toEqual(['Arroz', 'Quinoa'])
    expect(brands.map((r) => r.name)).toEqual(['Arroz Tucapel'])
  })

  it('la bandera del RPC MANDA sobre brand: un genérico con marca declarada sigue siendo marca', () => {
    const { generic, brands } = splitExchangeFoodsByOrigin<Row>([
      { name: 'Raro', brand: null, isGeneric: false },
      { name: 'Otro raro', brand: 'X', isGeneric: true },
    ])
    expect(generic.map((r) => r.name)).toEqual(['Otro raro'])
    expect(brands.map((r) => r.name)).toEqual(['Raro'])
  })

  it('PRESERVA el orden de entrada dentro de cada sección (el que ya fijó el RPC)', () => {
    const rows: Row[] = [
      { name: 'Marraqueta', isGeneric: true },
      { name: 'Pan Ideal', brand: 'Ideal', isGeneric: false },
      { name: 'Hallulla', isGeneric: true },
      { name: 'Pan Bimbo', brand: 'Bimbo', isGeneric: false },
      { name: 'Papa cocida', isGeneric: true },
    ]
    const { generic, brands } = splitExchangeFoodsByOrigin(rows)
    expect(generic.map((r) => r.name)).toEqual(['Marraqueta', 'Hallulla', 'Papa cocida'])
    expect(brands.map((r) => r.name)).toEqual(['Pan Ideal', 'Pan Bimbo'])
    // Las filas son las MISMAS referencias: el split no clona ni normaliza.
    expect(generic[0]).toBe(rows[0])
  })

  it('devuelve dos listas vacías para null, undefined y lista vacía', () => {
    expect(splitExchangeFoodsByOrigin<Row>(null)).toEqual({ generic: [], brands: [] })
    expect(splitExchangeFoodsByOrigin<Row>(undefined)).toEqual({ generic: [], brands: [] })
    expect(splitExchangeFoodsByOrigin<Row>([])).toEqual({ generic: [], brands: [] })
  })
})

describe('photoCreditNeeded / photoSourceLabel (S-08: el pie es CONDICIONAL)', () => {
  it('pide el pie si alguna fila visible trae cc_by_sa o cc_by', () => {
    expect(photoCreditNeeded([{ name: 'a', imageLicense: 'cc_by_sa' }])).toBe(true)
    expect(photoCreditNeeded([{ name: 'a', imageLicense: 'cc_by' }])).toBe(true)
    expect(
      photoCreditNeeded([
        { name: 'a', imageLicense: 'eva_owned' },
        { name: 'b', imageLicense: 'cc_by_sa' },
      ]),
    ).toBe(true)
  })

  it('NO pide el pie con fotos propias / autorizadas, sin foto, ni con la lista vacía', () => {
    expect(
      photoCreditNeeded([
        { name: 'a', imageLicense: 'eva_owned' },
        { name: 'b', imageLicense: 'eva_illustration' },
        { name: 'c', imageLicense: 'supplier_authorized' },
        { name: 'd', imageLicense: null },
        { name: 'e' },
      ]),
    ).toBe(false)
    expect(photoCreditNeeded([])).toBe(false)
    expect(photoCreditNeeded(null)).toBe(false)
    expect(photoCreditNeeded(undefined)).toBe(false)
  })

  it('nombra la fuente por fila solo cuando la licencia lo exige', () => {
    expect(photoSourceLabel('cc_by_sa')).toBe('Foto: Open Food Facts (CC BY-SA)')
    expect(photoSourceLabel('cc_by')).toBe('Foto: Open Food Facts (CC BY-SA)')
    expect(photoSourceLabel('eva_owned')).toBeNull()
    expect(photoSourceLabel('supplier_authorized')).toBeNull()
    expect(photoSourceLabel(null)).toBeNull()
    expect(photoSourceLabel(undefined)).toBeNull()
  })

  // El CHECK de `food_media.license` tiene SEIS valores (migración 20260714220000): solo
  // `cc_by_sa` y `cc_by` acreditan (S-08). Se enumeran los otros cuatro —más null/undefined,
  // que son «fila sin foto»— para que agregar una licencia al CHECK sin decidir su pie rompa acá.
  it('las OTRAS licencias del CHECK no acreditan: ni pie de lista ni fuente por fila', () => {
    const noCredita = ['unknown', 'public_domain', 'eva_owned', 'supplier_authorized'] as const
    for (const license of noCredita) {
      expect(photoSourceLabel(license)).toBeNull()
      expect(photoCreditNeeded([{ name: license, imageLicense: license }])).toBe(false)
    }
    expect(photoSourceLabel(null)).toBeNull()
    expect(photoSourceLabel(undefined)).toBeNull()
    expect(photoCreditNeeded([{ name: 'sin foto', imageLicense: null }])).toBe(false)
    expect(photoCreditNeeded([{ name: 'sin llave' }])).toBe(false)
    // Y la lista entera de no-acreditadas junta tampoco pide el pie.
    expect(photoCreditNeeded(noCredita.map((l) => ({ name: l, imageLicense: l })))).toBe(false)
  })

  it('`cc_by` (sin `_sa`) TAMBIEN acredita: nombra la fuente y pide el pie', () => {
    expect(photoSourceLabel('cc_by')).toBe(PORTIONS_COPY.student.sheetPhotoSource)
    expect(photoCreditNeeded([{ name: 'a', imageLicense: 'cc_by' }])).toBe(true)
    // Una sola fila CC en medio de las que no acreditan alcanza para el pie.
    expect(
      photoCreditNeeded([
        { name: 'a', imageLicense: 'unknown' },
        { name: 'b', imageLicense: 'public_domain' },
        { name: 'c', imageLicense: 'cc_by' },
      ]),
    ).toBe(true)
  })
})

// El evento 5 (`nutrition_equivalences_opened`) se cubre ACA y no en portions-analytics.test.ts
// porque es la misma pieza compartida de W5 que el split y el crédito: quien toque uno lee el otro.
describe('equivalencesOpenedPayload (DATA §11, evento 5 — es del ALUMNO)', () => {
  it('el nombre del evento es el de DATA §11', () => {
    expect(PORTIONS_EVENT_EQUIVALENCES_OPENED).toBe('nutrition_equivalences_opened')
  })

  it('emite EXACTAMENTE cuatro llaves y NINGUNA es group_code, un nombre o una cifra', () => {
    const payload = equivalencesOpenedPayload('rn', { set: 'cl', hasGeneric: true, rows: 24 })
    expect(payload).toEqual({
      surface: 'rn',
      set: 'cl',
      has_generic: true,
      rows_bucket: '11-30',
    })
    expect(Object.keys(payload).sort()).toEqual(['has_generic', 'rows_bucket', 'set', 'surface'])
    expect(JSON.stringify(payload)).not.toContain('group')
  })

  it('la superficie viaja por parámetro, no por spread del componente', () => {
    expect(
      equivalencesOpenedPayload('web', { set: 'smae', hasGeneric: false, rows: 0 }),
    ).toEqual({ surface: 'web', set: 'smae', has_generic: false, rows_bucket: '0' })
  })

  it('rows_bucket es un TRAMO: nunca sale el número crudo', () => {
    expect(portionRowsBucket(0)).toBe('0')
    expect(portionRowsBucket(1)).toBe('1-10')
    expect(portionRowsBucket(10)).toBe('1-10')
    expect(portionRowsBucket(11)).toBe('11-30')
    expect(portionRowsBucket(30)).toBe('11-30')
    expect(portionRowsBucket(31)).toBe('31-60')
    // El RPC corta en 60, pero un llamador distraído no rompe el enum.
    expect(portionRowsBucket(600)).toBe('31-60')
    expect(portionRowsBucket(-3)).toBe('0')
    expect(portionRowsBucket(Number.NaN)).toBe('0')
  })
})

describe('copys del sheet (W5.9, tuteo)', () => {
  it('los encabezados y el pie salen del copy canónico', () => {
    expect(PORTIONS_COPY.student.sheetGenericsTitle).toBe('Genéricos · INTA · UDD')
    expect(PORTIONS_COPY.student.sheetBrandsTitle).toBe('Marcas y productos')
    expect(PORTIONS_COPY.student.photoCredit).toBe('Fotos: Open Food Facts (CC BY-SA)')
  })

  it('photoSourceLabel NO hardcodea el texto: lo toma del mismo copy', () => {
    expect(photoSourceLabel('cc_by_sa')).toBe(PORTIONS_COPY.student.sheetPhotoSource)
  })
})
