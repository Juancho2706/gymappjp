// Baja de plantillas de plan V2 en la app (feedback del coach en iOS, 22-08: «¿No puedo eliminar
// plantillas ya creadas? Si no me sirven quedan ahí para siempre»). El módulo bajo test no importa
// react-native, así que corre con el runner del repo aunque viva en apps/mobile.
import { describe, expect, it } from 'vitest'
import {
  canDeletePlanTemplate,
  planTemplateDeleteCopy,
  planTemplateDisplayName,
} from '../../apps/mobile/lib/nutrition-v2-plan-template-delete'

describe('canDeletePlanTemplate', () => {
  it('una plantilla normal se puede eliminar', () => {
    expect(canDeletePlanTemplate({ name: 'Definición 1800', readable: true })).toBe(true)
  })

  // ESTE es el test que importa. Una plantilla ilegible no se abre ni se edita (por eso no lleva
  // lápiz), y el instinto es esconderle también la papelera "porque está rota". Es justo al revés:
  // es la fila que el coach no puede sacarse de encima de ninguna otra forma, y la web tampoco la
  // bloquea (su rama `force`). Si alguien invierte esto, se rompe acá y no en producción.
  it('una plantilla ILEGIBLE también se puede eliminar (es la del feedback)', () => {
    expect(canDeletePlanTemplate({ name: 'Rescatada de la V1', readable: false })).toBe(true)
  })

  it('sin fila no hay nada que borrar', () => {
    expect(canDeletePlanTemplate(null)).toBe(false)
    expect(canDeletePlanTemplate(undefined)).toBe(false)
  })
})

describe('planTemplateDisplayName', () => {
  it('recorta el nombre guardado', () => {
    expect(planTemplateDisplayName('  Volumen 3000  ')).toBe('Volumen 3000')
  })

  it('nombre vacío o en blanco cae a un genérico, nunca a «»', () => {
    expect(planTemplateDisplayName('')).toBe('esta plantilla')
    expect(planTemplateDisplayName('   ')).toBe('esta plantilla')
  })
})

describe('planTemplateDeleteCopy', () => {
  it('nombra la plantilla y promete que los alumnos aplicados no cambian', () => {
    const copy = planTemplateDeleteCopy({ name: 'Definición 1800', readable: true })
    expect(copy.title).toBe('Eliminar plantilla')
    expect(copy.body).toBe(
      '¿Eliminar «Definición 1800»? Los alumnos que ya la tienen aplicada no cambian.',
    )
  })

  it('avisa que no hay deshacer (en RN no existe el «Deshacer» de la web)', () => {
    expect(planTemplateDeleteCopy({ name: 'X', readable: true }).note).toMatch(/no se puede deshacer/i)
  })

  it('el botón cambia a un estado ocupado mientras el servidor responde', () => {
    const copy = planTemplateDeleteCopy({ name: 'X', readable: true })
    expect(copy.confirmLabel).toBe('Eliminar')
    expect(copy.busyLabel).not.toBe(copy.confirmLabel)
  })

  it('sin nombre no imprime unas comillas vacías', () => {
    expect(planTemplateDeleteCopy({ name: '   ', readable: false }).body).toContain('«esta plantilla»')
  })
})
