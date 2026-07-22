# Unidad B3 — Integración WEC + restos V2 (fix)

Rama `fix/executor-v3-qa1`. Sin commits. Informes base: `15-restos-ejecutor-viejo.md` (TODOS) + `09-estados-momentos.md` (BLOCKER wiring sustitución). tsc web y mobile LIMPIOS tras los cambios.

Regla de oro respetada: el motor de LogSetForm/KeypadProvider/draft/cola NO se tocó. Todo fue: props opcionales con default byte-idéntico a V2, ramas de render nuevas, o re-skin scoped al flag `[data-exec-v3]` / modo V3.

## Cambios por tarea

### 1 [BLOCKER] Modal Técnica → sheet oscura V3
- **Web (nuevo):** `v3/TechniqueSheetV3.tsx` — bottom-sheet dark (#1d1d26, handle, sin blur; reusa `.exec-v3-settings`/`.exec-v3-sheet-scrim`/`.exec-v3-handle`), media full-bleed en letterbox #050507, instrucciones con badge teñido de `--exec-brand`. Misma prioridad de media que el legacy (YouTube/gif/mp4/imagen).
- **Web wiring:** `WorkoutExecutionClient.tsx` — el Dialog claro legacy quedó gateado a `!execV3Active`; en V3 se monta `TechniqueSheetV3` (dentro del root `[data-exec-v3]`, sin portal).
- **RN:** `TechniqueSheet.tsx` — props aditivas `v3`/`accent`. En V3: Sheet `forceDark`, letterboxes → #050507 (`V3_LETTERBOX`), textos on-dark, badge numérico con `hexToRgba(accent,.15)`+accent, "Entendido" dark. V2 conserva su piel clara byte-idéntica. `ExecutorV3` pasa `v3 accent={exec.accent}`.

### 2 [BLOCKER] Modal "Nota del coach" → sheet oscura V3
- La nota migró en etapa 1 de `ExerciseStepV3` a **`v3/ExecMediaCard.tsx`** (compartido con superserie, solo-V3). Ahí reemplacé el `<Dialog bg-card>` por una sheet oscura framer-motion (`.exec-v3-settings` + `#1d1d26`, textos on-dark, botón dark). Sin portal ⇒ hereda `--exec-brand`.

### 3 [BLOCKER] Sustitución en V3
- **Web:** swap `SubstituteExerciseSheet` → `SubstituteSheetV3` en modo V3 (mismo contrato/handler `confirmSubstitution`, legacy conservado para V2). Disparador: agregué props `canSubstitute`/`onOpenSubstitute` a `ExerciseStepV3` (no las recibía) + un tool "Cambiar" (icono `Repeat`, discreto) en el pie `exec-v3-tools`, gateado a `canSubstitute` (`strength && doneCount===0`). WEC ya las cablea.
- **RN:** swap `SubstituteExerciseSheet` → `SubstituteSheetV3` en `ExecutorV3` pasando `exec` + `reducedMotion`. El trigger RN "Cambiar" ya existía.

### 4 [MAYOR] Toasts oscuros en V3
- **Web:** `WorkoutExecutionClient` marca `document.body[data-exec-v3-toast]` mientras V3 está montado (efecto con cleanup). `globals.css` (bloque nuevo, anclado tras el remap sport): `body[data-exec-v3-toast] [data-sonner-toast][data-styled='true']` fuerza superficie #1d1d26/borde #33333f/texto on-dark con `!important` (gana sobre los inline de richColors). Iconos conservan su hue. `sonner.tsx` intacto.
- **RN:** `Toast.tsx` — flag dark contado en el store (`subscribeDark`/`setDark`) + export `setToastDark`. `Toaster`/`ToastRow` pintan superficie oscura (#1d1d26) cuando está activo. `ExecutorV3` hace `setToastDark(true)` on-mount / `false` on-unmount.

### 5 [MAYOR] Keypad brand-aware
- **Web:** `NumericKeypadSheet.tsx` lee `--exec-brand` de `[data-exec-v3]` (patrón `DualWheelPicker`) y re-mapea la rampa sport INLINE en el panel raíz (`--sport-500/400/300`), así confirmar/tabs/RIR/step adoptan la marca. Se evitó poner `data-exec-v3` en el nodo porteado (arrastraría el `::before` de fondo). Fuera de V3 → sin nodo → azul Sport intacto.
- **RN:** `KeypadHost.tsx` — props `accent`/`accentText`; botones primarios (Siguiente/Listo/Omitir-save) usan la marca vía style cuando llegan (cae a `bg-sport-500`+blanco en V2). `ExecutorV3` los pasa desde `exec`.

### 6 [MAYOR] Barra "Finalizar" re-skin V3
- **Web:** barra `#1a1a22` + border-top 1.5px `#2f2f3a`; botón juicy-ghost (borde 2px #2f2f3a, superficie #1a1a22, texto on-dark) que se vuelve juicy de MARCA en `active:`. Gateado a `execV3Active`; V2 byte-idéntico.
- **RN:** `ExecutorV3` — barra con borderTop 1.5 `borderStrong` + bg `surface.surface`; botón ghost (borde 2px borderStrong) que pasa a `exec.accent` al presionar (Pressable `pressed`).

### 7 completionLabel (pendiente a4)
- WEC: `execV3CompletionLabel = program && plan.day_of_week ? \`Día N\` : null`, cableado a `SessionCompleteV3`. Sin programa/día → null ⇒ cae a `plan.title` (previo). Coincide con el mockup "¡Día 3 completo!".

### 8 MuscleMap leyenda "Fuerte/Medio/Leve"
- `MuscleMapSvg` (web + RN): prop aditiva `legendVariant?: 'ramp' | 'tiers'` (default `'ramp'` = V2 intacto). `'tiers'` = 3 niveles discretos Fuerte(100%)/Medio(52%)/Leve(26%) del mockup `.a2-legend`. `SessionCompleteV3` (web + RN) pasa `legendVariant="tiers"`. V2 (`WorkoutSummaryOverlay`) sin cambios.

### 9 Dialog "Descanso y alarma" (dead-code)
- **Dejado intacto** como indica el brief. Sigue siendo `bg-card`/`border-border` (claro) pero SOLO lo abre el botón Settings del header legacy, que está `hidden` en V3. No es un resto visible; limpiar al deprecar el legacy.

## Ya resuelto por Wave A (verificado, sin acción)
- Banner offline V3: WEC ya tiene la píldora calmada `#1b1b23`/`#2f2f3a` "Sin señal — guardando en tu teléfono" gateada a V3 (el ámbar queda para V2). RN `OfflineBanner variant="calm"`.

## Verificación
- `npx tsc --noEmit` web: LIMPIO. mobile: LIMPIO.
- Grep en árbol V3 web (`v3/`): cero `bg-card`/`bg-muted`/`bg-secondary`/`text-foreground`/`amber-500`/`border-border` opacos; los `bg-white/[0.06]` restantes son overlays translúcidos dark-correctos.
- RN: los `bg-white` de `TechniqueSheet` viven SOLO en la rama V2 (`!v3`).

## Archivos tocados
Web: `v3/TechniqueSheetV3.tsx` (nuevo), `v3/ExecMediaCard.tsx`, `v3/ExerciseStepV3.tsx`, `WorkoutExecutionClient.tsx`, `NumericKeypadSheet.tsx`, `MuscleMapSvg.tsx`, `v3/SessionCompleteV3.tsx`, `globals.css`.
RN: `TechniqueSheet.tsx`, `KeypadHost.tsx`, `Toast.tsx`, `MuscleMapSvg.tsx`, `v3/ExecutorV3.tsx`, `v3/SessionCompleteV3.tsx`.
