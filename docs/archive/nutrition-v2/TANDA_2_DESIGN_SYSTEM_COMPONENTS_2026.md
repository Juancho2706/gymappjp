# EVA Nutrición V2 — Tanda 2

## Design System, componentes compartidos y microinteracciones

**Estado:** completada  
**Fecha:** 14 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**PR:** #121, draft  
**Supabase:** sin cambios

---

## 1. Objetivo

Construir el lenguaje visual y los contratos reutilizables de Nutrición V2 antes de programar pantallas completas. La tanda no sustituye rutas productivas ni introduce una segunda paleta o sistema de movimiento.

Se reutilizan como fuentes canónicas:

- `@eva/brand-kit` para white label y motion;
- los tokens semánticos de `apps/web/src/app/globals.css`;
- los tokens equivalentes de `apps/mobile/global.css`;
- Ember para identidad de Nutrición;
- Sport y Aqua como colores funcionales de macros;
- status colors del sistema para success, warning, danger e info.

---

## 2. Paquete compartido

Se añadió el módulo source-only:

```txt
packages/nutrition-v2/
├── index.ts
├── design.ts
├── contracts.ts
└── contracts.test.ts
```

Se consume mediante aliases TypeScript/Vitest:

```txt
@eva/nutrition-v2
@eva/nutrition-v2/design
@eva/nutrition-v2/contracts
```

No se añadió un workspace package independiente, por lo que el lockfile no cambia y `pnpm install --frozen-lockfile` conserva su contrato.

### Contratos visuales compartidos

- estrategias `structured / flexible / hybrid`;
- macros y labels P/C/G;
- estados de sync y guardado;
- tonos semánticos;
- modelos de fila, franja, atención y pasos del Builder;
- formateo de kcal, gramos y porcentajes;
- cálculo de progreso y rango;
- duraciones/easings/springs derivados de `@eva/brand-kit`.

### Contratos de dominio preparados

- objetivos;
- permisos del alumno;
- items prescritos;
- franjas y variantes;
- borrador de plan;
- intake y corrección;
- snapshot diario;
- historial legacy explícito;
- idempotency keys.

Los schemas son Zod y podrán utilizarse tanto en web como React Native y en gateways de Tanda 4+.

---

## 3. Kit web

Ruta:

```txt
apps/web/src/components/nutrition-v2/
```

Componentes públicos:

- `NutritionPageShell`;
- `NutritionHeader`;
- `NutritionToolbar`;
- `StrategyBadge`;
- `PlanVersionBadge`;
- `MacroBudget`;
- `MacroProgress`;
- `MealTimeline`;
- `MealSlotCard`;
- `FoodThumbnail`;
- `FoodRow`;
- `SyncOfflineState`;
- `NutritionStatePanel`;
- `NutritionSkeleton`;
- `CoachAttentionCard`;
- `BuilderStepList`;
- `BuilderInspector`;
- `StudentPreview`;
- `ResponsiveDataAdapter`;
- `NutritionRefreshButton`;
- `NutritionCard`.

Microinteracciones client-side:

- `NutritionMotionButton`;
- `SelectableStrategyCard`;
- `AnimatedStatusCheck`;
- `SaveStateIndicator`;
- `AnimatedListItem`.

### Decisiones

- componentes estructurales pueden seguir siendo Server Components;
- Framer Motion solo entra en primitivas que lo requieren;
- reduced motion se resuelve con `useReducedMotion`;
- las superficies usan tokens, no hex de pantalla;
- el preview usa `surface-inverse`, no un color negro hardcoded;
- imágenes usan lazy loading y fallback explícito;
- tablas desktop tienen adaptación a cards móviles.

---

## 4. Kit React Native

Ruta:

```txt
apps/mobile/components/nutrition-v2/
```

Incluye equivalentes RN para:

- shell/header/toolbar;
- badges de estrategia y versión;
- macros;
- timeline y franjas;
- thumbnail/fila;
- sync/offline;
- empty/error/permission;
- skeletons;
- botones con microfeedback;
- selección de estrategia;
- guardado;
- alertas del coach;
- pasos e inspector;
- preview del alumno.

### Implementación

- NativeWind es la fuente de superficies, texto y bordes;
- `useTheme()` se limita a colores imperativos de iconos/librerías;
- Moti/Reanimated consumen los tokens de `useEvaMotion()`;
- haptics son cortos y semánticos;
- targets interactivos son de al menos 44 px;
- Expo Image usa cache memory-disk;
- reduced motion elimina desplazamientos sin eliminar feedback funcional.

---

## 5. Motion cerrado

| Evento | Token | Resultado |
|---|---|---|
| Press | `instant` | scale 0.98 |
| Selección | `fast` + `SPRING.ui` | borde/fill/check |
| Confirmación | `base` | spinner/check/status |
| Inserción/eliminación | `base` | layout y opacidad |
| Énfasis | `slow` | publicación o cambio importante |
| Celebración | `slower` | reservada para hitos |

No se añadió Rive/Lottie en esta tanda.

---

## 6. Accesibilidad

### Web

- labels y landmarks;
- `aria-valuenow/min/max` en progreso;
- `aria-live` para guardado/sync;
- focus visible;
- botones nativos;
- keyboard-friendly;
- reduced motion.

### React Native

- `accessibilityRole`;
- `accessibilityLabel`;
- `accessibilityState`;
- `accessibilityValue` en barras;
- live region para guardado;
- texto además de color/haptics;
- targets táctiles adecuados.

---

## 7. Temas y white label

La matriz obligatoria se conserva:

1. EVA claro;
2. EVA oscuro;
3. white label claro;
4. white label oscuro.

Reglas:

- marca: CTA, selección, focus y detalles autorizados;
- Ember: identidad de Nutrición;
- macros: paleta fija y consistente;
- success/warning/danger: sistema;
- surfaces/text/borders: semánticos;
- no usar el color de marca como estado de error o éxito.

---

## 8. Pruebas

Se añadieron tests para:

- progreso y rangos;
- schema flexible;
- intake inválido;
- idempotency keys;
- accesibilidad de barras;
- kcal restantes;
- badge de estrategia/versionado;
- empty state;
- preview con superficie semántica.

El Mobile Integration CI continúa siendo el gate de compilación RN.

---

## 9. Guardrails

- las pantallas V2 deben importar el kit público, no copiar estilos;
- no montar shells legacy;
- no crear nuevas paletas locales;
- no añadir duraciones inline salvo integración externa justificada;
- no animar todas las filas virtualizadas al hacer scroll;
- no usar confetti para operaciones cotidianas;
- no ocultar errores solo con color;
- no introducir requests o dependencias de datos dentro de componentes visuales.

---

## 10. Criterios de cierre

- [x] contratos compartidos web/RN;
- [x] componentes base web;
- [x] componentes base RN;
- [x] estados loading/empty/error/permission/offline;
- [x] skeletons;
- [x] Builder primitives;
- [x] preview del alumno;
- [x] microanimaciones;
- [x] reduced motion;
- [x] haptics;
- [x] dark/light/white label;
- [x] accesibilidad;
- [x] pruebas unitarias web/contratos;
- [x] guard de límites V1/V2 vigente;
- [x] cero cambios en Supabase;
- [x] cero rutas productivas reemplazadas.

**Tanda 2: completada.**
