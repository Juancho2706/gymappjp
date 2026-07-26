import { Profiler } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CountUpText } from './count-up'

// Motion cachea la deteccion de prefers-reduced-motion en un global de una sola vez
// (`hasReducedMotionListener`), asi que dentro de un mismo archivo de tests no se puede
// flipear `matchMedia` a mitad de camino. Releemos el media query en cada render para que
// el mock de matchMedia de abajo sea el que manda.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    useReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
})

const realMatchMedia = window.matchMedia

/** matchMedia que responde `true` a `(prefers-reduced-motion: reduce)`. */
function mockReducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('CountUpText', () => {
  it('llega al valor final sin volver a commitear el arbol React', async () => {
    // El contador de commits es el corazon del test: el bug EVA-NEXTJS-10/E era un
    // setState por frame. Con MotionValue el arbol commitea 1 sola vez, dure lo que dure.
    const onRender = vi.fn()
    render(
      <Profiler id="count-up" onRender={onRender}>
        <CountUpText value={87} data-testid="counter" />
      </Profiler>,
    )
    const el = screen.getByTestId('counter')

    // Primer render determinístico (SSR-safe): arranca en 0, no en el valor final.
    expect(el).toHaveTextContent(/^0$/)

    await waitFor(() => expect(el).toHaveTextContent(/^87$/), { timeout: 5000 })
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('con prefers-reduced-motion salta al valor final sin interpolar', async () => {
    mockReducedMotion()

    const onRender = vi.fn()
    render(
      <Profiler id="count-up-reduced" onRender={onRender}>
        <CountUpText value={87} data-testid="counter-reduced" />
      </Profiler>,
    )
    const el = screen.getByTestId('counter-reduced')

    // `jump()` en el efecto post-hidratación: el texto queda listo en el primer frame.
    // El bound de 250 ms es la prueba de que NO hubo resorte (60/20 tarda >1 s en llegar).
    await waitFor(() => expect(el).toHaveTextContent(/^87$/), { timeout: 250 })
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it('respeta el format custom (decimales) y el prop disabled', () => {
    render(
      <CountUpText
        value={72.45}
        disabled
        format={(v) => v.toFixed(1)}
        data-testid="counter-disabled"
      />,
    )

    expect(screen.getByTestId('counter-disabled')).toHaveTextContent(/^72\.5$/)
  })
})
