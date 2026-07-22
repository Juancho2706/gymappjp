---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-21 @ 8f8161cb"
canonical: true
source_of_truth: apps/web responsive + apps/mobile
---

# Paridad Web/PWA → React Native

Única fuente de verdad para saber qué está cerrado, qué falta y dónde retomar el port de React Native. Los detalles de ejecución viven en [`specs/rn-mobile-parity-redesign/TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md); este archivo prevalece ante cualquier auditoría, spec de unidad o informe histórico.

> **Preservación de funciones** (qué se movió de lugar, qué quedó **órfano** en el rediseño, y la deuda de paridad mobile): [`REDESIGN_FEATURE_MATRIX.md`](REDESIGN_FEATURE_MATRIX.md).

## Resumen ejecutivo

La paridad global **no está certificada todavía**.

| Bloque | Código y revisión estática | QA en dispositivo | Estado efectivo |
|---|---:|---:|---|
| Sección 1 — ejecutor del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 2 — dashboard del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 3 — coach (14 unidades) | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 2R — residuos del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 4A — nutrición del alumno | **12/12 aplicadas** | Pendiente | Cerrada estática; no certificada |
| Ola 4B — nutrición del coach y catálogos | **9/16 aplicadas** | Pendiente | **Activa** |

“Cerrado estático” significa que código, spec y verificaciones automatizadas disponibles convergieron. No significa que el comportamiento visual, gestos, teclado, cámara, safe areas u offline estén aprobados en hardware real.

## Ola activa: 4A

Fuente funcional/visual: `apps/web/src/app/c/[coach_slug]/nutrition-v2/**` y `apps/web/src/components/nutrition-v2/**` en viewport móvil. Specs vigentes: [`docs/rn-port/specs/seccion-4a/`](../rn-port/specs/seccion-4a/).

| Unidad | Alcance | Código | QA device |
|---|---|---:|---:|
| 4A-01 | Ruteo y chrome | Aplicado | Pendiente |
| 4A-02 | Vista Hoy: estructura | Aplicado | Pendiente |
| 4A-03 | Vista Plan | Aplicado | Pendiente |
| 4A-04 | Historial | Aplicado | Pendiente |
| 4A-05 | Shell y tab bar | Aplicado | Pendiente |
| 4A-06 | Editar y retirar registros | Aplicado | Pendiente |
| 4A-07 | Kit e ilustraciones | Aplicado | Pendiente |
| 4A-08 | AuraHero y colores white-label | Aplicado | Pendiente |
| 4A-09 | Porciones | Aplicado | Pendiente |
| 4A-10 | Registro y buscador | Aplicado | Pendiente |
| 4A-11 | Scanner | Aplicado | Pendiente |
| 4A-12 | Celebraciones y residuos | Aplicado | Pendiente |

Aplicadas: **las 12** (wave C en `73f6aa82`; wave D en `3efa1a75`; wave E en `7c6684fa`). Código de la ola completo; falta QA device.

## Ola activa: 4B

Fuente funcional/visual: superficie V2 VIVA del coach (`apps/web/src/app/coach/nutrition-v2/**` +
catálogos vivos). Specs vigentes: [`docs/rn-port/specs/seccion-4b/`](../rn-port/specs/seccion-4b/)
(INVENTARIO, RANKING con las 16 unidades y 6 waves, DECISIONES-OWNER: **V1 al olvido**, recetas
fuera, RN-extras estricto).

| Estado | Unidades |
|---|---|
| Aplicadas (wave 4B.1, `bce2eb3b`) | 4B-01 macros meal-groups (P0 datos), 4B-02 scope org foods, 4B-03 quick-edit notas+permisos |
| Aplicada (wave 4B.2, `76d8ea2f`) | 4B-04 SWAP tab coach→Centro V2 (inline, cápsula intacta; V1 = rollback tras flag) |
| Aplicadas (wave 4B.3, `8f8161cb`) | 4B-05 HUB, 4B-06 Catálogo V2 + ficha (sin tablist aún), 4B-08 Detalle asignar/archivar, 4B-10 Builder F-02 reemplazos (cierra TODO F-02 P3), 4B-15 MG editor |
| Siguiente | Wave 4B.4: 4B-07 Curación ∥ 4B-09 Detalle-copy ∥ 4B-11 Builder-porciones ∥ 4B-14 Quick-edit drafts + cablear tablist Alimentos/Curación en el hub |
| Resto | 4B-12, 4B-13 según `RANKING.md`; 4B-16 (deuda nutrition-pro) fuera de la rama (toca web+packages) |

### Dónde retomar

1. Wave 4B.4: `4B-07` Curación ∥ `4B-09` Detalle-copy ∥ `4B-11` Builder-porciones ∥ `4B-14` Quick-edit drafts; incluye cablear el tablist Alumnos/Alimentos/Curación del hub (índice libre tras 4B-05).
2. Waves 4B.5–4B.6 según `RANKING.md` (4B-12 permisos+catálogo+reemplazar, 4B-13 builder drafts).
3. Completar matriz device de 4A/4B y regresión dirigida de Secciones 1–3/2R (requiere build nativa).

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `previewv2` | Build y upload OK en el [run 29766013009](https://github.com/Juancho2706/gymappjp/actions/runs/29766013009) sobre `c6743ef3`; artefacto expirado | Valida ese corte, no el candidato actual ni el QA funcional/visual |
| iOS | `previewv2` | Build y upload de IPA OK en el [run 29765692202](https://github.com/Juancho2706/gymappjp/actions/runs/29765692202) sobre `c6743ef3`; falló el submit a TestFlight y el artefacto expiró | La compilación nativa quedó probada en ese corte; distribución y QA siguen pendientes |

La sincronización `bc9ac09f` pasó `expo export` local para Android e iOS. El perfil de submit `previewv2` quedó alineado en `f5301858`, pero aún requiere una ejecución real. Ninguna de esas verificaciones sustituye un build firmado retenido ni el QA en dispositivo.

## Siguiente horizonte

Después de cerrar y certificar 4A y 4B:

1. 5 — builder y programas del coach.
2. 6 — dominios restantes, inventariados en lotes pequeños.
3. 7 — certificación transversal de rutas, estados, branding, accesibilidad y ambos sistemas operativos.

El alcance exacto se confirma contra código antes de abrir cada ola; no se reactiva automáticamente un checklist histórico.

## Contrato de actualización

Actualizar este archivo en el mismo cambio que:

- aplique o revierta una unidad de paridad;
- cambie la ola activa o el orden de ejecución;
- obtenga un resultado nuevo de build o QA device;
- acepte una divergencia nativa;
- descubra un bloqueo que cambie el siguiente paso.

Cada actualización debe cambiar `last_verified` con fecha y commit. Evidencia extensa pertenece a la spec de unidad o a auditorías fechadas, nunca a este resumen.
