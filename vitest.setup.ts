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
