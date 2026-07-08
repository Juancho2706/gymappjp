# Guía CEO — 3 tareas pendientes (RN parity)

Esta guía está escrita para hacerse **sin saber nada de programación**: cada paso es un solo clic o un solo comando, explicado como si fuera la primera vez. Léela de arriba a abajo y no te saltes nada.

Qué desbloquea cada tarea:
- **Tarea 1 (SHA256)** te da la "huella digital" de la app Android; sin ella el login con Google y otros servicios rechazan la app.
- **Tarea 2 (Google Play)** te da la cuenta de empresa para publicar la app en la tienda de Android; sin ella no hay app en el celular de nadie.
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

## Tarea 2 — Crear la cuenta de Google Play Console como ORGANIZACIÓN

**Objetivo:** dejar creada (y en proceso de verificación) la cuenta de desarrollador de **EVA Technology SpA** en Google Play, pagando el fee de USD 25.
**Tiempo estimado:** 30–45 minutos de llenado de formulario, **pero la verificación completa tarda días o incluso semanas** (y si no tienes número D-U-N-S, obtenerlo puede tomar hasta 30 días aparte). Empieza HOY.

### Por qué ORGANIZACIÓN y no personal (importante, léelo)
Google tiene dos tipos de cuenta:
- **Personal** (para hobbistas/estudiantes): las cuentas personales **nuevas** (creadas después del 13 de noviembre de 2023) están obligadas a hacer una "prueba cerrada" con **mínimo 12 personas de prueba (testers) que se mantengan inscritas durante 14 días seguidos** antes de poder publicar la app al público. Es un dolor de cabeza y un retraso enorme.
- **Organización** (para empresas): al ser una empresa legalmente constituida, **quedas EXENTO de esa regla de los 12 testers / 14 días**. Además, algunas categorías (salud, finanzas, etc.) exigen cuenta de organización.

Como EVA Technology SpA es una empresa real constituida en Chile, **te conviene la de organización**: te salta la barrera de los testers y da más confianza. Ojo: el tipo de cuenta **no se puede cambiar fácilmente después**, así que elige "organización" desde el principio.

### Antes de empezar, ten a mano
1. **El número D-U-N-S de la empresa.** Es un identificador de 9 dígitos que da la empresa Dun & Bradstreet y que Google usa para verificar que EVA existe. **Es obligatorio para cuentas de organización.**
   - Averigua primero si EVA **ya tiene uno** (muchas empresas ya lo tienen). Búscalo/solicítalo gratis en el sitio oficial de Dun & Bradstreet.
   - **Obtenerlo es gratis pero puede tardar hasta ~30 días.** Si EVA no lo tiene, pídelo YA, en paralelo, antes de seguir con Google. Chile está cubierto por Dun & Bradstreet.
   - El **nombre legal y la dirección** que registres en Google **deben coincidir exactamente** con lo que figura en el perfil D-U-N-S de la empresa. Si no coinciden, la verificación se rechaza.
2. **Documentos de la empresa** (Google puede pedir alguno): certificado/escritura de constitución, patente/licencia comercial, o registro tributario de EVA Technology SpA.
3. **Un correo de contacto y un teléfono** que puedas revisar (para recibir códigos de verificación). Usa un **correo corporativo del dominio de la empresa** (por ejemplo, algo @eva-app.cl) en vez de un Gmail personal: da más confianza y evita rechazos.
4. **El sitio web de la empresa:** `https://eva-app.cl`.
5. **Una tarjeta de crédito o débito real** (Visa/Mastercard/American Express) para el pago de USD 25. **No sirven tarjetas prepago ni la mayoría de las virtuales.**
6. **Una cuenta de Google** para la empresa, con **verificación en 2 pasos activada**. Si vas a crear una nueva para EVA, hazlo antes.

### Pasos de registro
1. En el navegador, entra a **https://play.google.com/console** e inicia sesión con la cuenta de Google de la empresa.
2. Haz clic en el botón para empezar el registro de desarrollador (aparece como **"Get started"** / "Empezar" / "Crear cuenta de desarrollador").
3. Cuando pregunte el tipo de cuenta ("What type of account is this?" / "Elige un tipo de cuenta"), elige **"An organization or business"** (Una organización o empresa). **No elijas "Yourself / personal".**
4. Llena los datos de la organización tal como salen en el perfil D-U-N-S:
   - **Developer name** (nombre público que verán los usuarios; puede ser "EVA").
   - **Organization name** (nombre legal exacto: EVA Technology SpA).
   - **Dirección** de la organización.
   - **Teléfono** de la organización.
   - **Sitio web:** `https://eva-app.cl`.
   - **Número D-U-N-S** (los 9 dígitos).
5. Ingresa los **datos de contacto** (nombre, correo y teléfono de contacto) y el **correo/teléfono públicos** del desarrollador. Google enviará un **código de un solo uso (OTP)** al correo y al teléfono: escribe cada código para **verificarlos**. Estos datos deben seguir funcionando mientras la cuenta exista.
6. Continúa hasta la sección de **pago**. Paga el **fee único de USD 25** con la tarjeta. **Es un pago de una sola vez, para toda la vida de la cuenta** (a diferencia de Apple, que cobra todos los años). Puede que Google te pida un "desafío de depósito" o subir un comprobante bancario para validar la tarjeta/pago.
7. Es posible que te pida **verificar la identidad del representante** (subir foto de un documento de identidad con tu nombre legal) y/o **documentos de la empresa** (constitución, licencia o registro tributario). Súbelos si los pide.
8. Envía la solicitud. Verás un estado tipo **"verificación pendiente"**. **Ahora toca esperar:** la revisión suele tardar de un par de días a varias semanas para organizaciones. Google avisa por correo cuando esté aprobada.

### Qué copiar y a quién
- De esta tarea **no hay que copiarle nada técnico a Claude ahora mismo.** Lo que Claude/el equipo necesita es que **la cuenta quede creada y aprobada**.
- Cuando Google apruebe la cuenta, **avisa por el chat** ("cuenta de Play aprobada"). Más adelante se conectará esa cuenta con Expo/EAS para subir la app.

### Si algo sale mal
- **No tienes número D-U-N-S:** no puedes terminar el registro de organización sin él. Pídelo gratis en Dun & Bradstreet HOY (tarda hasta ~30 días). Solo si tu región no estuviera cubierta, Google ofrece un método alternativo por soporte; Chile sí está cubierto, así que usa el D-U-N-S.
- **"El nombre no coincide" / verificación rechazada:** el nombre legal y la dirección que pusiste en Google no son idénticos a los del perfil D-U-N-S. Corrígelos para que coincidan **carácter por carácter** (mismas mayúsculas, "SpA", etc.).
- **La tarjeta es rechazada:** no uses prepago ni tarjeta virtual; usa una tarjeta de crédito/débito normal a nombre de la empresa o del representante legal.
- **Elegiste "personal" por error:** el tipo de cuenta no se cambia fácil. Si te pasó, no sigas pagando; avisa para evaluar crear una cuenta nueva de organización.

_Fuentes: Play Console Help — Choose a developer account type (https://support.google.com/googleplay/android-developer/answer/13634885), Required information to create a Play Console developer account (https://support.google.com/googleplay/android-developer/answer/13628312), App testing requirements for new personal developer accounts (https://support.google.com/googleplay/android-developer/answer/14151465), Get started with Play Console (https://support.google.com/googleplay/android-developer/answer/6112435); Dun & Bradstreet (https://www.dnb.com)._

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
- [ ] **Tarea 2 — Google Play:** creé la cuenta de **organización** (EVA Technology SpA), pagué los USD 25, y avisé por el chat el estado (pendiente o aprobada). _(La aprobación puede tardar días/semanas; el D-U-N-S, si faltaba, hasta ~30 días.)_
- [ ] **Tarea 3 — Sentry:** creé el proyecto `eva-mobile` y pegué en el chat el **DSN** (URL larga) y el **slug** de la organización.
