# Guía CEO — 3 tareas pendientes (RN parity)

Esta guía está escrita para hacerse **sin saber nada de programación**: cada paso es un solo clic o un solo comando, explicado como si fuera la primera vez. Léela de arriba a abajo y no te saltes nada.

Qué desbloquea cada tarea:
- **Tarea 1 (SHA256)** te da la "huella digital" de la app Android; sin ella el login con Google y otros servicios rechazan la app.
- **Tarea 2 (Google Play)** te da la cuenta de desarrollador para publicar la app en la tienda de Android; sin ella no hay app en el celular de nadie. Hay **dos caminos** (personal u organización) y esta guía te ayuda a elegir.
- **Tarea 3 (Sentry)** te da un panel que avisa cuándo la app se rompe en el celular de un alumno; sin él, te enteras solo cuando alguien reclama.

> Vocabulario mínimo (te lo repito cuando aparezca):
> - **Terminal / consola:** la ventana negra donde se escriben comandos. En Windows se llama "PowerShell" o "Símbolo del sistema (CMD)".
> - **Comando:** una línea de texto que copias, pegas y ejecutas apretando **Enter**.
> - **Copiar/pegar en la terminal:** para pegar en PowerShell haces **clic derecho** dentro de la ventana (no funciona `Ctrl+V` en algunas versiones). Para copiar, seleccionas el texto con el mouse y aprietas **Enter** o `Ctrl+C`.

---

## Tarea 1 — Obtener el SHA256 fingerprint del keystore Android

**Objetivo:** conseguir una línea de texto (la "huella digital SHA256" de la app) y pegársela a Claude.
**Tiempo estimado:** 10 minutos.

### Qué es esto en cristiano
El "keystore" es como el sello o la firma de la fábrica que marca cada versión de tu app Android. La "huella SHA256" (SHA256 Fingerprint) es una tira larga de números y letras separados por dos puntos, algo así como:

```
SHA256 Fingerprint: A1:B2:C3:D4:E5:F6:...:99:00
```

Tu keystore **no está en tu computador**: vive en los servidores de Expo (EAS), en tu cuenta de Expo. Por eso lo vamos a consultar con un comando, no buscando un archivo.

### Pasos (método principal: EAS)

1. Abre la terminal. Aprieta la tecla de **Windows**, escribe `PowerShell`, y haz clic en **Windows PowerShell**. Se abre la ventana negra/azul.
2. Muévete a la carpeta de la app móvil. Escribe exactamente esto y aprieta **Enter** (ajusta la ruta si tu proyecto está en otra parte):
   ```
   cd D:\Proyectos\Antigravity\gymappjp\apps\mobile
   ```
3. Ejecuta el comando de credenciales. Escribe y aprieta **Enter**:
   ```
   npx eas credentials -p android
   ```
   - Si te pregunta "¿Ok to proceed?" o algo sobre instalar `eas-cli`, escribe `y` y aprieta **Enter**.
   - Si te pide iniciar sesión (login), escribe el **correo/usuario y contraseña de tu cuenta de Expo** (la misma cuenta donde están los builds). Al escribir la contraseña **no se ve nada** en pantalla: es normal, escríbela igual y aprieta **Enter**.
4. Ahora aparece un menú que se navega con las **flechas del teclado** (arriba/abajo) y se elige apretando **Enter**. El primer menú pregunta por el perfil de build ("Which build profile do you want to configure?"). Elige **production** (con la flecha bajas hasta `production` y aprietas **Enter**). Si solo aparece una opción, apretá **Enter**.
   - Nota: el comando ya trae fijada la plataforma Android porque pusiste `-p android`; por eso no te vuelve a preguntar "Android o iOS".
5. Aparece el menú principal de Android. Con las flechas baja hasta la opción que dice:
   ```
   Keystore: Manage everything needed to build your project
   ```
   y aprieta **Enter**.
6. En cuanto entras a esa sección, EAS **imprime en pantalla un resumen del keystore actual**. Ahí ya suele aparecer la línea `SHA256 Fingerprint:` con la tira de números y letras. Léelo con calma.
   - Si NO ves el SHA256 en ese resumen, con las flechas elige la opción **`Download existing keystore`** y aprieta **Enter**: eso vuelve a imprimir las huellas (SHA1 y SHA256) y además descarga un archivo `.jks` en la carpeta. Es seguro; no cambia nada.
7. Para salir del menú sin tocar nada, baja hasta **`Go back`** (o aprieta la tecla `Esc` / `Ctrl+C`) hasta que vuelvas a la línea normal de la terminal.

### Alternativa (si el menú de EAS cambió o falla): keytool
`keytool` es una herramienta que viene con **Java**. Solo sirve si tienes Java instalado (para saberlo: escribe `java -version` en la terminal; si responde con un número de versión, lo tienes; si dice "no se reconoce", no lo tienes y salta esta alternativa).

- Si tienes un archivo APK ya construido:
  ```
  keytool -printcert -jarfile build.apk
  ```
  (reemplaza `build.apk` por la ruta real del archivo). Busca en la salida la línea `SHA256:`.
- Si tienes el archivo del keystore (`.jks`) descargado en el paso 6:
  ```
  keytool -list -v -keystore nombre-del-archivo.jks
  ```
  Te pedirá una contraseña ("keystore password"): esa contraseña la muestra EAS en el mismo resumen del paso 6. Busca la línea `SHA256:`.

### Qué copiar y a quién
- **Copia la línea completa del `SHA256 Fingerprint`**, incluyendo todos los pares de números/letras separados por dos puntos (los `:`). No importa si la copias con el texto "SHA256 Fingerprint:" delante; Claude lo limpia.
- **Pégasela a Claude en el chat.** Eso es todo: no hay que guardarla en ningún archivo ni subirla a ningún lado.

### Si algo sale mal
- **"npx no se reconoce como comando":** falta Node.js. Avisa a Claude; no intentes instalarlo a ciegas.
- **Te pide login y no sabes la clave de Expo:** es la cuenta de Expo (expo.dev) donde se hacen los builds. Si no la recuerdas, entra a https://expo.dev y usa "Forgot password". Sin ese login el comando no puede leer el keystore.
- **El menú se ve raro / con símbolos:** agranda la ventana de PowerShell (arrastra el borde) y vuelve a correr el comando; a veces el menú se corta si la ventana es muy chica.
- **Copiaste solo la mitad:** la huella SHA256 es larga (64 caracteres en pares). Si al pegarla parece corta, vuelve al paso 6 y cópiala de nuevo completa.

_Fuentes: Documentación oficial de Expo — App credentials (https://docs.expo.dev/app-signing/app-credentials/) y Existing credentials (https://docs.expo.dev/app-signing/existing-credentials/); Play Console Help — Obtaining your app's SHA-256 certificate fingerprint (https://support.google.com/googleplay/android-developer/answer/16641489)._

---

## Tarea 2 — Crear la cuenta de Google Play Console (elegir camino: personal u organización)

**Objetivo:** dejar creada (y en proceso de verificación) la cuenta de desarrollador de Google Play para publicar EVA, pagando el fee único de USD 25.
**Tiempo estimado:** 30–45 minutos de formulario. La diferencia grande está en **cuánto tardas en poder publicar**: por el camino personal hay que hacer una prueba de 14 días con 12 testers; por el camino organización hay que conseguir primero el número D-U-N-S (hasta ~30 días). Empieza HOY por el que elijas.

### Contexto de EVA (esto define la recomendación)
Tres datos que cambian todo el análisis:
1. **La app EVA es GRATIS y no tiene compras dentro de la app** (los pagos de los coaches van por la web / MercadoPago, **fuera** de la tienda). En lenguaje de Google, eso significa que EVA **no es una cuenta "merchant"** (no monetiza en Play).
2. Ya existe **EVA Technology SpA** (empresa real chilena), pero sacar el **D-U-N-S** es burocracia lenta.
3. El CEO ya tiene **~16 coaches gratuitos y decenas de alumnos reales** usando la PWA. Eso es oro: son exactamente los "testers reales y con uso genuino" que Google quiere ver.

### Lo más importante que debes saber: ¿qué ve el público en la ficha?
Mucha gente evita la cuenta personal por miedo a que aparezca su nombre en vez del de la marca. **Ese miedo es en gran parte infundado.** Lo que confirmamos en la documentación oficial de Google:

- **El "developer name" (nombre del desarrollador que se ve grande en la ficha) es configurable y puede ser "EVA"**, aunque la cuenta sea personal. No estás obligado a poner "Juan Villegas" como nombre visible. Solo no puede suplantar a otra marca ni infringir marcas registradas.
- **La dirección física NO se muestra públicamente** cuando la app es gratis y sin compras dentro de la app. Google solo obliga a mostrar la dirección completa a las cuentas **"merchant"** (las que venden apps de pago o tienen compras in-app), por leyes de protección al consumidor. EVA **no** cae ahí. Cita textual de Google: _"To comply with consumer protection laws, merchant accounts (developer accounts with apps that monetize via paid apps or in-app purchases) must show their full address on Google Play."_
- Lo que **sí** aparece públicamente en una cuenta personal con app gratis: el **nombre de desarrollador** (p. ej. "EVA"), el **correo de desarrollador**, el **país** (Chile, derivado de tu dirección legal) y el **sitio web** si lo pones. En la sección de "identidad verificada del desarrollador" puede figurar tu **nombre legal** y el país, pero **no** la calle ni el teléfono. Es decir: los usuarios verán "EVA", no una dirección de tu casa.

**Conclusión de este punto:** con cuenta personal, la ficha se ve marca "EVA" y **no** expone tu domicilio. El nombre legal puede aparecer en un apartado de "acerca del desarrollador", pero eso es discreto y no es la cara de la app.

### Tabla comparativa

| Tema | Opción A — Personal | Opción B — Organización |
|------|---------------------|--------------------------|
| **D-U-N-S obligatorio** | ❌ No | ✅ Sí (9 dígitos; hasta ~30 días gratis) |
| **Prueba 12 testers / 14 días antes de publicar** | ✅ Sí (obligatoria para cuentas personales nuevas) | ❌ No (organización queda exenta) |
| **Fee** | USD 25 único | USD 25 único |
| **Nombre visible en la ficha** | Configurable → "EVA" | "EVA" (más el nombre legal de la SpA) |
| **Dirección pública** | No (app gratis / sin IAP) | No (app gratis / sin IAP) |
| **Verificación de identidad** | Documento del representante + tarjeta a su nombre + 2FA | Documento + docs de empresa + D-U-N-S + 2FA |
| **Tiempo real para poder publicar** | ~2–3 semanas (los 14 días + revisión) | Depende del D-U-N-S: días si ya existe, hasta ~30–40 si hay que sacarlo |
| **Funcionalidad de la cuenta** | Idéntica: ambas publican y podrían monetizar | Idéntica |
| **Migrar después** | Se puede pasar la app a una cuenta organización más adelante (ver abajo) | — |

> Nota: personal y organización tienen **exactamente la misma funcionalidad** en Play; lo único que cambia es la información que se pide al crearla y la regla de los testers.

---

## Opción A — Cuenta PERSONAL (RECOMENDADA para arrancar ya)

Elige esta si quieres **publicar cuanto antes sin esperar el D-U-N-S**, aprovechando que ya tienes coaches y alumnos reales que pueden ser los testers. Es el camino de un principiante absoluto.

### A.1 — Antes de empezar, ten a mano
1. **Una cuenta de Google** (un Gmail) para ser el dueño de la cuenta de desarrollador, con **verificación en 2 pasos (2FA) activada**. Puede ser un correo de EVA.
2. **Tu documento de identidad** (cédula/pasaporte/licencia). Google puede pedir una foto del documento e incluso una selfie. **El nombre del documento debe coincidir con el nombre de la tarjeta con la que pagas los USD 25.**
3. **Una tarjeta de crédito o débito real** (Visa/Mastercard/Amex) a tu nombre. **No sirven prepago ni la mayoría de las virtuales.**
4. **El sitio web:** `https://eva-app.cl` (opcional pero recomendable ponerlo).
5. **Una lista de 12 a 15 personas con correo Gmail** que probarán la app (plan detallado en A.4).

### A.2 — Crear la cuenta (paso a paso)
1. En el navegador entra a **https://play.google.com/console** e inicia sesión con el Gmail elegido.
2. Haz clic en el botón para empezar el registro (**"Get started"** / "Empezar" / "Crear cuenta de desarrollador").
3. Cuando pregunte el tipo de cuenta ("What type of account is this?"), elige **"Yourself" / "An individual/personal account"** (personal).
4. Llena los datos:
   - **Developer name** (el nombre público que verá la gente): escribe **`EVA`**.
   - **Nombre legal** y **dirección legal**: los tuyos (salen/enlazan con tu perfil de pagos de Google). Recuerda: la dirección **no** se mostrará públicamente en app gratis.
   - **Correo y teléfono de contacto**: uno que revises; llegan códigos de verificación (OTP). Escribe cada código para verificarlos.
   - **Correo de desarrollador**: el que aparecerá en la ficha para que los usuarios te contacten.
5. Paga el **fee único de USD 25** con la tarjeta. Es **una sola vez para toda la vida de la cuenta** (Apple, en cambio, cobra cada año).
6. Completa la **verificación de identidad** si la pide (foto del documento y a veces selfie) y activa **2FA**. Envía.
7. La cuenta suele quedar utilizable rápido, pero **para publicar al público primero hay que pasar la prueba cerrada** (lo que sigue).

### A.3 — La regla de los 12 testers / 14 días (mecánica exacta 2026)
Toda cuenta **personal creada después del 13 de noviembre de 2023** debe, antes de publicar al público:
- Correr una **prueba cerrada (closed testing)** con **al menos 12 testers** que estén **inscritos (opted-in) de forma CONTINUA durante 14 días seguidos**.
- **El conteo es de opt-ins, no de instalaciones activas**, PERO Google mira la **interacción real**: el motivo #1 de rechazo en 2026 es _"insufficient testing engagement"_ (los testers instalaron pero casi no abrieron ni usaron la app). Es decir: no basta con que acepten; tienen que **usar** la app.
- Si un tester **se sale (opt-out) antes de completar los 14 días**, **no cuenta**, y los 14 días deben ser **consecutivos** (si hay un hueco, se reinicia para esa persona). Ojo: si alguien acepta y luego **solo desinstala** (sin salirse formalmente), normalmente sigue contando, pero un opt-out sí lo descarta. Por eso conviene tener **margen: junta 14–15, no 12 justos.**
- Cumplidos los 14 días, en el **Dashboard** de Play Console aparece el botón para **solicitar acceso a producción**. Hay que responder un **cuestionario de 3 bloques**:
  1. **Sobre tu prueba cerrada:** cómo reclutaste testers, qué tan comprometidos estuvieron, qué funciones usaron y un resumen del feedback.
  2. **Sobre tu app:** público objetivo, propuesta de valor y estimación de instalaciones del primer año.
  3. **Preparación para producción:** qué cambiaste gracias al feedback y por qué está lista.
- **Qué evalúa Google:** que la app se probó de verdad y con calidad, para frenar apps malas, malware y fraude. **Tiempo de respuesta:** normalmente **7 días o menos** (a veces más). Si rechaza, sigues probando y vuelves a postular.

### A.4 — Plan concreto para juntar los 12 testers (esta es tu gran ventaja)
El CEO ya tiene **usuarios reales**: úsalos. Es justo lo que el cuestionario premia (reclutamiento y engagement genuinos).

**Plan recomendado:**
1. Elige **14–15 personas** (margen sobre 12) entre tus **coaches gratuitos y alumnos más activos** de la PWA. Son ideales: entienden la app y la usan de verdad.
2. Pídeles su **correo Gmail** (el que usan en su celular Android). El tester **solo necesita un Gmail y aceptar un enlace**; no paga ni configura nada raro.
3. En Play Console → **Testing → Closed testing**, crea una pista (track), sube el primer build de EVA y **agrega esos correos** (por lista de correos o Grupo de Google).
4. Envíales el **enlace de opt-in** (Google lo genera). Instrucción para cada uno: "abre este enlace, acepta ser tester, instala EVA desde Play, y **úsala unos minutos cada día por 2 semanas**" (que registren un entrenamiento, una comida, un check-in). Ese uso diario es lo que Google mide.
5. **Amigos y familia** sirven como **relleno de respaldo** para llegar a 14–15: cada uno solo necesita un Gmail, aceptar el enlace e instalar. Pídeles también que abran la app algunas veces.
6. Marca en el calendario el **día 14**. Ese día entra al Dashboard y solicita **acceso a producción**; en el cuestionario cuenta la verdad: "reclutamos coaches y alumnos que ya usaban nuestra PWA, la usaron a diario, y su feedback fue X". Esa historia real es una postulación fuerte.

**Sobre las comunidades de intercambio de testers** (TestersCommunity, r/AndroidClosedTesting, Discords, apps de "test swap"): existen y se usan mucho; **no son un incumplimiento duro del reglamento**, pero **no son lo ideal**. Su engagement es bajo (gente que instala para cumplir, no para usar), y en 2026 Google endureció la detección: puede marcar cuentas de testers "sospechosas" (que prueban un volumen anormal de apps) y el rechazo por _bajo engagement_ es el más común. **Recomendación:** usa tus usuarios reales como base; deja el intercambio recíproco solo como último recurso para tapar un hueco, nunca como el grueso.

### A.5 — ¿Y si mañana quiero pasar a la cuenta de la empresa?
Sí se puede, y es una buena estrategia ("personal ahora, organización después"):
- Google permite **transferir una app entre dos cuentas de Play**. Se conservan **usuarios, estadísticas, reseñas, valoraciones, instalaciones y suscripciones** de la app.
- Requisitos: ambas cuentas activas; la cuenta destino (la de organización) paga su propio **USD 25** (reembolsable si luego cierras la original); se necesita un **transaction ID** de la cuenta destino. **Ojo:** las **pistas de prueba (test tracks) NO se transfieren**, hay que recrearlas; los pedidos/órdenes previos quedan en la cuenta original.
- Como EVA es **gratis y no monetiza en Play**, además existe la vía de **cambio de dueño/tipo de cuenta**: Google permite cambiar el titular de cuentas personales **que no monetizan**; las que monetizan quedan obligadas a la ruta de "transferir la app a una cuenta nueva". EVA está del lado fácil.
- **Traducción:** no te quedas encerrado. Puedes publicar hoy en personal y migrar a EVA Technology SpA cuando el D-U-N-S esté listo, sin perder tu base de usuarios ni tus reseñas.

---

## Opción B — Cuenta de ORGANIZACIÓN (EVA Technology SpA)

Elige esta si prefieres **saltarte la prueba de 12 testers desde el día uno** y no te importa esperar el D-U-N-S. Da un pelín más de formalidad en la ficha (aparece el nombre legal de la SpA).

### B.1 — Antes de empezar, ten a mano
1. **El número D-U-N-S de la empresa** (9 dígitos, de Dun & Bradstreet). **Obligatorio.**
   - **Primero revisa si EVA YA tiene uno**: muchas empresas ya lo tienen asignado. Úsalo de inmediato si aparece. Herramienta de búsqueda gratuita: **D-U-N-S Number Lookup** en dnb.com.
   - Si no existe: pídelo. **Gratis = hasta ~30 días hábiles.** Hay **opción pagada expedita (~8 días hábiles)** si tienes prisa. Chile está cubierto por D&B.
   - El **nombre legal y la dirección** en Google deben **coincidir exactamente** (carácter por carácter, "SpA" incluido) con el perfil D-U-N-S, o la verificación se rechaza.
2. **Documentos de la empresa** por si los piden: constitución/escritura, patente/licencia o registro tributario de EVA Technology SpA.
3. **Correo y teléfono corporativos** que revises (para OTP). Mejor un correo del dominio @eva-app.cl que un Gmail personal.
4. **Sitio web:** `https://eva-app.cl`.
5. **Tarjeta real** (no prepago) para los **USD 25** y **cuenta de Google con 2FA**.

### B.2 — Pasos de registro
1. Entra a **https://play.google.com/console** e inicia sesión con la cuenta de Google de la empresa.
2. **"Get started"** / "Crear cuenta de desarrollador".
3. En tipo de cuenta elige **"An organization or business"**. **No elijas personal.**
4. Llena los datos **tal como salen en el perfil D-U-N-S**: developer name (puede ser "EVA"), organization name (EVA Technology SpA), dirección, teléfono, sitio web y **número D-U-N-S**.
5. Ingresa datos de contacto y correo/teléfono públicos; verifica con los códigos **OTP**.
6. Paga el **fee único de USD 25**. Puede pedir un "desafío de depósito" o comprobante bancario.
7. Sube identidad del representante y documentos de empresa si los pide.
8. Envía. Estado **"verificación pendiente"**: la revisión de organización tarda de días a varias semanas. Google avisa por correo.

### Qué copiar y a quién (aplica a ambas opciones)
- **No hay que copiarle nada técnico a Claude ahora.** Lo que el equipo necesita es que **la cuenta quede creada y aprobada**.
- Cuando Google la apruebe, **avisa por el chat** ("cuenta de Play aprobada" + si es personal u organización). Después se conecta con Expo/EAS para subir la app.

### Si algo sale mal
- **(B) No tienes D-U-N-S:** no puedes terminar el registro de organización sin él. Búscalo con el Lookup; si no existe, pídelo hoy (gratis ~30 días, o expedito pagado ~8 días). Mientras tanto, **puedes arrancar por la Opción A** y migrar después.
- **(B) "El nombre no coincide" / rechazo:** el nombre legal y la dirección en Google no son idénticos al perfil D-U-N-S. Corrígelos carácter por carácter.
- **(A) Rechazo de acceso a producción por "bajo engagement":** tus testers instalaron pero no usaron la app. Pídeles que la abran a diario unos días más y vuelve a postular.
- **(Ambas) Tarjeta rechazada:** no uses prepago ni virtual; usa crédito/débito normal.
- **(Ambas) Elegiste mal el tipo de cuenta:** el tipo no se cambia con un clic. Si te equivocaste, no sigas pagando; avisa por el chat para evaluar (recuerda que la app sí se puede transferir después, ver A.5).

### RECOMENDACIÓN
**Ve por la Opción A (personal) ahora.** Razones:
1. EVA es **gratis y sin compras in-app** → con cuenta personal la ficha muestra la marca **"EVA"** y **no** expone tu dirección; el costo de imagen es mínimo.
2. Te **evita esperar el D-U-N-S** (hasta ~30 días de burocracia que hoy frena todo).
3. Tienes **la ventaja perfecta para los 12 testers**: coaches y alumnos reales que ya usan la PWA → cumples los 14 días con uso genuino y una postulación de producción fuerte.
4. **No te encierra**: cuando quieras, transfieres la app a EVA Technology SpA (organización) conservando usuarios y reseñas.

En paralelo, **dispara HOY la búsqueda/solicitud del D-U-N-S** (primero el Lookup por si ya existe). Así, si más adelante prefieres la formalidad de la organización, la migración estará lista sin haber perdido tiempo de lanzamiento.

_Fuentes: Play Console Help — Choose a developer account type (https://support.google.com/googleplay/android-developer/answer/13634885), Required information to create a Play Console developer account (https://support.google.com/googleplay/android-developer/answer/13628312), Contact information requirements for developer accounts (https://support.google.com/googleplay/android-developer/answer/10840893), View and manage your developer account information — Play Console Requirements-verified accounts (https://support.google.com/googleplay/android-developer/answer/13634081), App testing requirements for new personal developer accounts (https://support.google.com/googleplay/android-developer/answer/14151465), Transfer apps to a different developer account (https://support.google.com/googleplay/android-developer/answer/6230247), Transferring ownership of a Play Console developer account (https://support.google.com/googleplay/android-developer/answer/16909862); Dun & Bradstreet — Get a D-U-N-S (https://www.dnb.com/en-us/smb/duns/get-a-duns.html) y D-U-N-S Number Lookup (https://www.dnb.com/en-us/smb/duns/duns-lookup.html)._

---

## Tarea 3 — Crear cuenta Sentry gratis + proyecto React Native

**Objetivo:** crear una cuenta gratis en Sentry, un proyecto llamado **eva-mobile**, y pegarle a Claude el **DSN** y el **slug de la organización**.
**Tiempo estimado:** 10 minutos.

### Qué es Sentry en cristiano
Sentry es un panel web que **te avisa cuando la app se rompe** en el celular de un usuario: te muestra qué error pasó, en qué pantalla y en qué modelo de teléfono. Sin esto, solo te enteras cuando alguien reclama. El plan gratis alcanza para arrancar: incluye hasta **5.000 errores por mes** (más que suficiente al principio).

### Pasos
1. En el navegador, entra a **https://sentry.io/signup/**.
2. Crea la cuenta. Puedes usar **"Sign up with Google"** (con la cuenta de la empresa) o correo + contraseña. Completa lo que pida y confirma tu correo si te llega un email de verificación.
3. En el primer ingreso, Sentry te pide crear una **organización** (organization). Ponle un nombre reconocible, por ejemplo **EVA** o **EVA Technology**.
   - **Qué es el "slug":** es la versión corta del nombre que Sentry usa en la dirección web (URL), en minúsculas y sin espacios. Por ejemplo, si la organización se llama "EVA Technology", el slug podría ser `eva-technology`. **Lo ves en la barra de direcciones del navegador:** cuando estás dentro de Sentry, la URL se ve como `https://<slug>.sentry.io/...` o `https://sentry.io/organizations/<slug>/...`. Ese trozo `<slug>` es lo que necesitamos.
   - También lo puedes ver/confirmar después en **Settings → Organization** (Ajustes → Organización), campo "Organization Slug".
4. Sentry te lleva a crear un proyecto (o busca el botón **"Create Project"**, arriba a la derecha en la sección Projects).
5. En la lista de plataformas, busca y elige **"React Native"** (puedes escribir "react native" en el buscador de la lista).
6. Cuando pida el **nombre del proyecto** ("Project name"), escribe exactamente:
   ```
   eva-mobile
   ```
   y confirma con el botón **"Create Project"**.
7. Sentry muestra una pantalla de instrucciones ("onboarding") con un bloque de código. Dentro de ese código aparece el **DSN**: es una URL larga que se ve así:
   ```
   https://xxxxxxxxxxxx@oNNNNNN.ingest.sentry.io/MMMMMM
   ```
   Cópiala completa.
   - **Si ya te saltaste esa pantalla y no copiaste el DSN:** entra a **Settings → Projects → eva-mobile → Client Keys (DSN)** (Ajustes → Proyectos → eva-mobile → Client Keys). Ahí, bajo la sección "SDK Setup", está el DSN de nuevo. Cópialo.

### Qué copiar y a quién
Pégale a Claude en el chat **dos cosas**, cada una etiquetada para que no se confundan:
- **DSN:** la URL larga `https://...@o....ingest.sentry.io/...` del paso 7.
- **Slug de la organización:** el trozo corto en minúsculas del paso 3 (por ej. `eva-technology`).

### Si algo sale mal
- **No encuentras el DSN:** ve a **Settings → Projects → eva-mobile → Client Keys (DSN)**. Siempre está ahí, aunque cierres la pantalla de bienvenida.
- **Creaste dos organizaciones o dos proyectos:** no pasa nada grave, pero dile a Claude cuál es el bueno (el proyecto `eva-mobile`) para no mezclar los slugs/DSN.
- **Confundes DSN con slug:** el **DSN** es la URL larga con `@` y `ingest.sentry.io`. El **slug** es la palabra corta en minúsculas de la dirección web. Si dudas, pega ambos igual y aclara cuál es cuál.

_Fuentes: Sentry — React Native (https://docs.sentry.io/platforms/react-native/), Sentry Signup (https://sentry.io/signup/), Expo — Using Sentry (https://docs.expo.dev/guides/using-sentry/)._

---

## Checklist de las 3 entregas

Cuando termines, deberías poder marcar esto y pegarle a Claude lo que corresponda:

- [ ] **Tarea 1 — SHA256:** pegué en el chat la línea completa del `SHA256 Fingerprint` (los pares de números/letras con `:`).
- [ ] **Tarea 2 — Google Play:** creé la cuenta de desarrollador (recomendado: **personal**, con nombre visible "EVA"), pagué los USD 25, y avisé por el chat qué tipo elegí y el estado (pendiente / testers en curso / aprobada). _(Personal: ~2–3 semanas por la prueba de 12 testers/14 días. Organización: depende del D-U-N-S, hasta ~30 días.)_ Además disparé la búsqueda/solicitud del **D-U-N-S** en paralelo (primero el Lookup por si EVA ya tiene uno).
- [ ] **Tarea 3 — Sentry:** creé el proyecto `eva-mobile` y pegué en el chat el **DSN** (URL larga) y el **slug** de la organización.
