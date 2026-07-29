---
status: active-static-complete
owner: product-engineering
last_verified: "2026-07-26 @ e0db4285"
canonical: product-requirements
source_of_truth: apps/web responsive + apps/mobile
---

# SPEC — Experiencia de entrada de EVA Mobile

> Rediseño y corrección del tramo comprendido entre el arranque nativo y el ingreso autenticado:
> splash, walkthrough pre-login, selector de rol, identificación del coach y login white-label.
> La referencia funcional/visual es la web responsive viva; una adaptación nativa puede cambiar el
> control, pero no el resultado, la marca, los permisos ni los estados.

## 1. Problema

La entrada actual de `apps/mobile` transmite menos calidad y confianza que el producto web, y además
contiene un fallo probable en el camino principal del alumno:

- El arranque concatena el splash nativo con `LaunchSplash` y agrega una espera artificial cercana a
  1,4 s. El resultado puede sentirse como un doble splash y retrasa contenido listo.
- El walkthrough pre-login usa cuatro iconos genéricos aunque existen ilustraciones editoriales
  creadas para esta historia. No hay imágenes de onboarding dentro de `apps/mobile`.
- El selector de rol usa una tarjeta de alumno sobredimensionada, una opción de coach secundaria y
  un layout vertical fijo que puede recortarse en pantallas bajas o con texto ampliado.
- La identificación del coach divide código y enlace/slug en controles distintos, autoenvía al quinto
  carácter y representa el código mediante cinco celdas alrededor de un input de 1×1. El patrón es
  frágil para accesibilidad, pegado de enlaces, errores y equipos angostos.
- `alumno/codigo.tsx` guarda el branding en `AsyncStorage`, pero no actualiza el `ThemeContext` vivo.
  El login siguiente puede recibir `coachId = null` o una marca anterior y cerrar una sesión válida.
- La validación enterprise de RN consulta `organization_members` con la sesión del alumno, aunque el
  propio código reconoce que RLS puede impedir esa lectura. Un alumno válido puede ser rechazado.
- Los universal links resuelven branding fuera de React y dependen de que el contexto relea una caché
  que solo carga al montar el provider.

El intake autenticado de `apps/mobile/app/alumno/onboarding.tsx` es otro flujo y no forma parte de este
problema.

## 2. Usuarios

- Alumno nuevo que instala EVA y recibió un código, slug o enlace de su coach.
- Alumno recurrente que debe volver directo a su login con marca o a su sesión.
- Alumno standalone, team o enterprise cuyo acceso debe validarse contra el workspace exacto.
- Coach que entra al panel móvil sin pasar por el flujo de código de alumno.
- Owner/QA que certifica arranque, enlaces y autenticación en Android e iOS.

## 3. Objetivos

1. Mostrar una entrada nativa rápida, coherente y sin doble splash ni tiempo artificial.
2. Contar el valor de EVA con tres ilustraciones existentes y una narrativa breve antes del login.
3. Hacer que elegir rol y entrar con un coach sea claro desde 320 dp, con teclado y texto ampliado.
4. Resolver código, slug o enlace con un único contrato y mantener la marca elegida en memoria y caché.
5. Validar el workspace del alumno de forma autoritativa y equivalente a web, sin debilitar RLS.
6. Conservar las cuatro variantes white-label del login web (`clasico`, `hero`, `energia`, `minimal`).
7. Cubrir estados de carga, error, red, caché, reintento, deep link y sesión existente.
8. Dejar evidencia automatizada y QA física separada para Android/iOS, light/dark y EVA/custom.

## 4. No objetivos

- Rediseñar el onboarding de perfil posterior al primer login.
- Cambiar el sistema de autenticación de Supabase o agregar proveedores nuevos.
- Actualizar Expo SDK, React Native o dependencias nativas como efecto colateral.
- Crear un binario distinto por coach.
- Rediseñar las superficies autenticadas ni ejecutar la ola 5 de builder/programas.
- Cambiar schema o RLS salvo que la implementación demuestre una necesidad no resoluble en servidor.
- Convertir el splash en una pieza publicitaria o una animación obligatoria.

## 5. Dirección de producto y diseño

### 5.1 Concepto

La dirección es **editorial atlética, cálida y directa**: ilustración protagonista, tipografía EVA,
mucho aire y una sola acción primaria por paso. Se reutilizan tokens, fuentes, radios y motion del
design system; no se introduce otra estética ni una cascada de tarjetas/gradientes.

La experiencia completa debe sentirse como una sola transición:

```text
launch nativo
  → walkthrough solo en primer uso
  → selector de rol
  → identificación del coach
  → login white-label
  → validación de sesión + workspace
  → destino autenticado
```

Una sesión activa o un enlace válido puede omitir pasos sin mostrar flashes de las pantallas
intermedias.

### 5.2 Auditoría multidisciplinaria

| Lente | Hallazgo crítico | Decisión de producto |
|---|---|---|
| Product Manager | El tramo previo al valor exige demasiadas decisiones y presenta copy inexacto. | Primer uso explicativo y corto; recorridos recurrentes directos; no afirmar “una cuenta por coach”. |
| UX/UI | El walkthrough no usa los assets propios y el selector crea una jerarquía visual desproporcionada. | Tres escenas coherentes; selector compacto de dos opciones legibles; una acción primaria por pantalla. |
| Frontend/Mobile | Hay anchos y alturas fijos, doble splash y estado de branding no sincronizado. | Layout con scroll/teclado/safe areas, `useWindowDimensions`, transición de marca explícita y motion reducible. |
| Software Architecture | `AsyncStorage` actúa de canal implícito entre rutas y deep links. | El identificador y el branding resuelto forman estado explícito; la caché solo conserva continuidad. |
| Backend | Web valida el workspace exacto con capacidad server-side; RN intenta replicarlo parcialmente en cliente. | Un boundary móvil autenticado reutiliza la regla autoritativa de web y devuelve el destino permitido. |
| Security | `coachId` y el body pueden seleccionar contexto, pero nunca probar identidad o autorización. | Identidad desde sesión/JWT validado; service role solo server-side y consultas acotadas al workspace solicitado. |
| QA Automation | Typecheck verde no demuestra splash, teclado, links ni safe areas reales. | Tests de contrato + integración y matriz física Android/iOS antes de certificar. |
| DevOps/Release | Cambiar la configuración del splash modifica el binario. | Build EAS nuevo; el splash no se promueve por OTA. |

## 6. Requisitos funcionales

### 6.1 Launch y splash

- Debe existir un solo lenguaje visual de lanzamiento: fondo estable + marca EVA legible.
- El frame nativo y el primer frame React deben coincidir lo suficiente para evitar flash o salto.
- La app no debe imponer una demora cuando fuentes, sesión y navegación ya están listas.
- Si la preparación supera el tiempo perceptible, el mismo frame puede continuar con feedback sutil;
  no debe empezar una segunda ceremonia de marca.
- Debe respetar reduce motion. Ninguna información esencial depende de animación.
- Debe probarse en build `production`/standalone; Expo Go y development build no certifican el splash.

### 6.2 Walkthrough pre-login

- Aparece solo en el primer uso normal; “Saltar” persiste la decisión.
- Tiene tres slides y usa assets locales, disponibles offline:

| Slide | Asset fuente | Función narrativa |
|---|---|---|
| 1 | [`coach-plan.webp`](../../apps/web/public/illustrations/coach-plan.webp) + `@2x` | Tu coach prepara un plan para ti. |
| 2 | [`alumno-scan.webp`](../../apps/web/public/illustrations/alumno-scan.webp) + `@2x` | Registrar entrenamiento, nutrición y check-ins es simple. |
| 3 | [`progreso.webp`](../../apps/web/public/illustrations/progreso.webp) + `@2x`, con [`logro@2x.webp`](../../apps/mobile/assets/stickers/logro@2x.webp) como acento opcional | Ves tu avance y celebras logros reales. |

- El trofeo no se usa como cuarta ilustración full-bleed: su lenguaje 3D es un acento de celebración,
  mientras las otras tres imágenes comparten la narrativa editorial.
- Cada slide contiene una idea, título corto, máximo dos líneas de apoyo y CTA consistente.
- Los indicadores anuncian posición accesible (“1 de 3”) además del cambio visual.
- El contenido se adapta a pantallas bajas y texto ampliado sin ocultar “Saltar” ni el CTA.
- El ingreso de código no es un cuarto slide: es una tarea posterior y accionable.

### 6.3 Selector de rol

- Título y copy deben explicar la decisión sin lenguaje promocional redundante.
- “Soy alumno” y “Soy coach” usan el mismo patrón de interacción y targets accesibles; alumno puede
  conservar prioridad de producto sin ocupar una tarjeta hero de 200 dp.
- La pantalla debe poder desplazarse en altura reducida y mantener el footer fuera del contenido
  crítico.
- Las opciones deben expresar el destino: alumno entra con su coach; coach gestiona sus clientes.
- Una marca cacheada puede llevar al alumno recurrente directo al login brandeado, siempre con una
  salida visible para “Cambiar de coach o rol”.

### 6.4 Identificación del coach

- Un único campo acepta:
  - código alfanumérico de cinco caracteres `[A-Z2-9]{5}`;
  - slug válido del coach;
  - enlace completo o ruta `/c/<slug>` y `/invite/<code>`.
- El copy dice “5 caracteres”, no “5 dígitos”.
- Pegar, autocompletar y editar deben funcionar en el mismo campo.
- El envío ocurre mediante CTA explícito; completar cinco caracteres no dispara una petición
  irreversible o sorpresiva.
- Mientras resuelve: bloqueo contra doble envío, progreso visible y teclado gestionado.
- Debe distinguir error de formato, coach no encontrado y problema de conexión, sin filtrar datos
  privados ni revelar membresías.
- Al resolver, el login muestra inmediatamente la marca correcta; no debe aparecer EVA genérico ni
  una marca guardada de otro coach.
- Volver, reintentar y cambiar de coach conservan un estado coherente.

### 6.5 Login white-label

- La app conserva paridad con la web responsive en marca, copy y variantes `clasico`, `hero`,
  `energia` y `minimal`.
- Logo, logo dark, preset, color, tipografía, tagline y foreground de contraste siguen el contrato
  actual de `@eva/brand-kit`.
- Email, contraseña, mostrar/ocultar, recordar, recuperar contraseña, loading y error son accesibles.
- Tras `signInWithPassword`, el alumno no entra al dashboard hasta validar el workspace solicitado.
- En acceso inválido, pausado o archivado, la sesión se cierra y se muestra copy seguro.
- `force_password_change` y el destino standalone/team/enterprise deben respetar el mismo resultado
  de producto que web.

### 6.6 Deep y universal links

- Resolver un link no depende de que React relea `AsyncStorage`.
- El parser nunca debe romper la apertura por un URI malformado.
- `/c/<slug>` y `/invite/<code>` terminan en el mismo contrato que el ingreso manual.
- Paths no soportados se degradan al selector o al destino existente, no a un login sin coach.
- El enlace no concede acceso: solo preselecciona contexto; sesión y workspace se validan después.

## 7. Contrato de datos, arquitectura y seguridad

### 7.1 Flujo autoritativo

```text
input/deep link
  → normalizador puro y testeado
  → resolver branding público permitido
  → estado de entrada explícito + ThemeContext
  → persistencia de continuidad en AsyncStorage
  → Supabase Auth signInWithPassword
  → endpoint autenticado de validación de workspace
  → identidad desde access token, scope exacto en servidor
  → setLastWorkspace + destino autorizado
```

### 7.2 Reglas

- Normalización y schemas compartibles viven en `packages/*`; no se duplican entre web y RN.
- El branding público contiene solo columnas ya autorizadas para pre-auth.
- `AsyncStorage` no es autoridad de identidad, workspace ni autorización.
- El cliente puede proponer `coachId`/identificador como scope; el servidor comprueba pertenencia
  usando el usuario autenticado.
- `SUPABASE_SERVICE_ROLE_KEY` nunca llega a mobile. Si el servidor la necesita para comprobar una
  membresía enterprise inaccesible por RLS, la consulta queda limitada a usuario, organización,
  coach, estado activo y no eliminado.
- El endpoint valida input con Zod, no confía en rol/workspace enviados por body y devuelve solo el
  resultado necesario.
- No se espera una migración. Si aparece, se abre como decisión separada y sigue el protocolo de
  branching/LIVE de `AGENTS.md`.
- La respuesta ante credenciales o scope inválido no debe facilitar enumeración de cuentas.

## 8. Accesibilidad y adaptación

- Targets táctiles de al menos 44 pt en iOS y 48 dp en Android cuando el control lo permita.
- Labels, hints, estados disabled/busy y errores anunciables por lector de pantalla.
- Orden de foco lógico; ningún input útil se reduce a 1×1.
- Soporte de Dynamic Type/font scaling sin truncar acciones.
- Safe areas, teclado y rotación/cambio de dimensiones sin cálculos basados en un ancho inicial fijo.
- Contraste derivado por tokens/brand-kit; no asumir texto blanco sobre cualquier marca.
- Reduce Motion reemplaza transformaciones por fades breves y elimina loops decorativos.

## 9. Criterios de aceptación

Estado al 2026-07-26: implementación y gates estáticos completados sobre `rnmobiledenuevo`.
Los checks de experiencia que dependen de un binario instalado permanecen abiertos hasta el build
EAS y la matriz física Android/iOS.

### Funcionalidad

- [ ] Primer arranque: splash único → walkthrough de tres imágenes → selector, sin flashes.
- [ ] Segundo arranque sin sesión: no repite walkthrough.
- [ ] Sesión activa: navega al destino correcto sin mostrar selector/login.
- [ ] Código válido, slug válido, `/c/` y `/invite/` cargan exactamente el coach esperado.
- [ ] Código inválido, coach inexistente, timeout y reintento muestran estados distintos y recuperables.
- [ ] Cambiar desde coach A a coach B nunca conserva marca o `coachId` de A en el login.
- [ ] Alumno standalone válido entra; alumno de otro coach es rechazado y queda sin sesión.
- [ ] Alumno enterprise válido para el coach de su organización entra aunque RLS no permita leer
      `organization_members` desde el cliente.
- [ ] Cuenta pausada/archivada y cambio forzado de contraseña respetan el contrato web.

### UI/UX y accesibilidad

- [ ] Las tres ilustraciones se empaquetan localmente y se ven nítidas en densidad 1×/2×.
- [ ] Selector, campo y login son utilizables en 320×568, pantallas altas y texto ampliado.
- [ ] Teclado no cubre campo, error ni CTA en iOS/Android.
- [ ] Light/dark y EVA/custom mantienen contraste; onboarding/selector EVA no heredan marca obsoleta.
- [ ] VoiceOver/TalkBack pueden completar selector, identificación y login.
- [ ] Reduce Motion conserva contenido y navegación.

### Arquitectura, seguridad y operación

- [x] Parser/schema compartido tiene tests de códigos, slugs, links y URI malformado.
- [x] El login móvil usa validación server-side de sesión + workspace; no replica el service role.
- [x] Tests cubren la transición de branding en memoria antes de caché y el fallo de persistencia.
- [x] Typecheck, tests afectados y completos, tokens y docs quedan verdes.
- [x] `expo export` Android/iOS queda verde.
- [ ] Un build EAS nuevo certifica el cambio nativo de splash.
- [ ] QA física aprobada en Android/iOS antes de declarar el frente cerrado.

## 10. Métricas de éxito

- Cero rechazos de alumnos válidos causados por branding nulo/obsoleto o lectura RLS incompleta.
- Cero doble splash o espera mínima forzada cuando la aplicación ya está lista.
- El alumno llega al formulario de acceso correcto en menos pasos que el flujo actual.
- El owner puede identificar cada slide por su ilustración, sin iconos sustitutos.
- Cero P0/P1 abiertos en la matriz de entrada antes de continuar la ola 5.

## 11. Investigación aplicada

- Apple separa el launch screen del onboarding y recomienda que el lanzamiento se parezca al primer
  frame de la app: [Launching](https://developer.apple.com/design/human-interface-guidelines/launching)
  y [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding).
- Android define un splash estándar y una transición breve hacia la app:
  [SplashScreen](https://developer.android.com/develop/ui/views/launch/splash-screen).
- Expo SDK 54 recomienda configurar `expo-splash-screen` mediante config plugin y verificar el
  resultado en build release:
  [Expo SplashScreen](https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/).
- Expo advierte que `+native-intent` corre fuera del contexto React:
  [Native intents](https://docs.expo.dev/router/advanced/native-intent/).
- React Native recomienda `useWindowDimensions` para dimensiones que cambian y expone su contrato de
  accesibilidad:
  [Dimensions](https://reactnative.dev/docs/dimensions.html) y
  [Accessibility](https://reactnative.dev/docs/accessibility).
- Supabase establece que la sesión/JWT identifica al usuario y RLS gobierna el acceso, no el rol
  `authenticated` por sí solo:
  [Sessions](https://supabase.com/docs/guides/auth/sessions) y
  [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 12. Preguntas para aprobación

- [x] Aprobar el walkthrough de tres slides y el trofeo como acento del tercero.
- [x] Aprobar retirar la espera ceremonial de `LaunchSplash` y usar una transición nativa continua.
- [x] Aprobar reemplazar OTP visual + fallback de slug por un único campo de código/slug/enlace.
- [x] Aprobar que este frente P0 se ejecute antes de abrir la ola 5 de paridad.
