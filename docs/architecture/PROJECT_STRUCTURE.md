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
  schemas/           Contratos Zod compartidos web/mobile
  types/             Tipos compartidos
  tokens/            Design tokens compartidos
  brand-kit/         Motor de color white-label (puro TS, OKLCH) compartido web/mobile
  calc/              Calculos puros compartidos web/mobile
  tiers/             @eva/tiers: catalogo de planes/tiers + ciclos de cobro (puro TS). Fuente UNICA;
                     web (lib/constants, domain/coach/types) y mobile (lib/coach-tiers) RE-EXPORTAN de aca (anti-drift, plan 04 F6)
  feature-prefs/     @eva/feature-prefs: resolucion de feature-prefs por seccion (puro TS) compartido web/mobile
  module-catalog/    @eva/module-catalog: catalogo de modulos de pago (MODULE_KEYS) compartido web/mobile
  nutrition-engine/  @eva/nutrition-engine: motor unico de adherencia/racha/anillos/micros compartido web/mobile
  workout-engine/    @eva/workout-engine: motor puro de ejecucion (pasos, keypad, summary, typed, PRs) compartido web/mobile (paridad RN, elimina drift)
  plan-builder/      @eva/plan-builder: logica pura del builder de programas (areas, superseries, A/B, completitud por tipo)
  cardio/            @eva/cardio: calculos puros de zonas/pace/plantillas de cardio
  bodycomp/          @eva/bodycomp: computo ISAK/BIA/somatotype/antropometria (movido desde apps/web/src/domain/bodycomp)
  profile-analytics/ @eva/profile-analytics: analitica pura de la ficha del cliente (progreso, balance muscular, tonelaje)
  coach-nav/         @eva/coach-nav: modelo de navegacion coach compartido
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

## Mobile: rutas (Expo Router) — paridad 1:1 con web md<760

Tras el plan de paridad RN (`specs/rn-mobile-parity-redesign`, E0-E8), `apps/mobile` espeja el arbol movil de la web. Detalle canonico: `apps/mobile/AGENTS.md`.

```text
apps/mobile/app/
  index.tsx              Splash + entrada inteligente + selector de rol (RN-nativo)
  change-password.tsx    Force password change
  (auth)/                login (coach + alumno white-label 4 layouts), register, forgot/reset-password, verify-email
  alumno/
    codigo.tsx           Resolucion de branding por invite_code / link /c/slug
    onboarding.tsx       Intake 3 pasos
    suspended.tsx        Muro suspendido team-aware
    movement.tsx         Screening (gate hasModule)
    bodycomp.tsx         ISAK/somatotype (gate hasModule)
    workout/             Ejecutor (ExecutorV2, stepper, keypad, summary)
    exercise/            Aprender: detalle ejercicio
    (tabs)/              home, workout, nutricion, check-in, exercises, history, perfil
  coach/
    program-builder.tsx  Builder de programas (polimorfico, areas, A/B, fases)
    nutrition-builder.tsx Builder de plan (template/client-plan, intercambios, swaps)
    meal-groups.tsx      Grupos de comidas
    foods.tsx            Redirect a nutricion?tab=foods
    tools.tsx            Launcher de modulos entitled
    modules.tsx          Catalogo de modulos (read-only, link-out)
    reactivate.tsx       Muro de reactivacion
    brand-preview.tsx    Preview de marca
    cardio/              Herramientas de cardio (zonas/pace/plantillas)
    movement/            Hub de screening
    bodycomp/[clientId]  Composicion corporal (BIA/ISAK/tendencias)
    cliente/[clientId]   Ficha completa (hero + 5 tabs + dossier + herramientas)
    settings/            brand, features, areas, team
    (tabs)/              home, builder, ejercicios, nutricion, clientes, check-ins,
                         settings, subscription, support, perfil
```

La ficha RN del coach usa endpoints mobile de recurso bajo
`apps/web/src/app/api/mobile/coach/clients/[clientId]/` para biometría,
check-ins y bodycomp. Cada request lleva el workspace explícito; bodycomp usa
un cliente token-scoped para conservar RLS como techo. La preferencia de team
activo es local en RN porque `workspace_preferences` no representa un
`last_team_id`; no se simula persistencia server-side ambigua.

Notas:
- Selector de rol / walkthrough / codigo son RN-nativos (la web es coach-slug-scoped, sin selector).
- Motor de negocio en packages puros compartidos (`@eva/workout-engine`, `nutrition-engine`, `cardio`, `bodycomp`, `plan-builder`) — anti-drift.
- Estado de cierre de paridad: `docs/audits/rn-parity-qa/e8-cierre-paridad.md`.

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
