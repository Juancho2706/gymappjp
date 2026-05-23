# Plan B — Design System: Storybook 8 + SDD
**Version:** 1.0 | **Date:** 2026-05-22 | **Priority:** P2 (sesión separada)

---

## Context

Dos piezas del design system están incompletas:

1. **Storybook:** No existe. Los componentes (atoms/molecules/organisms) tienen estructura
   de atomic design pero no tienen stories ni catálogo visual. Bloquea:
   - Onboarding de nuevos devs/diseñadores
   - Detección de regresiones visuales
   - Documentación de variantes y estados

2. **SDD (Spec-Driven Development):** No existe directorio `specs/`. Las especificaciones
   de features viven en código y docs de arquitectura — no hay fuente de verdad formal
   para implementar features con AI (Claude Code, Cursor).

**Scope esta sesión:** Solo Plan B. Plan A (enterprise) es prerequisito y va primero.

---

## B.1 — Storybook 8 Setup

### Stack y Compatibilidad (Mayo 2026)

- **Storybook 8.x** — compatible con Next.js 15 + React 19 + Tailwind v4 ✅
- **Framework:** `@storybook/nextjs-vite` (Vite builder) — NO usar `@storybook/nextjs` (Webpack)
  - Vite es más rápido y compatible con el stack moderno
  - El monorepo ya usa Next.js 15 con Turbopack en dev
- **Tailwind v4 CSS-first** — requiere `@source` directives en monorepo

### Instalación

**Desde `apps/web/`:**
```bash
cd apps/web
npx storybook@latest init --type nextjs
# Elegir: @storybook/nextjs-vite cuando pregunte el framework
```

Esto crea:
- `apps/web/.storybook/main.ts`
- `apps/web/.storybook/preview.ts`
- Agrega scripts `storybook` y `build-storybook` en `package.json`

### Archivos de Configuración

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
      themes: {
        light: '',
        dark: 'dark',
      },
      defaultTheme: 'dark',   // EVA es dark-first
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

**`apps/web/src/app/globals.css` — agregar `@source` para monorepo:**
```css
/* Al inicio del archivo, después del @import tailwindcss */
@import 'tailwindcss';
@source '../../../packages/tokens';   /* scan tokens para utilities */
@source '../../../packages/schemas';  /* por si hay clases en schemas */
```

### Addons a instalar:
```bash
npx storybook@latest add @storybook/addon-themes
npx storybook@latest add @storybook/addon-interactions
```

### Scripts en `apps/web/package.json`:
```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build --output-dir storybook-static"
  }
}
```

---

## B.2 — Stories para Componentes Existentes

### Atoms (prioridad alta)

**`src/components/atoms/Button.stories.tsx`**
```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { children: 'Click me', variant: 'default' } }
export const Secondary: Story = { args: { children: 'Secondary', variant: 'secondary' } }
export const Outline: Story = { args: { children: 'Outline', variant: 'outline' } }
export const Destructive: Story = { args: { children: 'Delete', variant: 'destructive' } }
export const Loading: Story = { args: { children: 'Loading...', disabled: true } }
export const Ghost: Story = { args: { children: 'Ghost', variant: 'ghost' } }
```

**Stories a crear (archivos nuevos):**

| Componente | Path | Variantes a documentar |
|-----------|------|------------------------|
| Button | `src/components/atoms/Button.stories.tsx` | default, secondary, outline, destructive, ghost, disabled, loading |
| Input | `src/components/atoms/Input.stories.tsx` | default, error, disabled, with label |
| Badge | `src/components/atoms/Badge.stories.tsx` | default, success, warning, danger, outline |
| Card / GlassCard | `src/components/atoms/Card.stories.tsx` | default, glass variant |
| Avatar | `src/components/atoms/Avatar.stories.tsx` | with image, fallback initials |

### Molecules

| Componente | Path | Notas |
|-----------|------|-------|
| InfoTooltip | `src/components/molecules/InfoTooltip.stories.tsx` | trigger + tooltip content |
| CheckInCard | `src/components/molecules/CheckInCard.stories.tsx` | con/sin foto, diferentes estados |
| FoodListCompact | `src/components/molecules/FoodListCompact.stories.tsx` | lista de items |

### Organisms (enterprise-specific)

| Componente | Path | Notas |
|-----------|------|-------|
| MfaBanner | `src/components/organisms/MfaBanner.stories.tsx` | estado pendiente MFA |
| OrgLoginForm | `src/app/org/login/OrgLoginForm.stories.tsx` | estado inicial, error, loading |

### Enterprise Landing Components (nuevos de Plan A)

Una vez que se creen los componentes de la enterprise landing page (Plan A),
agregar stories para:
- `EnterpriseHeroSection.stories.tsx`
- `EnterpriseFeaturesGrid.stories.tsx`
- `EnterprisePricingCard.stories.tsx`

---

## B.3 — CI/CD: Storybook Build en PR

**Archivo:** `.github/workflows/ci.yml`

Agregar job después del job `quality`:

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

**Nota:** No se hace deploy de Storybook por ahora (no Chromatic — tiene costo).
El CI solo verifica que el build no falle (detecta errores en stories).

---

## B.4 — SDD: Spec-Driven Development

### Estructura de Directorios

**Crear en root del monorepo:**
```
specs/
├── _templates/
│   ├── SPEC.md          ← plantilla: qué y por qué
│   ├── PLAN.md          ← plantilla: cómo construir
│   └── TASKS.md         ← plantilla: tareas descompuestas
├── enterprise-org-management/     ← spec retroactivo (ya implementado)
│   ├── SPEC.md
│   └── TASKS.md
├── enterprise-subdomain-landing/  ← spec de Plan A (en progreso)
│   ├── SPEC.md
│   └── PLAN.md
└── mobile-coach-client-parity/    ← spec de Plan C
    ├── SPEC.md
    └── PLAN.md
```

### Plantilla `specs/_templates/SPEC.md`:
```markdown
# Feature: [Nombre]

## Overview
[1-2 oraciones. Qué resuelve y para quién. NO incluir detalles técnicos.]

## Problem Statement
- ¿Qué problema existe hoy? (ser concreto, evitar vaguedades)
- ¿Quién lo sufre y con qué frecuencia?
- ¿Cuál es el costo de NO resolver esto?

## Users
- **Primary:** [persona + contexto]
- **Secondary:** [si aplica]

## Functional Requirements
- FR-001: El sistema DEBE [comportamiento obligatorio]
- FR-002: El sistema DEBERÍA [comportamiento deseable]
- [NECESITA CLARIFICACIÓN] — [pregunta abierta para el equipo]

## User Stories & Acceptance Criteria

### Story 1: [Objetivo del usuario] [P1]
**Given** [precondición conocida]
**When** [acción del usuario]
**Then** [resultado esperado y verificable]

**Criterio de done:** [cómo verificar esta story independientemente]

## Data Model
[Entidades involucradas y sus relaciones. Solo lo relevante para este feature.]
```
Ejemplo: Coach → tiene → WorkoutPrograms → tiene → ProgramBlocks → tiene → Exercises
```

## Success Criteria (medibles)
- [Acción] ocurre en menos de [X] segundos
- [% de usuarios] completan el flujo sin error
- [Métrica de negocio] mejora en [X]

## Edge Cases
- ¿Qué pasa si [condición de borde]?
- ¿Cómo se maneja [escenario de error]?

## Out of Scope
- NO incluye [feature relacionado pero diferente]
- NO aplica para [rol/contexto excluido]

## Assumptions
- Asumimos que [precondición técnica o de producto]
```

### Plantilla `specs/_templates/PLAN.md`:
```markdown
# Implementation Plan: [Nombre del Feature]

## Summary
- **Stack:** Next.js 15 App Router, Supabase, Tailwind v4, [otros relevantes]
- **Complexity:** [Low/Medium/High] — [1 línea de justificación]
- **Estimated effort:** [X días/sesiones]

## Architecture Decisions

| Decisión | Opción elegida | Por qué |
|----------|---------------|---------|
| Componente tipo | RSC / Client | [razón] |
| State management | useState / useActionState | [razón] |
| Data layer | React.cache query / RPC | [razón] |

## Module Structure (Feature-First)
```
app/[route]/
├── page.tsx              # RSC — fetch + render
├── loading.tsx           # Skeleton
├── _data/
│   └── feature.queries.ts
├── _actions/
│   └── feature.actions.ts
└── _components/
    └── FeatureForm.tsx
```

## DB Changes
```sql
-- Si hay nuevas tablas o columns
CREATE TABLE ... ;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ;
```
Si no hay cambios de DB: "None"

## Phase 1: [Nombre] (entregable: ...)
- [ ] Task 1
- [ ] Task 2

## Phase 2: [Nombre] (entregable: ...)
- [ ] Task 3

## Testing
- Unit: [qué se testea con Vitest]
- E2E: [qué flujo con Playwright]
- Manual: [qué verificar en browser]

## Risks
- [Riesgo técnico] → [Mitigación]
```

### Plantilla `specs/_templates/TASKS.md`:
```markdown
# Tasks: [Nombre del Feature]

## Definition of Done
Cada task está done cuando:
- [ ] TypeScript sin errores (`npm run typecheck`)
- [ ] ESLint sin warnings (`npm run lint`)
- [ ] Vitest pasan si hay unit tests
- [ ] Dark mode verificado visualmente
- [ ] Mobile viewport verificado (no `h-screen`, usar `h-dvh`)
- [ ] Story en Storybook creada (si es componente UI)

## Tasks

### Phase 1
- [ ] T-001: [acción concreta → output concreto]
- [ ] T-002: ...

### Phase 2 (depende de Phase 1)
- [ ] T-003: ...
```

---

## B.5 — Update CLAUDE.md: Agregar Sección SDD

**Archivo:** `CLAUDE.md` (root)

Agregar después de la sección "Code Rules":
```markdown
## SDD Workflow (Spec-Driven Development)

Toda feature nueva (no bugfixes) sigue este workflow:

1. **SPEC.md** primero — qué y por qué (user stories, acceptance criteria)
   Archivo: `specs/[feature-name]/SPEC.md` (usar template en `specs/_templates/`)
2. **PLAN.md** — cómo construir (arquitectura, DB changes, fases)
   Archivo: `specs/[feature-name]/PLAN.md`
3. **TASKS.md** — tareas descompuestas con checklist de done
   Archivo: `specs/[feature-name]/TASKS.md`
4. **Implementar** usando TASKS.md como guía
5. **Marcar tasks como done** en TASKS.md al completar

Las specs son la fuente de verdad para AI-assisted development.
Cuando uses Claude Code: proveer SPEC.md + PLAN.md como contexto.
```

---

## Orden de Ejecución Plan B

```
1. B.1 — Instalar Storybook (npx storybook@latest init)
2. B.1 — Configurar .storybook/main.ts y preview.ts
3. B.1 — Agregar @source en globals.css
4. B.2 — Crear stories para atoms (Button, Input, Badge, Card)
5. B.2 — Crear stories para molecules (InfoTooltip, CheckInCard)
6. B.3 — Agregar storybook-build job en ci.yml
7. B.4 — Crear estructura specs/ + plantillas
8. B.4 — Crear spec retroactivo enterprise-org-management
9. B.5 — Actualizar CLAUDE.md con sección SDD
```

---

## Verificación

```bash
# Storybook local
cd apps/web && npm run storybook
# → Abrir http://localhost:6006
# → Verificar dark mode toggle (arriba derecha)
# → Verificar que todos los atoms renderizan sin errores Tailwind
# → Verificar que las clases de tokens (amber-400, etc.) aplican correctamente

# Build Storybook (igual que CI)
cd apps/web && npm run build-storybook
# → Sin errores de build

# TypeCheck
npm run typecheck
```

---

## Notas por Rol

**UX/UI Designer:**
- Storybook es el catálogo de componentes. Una vez que exista, cualquier nuevo componente
  DEBE tener story antes de considerar que está "done".
- El toggle dark/light en Storybook es crítico — EVA es dark-first pero debe funcionar en light.

**Software Architect:**
- SDD con specs/ es la fundación para escalar el equipo. Sin specs formales,
  el contexto vive en conversaciones y se pierde.
- La estructura SPEC + PLAN + TASKS permite que Claude Code implemente features completas
  con contexto suficiente.

**QA:**
- Las user stories en SPEC.md son la base para los E2E tests de Playwright.
  Cada "Story N" en el SPEC debe tener un test correspondiente.
- El CI job `storybook-build` detecta errores en componentes antes de merge.

**DevOps:**
- Storybook build artifact se guarda solo en caso de fallo (no en cada run exitoso).
- Si en el futuro se quiere deploy de Storybook, considerar Chromatic (~$149/mo plan básico)
  o Netlify deploy gratuito.

**Frontend Engineer:**
- Cuando crees un componente nuevo, crea su `.stories.tsx` en el mismo PR.
- Patrón de story: default export = Meta, named exports = Story variants.
- Stories deben cubrir: estado default, estado disabled, estado error, dark mode.
