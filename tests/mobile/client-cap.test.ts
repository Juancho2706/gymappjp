// Lógica PURA del cupo de alumnos en mobile (embudo Free→Pro, W6.2/W6.3). El módulo bajo test no
// importa react-native/expo, así que corre con el runner del repo aunque viva en apps/mobile.
import { describe, expect, it } from 'vitest'
import {
  CAP_FULL_LABEL,
  CAP_WARNING_RATIO,
  STORE_PLAN_CHANGE_CAPTION,
  WARNING_500,
  capMeterLabel,
  capRatio,
  capTone,
  capWallCopy,
  countCapClients,
  freePlanBenefits,
  occupiesCap,
  shouldOpenAtCapWall,
  storePlanChangeCaption,
  type CapCountable,
} from '../../apps/mobile/lib/client-cap'

describe('client-cap: capRatio', () => {
  it('clampa a [0,1] y tolera basura', () => {
    expect(capRatio(0, 25)).toBe(0)
    expect(capRatio(5, 25)).toBe(0.2)
    expect(capRatio(30, 25)).toBe(1)
    expect(capRatio(-4, 25)).toBe(0)
    expect(capRatio(Number.NaN, 25)).toBe(0)
  })

  it('cupo no positivo o no finito se lee LLENO, nunca vacío', () => {
    expect(capRatio(0, 0)).toBe(1)
    expect(capRatio(0, -1)).toBe(1)
    expect(capRatio(0, Number.NaN)).toBe(1)
  })
})

describe('client-cap: capTone', () => {
  it('marca bajo el 80 %, ámbar desde el 80 %, lleno al 100 %', () => {
    expect(CAP_WARNING_RATIO).toBe(0.8)
    expect(capTone(0, 25)).toBe('brand')
    expect(capTone(19, 25)).toBe('brand') // 76 %
    expect(capTone(20, 25)).toBe('warning') // 80 % exacto
    expect(capTone(24, 25)).toBe('warning')
    expect(capTone(25, 25)).toBe('full')
    expect(capTone(26, 25)).toBe('full') // grandfather por encima del cupo
  })

  it('Free = 1: vacío es marca y el único alumno ya deja el medidor lleno', () => {
    expect(capTone(0, 1)).toBe('brand')
    expect(capTone(1, 1)).toBe('full')
  })

  it('sin cupo utilizable el tono es LLENO aunque no haya ni un alumno', () => {
    // Cupo 0 (columna en cero, lectura rota) no puede leerse «vacío, todo bien».
    expect(capTone(0, 0)).toBe('full')
    expect(capTone(0, -5)).toBe('full')
    expect(capTone(0, Number.NaN)).toBe('full')
  })

  it('el borde del ámbar cae exactamente en el 80 %, no en el 79', () => {
    expect(capTone(79, 100)).toBe('brand')
    expect(capTone(80, 100)).toBe('warning')
    expect(capTone(99, 100)).toBe('warning')
    expect(capTone(100, 100)).toBe('full')
  })

  it('la etiqueta de lleno es estado, no una oferta', () => {
    expect(CAP_FULL_LABEL).toBe('Cupo completo')
  })
})

describe('client-cap: capMeterLabel', () => {
  it('el adjetivo concuerda con el sustantivo del catálogo (no se concatena la «s»)', () => {
    expect(capMeterLabel(1, 1)).toBe('1 de 1 alumno activo')
    expect(capMeterLabel(0, 1)).toBe('0 de 1 alumno activo')
    expect(capMeterLabel(3, 25)).toBe('3 de 25 alumnos activos')
    expect(capMeterLabel(60, 60)).toBe('60 de 60 alumnos activos')
  })

  it('conteos imposibles no rompen la etiqueta', () => {
    expect(capMeterLabel(-2, 25)).toBe('0 de 25 alumnos activos')
    expect(capMeterLabel(Number.NaN, 25)).toBe('0 de 25 alumnos activos')
  })
})

describe('client-cap: countCapClients (quién OCUPA cupo)', () => {
  const real = (over: Partial<CapCountable> = {}): CapCountable => ({ isArchived: false, isDemo: false, ...over })

  it('el alumno de EJEMPLO no cuenta', () => {
    // Regresión del QA del owner en Android (22-08): coach Free con cupo 1 y SOLO el demo veía el
    // muro «Alcanzaste el cupo de tu plan» al tocar «Nuevo alumno» y en el paso 4 de la guía.
    expect(countCapClients([real({ isDemo: true })])).toBe(0)
    expect(occupiesCap(real({ isDemo: true }))).toBe(false)
  })

  it('el archivado no cuenta', () => {
    expect(countCapClients([real({ isArchived: true })])).toBe(0)
    expect(occupiesCap(real({ isArchived: true }))).toBe(false)
  })

  it('mezcla: solo los activos reales ocupan cupo', () => {
    const cartera: CapCountable[] = [
      real(),                                     // cuenta
      real(),                                     // cuenta
      real({ isDemo: true }),                     // ejemplo del onboarding
      real({ isArchived: true }),                 // archivado
      real({ isArchived: true, isDemo: true }),   // ejemplo archivado
    ]
    expect(countCapClients(cartera)).toBe(2)
  })

  it('un alumno PAUSADO sigue ocupando cupo (el predicado no mira `is_active`)', () => {
    // Espejo exacto del server (`countActiveStandaloneClients`): el gate filtra por `is_archived`,
    // nunca por `is_active`. Contar distinto acá haría discrepar el pre-check con el 402.
    expect(countCapClients([real()])).toBe(1)
  })

  it('sin la columna `is_demo` (DB vieja) el alumno cuenta, como antes', () => {
    expect(countCapClients([{ isArchived: false }])).toBe(1)
    expect(countCapClients([{ isArchived: false, isDemo: null }])).toBe(1)
  })

  it('cartera vacía o ausente ⇒ 0 (default PERMISIVO: deja pasar al formulario)', () => {
    expect(countCapClients([])).toBe(0)
    expect(countCapClients(null)).toBe(0)
    expect(countCapClients(undefined)).toBe(0)
    expect(occupiesCap(null)).toBe(false)
    expect(occupiesCap(undefined)).toBe(false)
  })

  it('con solo el demo, el medidor Free dice «0 de 1» y NO se lee lleno', () => {
    // Las dos bocas del mismo número: el medidor del home y el pre-check del alta.
    const active = countCapClients([real({ isDemo: true })])
    expect(capMeterLabel(active, 1)).toBe('0 de 1 alumno activo')
    expect(capTone(active, 1)).toBe('brand')
    expect(shouldOpenAtCapWall({ activeCount: active, maxClients: 1 })).toBe(false)
  })

  it('con un alumno REAL, el coach Free sí choca contra el muro', () => {
    const active = countCapClients([real(), real({ isDemo: true })])
    expect(active).toBe(1)
    expect(shouldOpenAtCapWall({ activeCount: active, maxClients: 1 })).toBe(true)
  })
})

describe('client-cap: shouldOpenAtCapWall (el alta abre en el muro, no en el formulario)', () => {
  it('con cupo lleno o excedido el alta arranca en el muro', () => {
    // QA owner Android 22-08: «+ agregar alumno» con el cupo lleno abría el formulario entero y el
    // muro llegaba recién al enviar, con los datos ya escritos.
    expect(shouldOpenAtCapWall({ activeCount: 1, maxClients: 1 })).toBe(true)
    expect(shouldOpenAtCapWall({ activeCount: 2, maxClients: 1 })).toBe(true) // grandfather
    expect(shouldOpenAtCapWall({ activeCount: 25, maxClients: 25 })).toBe(true)
  })

  it('con cupo disponible el formulario se abre normal', () => {
    expect(shouldOpenAtCapWall({ activeCount: 0, maxClients: 1 })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: 24, maxClients: 25 })).toBe(false)
  })

  it('dato ausente o basura NO bloquea el alta: el 402 del server sigue siendo la autorización', () => {
    // Fail-OPEN deliberado (al revés que el medidor, que ante cupo 0 se lee lleno): impedir un alta
    // legítima por una lectura incompleta es peor que un rebote del server.
    expect(shouldOpenAtCapWall({})).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: undefined, maxClients: undefined })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: 5, maxClients: undefined })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: undefined, maxClients: 1 })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: null, maxClients: null })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: Number.NaN, maxClients: 1 })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: 5, maxClients: Number.NaN })).toBe(false)
  })

  it('cupo no positivo (columna en cero o rota) deja pasar al formulario', () => {
    expect(shouldOpenAtCapWall({ activeCount: 0, maxClients: 0 })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: 3, maxClients: 0 })).toBe(false)
    expect(shouldOpenAtCapWall({ activeCount: 3, maxClients: -5 })).toBe(false)
  })
})

describe('client-cap: capWallCopy (muro de cupo del alta)', () => {
  it('título fijo y cuerpo con el cupo real, en plural correcto', () => {
    const free = capWallCopy({ limit: 1, platform: 'ios' })
    expect(free.title).toBe('Alcanzaste el cupo de tu plan')
    expect(free.body).toBe(
      'Tu plan actual permite 1 alumno activo. Para dejar espacio puedes archivar un alumno: su historial se mantiene intacto.',
    )

    const paid = capWallCopy({ limit: 25, platform: 'ios' })
    expect(paid.body).toContain('permite 25 alumnos activos.')
  })

  it('sin cupo conocido el cuerpo degrada sin inventar un número', () => {
    for (const limit of [undefined, null, 0, -3, Number.NaN]) {
      const copy = capWallCopy({ limit, platform: 'android' })
      expect(copy.body).toContain('Tu plan actual no permite sumar más alumnos activos.')
      expect(copy.body).toContain('archivar un alumno')
    }
  })

  // ── Compliance de tiendas (decisión cerrada del owner 21-08) ─────────────────────────────
  it('iOS NO lleva caption: cero texto que lleve a pagar (guideline 3.1.1)', () => {
    for (const limit of [1, 2, 25, 60]) {
      expect(capWallCopy({ limit, platform: 'ios' }).caption).toBeUndefined()
    }
    // Cualquier plataforma que no sea android se trata como iOS (fail-closed).
    expect(capWallCopy({ limit: 1, platform: 'web' }).caption).toBeUndefined()
    expect(capWallCopy({ limit: 1, platform: 'macos' }).caption).toBeUndefined()
  })

  it('Android lleva UNA línea de texto plano, sin link', () => {
    const copy = capWallCopy({ limit: 1, platform: 'android' })
    expect(copy.caption).toBe(STORE_PLAN_CHANGE_CAPTION)
    expect(copy.caption).toBe('Los cambios de plan se hacen en eva-app.cl')
    expect(copy.caption).not.toMatch(/https?:\/\//)
  })

  it('ningún texto del muro habla de plata ni de tiers ajenos', () => {
    for (const platform of ['ios', 'android']) {
      for (const limit of [undefined, 1, 25, 60]) {
        const copy = capWallCopy({ limit, platform })
        const text = [copy.title, copy.body, copy.caption ?? ''].join(' ')
        expect(text).not.toContain('$')
        expect(text).not.toContain('/mes')
        expect(text).not.toContain('Pro')
        expect(text).not.toContain('Elite')
        expect(text).not.toMatch(/\bpagar\b|\bcomprar\b|\bprecio\b/i)
      }
    }
  })
})

describe('client-cap: storePlanChangeCaption (única línea de tienda)', () => {
  it('Android recibe el literal canónico; nadie más', () => {
    expect(storePlanChangeCaption('android')).toBe(STORE_PLAN_CHANGE_CAPTION)
    for (const platform of ['ios', 'web', 'macos', 'windows', '']) {
      expect(storePlanChangeCaption(platform)).toBeUndefined()
    }
  })

  it('el muro de cupo usa ESTA decisión, no una copia', () => {
    expect(capWallCopy({ limit: 1, platform: 'android' }).caption).toBe(storePlanChangeCaption('android'))
    expect(capWallCopy({ limit: 1, platform: 'ios' }).caption).toBe(storePlanChangeCaption('ios'))
  })
})

describe('client-cap: freePlanBenefits (pantalla de confirmación de correo)', () => {
  const BENEFITS = freePlanBenefits()

  it('el beneficio de cambiar de plan es IDÉNTICO en las dos plataformas', () => {
    // Regresión de W6: en Android decía «…desde eva-app.cl» — una segunda línea de compliance,
    // distinta de la canónica, escondida dentro de un beneficio. El dónde va aparte, como caption.
    expect(BENEFITS).toContain('Cambia de plan cuando quieras')
    expect(BENEFITS.join(' ')).not.toContain('eva-app.cl')
  })

  it('el cupo Free sale del catálogo con el plural y el adjetivo concordados', () => {
    expect(BENEFITS[0]).toBe('1 alumno sin costo, con tu marca')
  })

  it('ningún beneficio habla de plata ni de tiers ajenos', () => {
    const text = BENEFITS.join(' ')
    expect(text).not.toContain('$')
    expect(text).not.toContain('/mes')
    expect(text).not.toMatch(/\bPro\b|\bElite\b/)
    expect(text).not.toMatch(/\bpagar\b|\bcomprar\b|\bprecio\b|\bupgrade\b/i)
  })
})

describe('client-cap: WARNING_500 es el ámbar del DS, una sola vez', () => {
  it('el hex es el de --warning-500', () => {
    expect(WARNING_500).toBe('#F5A524')
  })
})
