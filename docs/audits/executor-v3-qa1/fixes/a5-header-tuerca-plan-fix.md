# QA1 · Unidad A5 — Header + tuerca + vista Plan · CIERRE DE FIXES

Informe origen: `docs/audits/executor-v3-qa1/11-header-tuerca-plan.md`
Rama: `fix/executor-v3-qa1` · worktree `executor-redesign`

## Deltas cerrados

### HEADER (`ExecHeaderV3` web + RN)
- **[MAYOR·web] Chips glassy → chip sólido del mockup.** Los 3 chips (salir/Ver-todo/tuerca) pasan de
  `bg-white/[0.06] border-white/10` a `bg-[#1a1a22] border-[1.5px] border-[#2f2f3a] text-[#b7b7c2]`,
  36px, radio 11. Igualados a RN (que ya era la referencia fiel).
- **[MAYOR·web] 2 filas → 1 fila estilo mockup.** Nueva composición única: `[salir] [dots flex]
  "Ejercicio N de M" [Ver todo icono] [tuerca]`. Se **eliminó la fila meta** (series/volumen/cronómetro);
  esa info vive en el peek de descanso y el resumen final. El chip "Ver todo" ahora es solo icono (`List`).
- **[MAYOR·web] Label contador.** Quitados `uppercase` y `font-mono`; ahora 12px sans `font-extrabold`
  (800), caja normal. "Ejercicio N" en tinta clara + "de M" muted (paridad con RN).
- **[MENOR·web] Gap dots 7px, iconos 19px** (`gap-[7px]`, `h-[19px] w-[19px]`).
- **[MENOR·web+RN] Divisor/relleno del header quitado** (decisión jefe 4). Web: fuera `border-bottom`,
  fondo semitransparente más tenue para el sticky. RN: `borderBottomWidth` a 0, padding a `pb-2.5`.
- **[RN] Header a 1 fila con paridad**: dots + contador + `List` + tuerca en una sola fila; quitado el
  cronómetro (`TYPE.mono`) de la fila meta.

### TUERCA (`ExecSettingsSheet` web + RN)
- **[MAYOR·web] Quitada la fila "Cronómetro automático"** (no está en mockup ni RN). "Sonido del
  cronómetro" pasa a ser `is-first`. Props `autoTimerEnabled/onToggleAutoTimer` quedan opcionales en la
  interfaz por compatibilidad con el call-site, sin renderizar.
- **[MAYOR·web] Volumen: knob juicy del mockup.** `<input type=range>` re-estilado (webkit/moz): track
  8px `#2a2a34`, relleno de marca hasta `--exec-vol` (fijado inline desde el valor) y perilla 22px blanca
  con aro 4px de marca + sombra. Sin dependencias nuevas.
- **[MENOR·RN] Slider de volumen full-width** (mockup `.a3b-setrow.slider`): fila en columna, "Volumen" +
  `%` (color marca) arriba, barra a lo ancho abajo.
- **[MENOR·RN] Toggle en reposo**: off bg `#2a2a34` (`s.border`) y knob `#c9c9d2` (antes `surfaceRaised`
  + `textMuted`, más apagado).

### VISTA PLAN (`ExecListMapV3` web + `ExerciseListV3` RN)
- **[MAYOR] Título unificado "Plan completo".** RN: "Todos los ejercicios" → "Plan completo". Web:
  `ExecListMapV3` **ya no imprime título propio** ("Ver todo") — lo aporta el encabezado del peek; esto
  elimina el doble título "Plan completo" + "Ver todo".
- **[MAYOR] Vocabulario de fila unificado al mockup** en ambas plataformas: **icono de estado** (hecho =
  marca + check con tinta `--exec-brand-ink`/`accentText`; ahora = aro de marca + punto; pendiente =
  cuadro gris hundido) + **nombre** (13/800) + **palabra de estado** ("✓ d/t" / "ahora" / "pendiente";
  parcial-no-actual muestra la fracción para no perder el progreso). Se retiran número/dots-por-serie/pill
  AHORA/flecha (web) y check-o-fracción/dots/chip-de-tipo/AHORA-pill/chevron (RN).
- **[MENOR] `is-now` sin borde extra** (web + RN): solo tiñe el fondo con la marca al 10%.

## Pendientes (NO cerrados)

- **[MAYOR·web] Tono "Del sistema" — DELTA IMPOSIBLE en web.** La PWA no tiene API para reproducir el
  tono de alarma del sistema operativo; en RN esa opción está limitada a Android **por la misma razón que
  excluye iOS** (iOS no expone el tono del SO). Añadirla al `<select>` web sería una opción muerta
  (etiqueta "Del sistema" que no cambia el comportamiento) → no se agrega. El selector web mantiene el
  catálogo real (Digital/Campana/Clásico/Boxeo). Requiere veredicto del jefe.
- **[MENOR·web] Tono sigue en `<select>` nativo** (no pill+caret custom): conforme a la decisión del
  jefe 2 ("select de tono agrega opción…"), se conserva el `<select>`; no se convirtió a pill custom.
  La flecha es la nativa del SO.

## Archivos tocados
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExecHeaderV3.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExecListMapV3.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExecSettingsSheet.tsx`
- `apps/web/src/app/globals.css` (header, filas del mapa, slider de volumen — ediciones quirúrgicas)
- `apps/mobile/components/alumno/workout/v3/ExecHeaderV3.tsx`
- `apps/mobile/components/alumno/workout/v3/ExecSettingsSheet.tsx`
- `apps/mobile/components/alumno/workout/v3/ExerciseListV3.tsx`

## Notas white-label / reglas de oro
- Tinta sobre marca: web usa `var(--exec-brand-ink)` (ya presente en `[data-exec-v3]`); RN usa
  `exec.accentText`. No se hardcodeó ningún verde `#072100`/derivado del mockup en código nuevo.
- No se tocó el motor de resiliencia (LogSetForm/SetRow/ExerciseStep/Superset/WorkoutExecutionClient).
- No se tocaron ítems marcados CUMPLE (p.ej. toggle web `#072100`, dots del header, encabezado del peek).
- `globals.css` editado solo con anclas únicas (header, `.exec-v3-map-*`, `.exec-v3-range`).
