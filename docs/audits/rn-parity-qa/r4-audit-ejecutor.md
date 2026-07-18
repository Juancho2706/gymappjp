# R4 · Auditoría pixel del EJECUTOR alumno (RN vs PWA md)

Fuente de verdad: `apps/web/src/app/c/[coach_slug]/workout/[planId]/**` (árbol md, `md:` = tablet, pero el layout base < 760 es el mobile). RN auditado: `apps/mobile/components/alumno/workout/**` con flag `executorV2: true` (LegacyExecutor NO se renderiza).

## Mapeo de fuentes (para entender los DIFF)
Las familias SÍ coinciden por rol: web `font-mono`=RN `mono*`=**JetBrains Mono**; web `font-display`=RN `display*`=**Archivo**; web body (`--font-ui`)=RN `sans*`=**Hanken Grotesk**. El problema del CEO ("mono donde web usa sans") NO es que falten fuentes, sino **dónde se aplica mono**: RN mete frases/palabras en `TYPE.mono` (JetBrains) que en web van en Hanken (ver SetRow §4).

## Regla de copy
El copy WEB es la fuente de verdad; copiar VERBATIM. ⚠️ Tensión viva: la web tiene voseo ("Tocá","descansá") y el RN hoy está mezclado (voseo "Tocá para registrar" + acentos comidos "Ultima vez","Ver tecnica","maquina"). El doc ronda-4 dice neutralizar mobile a latino neutro. **Decisión pendiente del CEO** — este informe reporta el valor web verbatim en la columna "web"; el fixer debe (a) igualar web verbatim O (b) neutralizar consistentemente, pero NUNCA dejar la mezcla actual (acentos comidos = bug seguro en ambos criterios).

---

## 1. `SessionHeader.tsx` — header sticky
Web ref: `WorkoutExecutionClient.tsx` L1791-1895.

| Elemento | Web (valor exacto) | RN (actual) | DIFF |
|---|---|---|---|
| Ícono back | `ArrowLeft` (lucide) en botón `h-10 w-10 rounded-control bg-white/[0.08]` | `ChevronLeft` | Ícono distinto → usar **ArrowLeft** |
| Alineación título | Bloque central `text-center flex-1` (título CENTRADO) | Bloque `flex-1` izquierda (título IZQUIERDA) | Web centra; RN alinea a la izquierda |
| Título | `font-display text-lg` (Archivo 700, 18px) `font-bold` | `font-display-bold text-[18px]` (Archivo **800**) | Peso 700 vs 800 (usar `font-display` regular-bold) |
| Variante semana | **Badge pill** al lado del título: `text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/20 text-on-dark-muted` con texto `Semana {A/B}` | Eyebrow de texto ARRIBA del título (`Semana {A}`), sin borde/pill | Web = pill bordeado junto al título; RN = eyebrow plano arriba |
| Eyebrow superior | (no existe en web) | RN muestra `Entrenamiento` como eyebrow cuando no hay variante | **Sobra**: web no tiene eyebrow superior. Eliminar `Entrenamiento` |
| Sublínea programa | Debajo del título: `text-[10px] font-bold uppercase tracking-widest text-on-dark-muted` = `{fase · }Programa semanal` / `Día X de Y` | `subline` con `TYPE.eyebrow` (12px, tracking 0.12em) | Web 10px `tracking-widest`; RN 12px eyebrow → igualar a 10px |
| Toggle Lista/Pasos | Segmentado CON texto+ícono: `Lista`(List) `Pasos`(**GalleryHorizontal**), botones `h-9`, activo `bg-[var(--sport-500)] text-white`, contenedor `bg-white/[0.06] p-0.5` | Ícono-only `h-8 w-8` (List / **Rows3**), sin labels | **CEO aprobó el toggle chico** — mantener icon-only, PERO ícono de "Pasos" debe ser `GalleryHorizontal`, no `Rows3` |
| Tuerca ajustes | `Settings` `h-10 w-10 bg-white/[0.08]` | igual (`Settings size 18`) | OK |
| Barra progreso | `h-1.5 rounded-full bg-white/10`, fill `bg-[var(--sport-500)]` animada | `ProgressBar h=6 color #2680FF track w/10` | OK |
| Línea stats | `font-mono text-[11px] tabular-nums`: izq `**Ejercicio {n}** de {N}`; der `{done}/{req} series · {vol} · {mm:ss} · **{pct}%**`(pct `text-sport-400`) | Igual (TYPE.mono 11px) + añade `(máx)` al elapsed si capped | OK; el ` (máx)` es extra RN (aceptable, web no capa visible) |

---

## 2. `SingleExerciseCard.tsx` — card de ejercicio suelto
Web ref: `SingleExerciseCard.tsx` (web).

| Elemento | Web (valor exacto) | RN (actual) | DIFF |
|---|---|---|---|
| Fila silenciosa (tipo·músculo) | `text-[11px] font-bold`: **TypeGlyph** (ícono color del tipo) + **label del tipo** coloreado (ej. "Fuerza") + `·` + `muscle_group` (`font-semibold text-on-dark-muted`, **mixed-case 11px**, no uppercase). Si superset: `{SS-N} · {músculo}` | Solo `muscle_group` en `TYPE.eyebrow` (Hanken bold **UPPERCASE 12px** tracking 0.12em). Sin glyph, sin label de tipo, sin SS-N | Falta: glyph de tipo + label de tipo coloreado. RN pone el músculo en MAYÚSCULAS espaciadas; web es "Pecho" 11px mixed-case |
| Botón Detalles | `Info` + `Detalles` + `ChevronDown`, `text-[11px] font-semibold text-on-dark-muted` | igual (TYPE.caption 11px) | OK |
| Botón Cambiar | `ArrowRightLeft` + `Cambiar` `text-[11px] font-semibold` | igual | OK |
| Botón Técnica | `Play`(fill) + `Técnica` en pill `bg-white/[0.06] px-2.5 text-[11px] font-bold text-on-dark` | `Play`+`Tecnica` (sin acento) | Copy: web `Técnica` (con tilde) |
| Nombre ejercicio | `font-display text-[22px] font-black leading-[1.1] tracking-[-0.02em]` (Archivo **900**) | `font-display-black text-[22px] leading-[24px]` (Archivo 900), sin tracking | Falta `tracking-[-0.02em]` (≈ letterSpacing -0.44); lh 1.1 vs 24px≈1.09 OK |
| Dots progreso | `h-1.5 w-1.5` sport-400/white15 + `font-mono text-[11px] {done}/{sets}` | igual | OK |
| Línea prescripción | `font-mono text-[13px] font-semibold`: `{sets} × {reps}` · `{kg} kg` · `desc {rest}` · `tempo {t}` · `RIR {r}` (separador `·` con `text-on-dark-muted/40`) | igual (TYPE.mono 13px `font-mono-bold`) | Peso: web `font-semibold`, RN `font-mono-bold` (700). Sep RN es "· " inline vs `<Sep/>` muted. Menor |
| Chip sobrecarga | `TrendingUp` + label en pill `border-sport-500/30 bg-sport-500/[0.10] text-[11px] font-bold text-sport-300` | igual | OK (copy: "Mantén" web / "Manten" RN — ver §copy) |
| "Última vez" | `History` + `Última vez:` `font-semibold` + `{kg}kg × {reps}` `font-mono font-bold` + `Supera tu marca` + `= usar` | `Ultima vez:` (SIN tilde) + resto igual | Copy: web `Última vez:` con tilde |
| Cue técnica | `line-clamp-1 text-[12px] text-on-dark-muted` | `TYPE.caption 12px numberOfLines 1` | OK |
| **Captura serie activa** | Web renderiza INLINE en la card: inputs `Kg`×`Reps` (`h-14 text-2xl font-mono`, placeholder `-`) + `Esfuerzo · RPE`/`Reps en reserva · RIR` con **ScaleDots (10 dots)** + botón `✓ Listo` + `Agregar nota` — TODO visible en la card | RN muestra `SetRow` compacto "Tocá para registrar" que abre keypad sheet; inputs/dots/nota NO están en la card | **Divergencia estructural grande**: web deja inputs+dots visibles en la card; RN los esconde tras el keypad. (Nota: web-mobile TAMBIÉN abre keypad, pero conserva los inputs inline.) Evaluar con CEO si la card debe mostrar inputs inline |

---

## 3. `SupersetGroupCard.tsx` — superserie
Web ref: `SupersetGroupCard` en `WorkoutExecutionClient.tsx` L632-910.

| Elemento | Web (valor exacto) | RN (actual) | DIFF |
|---|---|---|---|
| Header "Superserie" | `font-display text-sm font-bold` (Archivo 700) + `{n} ejercicios · {maxSets} ronda(s)` `text-[11px] font-semibold` | `font-display-bold text-sm` (Archivo 800) + contador igual | Peso 700 vs 800 |
| Botón "Cómo hacerla" | Existe: `Cómo hacerla` + ChevronDown, expande párrafo guía | **NO existe** en RN | Falta el toggle "Cómo hacerla" + su párrafo |
| Línea de rondas | `text-[12px] leading-snug`: `Rondas: **{A1}** → **{B1}** sin descanso, descansa al cerrar la ronda.` (labels A1/B1 en `font-bold text-on-dark`, dinámicos) | `Completa una serie de cada ejercicio y repite. Descansa al cerrar la ronda.` | **Copy distinto**: usar VERBATIM `Rondas: A1 → B1 sin descanso, descansa al cerrar la ronda.` con A1/B1 en negrita |
| Ejecución por rondas | Web intercala: divisor `Ronda {n}` (`text-[10px] font-bold uppercase tracking-widest` con líneas), filas `A1/B1` (`font-black tabular-nums text-sport-300`) + cue `Sigue`, en orden A1→B1→A2→B2 | RN lista cada miembro con TODAS sus series seguidas (NO intercala por rondas) | **Estructura distinta** (RN lo marca como seam Wave B). Falta: divisores "Ronda N", etiquetas A1/B1, cue "Sigue" |
| Letra miembro | Círculo `h-6 w-6 bg-sport-500/15 text-[12px] font-black text-sport-300` | igual (`font-display-black text-[12px]`) | OK |
| Nombre miembro | `font-display text-[17px] font-black leading-[1.15] tracking-[-0.02em]` (Archivo 900, 17px) | `font-display-bold text-[16px] leading-[19px]` (Archivo 800, 16px) | Tamaño 17 vs 16 + peso 900 vs 800 |
| Chip músculo miembro | Pill `bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-bold` con **TypeGlyph** + `muscle_group` | (no se renderiza chip de músculo del miembro) | Falta el chip músculo con glyph |
| "Ver técnica" miembro | `Info` + `Ver técnica` `text-[11px] font-semibold` | `Info`+`Ver tecnica` (sin acento) | Copy: `Ver técnica` con tilde |
| Prescripción miembro | **Pills** rounded-full `bg-white/[0.06] px-2 py-0.5 font-mono font-semibold`: `{sets} × {reps}`, `{kg}kg`, `Descanso {rest}` | Texto plano mono "· " separado: `{sets} × {reps} · {kg}kg · {overload}` — SIN pills, SIN "Descanso {rest}" | Web = pills; RN = texto. Falta pill `Descanso {rest}` |
| Historial miembro | `Sesión anterior · {fecha}:` `font-semibold text-[10.5px]` + `{kg}kg × {reps}` `font-mono` + `Supera tu marca` | **NO se renderiza** en el miembro de superserie | Falta la línea "Sesión anterior · Hace X días · {kg}kg × {reps}" |
| Check completo | `CheckCircle2 w-6 h-6 text-sport-400` | `CheckCircle2 22 sport-400` | tamaño 24 vs 22, menor |

---

## 4. `SetRow.tsx` — fila de serie (RN-only pattern) ⚠️ foco del CEO
Web no tiene un "SetRow" tap-to-keypad; la fila viva es el `LogSetForm`. Para el estado **cerrado**, web usa el "chip recap".

| Elemento | Web (chip recap, `LogSetForm` L505-572) | RN (`SetRow`) | DIFF |
|---|---|---|---|
| Sin registrar | Web: fila de inputs (no hay "prompt"). Placeholder de input = `-` | `Serie {n}` (TYPE.eyebrow) + `Tocá para registrar` en **`TYPE.mono` (JetBrains)** + ChevronRight | **Frase en monospace** = el "mono donde va sans" del CEO. La frase debe ir en Hanken, no JetBrains. Además "Tocá" = voseo (ver §copy) |
| Registrado (fuerza) | Círculo `{n}` (`font-black tabular-nums`) + `{peso} × {reps}` (`font-mono text-[13px] font-bold`, "×" muted) + `RPE {r}`/`RIR {r}` (`font-mono text-[11px]`) + Check | `Serie {n}` eyebrow + `{reps} reps · {kg} kg · RPE {r} · RIR {r}` TODO en `TYPE.mono` | **Orden invertido**: web `{peso} × {reps}`; RN `{reps} reps · {kg} kg`. RN usa palabras "reps"/"kg" en mono; web usa "×" y solo números en mono |
| Pendiente/offline | Web: `CloudOff` + `Sin sincronizar` (`text-[10px] font-bold uppercase`, **Hanken**) borde ámbar | RN: sufijo ` · sin sincronizar` dentro de la línea **mono** `text-warning-500` | Web = badge sans separado; RN = texto mono inline |
| Marca registrada | Check `text-sport-400` | `Check #5C9DFF strokeWidth 2.6` en círculo `bg-sport-500/20` | OK aprox |

---

## 5. `TypedTargetGrid.tsx` — cards de objetivo (cardio/movilidad/roller)
Web ref: `TypedTargetGrid` en `WorkoutExecutionClient.tsx` L268-342.

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Grid | `grid grid-cols-2 md:grid-cols-5 gap-2` | `flex-row flex-wrap gap-8px, flexBasis 47%` | Aproxima 2-col; OK en mobile |
| Card | `rounded-sm border px-2.5 py-2`; normal `border-[var(--border-inverse)] bg-white/[0.05]`; highlight `border-ember-500/30 bg-ember-500/[0.14]` | `rounded-control` (radio distinto) + mismos bg/borde | Radio: web `rounded-sm`, RN `rounded-control` (más redondeado) |
| Label | `text-[9.5px] font-bold uppercase tracking-[0.06em]` | `TYPE.eyebrow` (12px uppercase tracking 0.12em) | Tamaño 9.5 vs 12, tracking 0.06 vs 0.12 |
| Valor | `font-mono text-[15px] font-bold tabular-nums` | `TYPE.mono 15px font-mono-bold` | OK |
| Copy cards | `Intervalos/Duración/Distancia/Pace objetivo/Zona FC/Rondas/Hold/Series/Respiraciones/Pasadas/Lado/Carga/Descanso/Objetivo` | idénticos (importados del engine) | OK |
| Botón timer | `bg-[var(--sport-500)]/[0.12] border-border-inverse text-xs font-bold min-h-[44px]`: `Iniciar intervalos`/`Cronómetro`/`Timer de hold ({s}s)`/`Timer ({s}s)` | igual (`h-11 self-end`) | OK (copy `Cronómetro` con tilde — RN usa `Cronómetro` OK) |

---

## 6. `KeypadHost.tsx` + `TypedKeypad.tsx` (EffortScale)
Web ref: `NumericKeypadSheet.tsx` + `EffortScale.tsx`.

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Header objetivo | `Objetivo {sets}×{reps} · {peso} kg` (siempre visible) + `Última vez {kg} × {reps}` | `Serie {n} · objetivo {reps} reps · {kg} kg`; SIN "Última vez" | Copy: web `Objetivo {sets}×{reps}`; RN `objetivo {reps} reps`. Falta línea "Última vez" |
| Paso esfuerzo | Muestra **ambos** en el mismo paso: `Esfuerzo (opcional)`, luego `Esfuerzo · RPE` + (?)help + ScaleDots Y `Reps en reserva · RIR` + (?)help + ScaleDots | Solo UNO (rpe O rir según `block.rir`): label `RPE (esfuerzo percibido)` / `RIR (reps en reserva)`, sin (?)help | Web muestra RPE **y** RIR con help; RN muestra uno solo sin help. Labels distintos |
| Botones esfuerzo | `Listo` (Check) | `Omitir` + `Guardar serie` | Copy/estructura distinta |
| ScaleDots | `bg-[var(--sport-500)]`/`bg-white/15`, readout `font-mono font-bold text-sport-300`, dots 10px | `EffortScale` idéntico (10px, sport-500/white15, readout mono sport-300) | OK |
| Grid keypad / chips | keypad es paridad (dígitos, chips ±, coma) | `TypedKeypad` OK (display Archivo black, teclas Archivo bold) | OK |
| Acción primaria | `Siguiente`(ArrowRight) / `Listo`(Check) | igual | OK |

---

## 7. `ExecutorV2.tsx` — barra inferior + secciones
Web ref: `WorkoutExecutionClient.tsx` L1916-1960.

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Botón "Finalizar" | UNA sola vez: barra fija inferior `Finalizar entrenamiento` (`CheckCircle2` + texto completo, `bg-sport-500 h-12 px-5`) | **DUPLICADO**: (a) `Button label="Finalizar entrenamiento"` al final del scroll (L533) **y** (b) barra fija con `Finalizar` (texto TRUNCADO, L566) | Quitar el botón in-scroll; la barra fija debe decir **`Finalizar entrenamiento`** completo, no `Finalizar` |
| Chip descanso barra | `Descanso ({time}s)` pill ember `bg-[var(--ember-500)]/15 text-ember-200 border-ember-500/25 text-xs font-bold` + Timer | `Descanso (90s)` ember-200 `font-sans-bold text-xs` + Timer | OK (RN hardcodea 90s; web usa defaultTime||90 — igual en práctica) |
| Separador secciones | barra `w-1 rounded-full bg-sport-500` (opacity 0.4 si muted) + `h2 text-sm font-bold uppercase tracking-wider text-on-dark-muted` + `hr` | igual (`font-sans-bold text-sm uppercase letterSpacing 1`) | OK |
| Subtítulo sección | `text-xs leading-relaxed text-on-dark-muted pl-4 border-l-2 border-white/10` | igual (`text-[12px] border-l-2 pl-4`) | OK |
| Banner "todo listo" | (web no tiene banner Trophy en el scroll; el cierre va al overlay) | RN muestra card Trophy `Entrenamiento completado!` arriba del scroll | Extra RN — verificar con CEO si debe salir (web no lo tiene inline) |

---

## 8. `StepperExecution.tsx` — modo Pasos
Web ref: `StepperExecution.tsx` (web).

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Nav superior | prev/next `h-11 w-11 rounded-control border`; centro: sección `text-[10px] font-bold uppercase tracking-widest text-sport-300` (muted→`/60`) + `**Ejercicio {n}** de {N}` `font-mono text-[11px]` | idéntico (TYPE.eyebrow sección sport-300 + TYPE.mono "Ejercicio {n} de {N}") | OK. (Nota: el CEO habló de "BLOQUE X de Y" — ambos ya dicen **"Ejercicio X de Y"**, no "BLOQUE"; ninguna acción) |
| Rail segmentos | `h-1.5 rounded-full`: active `bg-sport-400`, done `bg-sport-500/60`, upcoming `bg-white/15` | idéntico | OK |
| CTA pie | `Siguiente ejercicio` (CheckCircle2+ChevronRight) borde/bg sport | igual (`TYPE.label text-sport-300`) | OK |

---

## Resumen de prioridad para fixers
1. **SetRow (§4)**: sacar frases de `TYPE.mono` → Hanken; invertir a `{peso} × {reps}`; arreglar "Tocá para registrar"/voseo. (Causa directa del "mono donde va sans".)
2. **Header (§1)**: back=ArrowLeft, título centrado, semana=pill-badge, quitar eyebrow "Entrenamiento", ícono Pasos=GalleryHorizontal.
3. **Superserie (§3)**: copy "Rondas: A1 → B1 sin descanso…", chips-pill, "Descanso {rest}", historial "Sesión anterior".
4. **Barra inferior (§7)**: quitar botón duplicado; texto completo "Finalizar entrenamiento".
5. **Card suelta (§2)**: glyph+label de tipo en la fila silenciosa; músculo mixed-case 11px (no uppercase).
6. **Keypad (§6)**: RPE+RIR juntos con help; línea "Última vez"; objetivo `{sets}×{reps}`.
7. **Acentos comidos** transversal: `Técnica`, `Última vez`, `Ver técnica`, `máquina`, `Mantén`.
