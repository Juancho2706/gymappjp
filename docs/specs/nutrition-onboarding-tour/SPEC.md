# SPEC — Guía Viva: onboarding por spotlight de Nutrición (web + PWA + RN)

> **CERRADA — 2026-08-17.** Implementación verificada en el árbol (auditoría specs-vs-código);
> evidencia clave: `tour-engine`/`tour-geometry`/`tour-flags` web + `TourOverlay`/`TourTargets` RN.

- **Origen:** decisión del dueño (2026-08-17) sobre los artifacts «Dos Bienvenidas» (eligió el
  tour A sobre la checklist B) y «Guía Viva EVA» (dirección aprobada: «me encantó… deberías
  implementarlo»). Los mockups funcionales de ese artifact son la referencia normativa visual
  y de contenido.
- **Rama de trabajo:** `rnmobiledenuevo` (post T3.v Cabina + Familia N).
- **Alcance de plataformas:** web desktop + responsive/PWA y RN Android (iOS vía OTA
  post-aprobación). **Cero dependencias nuevas. Cero backend.**

## Por qué existe

Señal real de usuarios (coach Dudu, 2026-08-16): «la parte de nutrición era medio enredada»,
y del socio: «hasta yo quedé pillado con algunas funciones». El producto es rico pero las
capacidades no se descubren solas (reemplazos ⇄ y corrección de macros viven en un ⋮; los
gramos, en un hover). La Guía Viva enseña el MAPA una sola vez y queda disponible a demanda.

## Decisiones

**D1 — Un motor, cuatro superficies, tres guiones.** Motor de spotlight propio (sin librerías:
el contrato es chico y driver.js no cubre RN). Superficies: editor web, hub web, editor RN,
hub RN. Guiones cerrados (copys en la sección «Guiones»): editor 8 pasos, hub 6 pasos; en
móvil (<768 web y RN) el guion del editor se reduce a 6 pasos (mini-cinta en vez de cinta).

**D2 — El «?» jamás tapa nada (INVARIANTE BLOQUEANTE del dueño).** Botón de ayuda 30px,
semi-transparente + blur, pulso suave solo hasta el primer uso del tour de esa superficie.
Ubicaciones que NO pueden solapar ningún control interactivo ni contenido operable:
- Editor desktop (≥1024): esquina inferior IZQUIERDA del lienzo (la derecha es paleta y la
  barra de totales flota al centro-derecha). Offset: 14px del borde, por sobre el fondo del
  canvas, nunca sobre cards (si el scroll lo cruza con una card, el botón es `fixed` al
  overlay con fondo propio — flota SOBRE el fondo, se acepta cruce visual con cards pero
  JAMÁS dentro del área de la PublishBar/cinta ni tapando botones).
- Editor <1024 y RN: flotante sobre la PublishBar, lado IZQUIERDO (los CTAs viven a la
  derecha), respetando safe-areas.
- Hub (web y RN): inline junto al título «Centro de Nutrición» (no flotante).
- Gate geométrico obligatorio: en los anchos del harness, el rect del «?» no intersecta el
  rect de NINGÚN `button/a/input/select` ajeno al propio «?» (tolerancia 0).

**D3 — La tarjeta del tour siempre completa en viewport (INVARIANTE BLOQUEANTE del dueño).**
Posicionador con clamp + flip: la tarjeta (280px desktop) se ubica junto al target con margen
8px y se CLAMPEA a los bordes del viewport/overlay; si no cabe a un costado, va abajo; si no,
arriba. Si el target está fuera de vista, primero `scrollIntoView({block:'center'})` y luego
se posiciona. En <768 (web) y RN SIEMPRE variante `dock`: tarjeta anclada abajo a lo ancho
(thumb-zone, sobre safe-area). Gate geométrico obligatorio: en cada paso de cada tour, el
rect de la tarjeta ⊆ rect del viewport (tolerancia 0) en los 5 anchos del harness.

**D4 — Memoria por coach y por tour, versionada, sin backend.** Flags
`eva.tour.<tourId>.v1.<coachId>` en localStorage (web) / AsyncStorage (RN). Auto-arranque
solo si el flag no existe al ENTRAR a la superficie (editor: al montar el overlay en modo
editor; hub: al montar la pestaña Alumnos); después solo manual vía «?». Subir a `v2` en el
futuro re-arranca una vez. «Saltar» y «Listo» marcan igual (no se insiste).

**D5 — Contrato de interacción.** Velo 74% con recorte vivo (4 paños + halo, transiciones
220-280ms con curva del DS); la UI de abajo queda inerte durante el tour (pointer-events y
foco). Tarjeta: icono clay 22px + título 3-5 palabras + máx 2 líneas + dots + ← → + «Saltar»
siempre visible + contador n/N. Esc (web) y back (RN/Android) = Saltar. Focus atrapado en la
tarjeta; al cerrar vuelve al «?» o al elemento previo. `prefers-reduced-motion` (web) /
reduce-motion (RN) apagan transiciones del velo y el pulso del «?».

**D6 — Copy = beneficio, no instrucción.** Los textos de los guiones están CERRADOS en esta
SPEC (abajo); español latam con tildes; nada de «haz clic en…». Cambios de copy = decisión
del dueño.

## Guiones (contenido cerrado)

### Editor (desktop web, 8 pasos) — targets por `data-tour` en superficies reales
1. `ribbon` · icono franja · «Tu tablero de vuelo» · «Kcal y macros del día en vivo mientras
   editas. Verde en banda; ámbar si el día se pasa.»
2. `metas` · version · «Metas sin salir del flujo» · «Kcal, P/C/G y fibra·sodio·agua del día
   activo — en un popover, la comida nunca se tapa.»
3. `rail` · dia · «Días del plan» · «Un BASE que aplica siempre + días propios (sábado libre,
   carga). El punto ámbar te avisa qué día quedó a medias.»
4. `slot` · franja · «Franjas que se leen solas» · «Foto real + barrita P·C·G por alimento.
   ¿Gramos exactos? Pasa el cursor por la barrita.»
5. `item-menu` · proteina · «El ⋮ guarda los superpoderes» · «Reemplazos autorizados ⇄,
   corrección de macros, mover de franja y quitar — todo por alimento.»
6. `porciones` · porciones · «Porciones a elección» · «Grupos como “Verduras · 7,5”: el alumno
   elige QUÉ comer dentro de tu marco. Control sin microgestión.»
7. `paleta` · carbohidrato · «Tu catálogo, con memoria» · «Miles de alimentos con foto y
   marca + los tuyos. “Sueles usar” aprende de ti; las cantidades se recuerdan solas.»
8. `publicar` · version · «Publica y ya llegó» · «El alumno ve la versión nueva al instante.
   Lo que ya registró hoy, jamás se pisa.»

### Editor (móvil <768 y RN, 6 pasos)
mini-cinta → metas → franja+spark (tap) → agregar/stack → porciones → publicar (mismos copys
del artifact aprobado, ajustados a tap en el paso del spark).

### Centro de Nutrición (web y RN, 6 pasos)
1. `tabs` «Cuatro pestañas, todo tu mundo» 2. `stats` «La foto en 3 números» 3. `filters`
«Filtros de atención» 4. `alumno-row` «La semana de un vistazo» (semáforo de 7 puntos)
5. `nueva-version` «Nueva versión en 2 toques» 6. `help` «¿Y este “?”» (cierra explicando la
repetición). Copys literales del artifact aprobado.

## Alcance

- Web: componente `TourEngine` + `TourHelpButton` compartidos en
  `apps/web/src/components/nutrition-v2/tour/` (nuevo dir), montaje en `QuickEditPlanView`
  (solo modo editor) y en el hub (`app/coach/nutrition-v2/page.tsx`, pestaña Alumnos).
- RN: `components/nutrition-v2/tour/` espejo (Modal transparente + `measureInWindow`),
  montaje en `QuickEditMode` (editor) y en el hub (`app/coach/nutrition-v2/index.tsx`).
- Targets: atributos `data-tour="…"` (web) / props-ref registrables (RN) en los elementos
  reales ya existentes — cero cambios de estructura de las superficies.
- Harness: stories del tour + asserts geométricos D2/D3 en `scripts/cabina-visual-check.mjs`.

## Fuera de alcance

Checklist de activación (opción B, queda en backlog) · tours del área alumno · analítica de
pasos (solo evento PostHog `tour_completed`/`tour_skipped` si el cliente ya está montado en
la superficie; NO agregar SDK) · builder/par viejo (se retira el 30-08) · iOS build.

## Backend

**Cero.** Flags en storage local del dispositivo. Nada de columnas, RPC ni endpoints.

## Invariantes

- D2 y D3 son BLOQUEANTES: gate geométrico en rojo = tanda no cierra.
- El tour jamás bloquea la salida: «Saltar» visible en todos los pasos; Esc/back cierran.
- Auto-arranque solo primera vez por superficie y coach; jamás en creación con `?from=`
  a medio flujo (si el overlay entra en creación, el auto-arranque espera a la próxima
  entrada en modo edición normal — un tour sobre un plan vacío enseña menos).
- Tokens del DS; Pressable RN jamás con style-función; safe-areas RN.
- Los `data-tour` no cambian comportamiento ni estilos de los elementos que decoran.

## Criterios de aceptación

- Tour completo operable en: editor 1536/1280/1024 (tarjeta lateral), 768/390 (dock), RN
  Android (dock); hub web 1280/390 y hub RN.
- Gates verdes: typecheck web+mobile, vitest, `cabina-visual-check` con los asserts nuevos
  (D2 «?» sin solapes, D3 tarjeta ⊆ viewport en cada paso, tour abre/avanza/salta/termina,
  flag persiste y evita re-auto-arranque), expo export android, docs:check.
- QA del dueño en preview + device (puede fundirse con el QA del paquete vigente).
