# Plan B — Foundation: Clean Architecture · Atomic Design · Feature-First · SDD
**Version:** 2.1 | **Date:** 2026-05-23 | **Priority:** P1 | **Status:** PENDING
**Reemplaza:** `plan-b-design-system.md` (v1.0 — scope era solo Storybook + SDD)
**Docs de referencia:** `AGENTS.md §4.0` · `CLAUDE.md §Pilares Arquitectónicos`

---

## Diagnóstico: Estado actual

| Pilar | Estado | Gap |
|-------|--------|-----|
| **Clean Architecture** | ✅ 80% | `domain/` + `infrastructure/db/` + `services/` existen. Gap: algunos `_data/` van directo a Supabase, bypasean repositories. |
| **Feature-First** | ✅ Completo | Module pattern `_data/_actions/_components` en todo `/coach/*`, `/org/*`, `/c/*`. Ningún gap. |
| **Atomic Design** | ⚠️ Esqueleto | `atoms/`, `molecules/`, `organisms/` son barrel exports vacíos. Componentes reales dispersos en `coach/`, `auth/`, `landing/`, `ui/`. |
| **SDD** | ❌ Ausente | `specs/` directory no existe. Contexto de features vive en conversaciones, no escala con AI ni con equipo. |
| **Design System / Storybook** | ⚠️ Parcial | `packages/tokens/` existe con paleta y espaciado. Storybook no existe, sin catálogo visual ni stories. |

**Conclusión:** No se necesita reestructuración mayor. Los huesos son sólidos.
El trabajo es: llenar gaps + estandarizar inconsistencias + documentar con specs.

**Ya documentado en:**
- `AGENTS.md §4.0` — reglas de capas + checklist pre-código
- `CLAUDE.md §Pilares Arquitectónicos` — referencia rápida + data flow obligatorio

---

## Decisión de Arquitectura: Atomic Design vs Domain-Driven Components

**Problema:** Dos estrategias coexisten sin estándar claro:
- `components/atoms/`, `molecules/`, `organisms/` — existen pero vacíos
- Componentes reales en `components/coach/`, `components/auth/`, `components/landing/`

**Decisión (elegir una antes de implementar):**

### Opción A — Strict Atomic (recomendada para design system puro)
```
components/
├── atoms/          ← Button, Input, Badge, Avatar, Spinner, Label
├── molecules/      ← FormField, SearchBar, InfoTooltip, CheckInCard
├── organisms/      ← DataTable, NavSidebar, MfaBanner, OrgLoginForm
├── auth/           ← mantener (domain-specific, no reutilizable)
├── coach/          ← mantener (domain-specific)
├── landing/        ← mantener (domain-specific)
└── ui/             ← shadcn primitives (no mover, son externos)
```
Migrar shared components de `coach/`, `auth/` a atomic layers.
Costo: medio (renombrar imports).

### Opción B — Domain-Driven + Atomic como namespace (recomendada para velocidad)
Dejar todo donde está. Usar atomic layers solo para componentes verdaderamente
transversales (usados en 3+ domains distintos).
```
atoms/     ← solo primitivos reutilizables en cualquier domain
molecules/ ← solo compuestos reutilizables en cualquier domain
organisms/ ← solo organismos multi-domain
```
Costo: mínimo, sin migración.

**Recomendación: Opción B.** Opción A tiene alto costo de migración y EVA no tiene equipo
de diseño dedicado que justifique catálogo estricto. Opción B permite crecer el catálogo
progresivamente sin romper nada.

---

## B.1 — Clean Architecture: Auditoría y Estandarización

### Gap identificado
Algunos módulos en `app/coach/*/._data/` hacen queries directamente con Supabase client
en vez de pasar por `infrastructure/db/*.repository.ts`. Esto rompe la separación de capas.

### Estándar obligatorio
```
app/coach/[module]/_data/[module].queries.ts
  → llama a services/[domain].service.ts
  → llama a infrastructure/db/[domain].repository.ts
  → llama a Supabase client
```

Nunca:
```
app/coach/[module]/_data/[module].queries.ts
  → llama directamente a Supabase client  ← INCORRECTO
```

### Módulos a auditar (inconsistencia conocida o probable)
- `coach/nutrition/` — verificar si usa nutrition.service.ts o va directo
- `coach/check-ins/` — verificar si usa repository layer
- `coach/settings/` — verificar
- `org/*/` — verificar si usa org.service.ts

### Tarea B.1
- [ ] B.1.1 — Auditar cada módulo en `app/coach/` y `app/org/`: listar cuáles bypasean repositories
- [ ] B.1.2 — Para cada bypass: mover query a repository + exponer desde service
- [ ] B.1.3 — Agregar a CLAUDE.md: "Data flow obligatorio: _data → service → repository → Supabase"
- [ ] B.1.4 — Agregar a Definition of Done en specs/: "No Supabase directo en _data/"

**Scope:** No romper nada existente. Solo mover código, no reescribir lógica.

---

## B.2 — Atomic Design: Poblar Layers con Componentes Reales

Siguiendo **Opción B** (domain-driven + atomic como namespace para transversales).

### Componentes a agregar a atoms/ (primitivos multi-domain)

| Componente | Fuente actual | Target |
|-----------|--------------|--------|
| Button | `components/ui/button.tsx` (shadcn) | No mover — crear wrapper en atoms si se necesita extender |
| Input | `components/ui/input.tsx` (shadcn) | No mover |
| Badge | `components/ui/badge.tsx` (shadcn) | No mover |
| StatusBadge | disperso en coach/ | `atoms/StatusBadge.tsx` |
| Spinner / LoadingDot | disperso en loaders/ | `atoms/Spinner.tsx` |
| EmptyState | si existe disperso | `atoms/EmptyState.tsx` |

### Componentes a agregar a molecules/

| Componente | Fuente actual | Target |
|-----------|--------------|--------|
| InfoTooltip | si existe en molecules/ | verificar |
| FormField (label + input + error) | disperso en forms | `molecules/FormField.tsx` |
| SearchBar | si existe disperso | `molecules/SearchBar.tsx` |
| AvatarWithName | disperso en coach/ | `molecules/AvatarWithName.tsx` |

### Componentes a agregar a organisms/

| Componente | Fuente actual | Target |
|-----------|--------------|--------|
| MfaBanner | `components/organisms/` (verificar) | ya debería estar |
| DataTable genérico | disperso | `organisms/DataTable.tsx` si es multi-domain |

### Tareas B.2
- [ ] B.2.1 — Auditar `components/coach/`, `components/auth/`, `components/landing/`: identificar qué componentes se usan en 2+ domains distintos
- [ ] B.2.2 — Mover componentes multi-domain a `atoms/` o `molecules/` según tamaño/complejidad
- [ ] B.2.3 — Actualizar barrel exports en `atoms/index.ts`, `molecules/index.ts`, `organisms/index.ts`
- [ ] B.2.4 — Actualizar imports en todos los archivos que usaban la ubicación anterior

---

## B.3 — SDD: Spec-Driven Development

### Estructura a crear

```
specs/
├── _templates/
│   ├── SPEC.md          ← qué y por qué (user stories, AC)
│   ├── PLAN.md          ← cómo construir (arquitectura, DB, fases)
│   └── TASKS.md         ← tareas descompuestas + DoD checklist
├── enterprise-org-management/     ← spec retroactivo (ya implementado)
│   ├── SPEC.md
│   └── TASKS.md
├── enterprise-subdomain/          ← Plan A (completado)
│   ├── SPEC.md
│   └── TASKS.md
└── [future-feature]/
    ├── SPEC.md
    ├── PLAN.md
    └── TASKS.md
```

### Workflow SDD (obligatorio para features nuevas, no bugfixes)

```
1. SPEC.md   → qué resuelve, para quién, user stories, acceptance criteria
2. PLAN.md   → arquitectura, DB changes, fases de implementación
3. TASKS.md  → tareas atómicas, Definition of Done por task
4. Implementar usando TASKS.md como guía
5. Marcar tasks ✅ al completar
```

### Definition of Done (universal — va en cada TASKS.md)

Cada task está done cuando:
- [ ] TypeScript sin errores (`npm run typecheck`)
- [ ] ESLint sin warnings (`npm run lint`)
- [ ] Vitest pasan si hay unit tests
- [ ] Dark mode verificado visualmente
- [ ] Mobile viewport: `h-dvh` no `h-screen`
- [ ] No Supabase directo en `_data/` — pasar por service layer
- [ ] Si componente UI nuevo: story en Storybook creada

### Tareas B.3
- [ ] B.3.1 — Crear `specs/_templates/SPEC.md` (template)
- [ ] B.3.2 — Crear `specs/_templates/PLAN.md` (template)
- [ ] B.3.3 — Crear `specs/_templates/TASKS.md` (template con DoD universal)
- [ ] B.3.4 — Crear spec retroactivo `specs/enterprise-org-management/`
- [ ] B.3.5 — Crear spec retroactivo `specs/enterprise-subdomain/`
- [ ] B.3.6 — Actualizar CLAUDE.md: agregar sección "SDD Workflow"

---

## B.4 — Storybook 8: Catálogo Visual

### Stack
- **Storybook 8.x** + `@storybook/nextjs-vite` (Vite builder, compatible con Next.js 15 + React 19 + Tailwind v4)
- **No Webpack** — solo Vite
- **Dark-first** — EVA usa dark mode por defecto

### Setup

```bash
cd apps/web
npx storybook@latest init --type nextjs
# Elegir @storybook/nextjs-vite
npx storybook@latest add @storybook/addon-themes
npx storybook@latest add @storybook/addon-interactions
```

### Configuración

**`apps/web/.storybook/main.ts`:**
```typescript
import type { StorybookConfig } from '@storybook/nextjs-vite'

const config: StorybookConfig = {
  framework: '@storybook/nextjs-vite',
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    '../../../packages/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-themes',
  ],
}
export default config
```

**`apps/web/.storybook/preview.ts`:**
```typescript
import '../src/app/globals.css'
import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react'

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'dark',
    }),
  ],
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#09090b' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
}
export default preview
```

### Stories a crear (prioridad)

**Atoms:**
| Story | Variantes |
|-------|-----------|
| `atoms/StatusBadge.stories.tsx` | active, inactive, pending, expired |
| `atoms/Spinner.stories.tsx` | sizes: sm, md, lg |
| `atoms/EmptyState.stories.tsx` | con/sin acción |

**Molecules:**
| Story | Variantes |
|-------|-----------|
| `molecules/FormField.stories.tsx` | default, error, disabled |
| `molecules/AvatarWithName.stories.tsx` | con imagen, fallback initials |

**Organisms (enterprise-specific):**
| Story | Variantes |
|-------|-----------|
| `organisms/MfaBanner.stories.tsx` | pending MFA |
| `app/org/login/OrgLoginForm.stories.tsx` | initial, loading, error |

**Auth components:**
| Story | Variantes |
|-------|-----------|
| `components/auth/AuthErrorAlert.stories.tsx` | diferentes tipos de error |
| `components/auth/PasswordInput.stories.tsx` | empty, filled, error |

### CI: Storybook Build Check

**`.github/workflows/ci.yml` — agregar job:**
```yaml
storybook-build:
  runs-on: ubuntu-latest
  needs: quality
  defaults:
    run:
      working-directory: apps/web
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci
    - name: Build Storybook
      run: npm run build-storybook
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: storybook-build-errors
        path: apps/web/.storybook/
        retention-days: 3
```

No deploy de Storybook todavía (no Chromatic — tiene costo). CI solo verifica build.

### Tareas B.4
- [ ] B.4.1 — Instalar Storybook (`npx storybook@latest init`)
- [ ] B.4.2 — Configurar `.storybook/main.ts` y `preview.ts`
- [ ] B.4.3 — Agregar `@source` en `globals.css` para monorepo tokens
- [ ] B.4.4 — Crear stories atoms (StatusBadge, Spinner, EmptyState)
- [ ] B.4.5 — Crear stories molecules (FormField, AvatarWithName)
- [ ] B.4.6 — Crear stories organisms/auth (MfaBanner, OrgLoginForm, AuthErrorAlert)
- [ ] B.4.7 — Agregar `storybook-build` job en CI

---

## B.5 — CLAUDE.md: Actualizar con Estándares

Agregar/actualizar secciones en `CLAUDE.md`:

```markdown
## Data Flow (obligatorio)
_data/ → service (services/) → repository (infrastructure/db/) → Supabase
NUNCA: _data/ → Supabase directo

## Atomic Design (Opción B — domain-driven + atomic transversal)
atoms/       ← primitivos usados en 3+ domains distintos
molecules/   ← compuestos usados en 3+ domains distintos
organisms/   ← organismos multi-domain
coach/, auth/, landing/ ← componentes domain-specific (no mover)
ui/          ← shadcn primitives (no tocar)

## SDD Workflow
Toda feature nueva (no bugfix) requiere specs/[feature]/{SPEC,PLAN,TASKS}.md antes de código.
Templates en specs/_templates/.

## Storybook
Todo componente nuevo en atoms/molecules/organisms DEBE tener .stories.tsx en el mismo PR.
Correr: cd apps/web && npm run storybook
```

### Tarea B.5
- [ ] B.5.1 — Actualizar CLAUDE.md con secciones anteriores

---

## Orden de Ejecución

```
Sesión 1 — Docs Foundation (sin tocar código):
  ✅ HECHO: Actualizar CLAUDE.md con §Pilares Arquitectónicos
  ✅ HECHO: Actualizar AGENTS.md §4.0 + checklist §14
  B.3.1–B.3.3  → Crear specs/_templates/ (SPEC, PLAN, TASKS)
  B.3.4–B.3.5  → Specs retroactivos (enterprise-org-management, enterprise-subdomain)
  B.3.6        → Actualizar CLAUDE.md con §SDD Workflow (ya parcialmente hecho)
  B.1.1        → Auditar bypasses Clean Architecture (solo auditoría, sin fixes aún)

Sesión 2 — Storybook:
  B.4.1–B.4.3  → Instalar Storybook + configurar
  B.4.4–B.4.6  → Crear stories prioritarias (atoms, molecules, organisms/auth)
  B.4.7        → CI job storybook-build

Sesión 3 — Atomic + Clean Architecture fix:
  B.2.1–B.2.4  → Identificar y mover componentes multi-domain a atomic layers
  B.1.2–B.1.4  → Corregir bypasses repository (basado en auditoría Sesión 1)
```

**Sesión 1 es la más valiosa** — no toca UI, solo estructura de conocimiento
que hace todas las sesiones futuras más eficientes (AI y humanos).

---

## Verificación

```bash
# Storybook local
cd apps/web && npm run storybook
# → http://localhost:6006
# → Verificar dark mode toggle
# → Verificar atoms/molecules renderizan sin errores Tailwind

# Build (igual que CI)
cd apps/web && npm run build-storybook

# TypeCheck + Lint (después de cualquier cambio)
npm run typecheck && npm run lint
```

---

## Notas

**Por qué SDD primero:** Sin specs/, cada feature nueva empieza desde cero de contexto.
Con specs/, Claude Code puede implementar features completas dando SPEC+PLAN como contexto.
ROI inmediato desde la primera feature nueva.

**Por qué NO Strict Atomic (Opción A):** Migración de 50+ componentes con alto riesgo de
romper imports. EVA no tiene equipo de diseño dedicado que justifique catálogo estricto.
Opción B da 80% del beneficio con 20% del esfuerzo.

**Por qué no reestructuración mayor:** `domain/`, `infrastructure/db/`, `services/` ya están
bien implementados. El 80% de Clean Architecture que falta es estandarización de consistencia,
no reescritura.
