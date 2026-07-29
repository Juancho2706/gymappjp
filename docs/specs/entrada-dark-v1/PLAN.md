---
status: draft
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# PLAN — Entrada dark v1

Arquitectura y fases de implementacion. Spec funcional en [`SPEC.md`](SPEC.md); valores visuales/motion normativos en [`DESIGN-SPEC.md`](DESIGN-SPEC.md); evidencia y root-causes en `docs/research/entrada-redesign/auditoria/a1-auditoria-entrada.md`.

## Arquitectura de componentes (nuevos y tocados)

```
app/_layout.tsx                      preventAutoHideAsync ya existe; hideAsync se muda al SplashGate
app/index.tsx                        REESCRITURA: gate + pantalla fusionada valor+selector
  ├─ components/entry/SplashGate.tsx        NUEVO: replica JS del splash + resolucion de sesion/branding
  ├─ components/entry/EntryBackground.tsx   NUEVO: textura sello (base + radiales + crosshatch + vineta)
  ├─ components/entry/LightLayer.tsx        NUEVO: capa de luz --heat/--lift parametrizada por acento
  ├─ components/entry/RoleCards.tsx         NUEVO: cards craft alumno/coach + morph de salida
  ├─ components/entry/ProductFragments.tsx  NUEVO: mini semana / anillo macros / grafica (svg estatico)
  └─ components/entry/EvaFigure.tsx         NUEVO: figura blanca (Image, asset eva-icon.png)
app/alumno/codigo.tsx                RESTYLE dark (frame 04)
app/(auth)/login.tsx                 SOLO variante role=coach dark (frame 05); alumno intacto
components/AmbientBrandGlow.tsx      FIX stopOpacity (Fase 0)
components/GlassCard.tsx             FIX stopOpacity (Fase 0)
components/Walkthrough.tsx           ELIMINAR (Fase 3)
lib/walkthrough.ts                   ELIMINAR (Fase 3)
context/ThemeContext.tsx             ForceLightTheme → ForceScheme(scheme) (Fase 1)
lib/theme.ts                         DARK_SCHEME_VARS espejo (Fase 1)
global.css / tailwind.config.js      tokens nuevos (surface-entry, veil, veil-2, glow) (Fase 1)
components/EvaLoader.tsx             deja de montarse en la entrada; unificar reduced-motion (Fase 2)
app.json                             splash image → figura blanca (BINARIO) (Fase 5)
```

Decisiones tecnicas clave (el detalle fino vive en DESIGN-SPEC):

- **Textura sello**: `EntryBackground` reusa las DOS tecnicas ya probadas del repo — svg `Pattern` (como el appgrid 40px de `AppBackground.tsx`, aca celda 3px) para el crosshatch, y svg `RadialGradient` CON `stopOpacity` para los lavados. Estatica: se monta una vez por encima del router de la familia y no anima en cold start (f1: peor ventana de jank).
- **Capa de luz**: `expo-linear-gradient` (ya instalada) parametrizada `{heat, lift, rgb}`; una sola instancia persistente; el retorno branded cruza el `rgb` de EVA→coach (fusion frame 06 de B).
- **Gate**: `SplashGate` absorbe la fase `checking` de `index.tsx` — replica del splash + `getSession()` + `loadStoredBranding()` en paralelo; sesion → crossfade branded → `router.replace(home)`; sin sesion → fade a pantalla fusionada. `hideAsync()` recien con la replica montada (bait-and-switch; Android no tiene fade nativo).
- **Morphs**: overlay clonado con Reanimated (medir card con `measure`, animar rect → full-screen 260ms `ease-out` mientras `router.push` monta debajo; reduce-motion/fallback = crossfade 160ms). Sin shared elements de terceros.
- **Fragmentos de producto**: svg estatico dedicado (~34 nodos total), datos congelados de ejemplo — NO se montan los componentes reales del home.
- **Backend**: cero cambios. Branding ya viaja por `/api/mobile/config` y se cachea en AsyncStorage (`lib/branding.ts`).

## Fases

### Fase 0 — Fixes de librerias (bugs de PROD, independientes del rediseño; commit propio)

1. `stopOpacity` explicito en TODO `<Stop>` de svg del repo mobile: `AmbientBrandGlow.tsx` (6 stops), `GlassCard.tsx` (cornerGlow) + barrido `grep -rn "stopColor" apps/mobile`. QA visual de las superficies afectadas: selector actual, `brand.tsx`, `ProgramLibraryHero`, `NutritionHeader`, consumidores de GlassCard.
2. Regla `className` + `style`-funcion: fix `Walkthrough.tsx:311` y `index.tsx:180` (interim, aunque Fase 3 los reescriba/elimine: este commit puede shippear solo) + barrido repo (`grep -rn "className.*style={({" apps/mobile` y variantes) + regla documentada en `apps/mobile/AGENTS.md`.
3. Colaterales de la auditoria: doble `AppBackground` en checking, `AppBackground.tsx:28` `mode`→`resolvedScheme`, `EvaLoader` a `useReducedMotion`.

**Gate**: tsc + export + QA visual before/after de las 5 superficies prod. Shippeable solo, ANTES del rediseño.

### Fase 1 — Infra de tema (OTA)

1. `ThemeContext.tsx`: `ForceLightTheme` → `ForceScheme({ scheme, branded })`; conservar export viejo como alias deprecado para no tocar los 4 call sites ajenos en el mismo commit.
2. `lib/theme.ts`: `DARK_SCHEME_VARS` espejo del bloque `.dark` (mismo contrato de mantenimiento comentado que `LIGHT_SCHEME_VARS`).
3. StatusBar por scheme; tokens nuevos de DESIGN-SPEC §5 en `global.css` + `tailwind.config.js` + `TOKENS.md` (con su drift `surface-inverse`/`text-muted` de a1 §3 resuelto o documentado).

**Gate**: tsc + export + smoke: forzar dark en una ruta de prueba y verificar vars.

### Fase 2 — SplashGate + retorno branded (OTA)

1. `EntryBackground` + `LightLayer` + `EvaFigure` + `SplashGate` segun DESIGN-SPEC §1-2.
2. `index.tsx`: fase checking reemplazada por SplashGate; `EvaLoaderScreen` fuera de la entrada; gates existentes intactos (sesion→home, branding cacheado→login alumno, `pick=1`).
3. Retorno branded: crossfade 220ms figura EVA → tile de marca del coach (logoUrlDark ?? logoUrl ?? iniciales, acento por canal de alpha) + LightLayer cruza el acento → `router.replace`.

**Gate**: tsc + export + emulador: cold start con y sin sesion, sin red (airplane), reduce-motion, cronometro <1s de splash JS con Metro cacheado.

### Fase 3 — Pantalla fusionada + morphs + destinos (OTA)

1. `app/index.tsx` fase selector → pantalla fusionada (frame 02): lockup, H1, `ProductFragments`, `RoleCards`.
2. Morph alumno → `codigo.tsx` restyled dark (frames 03-04); morph coach → login coach dark (frames 05) — `(auth)/login.tsx` gana variante visual `role=coach` scheme dark identidad EVA; el flujo/logica de auth NO cambia.
3. Retirar `Walkthrough.tsx` + `lib/walkthrough.ts` + assets `assets/onboarding/*.webp` (verificar con grep que `stickers/logro.webp` tenga otros usos antes de tocarlo; si es exclusivo del walkthrough, se queda — lo usan las celebraciones segun f6).
4. Compact/<667px y fontScale>1.15: colapso a 2 beneficios (DESIGN-SPEC §3).

**Gate**: tsc + export + QA emulador completo (7 pantallas, dark unico scheme de la familia, teclado fisico, back button Android) + Maestro flow opcional de la entrada.

### Fase 4 — QA integral + docs (OTA)

1. QA device del owner (Android fisico + iOS cuando haya binario): halation OLED de blooms/luz, morph en gama baja, fontScale, TalkBack/VoiceOver basico (labels ya especificados).
2. Actualizar `docs/status/MOBILE_PARITY.md` (la entrada RN diverge del web a proposito — documentar), `docs/status/CURRENT.md`, cerrar F10 de QA ronda 1.

### Fase 5 — Binario (cuando el owner lo pida)

1. `app.json`: splash `image` → asset figura blanca (`eva-icon.png` o derivado con padding correcto, `imageWidth` segun DESIGN-SPEC), `backgroundColor #07080C` ambos modos (ya esta).
2. Viaja con el proximo build EAS (junto al fix MOB-01 HealthKit pendiente del owner). NO gatillar build sin pedido explicito.

## Orden y entrega

- Fase 0 = commit independiente (fix de prod, cherry-pickeable a master segun politica de hotfixes del owner).
- Fases 1-3 = la ola de rediseño; commits por fase en `rnmobiledenuevo`, SIN push hasta pedido explicito (regla vigente).
- Implementacion con workers Opus guiados por DESIGN-SPEC (un worker por fase, jefe revisa diffs por wave); Fase 0 es mecanica → Sonnet con instrucciones exactas.
- Rollback: OTA revert (todo lo JS); el binario del splash es aditivo e inocuo.

## Riesgos tecnicos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Jank cold start por textura/luz | Capas estaticas montadas una vez; cero animacion de fondo en cold start; medir en release build |
| Morph janky en gama baja | Fallback crossfade 160ms; morph solo transform/opacity |
| Halation OLED | Validacion device; alphas de bloom con fallback .40 |
| Regresion por barrido className+style-funcion | Diff quirurgico por archivo, QA visual de cada superficie tocada |
| `DARK_SCHEME_VARS` drift futuro | Mismo comentario-contrato que LIGHT + item en TOKENS.md |
| OTA a binarios con splash negro viejo | Aceptado: hoy ya es invisible; mejora completa llega con Fase 5 |
