import { vi } from 'vitest'

// Los setupFiles corren DESPUES de montar el environment del archivo, asi que estos dos
// chequeos son la forma correcta de compartir un unico setup entre los projects `*-node`
// (environment: 'node') y `*-dom` (environment: 'jsdom'), y siguen valiendo para un
// `.test.ts` que pida DOM por archivo con `// @vitest-environment jsdom`.

// Matchers de jest-dom: solo tienen sentido con DOM. En `node` ni se importan (ahorra el
// import y evita que un test puro dependa por accidente de `toBeInTheDocument`).
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom')
}

// Mock de Next.js router (vale para node y para jsdom: es logica, no DOM)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => '',
}))

// Stub de scrollIntoView (mismo motivo que matchMedia: jsdom NO lo implementa).
//
// POR QUE (CI 19-09, shard 1/3): `LogSetForm` hace
// `setTimeout(() => formRef.current?.scrollIntoView(...), 60)`. El `?.` protege que el REF exista,
// no que el METODO exista, así que en jsdom el timer explota 60 ms después — fuera del test que lo
// disparó. Vitest lo cuenta como «unhandled error» y tumba el shard ENTERO con los 3.774 tests en
// verde. Que aparezca o no depende de si la máquina llega a ejecutar el timer antes del teardown:
// en CI sí, en local no, y basta agregar un archivo a `tests/**` para que el reparto de shards
// cambie y lo destape.
//
// Va acá y no en el componente a propósito: es una carencia del ENTORNO de test, no del producto
// (todos los navegadores implementan scrollIntoView), y así cubre a cualquier componente que haga
// scroll, no solo a este.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// Mock de matchMedia (solo entornos con window — tests `node` lo omiten)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
