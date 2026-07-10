# E8 — Cierre de paridad RN 1:1 (consolidado del barrido)

Fecha: 2026-07-09 · Rama `rnmobiledenuevo` · Consolida los 6 barridos `e8-barrido-*.md`.
Referencia: árbol mobile web (`md<760`) + inventario `research/03-05`.
Veredicto por pantalla: **OK** / **GAP-menor** (cosmético) / **GAP-mayor** (estructura o funcionalidad ausente).

## Veredicto global

**Paridad ALTA, cierre APROBADO con salvedades.** Los dominios centrales (auth, dashboard alumno y coach, ejecutor de entrenamiento, builder de programas, builder de nutrición con intercambios/swaps/restricciones, ficha del cliente, settings, módulos de pago, cardio/movement/bodycomp) están transcritos 1:1 con la rama móvil web. El motor puro compartido (`@eva/workout-engine`, `@eva/nutrition-engine`, `@eva/cardio`, `@eva/bodycomp`, `@eva/plan-builder`) elimina el drift en cálculos. Sin tokens legacy pre-DS. Gating de dinero (`hasModule`, `canUseNutrition`, `ModuleOffNotice`) consistente y fail-closed. Los 4 GAP-mayor son acotados y todos ya diagnosticados; ninguno bloquea el cierre estructural. Van a la ronda final de QA del CEO.

## Conteo por dominio

| Dominio | Barrido | OK | GAP-menor | GAP-mayor |
|---|---|---:|---:|---:|
| Alumno — core (splash/auth/home/perfil) | `alumno-core` | 11 | 1 | 1 |
| Alumno — nutrición/checkin/aprender/movement/bodycomp | `alumno-nutricion` | 14 | 3 | 2 |
| Alumno — workout/ejecutor | `alumno-workout` | 6 | 3 | 0 |
| Coach — dashboard/directorio/ficha | `coach-core` | 12 | 3 | 1 |
| Coach — builder/nutrición/check-ins | `coach-builder-nutricion` | 9 | 2 | 0 |
| Coach — settings/módulos/auth | `coach-settings-modulos` | 13 | 5 | 0 |
| **Total** | | **65** | **17** | **4** |

## GAP-mayor — lista para QA final del CEO (4)

1. **Alumno · home — falta `OrgAnnouncementBanner` (§1 web).** El home no consulta anuncios activos de la organización (`getActiveOrgAnnouncements`); alumno enterprise/team no ve avisos de su org. `app/alumno/(tabs)/home.tsx`.
2. **Alumno · nutrición — falta 3er estado "dominio OFF" (master switch).** Web tiene `NutritionDomainOff` cuando el coach apaga el dominio sin borrar data; RN solo maneja loading + sin-plan → un deep-link/estado stale muestra el plan completo. `app/alumno/(tabs)/nutricion.tsx:483-494`.
3. **Alumno · nutrición — gating por sección (`sectionFlags`) solo aplica a micros.** Notas/Compras/Plato/Off-plan/Recetas se renderizan incondicionalmente (solo ocultan por data vacía); una sección desactivada por el coach igual aparece. Web las gatea vía `resolveFeaturePrefs`. `NotesThread`, `ShoppingList`, `PlatePanel`, `OffPlanLogger`, `RecipeIdeasSection`.
4. **Coach · ficha → tab Nutrición — falta Zona C (coach).** Ausente: nota privada del coach, hilo bidireccional de comentarios del día, editor de umbrales de micros (`nutritionProEnabled`) y panel override "Funciones para este alumno" (tri-state por sección). Solo hay alertas read-only. `NutricionTab.tsx`, `coach-client-detail.ts`.

## GAP-menor — higiene (17, no bloquean)

**Alumno:** perfil "Ayuda" usa `contacto@eva-app.cl` vs web `SALES_EMAIL`; export del día en sheet vs 3 botones inline; energía check-in selector segmentado vs slider 1-10; éxito check-in sin `SuccessWaveOverlay` brandeado; tab workout sin ring de progreso/completado ni estado de error; `SessionHeader` sin tuerca de ajustes de timer (auto-timer + sonido, WAVE-B-SEAM); history sin estado de error.

**Coach:** builder sin link a Áreas ni orden Recientes/Nombre; meal-groups chips muestran 4 alimentos vs 3; TeamsBridge umbral muerto 48 vs 80 (comportamiento final correcto); import sin wizard de mapeo/preview (paste CSV un paso); `NutricionTab` charts con hex/fonts hardcodeados vs tokens `theme.*`/`FONT`; settings footer "Ejercicio Virtual Avanzado · v2.4" vs web "EVA · v2.4"; Apariencia/DangerZone/SignOut movidos a perfil (decisión IA móvil); Mi Marca avanzado sin `splash`; módulos CTA no context-aware (siempre "Agregar"→ADDONS_URL) y sin aviso `killedByOperator`.

## Decisiones deliberadas (NO son gaps)

- Selector de rol / walkthrough / código de coach = RN-nativos (la web es coach-slug-scoped, PWA sin selector) — paridad conceptual.
- Check-ins coach = **tab agregado additivo** RN (no existe en web); mejora, no gap.
- Money-safety by design: todo cobro/cambio de plan/tarjeta/add-on/cupón es link-out al navegador (subscription/módulos/reactivate).
- Fotos check-in suben directo a bucket Supabase (sin WAF Cloudflare de por medio → el patrón signed-URL web no aplica).
- Apariencia/DangerZone/SignOut en perfil en vez del hub Opciones (arquitectura de navegación móvil).
- Export PDF via share nativo en vez de descarga navegador.

## Desviaciones RN aceptadas

Tres puntos donde la RN diverge del layout literal web de forma **intencional** (equivalencia funcional, no gap). Se dejan como están:

1. **Export del día (nutrición) — sheet en vez de 3 botones inline.** Web muestra Copiar detalle / Resumen WhatsApp / Descargar PDF siempre visibles en la columna; RN los agrupa tras el ícono share del header → `ExportDayActions`. Mismas 3 acciones, patrón móvil (no saturar el scroll del plan). `nutricion.tsx`.
2. **Nivel de energía (check-in) — selector segmentado 1-10 en vez de slider.** RN no tiene primitiva Slider nativa liviana; el segmentado entrega los mismos 10 valores con mejor tap-target táctil. `check-in.tsx`.
3. **Éxito de check-in — círculo check + Confetti en vez de `SuccessWaveOverlay` brandeado.** La ola SVG animada es web-específica; el confetti + check (reduce-motion-aware) cubre el refuerzo positivo equivalente. `check-in.tsx`.

## Cierre del lote de gap-menores (E8)

Resueltos en esta wave (paridad exacta con la web md, tokens DS, sin duplicar lógica web):
perfil `Ayuda` → constante `SALES_EMAIL`; umbral TeamsBridge unificado en 80 (`home.tsx` coach); estado de error + reintento en `history.tsx` y en el tab `workout.tsx`; hero de HOY con `ProgressRing` (series/objetivo) + CTA Empezar/Continuar/Ver registro en `workout.tsx` (espejo §4.5); `builder.tsx` con acceso a Áreas (`/coach/settings/areas`) y orden Recientes/Nombre; `meal-groups.tsx` chips a 3 alimentos + confirmación con `Dialog` DS; tuerca de Ajustes en `SessionHeader` (sheet con auto-timer + alarma, reutilizando `rest-timer-preferences`/`RestAlarmPreference`, seam WAVE-B cerrado); import wizard 4 pasos ya cableado (`ImportClientsForm`, comentario corregido en `clientes.tsx`).
