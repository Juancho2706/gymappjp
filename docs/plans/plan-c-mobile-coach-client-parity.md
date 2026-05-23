# Plan C — Mobile Coach + Alumno: Paridad con Web Responsive
**Version:** 1.0 | **Date:** 2026-05-22 | **Priority:** P1 (antes de enterprise mobile)

---

## Context

La app mobile (`apps/mobile/`) usa **Expo SDK 53 + Expo Router v4 + custom ThemeContext**
(NO NativeWind — usa StyleSheet de React Native con tokens propios). El objetivo es que
la app mobile sea **visualmente y funcionalmente idéntica** a la versión web responsive
de EVA para coach y alumno.

El objetivo de "idéntico" significa:
- Mismo flujo de usuario (mismo order de pasos, misma info visible)
- Mismo vocabulario UX (botones con el mismo label, misma jerarquía)
- Mismos datos disponibles (no pantallas vacías donde la web tiene datos)
- Misma visual language (colores, cards, tipografía — mapeados desde los tokens)

**NO significa:** pixel-perfect CSS idéntico. React Native ≠ web. Los layouts se adaptan a
tabs/bottom nav vs sidebar/top nav.

---

## Gap Analysis Completo (Web vs Mobile)

### Coach — Feature Parity Table

| Feature | Web Route | Mobile | Status | Plan |
|---------|-----------|--------|--------|------|
| Dashboard KPI | /coach/dashboard | home tab | ✅ Existe | Auditar visualmente |
| Lista alumnos (ver) | /coach/clients | clientes tab | ✅ Existe | Auditar, agregar bulk actions |
| Crear/editar programa workout | /coach/builder/[clientId] | builder tab (solo lectura) | ❌ READ-ONLY | Construir builder mobile |
| Asignar programa a alumno | /coach/builder/... | N/A | ❌ MISSING | Pantalla de asignación |
| Crear plan nutricional | /coach/nutrition-builder/[clientId] | nutricion tab (solo lectura) | ❌ READ-ONLY | Construir nutrition builder |
| Templates nutrición | /coach/nutrition-plans | N/A | ❌ MISSING | Vista de templates |
| Base de alimentos/recetas | /coach/foods, /recipes | N/A | ❌ MISSING (complejo) | Low priority |
| Gestión ejercicios | /coach/exercises | N/A | ❌ MISSING (admin) | Low priority |
| Ver check-ins alumnos | No existe en web dedicado | check-ins tab | ✅ Mobile first | Mantener |
| Suscripción coach | /coach/subscription | perfil tab (solo estado) | ⚠️ PARCIAL | Pantalla detalle |
| Configuración cuenta | /coach/settings | perfil (básico) | ⚠️ PARCIAL | Expandir settings |
| Soporte/ayuda | /coach/support | N/A | ⚠️ LOW | Link externo |

### Alumno — Feature Parity Table

| Feature | Web Route | Mobile | Status | Plan |
|---------|-----------|--------|--------|------|
| Dashboard completo | /c/[slug]/dashboard | home tab | ✅ Existe | Auditar |
| Ejecutar workout | /c/[slug]/workout/[planId] | workout (hidden) | ⚠️ PARCIAL | Audit + fixes |
| Rest timer workout | /c/[slug]/workout/[planId] RestTimer | N/A | ❌ MISSING | Construir |
| Historial workouts | /c/[slug]/workout-history | history tab | ✅ Existe | Auditar |
| Resumen post-workout | /c/[slug]/workout WorkoutSummaryOverlay | N/A | ❌ MISSING | Construir |
| Logging nutrición | /c/[slug]/nutrition | nutricion tab | ✅ Existe | Auditar |
| Catálogo ejercicios | /c/[slug]/exercises | exercises tab | ✅ Existe | Auditar |
| Check-in semanal | /c/[slug]/check-in | check-in tab | ✅ Existe | Auditar |
| Cambiar contraseña | /c/[slug]/change-password | perfil (link) | ⚠️ PARCIAL | Verificar |
| Cuenta suspendida | /c/[slug]/suspended | N/A | ❌ MISSING | Pantalla simple |

---

## Prioridades de Implementación

### P0 — Bloquean la experiencia de workout (alumno más afectado)

**C.1 — Rest Timer en Mobile** ✅ DONE (sesión 2026-05-22)
**C.2 — WorkoutSummaryOverlay en Mobile** ✅ DONE (sesión 2026-05-22)

### P1 — Core coach features (diferencian de "solo visor" a "herramienta completa")

**C.3 — Coach: Workout Program Builder Mobile** ✅ DONE (sesión 2026-05-22)
**C.4 — Coach: Subscription Detail Screen** ✅ DONE — expandido en perfil.tsx (sesión 2026-05-22)
**C.5 — Coach: Settings Screen Expandido** ✅ DONE — notificaciones + cuenta en perfil.tsx (sesión 2026-05-22)

### P2 — Completeness (full parity)

**C.6 — Coach: Nutrition Builder Mobile (básico)** ❌ PENDIENTE
**C.7 — Alumno: Cuenta Suspendida Screen** ✅ DONE (sesión 2026-05-22)
**C.8 — Visual Audit Passes (todos los screens existentes)** ❌ PENDIENTE

---

## Archivos por Implementar

### C.1 — Rest Timer Mobile

**Contexto web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/RestTimer.tsx`
— Timer countdown con segundos configurables, vibración, skip button.

**Mobile:**
- Crear `apps/mobile/components/workout/RestTimer.tsx`
- Integrar en `apps/mobile/app/alumno/workout.tsx` (o donde se ejecute el workout)
- Usar `expo-haptics` para vibración (ya disponible en el proyecto)
- Usar `react-native-countdown-circle-timer` o implementación nativa con `setInterval`
- API: props `{ duration: number; onComplete: () => void; onSkip: () => void }`

**Estado en el workout:**
```
[Ejercicio completado] → [Rest Timer overlay] → [Siguiente ejercicio]
```

### C.2 — WorkoutSummaryOverlay Mobile

**Contexto web:** `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx`
— Al terminar el workout: muestra duración, ejercicios completados, sets, mensaje de motivación.

**Mobile:**
- Crear `apps/mobile/components/workout/WorkoutSummaryModal.tsx`
- Usar `Modal` de React Native o BottomSheet existente
- Datos a mostrar: tiempo total, ejercicios completados, sets completados
- CTA: "Volver al inicio"

### C.3 — Coach: Workout Program Builder Mobile

**Es la feature más compleja del plan.** El web builder usa DnD (drag-and-drop) con `@dnd-kit`.
En mobile, el equivalente es SwipeableRow o long-press para reordenar.

**Alcance para paridad:**
- **Ver** programas de un alumno (ya existe — read-only)
- **Crear** programa nuevo para un alumno
- **Agregar ejercicios** (búsqueda + selector)
- **Editar** sets/reps/descanso por ejercicio
- **Reordenar** ejercicios (drag or long-press)
- **Guardar** programa

**NO incluir en esta fase:**
- Clonar entre alumnos
- Templates avanzados
- Bloques/semanas múltiples (si no está en web mobile tampoco)

**Archivos a crear:**
```
apps/mobile/app/coach/(tabs)/builder.tsx          (actualizar — agregar modo edición)
apps/mobile/app/coach/program-builder.tsx         (nueva pantalla modal/stack)
apps/mobile/components/coach/ProgramBuilderForm.tsx
apps/mobile/components/coach/ExerciseSearchSheet.tsx
apps/mobile/components/coach/ExerciseSetRow.tsx
```

**API:** Reutilizar los mismos endpoints/server actions que usa la web.
El mobile ya tiene Supabase configurado — usar el cliente existente.

**UX Pattern:**
```
clientes tab → tap alumno → "Ver programas" → [lista programas] → "+" nuevo → builder form
```

### C.4 — Coach: Subscription Detail Screen

**Contexto web:** `/coach/subscription` — muestra plan actual, límites, CTA upgrade, fechas.

**Mobile actual:** `perfil tab` muestra solo el estado del tier.

**Agregar en perfil tab o pantalla nueva:**
- Plan actual y límite de alumnos
- Alumnos activos vs límite
- Fecha próximo ciclo de cobro
- Botón "Gestionar suscripción" → abrir webview o URL externa

**Archivos:**
```
apps/mobile/app/coach/(tabs)/perfil.tsx   (expandir sección de suscripción)
apps/mobile/components/coach/SubscriptionCard.tsx (nuevo)
```

### C.5 — Coach: Settings Screen Expandido

**Contexto web:** `/coach/settings` — nombre, foto, slug, branding (color, logo), notificaciones.

**Mobile actual:** `perfil tab` solo tiene nombre/email/foto básico + logout.

**Agregar:**
- Cambio de nombre y slug (si está disponible en web)
- Cambio de foto de perfil (ya existe `expo-image-picker`)
- Notificaciones push (toggle — ya existe lógica de push)
- Link a cambio de contraseña

**Archivos:**
```
apps/mobile/app/coach/(tabs)/perfil.tsx   (expandir)
apps/mobile/components/coach/ProfileSettingsForm.tsx (nuevo)
```

### C.6 — Coach: Nutrition Builder Basic

**Contexto web:** `/coach/nutrition-builder/[clientId]` — crear plan nutricional con macros
por meal, buscar alimentos, asignar días.

**Alcance mobile (básico):**
- Ver plan nutricional asignado a un alumno (con detalle de meals y macros)
- Asignar template de nutrición existente a un alumno
- **NO incluir:** crear plan desde cero con búsqueda de alimentos

**Archivos:**
```
apps/mobile/app/coach/nutrition-assignment.tsx (nuevo)
apps/mobile/components/coach/NutritionTemplateSelector.tsx (nuevo)
```

### C.7 — Alumno: Cuenta Suspendida Screen

**Simple:** Pantalla que aparece cuando el plan del coach está suspendido.

```
apps/mobile/app/alumno/suspended.tsx (nueva — matching web /c/[slug]/suspended)
```

Mensaje: "Tu coach ha pausado temporalmente el acceso. Contacta a tu coach para más info."

### C.8 — Visual Audit Pass

Para cada pantalla existente, verificar contra la web:
- ¿Muestra la misma información?
- ¿Los estados de carga son correctos?
- ¿Los estados vacíos tienen su EmptyState?
- ¿Los colores están mapeados correctamente desde los tokens?

**Checklist de screens a auditar:**
```
[ ] alumno/home — dashboard completo
[ ] alumno/workout — ejecución step-by-step
[ ] alumno/history — historial workouts
[ ] alumno/nutricion — logging comidas
[ ] alumno/check-in — wizard 3 pasos
[ ] coach/home — KPIs y dashboard
[ ] coach/clientes — lista con filtros
[ ] coach/builder — programas (después de C.3)
[ ] coach/check-ins — feed check-ins
```

---

## Consideraciones de Arquitectura Mobile

### ThemeContext y Design Tokens

El mobile usa `apps/mobile/context/ThemeContext.tsx` con colores hardcodeados.
Los tokens del paquete `packages/tokens/` exportan los mismos valores.

**Acción:** Verificar que los colores en `ThemeContext` coincidan con `packages/tokens/index.ts`.
Si divergen, actualizar ThemeContext para importar desde tokens:

```typescript
import { tokens } from '@eva/tokens'
// usar tokens.colors.brandPrimary, etc.
```

Esto asegura consistency entre web y mobile.

### Navigation Pattern

Mobile usa bottom tab navigator (6 tabs coach, 6 tabs alumno + hidden).
Web usa sidebar (coach) y top nav (alumno).

El mapping es:
- Web sidebar links ↔ Mobile bottom tabs (mismos destinos, diferente chrome)
- Web modal/drawer ↔ Mobile bottom sheet o stack screen

### API Calls

Mobile usa Supabase JS client directamente (no server actions de Next.js).
Los mismos RPC functions y tablas son accesibles.
Reutilizar las queries de `apps/web/src/infrastructure/db/*.repository.ts` como referencia
para las queries mobile en `apps/mobile/lib/`.

---

## Orden de Ejecución

```
Fase 1 — Alumno workout completion:
  1. C.1 — Rest Timer component
  2. C.2 — WorkoutSummaryModal
  3. C.7 — Suspended screen (simple)
  4. C.8 — Visual audit alumno screens

Fase 2 — Coach productive features:
  5. C.3 — Program Builder (mayor complejidad)
  6. C.4 — Subscription card en perfil
  7. C.5 — Settings expandido
  8. C.8 — Visual audit coach screens

Fase 3 — Completeness:
  9. C.6 — Nutrition assignment (básico)
  10. Final smoke test en Expo Go (iOS + Android simulator)
```

---

## Verificación

```bash
# Run mobile dev
cd apps/mobile && npx expo start

# iOS simulator
npx expo run:ios

# Android emulator
npx expo run:android

# Por cada pantalla nueva:
# 1. Comparar visualmente con la versión web en responsive mode (375px width)
# 2. Verificar que los datos se cargan correctamente
# 3. Verificar estados de carga y error
# 4. Verificar que la navegación entre pantallas es correcta

# TypeCheck mobile
cd apps/mobile && npx tsc --noEmit
```

---

## Notas por Rol

**Mobile Engineer:**
- NO cambiar a NativeWind — el ThemeContext funciona y cambiar sería un refactor masivo
  sin beneficio claro (NativeWind v4 aún tiene rough edges en Expo SDK 53)
- Rest Timer: usar `useRef` + `setInterval` para precisión. Cancelar en cleanup.
- Program Builder: usar `FlatList` con `drag-to-reorder` via `react-native-draggable-flatlist`
  (ya probado con Expo) o implementar long-press + swap.

**UX/UI Designer:**
- Los builders (C.3, C.6) son flows complejos — definir UX antes de codear.
  ¿Modal fullscreen? ¿Stack screen? ¿Bottom sheet por paso?
- Recomendación: Stack screen con header "Cancelar / Guardar" — consistent con iOS/Android patterns.

**QA:**
- Para cada feature nueva: crear test en Expo con Maestro o manual testing en physical device.
- Rest timer: verificar que la vibración funciona en device real (no simulator).
- Program builder: verificar que el drag-to-reorder funciona con gestos nativos.

**Product Manager:**
- La priorización P0 → P1 → P2 sigue el impacto en el usuario final.
- El rest timer y summary overlay son los gaps más notorios en el flujo de workout.
- El program builder mobile habilita a coaches que solo usan móvil.

**Backend Engineer:**
- Mobile usa Supabase client JS — mismas RLS policies aplican.
- No se requieren nuevas API routes o RPC functions para estas features.
- Verificar que las queries de `workout_logs` para resumen post-workout retornan
  los datos correctos (duration, completed sets, etc.)
