---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-08-28"
canonical: false
---

# PLAN — «+ Nueva» pregunta qué crear

1. **Mockup primero** (regla del owner 25-08): artifact «Incompleto y Nueva» con ANTES/DESPUÉS en
   claro y oscuro, tokens reales del DS. Aprobado el 28-08 («A ok, B ok»).
2. **RN** (`builder.tsx`): estado `newSheetOpen`, `Sheet` nativeModal con dos filas y «Cancelar»;
   elegir cierra y navega en el mismo tick (patrón del panel, `CoachDashboardSections.tsx:726`).
   `ejercicios.tsx`: `useEffect` gateado por `!loading` (la pantalla hace early-return del loader y
   `canCreate` sale del mismo fetch), consumo único por `useRef`, `present()` diferido con
   `requestAnimationFrame`, `router.setParams({ create: '' })`.
3. **Web** (`LibraryHeader.tsx`): `DropdownMenu` del DS para `sm+` (trigger pintado como
   `Button variant="sport"`, incluidas las reglas `dark:` del trigger) y `Sheet side="bottom"`
   para `<sm` (anatomía de `WorkoutDoneSheet`). `ExerciseCatalogClient.tsx`: `?create=1` →
   `setCreateName('')` + `router.replace` conservando `?q=`. Tokens `success` vía
   `bg-[var(--success-500)]/18` (la rampa success no está en `@theme` de la web).
4. **Gates proporcionales**: `tsc` mobile y web, vitest de los archivos tocados, `check:tokens`,
   `docs:check`. Lint web 0 errores (los 3 errores de `builder.tsx` bajo el config raíz son
   pre-existentes: `loadLibrary` antes de declarar y `themedIcon` en render; mobile no entra en
   `pnpm lint`).
5. **Salida**: push a `rnmobiledenuevo` + `master` → deploy web READY → OTA android + ios a
   runtime 1.1.2 desde `master` → QA device/navegador del owner.
