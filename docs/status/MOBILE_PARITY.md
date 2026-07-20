---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-20 @ 34b09d8f"
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
| Ola 4A — nutrición del alumno | **5/12 aplicadas** | Pendiente | **Activa** |

“Cerrado estático” significa que código, spec y verificaciones automatizadas disponibles convergieron. No significa que el comportamiento visual, gestos, teclado, cámara, safe areas u offline estén aprobados en hardware real.

## Ola activa: 4A

Fuente funcional/visual: `apps/web/src/app/c/[coach_slug]/nutrition/**` en viewport móvil. Specs vigentes: [`docs/rn-port/specs/seccion-4a/`](../rn-port/specs/seccion-4a/).

| Unidad | Alcance | Código | QA device |
|---|---|---:|---:|
| 4A-01 | Ruteo y chrome | Aplicado | Pendiente |
| 4A-02 | Vista Hoy: estructura | Aplicado | Pendiente |
| 4A-03 | Vista Plan | Pendiente | Pendiente |
| 4A-04 | Historial | Pendiente | Pendiente |
| 4A-05 | Shell y tab bar | Pendiente | Pendiente |
| 4A-06 | Editar y retirar registros | Pendiente | Pendiente |
| 4A-07 | Kit e ilustraciones | Aplicado | Pendiente |
| 4A-08 | AuraHero y colores white-label | Pendiente | Pendiente |
| 4A-09 | Porciones | Pendiente | Pendiente |
| 4A-10 | Registro y buscador | Aplicado | Pendiente |
| 4A-11 | Scanner | Aplicado | Pendiente |
| 4A-12 | Celebraciones y residuos | Pendiente | Pendiente |

Aplicadas: **01, 02, 07, 10 y 11**. Pendientes: **03, 04, 05, 06, 08, 09 y 12**.

### Dónde retomar

1. Wave C: `4A-06`, `4A-08` y `4A-09` en archivos disjuntos.
2. Wave D: `4A-03` y `4A-12`.
3. Wave E: `4A-04`; después `4A-05` si ambas siguen compartiendo `index.tsx`.
4. Ejecutar gates estáticos y export después de cada wave.
5. Completar matriz device de 4A y regresión dirigida de Secciones 1–3/2R.

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `previewv2` | **OK**, reportado por el usuario el 2026-07-20 | El artefacto construye; QA funcional/visual sigue pendiente |
| iOS | `previewv2` | Rebuild pendiente | El fallo anterior ocurrió antes de Xcode por credenciales/distribution de EAS; `c6743ef3` cambió iOS a credenciales locales + distribución store. Falta verificar con una nueva ejecución |

No marcar iOS verde hasta que GitHub Actions termine correctamente. Un build verde tampoco cierra el QA en dispositivo.

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
