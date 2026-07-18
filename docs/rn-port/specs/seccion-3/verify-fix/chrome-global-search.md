# Verificación adversarial — chrome-global-search

Fecha: 2026-07-12. Web fuente: `apps/web/src/components/coach/CoachGlobalSearch.tsx`
y `apps/web/src/services/search/coach-search.service.ts`.

## Resultado

Cero P0/P1 y cero P2 accionable dentro de la unidad y sus dos consumidores de
navegación. Se revalidó contra `HEAD`, no contra el estado histórico descrito por
la spec.

## Navegación y cableado

- Programa asignado conserva `clientId` + `programId`; plantilla conserva su id
  como `templateId` (`CoachSearchPalette.tsx:45-51,141-159`).
- `program-builder.tsx` consume `programId` y filtra el programa concreto, no el
  activo genérico (`program-builder.tsx:260,421-469`).
- Ejercicio navega con `?q=` y el tab lo siembra en cada foco mediante
  `useLocalSearchParams` + `useFocusEffect` (`ejercicios.tsx:45,67-76`).
- Tecla Buscar selecciona el primer resultado visible, equivalente al Enter del
  web (`CommandPalette.tsx`, `onSubmitEditing`).
- Selección por tap, cancelar y back Android siguen cableados.

## Visual/copy/tokens corregidos

- loading comienza después del debounce, al lanzar la request, como web;
- input autofocado usa superficie card, borde sport y focus-ring estable;
- spinner usa text-subtle/muted, no el color de marca;
- copy del placeholder es singular y verbatim sin el atajo desktop `(/)`;
- input, empty, headings, filas, sublabels e iconos alineados a la métrica web;
- highlight usa peso 700, no 800;
- pressed usa `sport-100`/`sport-700`, sin alfa manual;
- thumbnail usa blanco en light, sunken en dark y radio `radius-md`;
- botón limpiar tiene feedback y tamaño de icono web;
- TextInput expone el accessibility label del combobox web.

## Adaptaciones nativas justificadas

- modal fullscreen + Cancelar sustituyen dropdown/click-fuera/Escape;
- campo mantiene 44 px de alto como target touch (web desktop: 40 px);
- no hay navegación por flechas ni hover persistente sin teclado/puntero;
- limpiar conserva abierto el modal: cerrarlo eliminaría también el input, a
  diferencia del web donde sólo desaparece el dropdown.

Estas adaptaciones preservan lo que el usuario ve y puede hacer; no agregan una
feature ni eliminan un resultado/acción del web.
