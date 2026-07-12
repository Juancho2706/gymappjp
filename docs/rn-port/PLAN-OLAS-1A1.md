# Plan de olas 1:1 — PWA responsive → React Native

> Plan canónico de ejecución desde 2026-07-12. Complementa `README.md` (método)
> y `docs/porting-status.md` (estado vivo). La fuente de verdad visual y funcional
> es siempre `apps/web` en su variante responsive/móvil.

## 1. Filtro de entrada: qué se arregla

Una tarea entra en una ola **solo** cuando cumple las cuatro condiciones:

1. Existe evidencia web concreta (`archivo:líneas`) del elemento, estado o gesto.
2. RN difiere de forma observable: layout, copy, color, tipografía, estado,
   interacción, navegación, datos mostrados, carga, error, claro u oscuro.
3. La diferencia no es una adaptación nativa obligatoria que preserve lo que el
   usuario ve y puede hacer.
4. La spec define una comprobación objetiva web↔RN para cerrar el hallazgo.

Por tanto, **sí entran** aunque antes se hayan rotulado P2:

- diferencias de píxeles, espaciado, radio, sombra, gradiente, iconografía,
  tipografía o animación que existan en el web;
- usos incorrectos de white-label, tokens semánticos o superficies;
- estados o acciones presentes en web y ausentes en RN;
- divergencias light/dark, loading/empty/error/disabled/offline;
- diferencias de copy, contenido, orden o jerarquía.

**No entran**:

- cronómetro/notificación/lockscreen con librería nativa si el flujo visible del
  web ya está preservado;
- háptica, Media Session, hover, wake-lock u otra capacidad exclusiva de una
  plataforma;
- refactors, performance o arquitectura sin diferencia observable de paridad;
- diseños nuevos, “mejoras” creativas o cambios de producto no presentes en web;
- migraciones masivas preventivas. Ejemplo: un sheet @gorhom sólo se migra a
  `nativeModal` si QA reproduce que no abre al primer toque o queda fuera de
  pantalla; la incompatibilidad teórica sola no autoriza el cambio.

Si web contiene un probable bug, web sigue mandando hasta que el owner decida
corregir el producto en ambas superficies. La excepción debe quedar escrita.

## 2. Definition of Done por unidad

Una unidad se cierra solamente con:

1. inventario completo de su superficie responsive;
2. spec con citas web para cada afirmación visual/funcional;
3. implementación RN contra la spec;
4. verificador distinto comparando elemento por elemento;
5. lente de lógica/estado/foco/offline;
6. cero P0/P1 y **cero P2 accionable de paridad**;
7. residuos limitados a adaptaciones nativas justificadas por escrito;
8. gates verdes: `pnpm exec tsc --noEmit` en `apps/mobile`, tokens `86/86` y
   `pnpm exec expo export --platform android`;
9. QA device light/dark y marca EVA + una marca de alto contraste;
10. `docs/porting-status.md` actualizado en el mismo commit.

“Cero P2 accionable” reemplaza la regla antigua de cerrar con deltas visuales
pendientes. Si se puede reproducir desde el web con los tokens existentes, se
arregla. Si el DS carece de un valor exacto, se documenta primero y se resuelve
en la miniunidad de primitivos/tokens, sin introducir valores crudos en pantalla.

## 3. Orden de ejecución

### Ola 3 — Dashboard del coach (activa)

Terminar las 14 unidades existentes de `specs/seccion-3/` y su verificación
adversarial. No abandonar ni mezclar este checkpoint con el árbol del alumno.

Incluye exclusivamente diferencias del dashboard, chrome, directorio y ficha
del coach demostradas por sus specs. El doble-FAB continúa bloqueado por decisión
del CEO: no se implementa hasta recibir respuesta.

### Ola 2R — Cierre absoluto del alumno ya portado

Se ejecuta inmediatamente después del checkpoint de Ola 3. Reabre Secciones 1 y
2 únicamente para eliminar diferencias web↔RN observables.

Unidades obligatorias:

1. **Chrome de Movimiento/Bodycomp:** moverlas bajo `(tabs)` como rutas ocultas,
   preservar deep links y mantener la cápsula con “Más” activo como en web.
2. **Widget nutricional de Inicio:** completar/descompletar comidas inline con
   actualización optimista y cola offline, igual que web.
3. **Tipografía white-label:** propagar el `brand_font_key` permitido a la
   tipografía display de RN donde el layout `/c` web usa `--brand-font`.
4. **Residuos visuales de Sección 1:** bordes, tipografía, `tabular-nums`, grids,
   iconos, timer, resumen, sustitución y demás P2 listados en
   `docs/porting-status.md`; arreglar sólo los que el comparador confirme.
5. **Residuos visuales de Sección 2:** chrome, saludo, hero, streak, badges,
   sparklines, PR, hábitos, perfil y check-in; misma regla de evidencia.
6. **Sheets del alumno:** smoke desde arranque en frío. Migrar caller por caller
   sólo los que fallen al primer toque; no hacer migración preventiva global.

### Ola 4A — Nutrición completa del alumno

Alcance web: `apps/web/src/app/c/[coach_slug]/nutrition/**`.

Debe inventariarse desde cero como sección formal; los barridos E8 anteriores no
sustituyen specs elemento por elemento. Unidades mínimas:

1. shell/header, selector de día y estados de dominio OFF/read-only;
2. hero `MacroRingSummary`;
3. cards de comida, ingredientes, porciones y completado;
4. intercambios/equivalencias;
5. fuera de plan;
6. adherencia, recap semanal y racha;
7. plato, micros y objetivos;
8. notas coach↔alumno;
9. recetas, compras y exportación;
10. estados loading/empty/error/offline y refresco por foco.

Hallazgo de entrada ya confirmado para `MacroRingSummary`:

- web usa card `surface-inverse`/`border-inverse` y texto `on-dark`;
- kcal usa `ember-500`, proteína `ember-500`, carbohidratos `sport-500`
  white-label y grasas `aqua-500`;
- RN actual usa card normal, kcal success y carbos azul fijo. Debe portarse la
  composición web completa, no sólo recolorear barras.

### Ola 4B — Nutrición del coach y catálogos asociados

Alcance: `coach/nutrition-*`, `foods`, `recipes`, `meal-groups` y las superficies
de ficha no cerradas por Ola 3. Separarla de 4A evita mezclar dos usuarios y hace
posible QA de una sección completa.

### Ola 5 — Builder y programas del coach

Alcance: `coach/builder`, `program-builder`, `workout-programs`, `templates`.
Inventario responsive antes de usar componentes desktop como referencia. DnD se
puede adaptar al gesto nativo, pero contenido, estados y resultado deben coincidir.

### Ola 6 — Resto inventariado por dominio

No usar una sola ola “Resto”. Dividir después del inventario en lotes de 10–15
unidades con archivos RN disjuntos:

- alumno: ejercicios/detalle, movimiento, bodycomp, auth, onboarding, suspendido,
  cambio de contraseña y rutas periféricas;
- coach: ejercicios, ajustes/branding, suscripción, herramientas y soporte;
- shells compartidos: login, loaders, errores, empty states y primitives que
  afecten superficies anteriores.

Una ruta sólo se omite si no existe contraparte responsive o si la diferencia es
una capacidad exclusivamente nativa ya cubierta por el filtro de §1.

### Ola 7 — Certificación transversal

1. Re-inventario automático de rutas web↔RN para detectar omisiones.
2. Barrido de `ola0-hallazgos.json`: cada discrepancia debe estar arreglada,
   descartada con evidencia actual o marcada como adaptación nativa.
3. Búsqueda de colores/espaciados/tipografías crudos; comparar cada caso con el
   token web antes de cambiarlo.
4. Matriz light/dark × marca EVA/marca custom × tamaños de dispositivo.
5. QA de frío, foreground, offline y sesión restaurada.
6. Gates, build release y checklist visual humano pantalla por pantalla.

## 4. Contrato white-label para todas las olas

- `sport-100…700` es la rampa de marca y **sí** cambia por coach.
- `ember`, `success`, `danger`, `warning`, `aqua`, neutros y superficies no se
  recolorean por marca salvo que el web cite explícitamente `sport`/`theme-primary`.
- `accent-nutrition` es `ember`; `accent-training` es `sport`.
- No decidir por el nombre `primary`: verificar el token exacto usado por web.
- La fuente de marca se aplica sólo donde el web consume `--brand-font` y siempre
  mediante el catálogo permitido, nunca desde una cadena arbitraria.
- Cero valores crudos nuevos. Un literal existente sólo se conserva si representa
  exactamente un canvas/token fijo del web y queda documentado.

## 5. Regla de documentación y commits

Cada tanda actualiza `docs/porting-status.md`, corre los tres gates, hace commit
descriptivo y push únicamente a `rnmobiledenuevo`. No se toca `master`. Los
resultados visuales de device se registran con build/commit/tema/dispositivo.
