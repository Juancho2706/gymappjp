---
status: approved-active
owner: Juan Manuel Villegas
last_verified: "2026-07-20 @ 3867e8ad"
canonical: product-requirements
source_of_truth: apps/web responsive + apps/mobile
---

# SPEC — Paridad React Native con Web/PWA

## Problema

EVA mantiene dos superficies de producto: web/PWA y una app Expo/React Native. Cuando layout, lógica, permisos o estados evolucionan por separado, alumnos y coaches reciben experiencias distintas y aumenta el riesgo de errores de datos, seguridad y operación.

El proyecto de paridad lleva React Native al mismo contrato de producto que la web responsive y establece un proceso anti-drift para mantenerlo.

El avance vigente no vive en esta spec: consultar [`docs/status/MOBILE_PARITY.md`](../../docs/status/MOBILE_PARITY.md).

## Usuarios

- Alumnos: entrenamiento, nutrición, check-in y progreso con marca de su coach.
- Coaches standalone y team: clientes, programas, nutrición, configuración y módulos habilitados.
- Owner/QA: certificación de builds y releases en hardware real.

## Objetivos

1. Paridad visual y funcional con el árbol móvil de `apps/web`, no con desktop.
2. Mismos estados: carga, vacío, error, offline, pending, disabled y permisos.
3. Mismos contratos de negocio mediante `packages/@eva/*` cuando la lógica sea compartible.
4. Seguridad equivalente: validación servidor, RLS y entitlements server-side.
5. White-label, dark mode, accesibilidad, safe areas y navegación nativa coherentes.
6. Build y QA reproducibles en Android e iOS.
7. Toda feature web compartible nace con evaluación/tarea espejo mobile.

## Principios de producto

- **Web responsive es la referencia.** Una divergencia requiere justificación escrita.
- Una adaptación nativa puede cambiar el control —por ejemplo sheet, gesto o cámara— pero no el contenido, resultado ni permisos.
- Capacidades nativas adicionales solo permanecen si están aprobadas y no degradan paridad.
- Checkout, cambio de tarjeta y compra de add-ons permanecen como link-out mientras no exista una decisión explícita de IAP.
- EVA usa un binario compartido; el white-label ocurre dentro de la aplicación, no en icono/binario por coach.
- Áreas públicas web y administración interna sin equivalente móvil quedan fuera.

## Requisitos

### Interfaz

- Jerarquía, copy, tokens, tipografía, iconografía, radios, spacing y motion equivalentes.
- Matriz light/dark y EVA/marca personalizada.
- Safe areas, teclado, scroll, foco y tamaños pequeños verificados.
- Sin Inter/Montserrat ni theme legacy en superficies ya migradas.

### Funcionalidad y datos

- Misma navegación, validación, cálculo y persistencia para el mismo usuario/dato.
- Escrituras idempotentes y sin pérdida de campos desconocidos.
- Offline/pending visibles y reconciliación segura al volver la conexión.
- Lógica compartible consumida desde packages; no forks locales silenciosos.
- Nuevos write-paths prueban GRANT/RLS antes de exponerse.

### Seguridad comercial

- Entitlements no dependen solo de ocultar UI.
- Mutaciones de módulos pagos pasan por el boundary servidor correspondiente.
- Lecturas directas usan PostgREST únicamente con RLS comprobada para usuario, workspace y módulo.

### Operación

- Profiles EAS versionados y secretos fuera del repositorio.
- Android e iOS deben construir con el profile objetivo.
- Un build verde no sustituye smoke ni QA visual/funcional en dispositivo.
- Errores de runtime relevantes deben ser observables.

## Criterios de aceptación global

- [ ] Inventario actualizado de rutas web-responsive ↔ RN sin omisiones relevantes.
- [ ] Todas las olas funcionales cerradas sin P0/P1/P2 accionables.
- [ ] Divergencias nativas restantes aprobadas y registradas.
- [ ] Tokens, typecheck y pruebas afectadas verdes.
- [ ] Android e iOS construyen con configuración de release/preview acordada.
- [ ] Matriz device aprobada: ambos OS, light/dark y EVA/custom brand.
- [ ] Deep/universal links verificados en ambos OS.
- [ ] RLS/entitlements comprobados para caminos de lectura y escritura sensibles.
- [ ] Documentación canónica y política anti-drift activas.

## Fuera de alcance

- Igualar el layout desktop en una pantalla móvil.
- Replicar landing, pricing, legal público u operación admin sin caso móvil.
- Widgets, HealthKit/Google Fit, smartwatch y otras mejoras nativas futuras.
- Upgrade de Expo SDK dentro de una ola de paridad salvo bloqueo demostrado y decisión explícita.
- Refactors sin cambio observable o de seguridad.

## Riesgos principales

| Riesgo | Control |
|---|---|
| Documentación histórica interpretada como backlog | Estado y tareas canónicas únicas |
| Paridad estática que falla en device | Gate separado y obligatorio de hardware real |
| Doble implementación de lógica | Packages compartidos y tests de contrato |
| Pérdida de datos al guardar desde RN | Passthrough, idempotencia y round-trip tests |
| Bypass de módulo pago | Entitlements/RLS/servidor, nunca UI sola |
| Fragmentación por dependencias nativas | Batch al inicio de ola y build por plataforma |
| Regresión web por seams compartidos | Gates web y mobile en el mismo cambio |
