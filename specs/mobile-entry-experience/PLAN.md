---
status: active-static-complete
owner: product-engineering
last_verified: "2026-07-26 @ e0db4285"
canonical: implementation-plan
source_of_truth: specs/mobile-entry-experience/SPEC.md
---

# PLAN — Experiencia de entrada de EVA Mobile

> Estrategia técnica de [`SPEC.md`](SPEC.md), aprobada por el owner el 2026-07-26 e implementada
> estáticamente sobre `rnmobiledenuevo`. El P0 de acceso, la calidad visual y el cambio nativo de
> splash están aplicados; faltan build EAS del corte y QA física.

## 1. Arquitectura elegida

### Estado de entrada explícito

La marca seleccionada no viajará implícitamente solo por `AsyncStorage`. El resolver devuelve un
objeto de branding; la pantalla de código lo entrega al `ThemeContext`, lo persiste para continuidad
y navega con un identificador estable. El login verifica que ambos representen el mismo coach.

`+native-intent.ts` se limita a parsear y redirigir con un identificador seguro. La resolución remota
ocurre dentro del árbol React, donde existen tema, errores, telemetría y lifecycle.

### Contrato compartido

Extender `@eva/schemas` con:

- schema de invite code `[A-Z2-9]{5}`;
- schema de slug;
- parser seguro para valor crudo, `/c/<slug>` y `/invite/<code>`;
- resultado discriminado (`code | slug | invalid`) sin `throw` por URI malformado.

Web y mobile consumen la misma clasificación; la extracción específica de un intent nativo queda en
`apps/mobile`.

### Validación de workspace

Crear un endpoint autenticado móvil que reutilice la semántica de
`clientLoginAction`:

```text
apps/mobile login
  → Supabase signInWithPassword
  → apiFetch('/api/mobile/auth/validate-student-workspace', authenticated)
  → validar access token y obtener user
  → buscar clients self
  → verificar standalone o membresía org+coach activa
  → setLastWorkspace
  → devolver destino / forcePasswordChange
```

El endpoint toma identidad del bearer token. Un `coachId` validado por Zod selecciona el scope, pero
no autoriza. La service role, si hace falta para la membresía enterprise, permanece en el servidor y
la consulta se acota exactamente como en web. No se espera migración.

### Splash

Migrar la configuración legacy de `app.json` al config plugin ya instalado de
`expo-splash-screen`. Mantener un frame estable EVA para light/dark y eliminar la espera obligatoria
del splash React. La app retiene el native splash solo hasta tener fuentes y una decisión de ruta;
si aún carga, continúa con un frame React equivalente.

## 2. Superficies y archivos previstos

La lista se confirma contra HEAD al iniciar cada fase.

| Acción | Ruta | Alcance |
|---|---|---|
| UPDATE | `packages/schemas/src/**` | Parser/schema compartido de identificador de coach. |
| UPDATE | `apps/mobile/lib/branding.ts` | Separar resolver, caché y normalización; errores tipados. |
| UPDATE | `apps/mobile/context/ThemeContext.tsx` | Transición explícita y atómica de branding. |
| UPDATE | `apps/mobile/app/+native-intent.ts` | Parsear y redirigir; no hacer fetch fuera de React. |
| UPDATE | `apps/mobile/app/alumno/codigo.tsx` | Campo único, estados y entrega explícita de branding. |
| UPDATE | `apps/mobile/app/(auth)/login.tsx` | Consumir contexto exacto y validación autoritativa. |
| CREATE | `apps/web/src/app/api/mobile/auth/validate-student-workspace/route.ts` | Boundary móvil autenticado. |
| CREATE | tests junto al endpoint y en `tests/mobile/**` | Contratos de parser, branding y workspace. |
| UPDATE | `apps/mobile/components/Walkthrough.tsx` | Tres slides con ilustraciones locales. |
| CREATE | `apps/mobile/assets/onboarding/**` | Copia optimizada 1×/2× de las tres ilustraciones. |
| UPDATE | `apps/mobile/app/index.tsx` | Selector compacto, scroll y estados de entrada. |
| UPDATE | `apps/mobile/app.json` | Config plugin de splash light/dark. |
| UPDATE/DELETE | `apps/mobile/components/shared/LaunchSplash.tsx` | Continuidad de frame o retiro de ceremonia duplicada. |
| AUDIT | `apps/mobile/components/EvaSplash.tsx`, `components/alumno/BrandedSplash.tsx` | Retirar solo si se confirma que siguen huérfanos. |
| UPDATE | docs canónicos y este paquete SDD | Estado, evidencia y QA real. |

## 3. Fases

### F0 — Baseline y aprobación

1. Aprobar narrativa de tres slides, campo único, splash continuo y prioridad.
2. Capturar screenshots actuales de 320×568 y un equipo alto como baseline.
3. Congelar matriz de rutas/casos: sesión, caché, código, slug, link y cambio de coach.
4. Registrar cualquier divergencia deliberada respecto del login web responsive.

Gate: SPEC aprobada y `TASKS.md` sin preguntas de producto pendientes.

### F1 — P0 de contrato y autenticación

1. Crear parser/schema compartido y tests adversariales.
2. Implementar endpoint autenticado de workspace con sesión real, Zod y respuestas seguras.
3. Reutilizar `setLastWorkspace` y la regla standalone/enterprise de web.
4. Cambiar RN para actualizar `ThemeContext` y caché en una única operación.
5. Hacer que el login valide el coach resuelto y use el destino devuelto por servidor.
6. Convertir intents en redirecciones explícitas sin fetch ni caché oculta.

Gate:

- tests de parser y endpoint;
- alumno standalone/enterprise/otro coach/pausado;
- `pnpm --filter @eva/mobile exec tsc --noEmit`;
- typecheck web y pruebas afectadas.

Rollback: conservar el resolver público actual y revertir el endpoint/consumidor como una unidad. No
hay DDL que revertir.

### F2 — Walkthrough y assets

1. Copiar `coach-plan`, `alumno-scan` y `progreso` a `apps/mobile/assets/onboarding/` con sus pares
   `@2x`; importar siempre el asset base para que Metro elija densidad.
2. Componer el tercer slide con el trofeo como acento solo si no compite con la ilustración.
3. Reescribir el modelo de cuatro iconos a tres escenas.
4. Ajustar paginación, accesibilidad, reduce motion, alturas pequeñas y preload.
5. Verificar tamaño del bundle y memoria; no duplicar archivos innecesarios.

Gate: screenshots Android/iOS de los tres slides, offline, 1×/2×, 320×568 y texto ampliado.

### F3 — Selector, identificación y login

1. Rehacer el selector con jerarquía compacta y el mismo patrón táctil para alumno/coach.
2. Reemplazar celdas OTP + slug fallback por un campo único con CTA.
3. Diseñar estados de formato, buscando, no encontrado, sin red y reintento.
4. Alinear la transición visual con las cuatro variantes de login ya presentes en RN/web.
5. Auditar teclado, autofill, foco, recuperar contraseña, cambio de coach y back stack.
6. Añadir labels/hints/state busy y tests de interacción.

Gate: matriz funcional completa y revisión 1:1 contra `apps/web/src/app/c/[coach_slug]/login/**`.

### F4 — Splash nativo

1. Configurar `expo-splash-screen` en `app.json` para light/dark sin agregar dependencia.
2. Alinear el primer frame React con el frame nativo.
3. Retirar la demora obligatoria y eliminar componentes splash huérfanos confirmados.
4. Exportar ambas plataformas y generar un build EAS candidato.
5. Medir visualmente cold/warm start y navegación con/sin sesión.

Gate: cero doble splash/flash en dispositivo real; build + QA Android/iOS. Este cambio no sale por OTA.

### F5 — Cierre y regreso a paridad

1. Ejecutar gates completos proporcionales.
2. Actualizar `MOBILE_PARITY.md`, `CURRENT.md`, testing y release notes si corresponde.
3. Registrar QA física sin confundir build verde con certificación.
4. Cerrar/archivar este paquete SDD cuando no queden P0/P1/P2.
5. Retomar ola 5 de builder/programas.

## 4. Diseño UI/UX verificable

- Walkthrough: ilustración dominante, bloque de copy estable y CTA inferior seguro; no icon tile.
- Selector: encabezado compacto + dos filas/tarjetas de 72–88 dp; sin hero card de 200 dp.
- Identificador: label visible, campo estándar grande, ayuda contextual y CTA; no input 1×1.
- Login: no reinventar las cuatro variantes existentes; corregir continuidad, estados y paridad.
- Fondo y chrome: tokens EVA, no colores hardcodeados fuera de assets/launch.
- Componentes permanecen route-local; solo pasan a atomic si alcanzan 3+ dominios.

## 5. Plan de pruebas

### Unitarias

- code/slug/URL válidos;
- mayúsculas, espacios, query/hash y caracteres escapados;
- URI malformado no lanza excepción;
- branding A→B, null y caché corrupta;
- resultado de destino standalone/team/enterprise.

### Integración

- endpoint sin token, token inválido, alumno inexistente, coach incorrecto, pausado y enterprise;
- la respuesta nunca incluye datos privados ni depende de identidad enviada por body;
- `setLastWorkspace` se ejecuta solo tras match;
- deep link y entrada manual convergen en el mismo resolver.

### UI

- walkthrough skip/next/final;
- selector alumno/coach;
- paste de código/slug/link, loading, doble tap, error y retry;
- teclado/foco/autofill;
- login en las cuatro variantes y ambos esquemas;
- VoiceOver/TalkBack y Reduce Motion.

### Gates

```bash
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm typecheck
pnpm test -- <tests afectados>
pnpm check:tokens
pnpm docs:check
pnpm --filter @eva/mobile exec expo export --platform android
pnpm --filter @eva/mobile exec expo export --platform ios
```

El build EAS se ejecuta solo cuando F4 esté listo. La aprobación final requiere hardware real.

## 6. Riesgos y controles

| Riesgo | Control |
|---|---|
| Resolver visualmente antes de arreglar el acceso | F1 bloquea F2–F4 como primer checkpoint de código. |
| Introducir service role en cliente | Endpoint server-only + test que exige bearer y scope exacto. |
| Duplicar la lógica de web | Parser compartido y reutilización de servicio/workspace existente. |
| Aumentar tiempo/bundle por imágenes | Assets locales optimizados, densidades correctas y medición de bundle. |
| Splash válido en Expo Go pero roto en release | Gate exclusivo de build standalone Android/iOS. |
| Drift del login white-label | Matriz de cuatro layouts y comparación con web responsive viva. |
| Perder alumnos recurrentes por caché vieja | Cache migration/fallback y acción visible para cambiar coach/rol. |
| Scope crece a onboarding post-login | Non-goal explícito y rutas separadas. |

## 7. Rollback

- Parser/branding/login: revertir F1 como checkpoint único y conservar sesión Supabase existente.
- UI de entrada: revertir por fase; no toca datos de usuario.
- Splash: volver al último `app.json` y artefacto firmado estable; un OTA no corrige configuración nativa.
- DB: no esperada. Si aparece una necesidad, solo forward-fix aditivo bajo protocolo Supabase.
