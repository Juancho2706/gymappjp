# Auditoría EVA — paridad RN mobile vs web/PWA (2026-06-02)

> Foco: **funcionalidad** (no estética). Comparación pantalla por pantalla. Estado: ✅ paridad · 🟡 parcial · 🔴 falta. Rutas web reales inventariadas de `apps/web/src/app/coach/**` y `apps/web/src/app/c/[coach_slug]/**`.

## COACH

| Web (ruta) | RN | Estado | Qué falta en RN |
|---|---|---|---|
| `dashboard` | `coach/(tabs)/home` | ✅ | KPIs, charts (con tooltip), feed, agenda, banners. OK. |
| `clients` (lista) | `coach/(tabs)/clientes` | ✅ | Lista, stats, filtros, swipe-dismiss alerts, crear. OK. |
| `clients/[clientId]` (detalle) | `coach/cliente/[clientId]` | 🟡 | Hecho: hero+stats, compliance rings, peso objetivo inline, tabs Resumen/Actividad/Progreso/Pagos, drill-down por fecha, panels programa+nutrición, check-ins (energía/notas/fotos/revisar), **gráfica de peso interactiva (nueva)**. **Falta:** export PDF (RN solo texto vía Share); gráficas de energía/medidas; quizá medidas corporales si la web las tiene. |
| `clients/[clientId]/progress-print` (PDF) | — | 🔴 | Export PDF del progreso. RN usa `Share.share()` texto. Requiere `expo-print`. |
| `clients/import` (CSV masivo) | — | 🔴 | Importar alumnos por CSV. Nicho; baja prioridad mobile. |
| `exercises` | `coach/(tabs)/ejercicios` | ✅ | Biblioteca + crear/editar. OK. |
| `foods` (gestión alimentos) | — | 🟡 | RN crea alimento inline en el nutrition-builder, pero NO hay pantalla de gestión/listado/editar/borrar foods del coach. |
| `meal-groups` (grupos de intercambio) | — | 🔴 | `food_swap_groups` — intercambios de alimentos. No existe en RN. |
| `recipes` + `recipes/[id]` | — | 🔴 | Recetas (Edamam). No existe en RN. |
| `nutrition-plans` (hub) | `coach/(tabs)/nutricion` | 🟡 | RN: por alumno (crear/editar/activar/eliminar/**copiar a otro alumno**). **Falta:** plantillas de nutrición reales (propagar a varios) + favoritos UI. |
| `nutrition-plans/[templateId]/edit`, `/new` | — | 🔴 | **Plantillas de nutrición** (tablas `nutrition_plan_templates`+`template_meals`+`saved_meals`+`template_meal_groups` + propagación). Pasada dedicada. |
| `nutrition-builder/[clientId]` | `coach/nutrition-builder` | ✅ | Plan por alumno con comidas/foods/macros. OK. |
| `workout-programs` (biblioteca) | `coach/(tabs)/builder` | ✅ | Hub plantillas/asignados, filtros, scroll arreglado. OK. |
| `workout-programs/builder`, `builder/[clientId]` | `coach/program-builder` | 🟡 | Crear/editar programa y **plantilla** (mode=template). **Falta:** sync de plantilla→alumnos con overrides (botón "Sync" es stub). |
| `templates` (workout templates) | dentro de builder | 🟡 | Listar/duplicar/asignar plantilla OK; falta editor template avanzado + sync. |
| `settings` (Mi Marca) | `coach/(tabs)/settings` | ✅ | Logo, color, loader (icon mode+estilo), welcome msg, welcome_modal (texto/video), compartir, brand score. **+ logo ahora en header y perfil.** Falta QR (lib). |
| `settings/preview` | — | 🟡 | RN tiene preview embebido en Mi Marca; no pantalla full-screen aparte. OK funcional. |
| `subscription` (+`/processing`) | `coach/(tabs)/subscription` | ✅ | Tier/uso/renovación + gestionar en web (MP no nativo). OK. |
| `support` | `coach/(tabs)/support` | ✅ | FAQ + contacto. OK. |
| `onboarding/complete` | — | 🔴 | Onboarding del coach (completar perfil tras registro). RN solo register básico. |
| `reactivate` | — | 🔴 | Reactivar suscripción vencida. Baja prioridad (link web). |

## ALUMNO

| Web (ruta) | RN | Estado | Qué falta en RN |
|---|---|---|---|
| `[slug]/login` | `(auth)/login?role=alumno` + `alumno/codigo` | ✅ | Login + entrada por código. Deep-link `/c/slug` ya rutea (nuevo). |
| `[slug]/dashboard` | `alumno/(tabs)/home` | ✅ | Saludo, semana, check-in banner, racha, widgets, welcome modal. OK. |
| `[slug]/workout/[planId]` | `alumno/workout/[planId]` | ✅ | Ejecución de rutina + logs. OK (verificar offline). |
| `[slug]/check-in` | `alumno/(tabs)/check-in` | ✅ | Peso/energía/fotos. OK. |
| `[slug]/nutrition` | `alumno/(tabs)/nutricion` | ✅ | Plan + log comidas. OK. |
| `[slug]/exercises` | `alumno/(tabs)/exercises` | ✅ | Biblioteca/aprender. OK. |
| `[slug]/workout-history` | `alumno/(tabs)/history` | ✅ | Historial. OK. |
| `[slug]/suspended` | `alumno/suspended` | ✅ | OK. |
| `[slug]/onboarding` (intake) | — | 🔴 | **Onboarding/intake del alumno** (datos iniciales, objetivos, medidas). No existe en RN. Importante para alumno nuevo. |
| `[slug]/change-password` | — | 🟡 | RN: link a web. No pantalla nativa de cambio de contraseña. |
| perfil alumno | `alumno/(tabs)/perfil` | 🟡 | RN tiene perfil básico. Verificar vs web (datos, objetivos, logout). |

## PRIORIZACIÓN sugerida (funcionalidad faltante)
1. 🔴 **Onboarding alumno (intake)** — alumno nuevo sin intake = experiencia rota. Alto valor.
2. 🔴 **Plantillas de nutrición + propagación** — feature coach grande (tablas template). Pasada dedicada + device.
3. 🟡 **Detalle alumno**: export PDF (`expo-print`) + más gráficas (energía/medidas).
4. 🟡 **Workout template sync** (overrides) — completar el botón "Sync".
5. 🟡 **Foods management** (listar/editar/borrar alimentos del coach) — pantalla dedicada.
6. 🔴 **Recipes / meal-groups** — features nutrición avanzada. Evaluar si van a mobile.
7. 🟡 **Change-password nativo** (alumno + coach) en vez de link web.
8. 🔴 **Onboarding coach** (`onboarding/complete`).

## Notas
- **Logo coach**: ya se muestra en header, perfil coach y Mi Marca (fix 2026-06-02). Si no aparece en device, verificar que `coaches.logo_url` del coach de prueba esté seteado y que la URL del bucket `logos` sea accesible (live).
- **Sin cambios de BD** en ningún ítem (tablas existen). Mutations bajo sesión coach (RLS).
- Validar cada pantalla nueva con `tsc` + `expo export android` + device.
