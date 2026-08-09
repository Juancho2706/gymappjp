import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CUSTOM_FOOD_ALL_ZERO_MESSAGE } from '@/app/coach/nutrition-v2/_lib/custom-food-macros'

const saveCustomFood = vi.fn()

// El contrato server de crear NO se toca en T2.3: acá se stubea para poder observar SI se llamó.
vi.mock('@/app/coach/nutrition-plans/_actions/nutrition-coach.actions', () => ({
  saveCustomFood: (...args: unknown[]) => saveCustomFood(...args),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AddFoodSheet } from './AddFoodSheet'

function fill(name: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(`[name="${name}"]`)
  if (!field) throw new Error(`campo ${name} no encontrado`)
  fireEvent.change(field, { target: { value } })
  return field
}

async function openSheet(onCreated?: (name: string) => void) {
  render(<AddFoodSheet coachId="11111111-1111-4111-8111-111111111111" onCreated={onCreated} />)
  fireEvent.click(screen.getByRole('button', { name: /nuevo alimento/i }))
  await screen.findByRole('button', { name: /guardar/i })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
}

// Timeout holgado: bajo la suite completa el arranque en frio de jsdom + Base UI supera los
// 5000 ms por defecto (visto en CI local: transform 75 s, environment 21 min agregados) y el
// primer test del archivo muere por reloj, no por logica. Aislado corre en <4 s.
describe('AddFoodSheet — invariante 6 (kcal/P/C/G obligatorios)', { timeout: 20000 }, () => {
  beforeEach(() => {
    saveCustomFood.mockReset()
    saveCustomFood.mockResolvedValue({ success: true })
  })

  it('no manda al servidor un alimento con los cuatro macros en 0', async () => {
    await openSheet()
    fill('name', 'Agua')
    fill('calories', '0')
    fill('protein', '0')
    fill('carbs', '0')
    fill('fats', '0')

    submit()

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toBe(CUSTOM_FOOD_ALL_ZERO_MESSAGE)
    expect(saveCustomFood).not.toHaveBeenCalled()
  })

  it('al rebotar la validación conserva lo ya escrito (React no resetea un submit cancelado)', async () => {
    await openSheet()
    fill('name', 'Huevo cocido')
    fill('category', 'proteina')
    fill('calories', '0')
    fill('protein', '0')
    fill('carbs', '0')
    fill('fats', '0')

    submit()
    await screen.findByRole('alert')

    expect(document.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('Huevo cocido')
    expect(document.querySelector<HTMLInputElement>('[name="category"]')?.value).toBe('proteina')
  })

  // Contraste del test de arriba: cuando el submit NO se cancela, React encola su
  // `requestFormReset` junto al action y los campos NO controlados quedan en blanco. Es
  // comportamiento propio de React 19 (preexistente, no de T2.3); se pinea para que el test
  // anterior no pase por vacío el día que cambie.
  it('si el action SÍ corre y el servidor falla, React resetea los campos no controlados', async () => {
    saveCustomFood.mockResolvedValue({ success: false, error: 'Error al guardar: boom' })
    await openSheet()
    fill('name', 'Huevo cocido')
    fill('calories', '155')
    fill('protein', '13')
    fill('carbs', '1')
    fill('fats', '11')

    submit()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'))
    expect(document.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('')
  })

  it('deja pasar el alta válida y avisa el nombre creado en vez de refrescar el RSC', async () => {
    const onCreated = vi.fn()
    await openSheet(onCreated)
    fill('name', '  Huevo cocido  ')
    fill('calories', '155')
    fill('protein', '13')
    fill('carbs', '1')
    fill('fats', '11')

    submit()

    await waitFor(() => expect(saveCustomFood).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Huevo cocido'))
  })
})
