# Scan de paridad COACH — RN mobile vs Web (2026-06-22)

Workflow `coach-parity-scan` (31 agentes, 1 por pantalla coach, 3.45M tokens). Cada agente leyó la web a fondo (page + `_data`/`_actions`/`_components` + services) y el mobile (screen + libs), devolvió diff estructurado.

- **web** = fuente de verdad (`apps/web`, master)
- **mobile** = `feat/rn-parity-overnight` (worktree `D:/tmp/gymappjp-rn-overnight`, lo que se buildea en Actions)

> **Nota metodológica:** los agentes leyeron el checkout local `D:/Proyectos/Antigravity/gymappjp` que está en rama `hotfix/whitelabel-v2-update-grant` **sin el merge de PR #58**. Por eso marcaron 3 P0 "endpoint no existe". **Verificado contra `origin/master`: las 13 rutas `/api/mobile/*` existen y los paths del mobile calzan exacto → 0 P0 reales** (ver §0).

---

## 0. Reconciliación P0 (falsos positivos — VERIFICADO)

| Pantalla | P0 reportado | Estado real (origin/master + grep mobile) |
|---|---|---|
| Cardio perfil | `cardio/profile` 404 | ✅ existe; mobile llama `/api/mobile/cardio/profile` |
| Movement wizard | `movement/item`+`finalize` 404 | ✅ existen `item/finalize/assessment/draft`; mobile calza |
| Nutrición Pro intercambios | `exchanges/*` 404 | ✅ existen `set-mode/targets/meal-variant/variants`; mobile calza |

Las 3 features funcionan en prod. Su `parity_pct` real sube mucho (estaba castigado por el P0 inexistente): cardio-perfil ~90, movement-wizard ~85, nutri-exchanges ~88.

**No hay nada roto en runtime por endpoints.** Sí hay que verificar en DEVICE que no tiren 42501 (RLS/GRANT), que tsc/bundle no cubre.

---

## 1. Scorecard (parity_pct por pantalla, ajustado)

| Pantalla | % | Estado | Lo que falta (titular) |
|---|---|---|---|
| Recetas | 95 | 1:1 | paste-URL imagen (P3) |
| Dashboard | 93 | minor | welcome-modal trigger, confetti, deep-links reactivate |
| Bodycomp alumno | 93 | minor | sub-labels tabs, off-state gating |
| Nav / chrome | 90 | minor | **link Panel empresa (org admin)** |
| Clientes lista | 90 | minor | Días local vs pulse, copy empties |
| Cardio perfil | ~90 | minor | (P0 falso) date picker, copy |
| Detalle alumno | 88 | minor | **Zona C sin gating feature-pref**, panel progreso 7-pills |
| Cardio hub | 88 | minor | gating client-side, copy off-state "de pago" |
| Nutri templates | 88 | minor | **motor macros no compartido (drift)**, org_template prefill |
| Movement wizard | ~85 | minor | (P0 falso) team-pool consent |
| Builder fuerza | 85 | minor | **áreas→3 secciones fijas**, gating cardio, scope team |
| Movement reporte | 82 | minor | radar evolución, print/PDF |
| Nutri builder | 82 | minor | **PDF intercambios**, gating por pref, badges restricción |
| Grupos de comida | 82 | minor | **unit 'u' vs 'un' = corrupción cross-plataforma**, factor macro |
| Programas | 80 | minor | config asignación (días/inicio), scope workspace |
| Áreas | 80 | minor | scope team, gating canEdit, redirect org |
| Movement hub | 78 | minor | scope 3-vías, copy off-state |
| Mi Marca | 78 | minor | **white-label v2 avanzado AUSENTE (color2/fuente/dark/loader)** |
| Funciones | 78 | minor | scope team, redirect enterprise, kill-switch |
| Plantillas entreno | 78 | minor | = programas (mismo motor) |
| Importar alumnos | 72 | minor | **xlsx (CSV-only)**, template, sin auditoría |
| Ejercicios | 72 | minor | **exercise_type polimórfico**, recorte video, player in-app |
| Nutri board | 72 | minor | tabs foods/recetas no-inline, default tab, hints asignar |
| Módulos | 72 | minor | scope team, CTA contextual, kill-switch, telemetría |
| Foods | 55 | major | medida casera, orden, origen, categorías, scope org |
| Settings hub | 55 | major | **upsell free branding ausente**, variante team |
| Suscripción | 55 | major | catálogos informativos (tiers/add-ons/cupón) |
| Team | 55 | major | Brand Studio recortado, crear-coach (web-only legit) |
| Check-ins | 55 | n/a | tab mobile-only; falta "Marcar revisado" + navegar |
| Soporte | 15 | major | **form ticket vs mailto — 0 paridad** |

---

## 2. BUGS reales (no solo paridad — corregir primero)

1. **Grupos de comida — corrupción cross-plataforma de `unit`** (P1). Web persiste `unit='u'`, mobile persiste `'un'`; `normalizeGroup` coacciona `!='un'`→`'g'`. Un item creado en web (`u`) se lee como `g` en mobile (y viceversa). **Además** el factor de macros por unidad difiere: web usa `quantity` crudo (valores per-100g como per-unidad), mobile usa `(quantity*serving_size)/100` → **totales distintos**. Hay que unificar el valor de `unit` y la fórmula.
2. **Detalle alumno — Zona C sin gating de feature-prefs** (P1). Mobile renderiza toda la Zona C (hilo/micros/restricciones) sin `resolveFeaturePrefs` por-alumno → el coach ve/edita superficie que el alumno tiene apagada.
3. **Dashboard — fecha off-by-one** (P3). `formatDateES(new Date('YYYY-MM-DD'))` corre TZ → puede mostrar 1 día menos.
4. **client_intake upsert** coacciona `0/''` sobre NOT NULL → si el alumno no tenía fila, puede pisar datos reales no editados (device-risk).

---

## 3. Sistémicos (un patrón, muchas pantallas)

- **A. Scoping de workspace team-pool ausente.** Mobile resuelve standalone/org pero **no team** (`resolvePreferredWorkspace`). Afecta builder, programas, templates, áreas, funciones, módulos, cardio, movement, nutrición, foods, ejercicios, meal-groups. Un coach de pool ve/escribe con scope equivocado. *Relevancia: Movida cancelada → team es nicho; mayoría standalone. Real pero baja prioridad comercial.*
- **B. Kill-switch (`EVA_DISABLED_MODULES`) + resolución de feature-pref no aplicados client-side.** Mobile lee `enabled_modules` directo → muestra superficie Pro que la web oculta. Afecta funciones, módulos, nutri-builder, detalle alumno, bodycomp, cardio, movement. *Nota: las ESCRITURAS ya están gateadas server-side por #3 → no hay evasión de cobro real, solo UI muestra de más.*
- **C. Redirects enterprise/org_managed** ausentes en settings sub-pages → coach de org ve CRUD que RLS rechaza.
- **D. Copy off-state viola anti-hostigamiento.** Cardio/movement/bodycomp dicen "es un módulo de pago" + CTA "Ver en la web" (sale de la app). Web usa copy neutro + CTA in-app a `/coach/settings/modules`. **Quick fix transversal.**

---

## 4. Gaps P1 por pantalla (standalone-relevantes)

- **Mi Marca:** white-label v2 avanzado AUSENTE (color2/fuente/dark/loader-variant) + `updateCoachBrandSettings` no persiste esas cols. Recién shippeado en web; coach no lo puede tocar en mobile. *(GRANT UPDATE de las 7 cols ya existe del fix 2026-06-21.)*
- **Ejercicios:** `exercise_type` polimórfico (no se pueden crear cardio/movilidad/roller), recorte video (start/end), player YouTube in-app, sinónimos de búsqueda.
- **Builder:** áreas dinámicas reducidas a 3 secciones fijas (CAL/PRI/ENF); gating cardio no aplicado.
- **Importar:** xlsx/xls (hoy CSV-only) + template descargable.
- **Nutri board:** tabs Alimentos/Recetas no-inline (derivan a pantalla); default tab Alumnos; hints por-alumno en asignar; board 2-col + desasignar.
- **Nutri builder:** PDF intercambios branded; sidebar adherencia 30d; badges restricción en buscador.
- **Soporte:** portar el form de ticket (tipo/asunto/prioridad/adjunto/envío in-app) — hoy es solo mailto+FAQ.
- **Settings hub:** upsell free de branding (hero before/after + precio).
- **Check-ins:** "Marcar como revisado" + navegar a la ficha del alumno.
- **Nav:** link "Panel empresa" para coach org_admin.
- **Suscripción:** catálogos informativos (tiers disponibles, add-ons no contratados con precio, canje de cupón) — no exponen dinero, deberían existir.

---

## 5. Web-only legítimo (NO son gaps — derivar a web está OK)

Crear cuenta de coach nueva (service-role), checkout/cambiar tarjeta/cancelar (MP), borrar cuenta (service-role), upload con signed-URL+quota. Mobile corre user-scoped sin service-role; derivar con `Linking` es correcto. *Mejorable: deep-links específicos en vez de URL genérica.*

---

## 6. Riesgos de DEVICE a verificar (tsc/bundle no cubre)

- **42501/RLS en escrituras user-scoped:** meal-groups, foods, áreas, funciones, team brand, client_intake, nutrient_targets, food_preferences. Toda col nueva editable exige `GRANT UPDATE(col)` (mismo pecado white-label v2).
- **VirtualizedLists anidadas:** tabla clientes (FlashList en ScrollView), builder (NestableDraggable), nutri board. Riesgo scroll/gesto en Android con listas largas.
- **Catch-all enmascara errores:** muchos libs hacen `.catch(()=>[])` → fallo de RLS/red se ve como empty-state, no como error.
- **Fotos check-in bucket privado:** requieren signed URL; path crudo = viewer en blanco.
