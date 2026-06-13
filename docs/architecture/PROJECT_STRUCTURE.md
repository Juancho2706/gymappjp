# Project Structure

Ultima modificacion: 2026-05-21 18:25 -04:00

## Rama y entorno

- Rama activa de desarrollo: `v2/enterprise`.
- Produccion/Vercel live: no tocar desde esta limpieza; normalmente viene de `origin/master`.
- Supabase para desarrollo: local `http://127.0.0.1:54321`.
- No ejecutar `npx supabase db push` ni push a `master` sin autorizacion explicita.

## Monorepo

```text
apps/
  web/        Next.js App Router, backend web, PWA y paneles
  mobile/     Expo/React Native
packages/
  schemas/    Contratos Zod compartidos web/mobile
  types/      Tipos compartidos
  tokens/     Design tokens compartidos
  brand-kit/  Motor de color white-label (puro TS, OKLCH) compartido web/mobile
  calc/       Calculos puros compartidos web/mobile
  tiers/      @eva/tiers: catalogo de planes/tiers + ciclos de cobro (puro TS). Fuente UNICA;
              web (lib/constants, domain/coach/types) y mobile (lib/coach-tiers) RE-EXPORTAN de aca (anti-drift, plan 04 F6)
supabase/
  migrations/ Migraciones activas
  seed.sql    Fixtures locales/E2E
tests/        Playwright E2E
docs/         Documentacion canonica
```

## Web: capas obligatorias

```text
apps/web/src/
  app/                Rutas App Router
  domain/             Tipos puros de negocio
  infrastructure/db/  Repositories con SupabaseClient inyectado
  services/           Logica de aplicacion
  components/         UI compartida
  lib/                Integraciones/helpers compartidos
```

Reglas:

- `page.tsx` no debe crear Supabase client directo. Debe delegar a `_data/*.queries.ts`.
- Server actions viven en `_actions/*.actions.ts`.
- No debe haber `actions.ts` raiz en rutas.
- `_actions` no debe tener `supabase.from()` directo; debe delegar a services/repositories.
- `React.cache` vive en `_data`, no en repositories.
- Mutations deben validar con Zod y llamar `revalidatePath()` cuando cambian UI cacheada.

## Patron de ruta

```text
feature/
  page.tsx
  loading.tsx
  _data/
    feature.queries.ts
  _actions/
    feature.actions.ts
  _components/
    FeatureClient.tsx
```

## Componentes

Web:

```text
apps/web/src/components/
  atoms/
  molecules/
  organisms/
  ui/
  coach/
  client/
  landing/
  shared/
```

Mobile:

```text
apps/mobile/components/
  atoms/
  molecules/
  organisms/
```

Criterio:

- Atom: primitivo sin estado de dominio.
- Molecule: composicion con estado local.
- Organism: domain-aware, orquesta interacciones.

## Supabase

- Cambios DB van en `supabase/migrations/`.
- Regenerar tipos despues de schema changes:

```powershell
npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts
```

- `supabase/.temp/` es cache local del CLI y esta ignorado.

## Archivos raiz

Se permiten en raiz:

- `README.md`
- `AGENTS.md` y `CLAUDE.md` como memoria local de agentes
- Configs del repo: `package.json`, `playwright.config.ts`, `vercel.json`, etc.

Planes, handoffs, estado y verificaciones deben vivir en `docs/`.
