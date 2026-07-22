---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-21 @ 7c6684fa"
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

### Dónde retomar

1. Completar matriz device de 4A y regresión dirigida de Secciones 1–3/2R (requiere build nativa).
2. Abrir la ola 4B (nutrición del coach y catálogos) confirmando alcance contra código.
3. Residuo diferido de nutrición coach: editor de reemplazos F-02 en el builder móvil (TODO en `QuickEditMode.tsx`).

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `previewv2` | Build y upload OK en el [run 29766013009](https://github.com/Juancho2706/gymappjp/actions/runs/29766013009) sobre `c6743ef3`; artefacto expirado | Valida ese corte, no el candidato actual ni el QA funcional/visual |
| iOS | `previewv2` | Build y upload de IPA OK en el [run 29765692202](https://github.com/Juancho2706/gymappjp/actions/runs/29765692202) sobre `c6743ef3`; falló el submit a TestFlight y el artefacto expiró | La compilación nativa quedó probada en ese corte; distribución y QA siguen pendientes |

La sincronización `bc9ac09f` pasó `expo export` local para Android e iOS. El perfil de submit `previewv2` quedó alineado en `f5301858`, pero aún requiere una ejecución real. Ninguna de esas verificaciones sustituye un build firmado retenido ni el QA en dispositivo.

## Siguiente horizonte

Después de cerrar y certificar 4A:

1. 4B — nutrición del coach y catálogos.
2. 5 — builder y programas del coach.
3. 6 — dominios restantes, inventariados en lotes pequeños.
4. 7 — certificación transversal de rutas, estados, branding, accesibilidad y ambos sistemas operativos.

El alcance exacto se confirma contra código antes de abrir cada ola; no se reactiva automáticamente un checklist histórico.

## Contrato de actualización

Actualizar este archivo en el mismo cambio que:

- aplique o revierta una unidad de paridad;
- cambie la ola activa o el orden de ejecución;
- obtenga un resultado nuevo de build o QA device;
- acepte una divergencia nativa;
- descubra un bloqueo que cambie el siguiente paso.

Cada actualización debe cambiar `last_verified` con fecha y commit. Evidencia extensa pertenece a la spec de unidad o a auditorías fechadas, nunca a este resumen.
