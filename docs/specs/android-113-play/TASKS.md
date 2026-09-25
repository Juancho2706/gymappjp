---
status: active
owner: mobile-release
last_verified: "2026-09-25 @ a2a5e7b3"
canonical: false
---

# TASKS — Android 1.1.3: limpiar los dos avisos de Play sin romper nada

Ver [SPEC](SPEC.md) y [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**
Etiquetas: **[agente]** código/CI, **[owner]** Play Console, dispositivo o decisión.
Push, deploy, OTA y envíos a Play: solo con OK explícito del owner en la sesión.

Orden duro: **W0 ∥ W1 → W2 → W3**; **W4** puede escribirse en paralelo a W3, pero **W5 no sube a
Play hasta que A esté publicada**; W6 cierra.

---

## W0 · Prerrequisitos (antes de enviar A a producción)

- [x] **W0.1 [owner] Respuestas Q1–Q4** (25-09): D5 `/coach/subscription` fuera de ambas, D6 directo
      a producción sin pista de prueba, D7 `/privacidad` completa, D8 Meta igual que iOS.
- [x] **W0.2 [agente → owner] `/privacidad` completa (D7)** — OK del owner 25-09; en producción con `89bd9d9c` (verificado por curl: fecha 25-09, Meta, Sentry, «Borrar ID de publicidad», sin «No usamos cookies de rastreo») (`apps/web/src/app/privacidad/page.tsx`): §5
      suma Meta Platforms (medición de anuncios: web y app), Functional Software/Sentry (errores de
      la app), Flow (pagos) y Google (inicio de sesión); §4 y §9 explican identificadores
      publicitarios y eventos de app (instalación, apertura, alta de coach; nunca datos de salud,
      correo ni nombre); cómo desactivarlo (Android: Ajustes → Google → Anuncios → «Borrar ID de
      publicidad»; iOS: ATT; web: banner de cookies); §9 deja de decir «No usamos cookies de rastreo
      de terceros». `LAST_UPDATED` al día. **El owner aprueba el texto** antes del deploy.
      Verificación: `pnpm typecheck` + preview de Vercel; deploy a producción **antes** de W2.3.
- [x] **W0.3 [owner] Play Console → Contenido de la app → ID de publicidad = Sí**, fines Analítica y
      Publicidad o marketing. Hecho 25-09 desde el navegador del owner (antes decía «No»); guardado sin
      enviar a revisión: viaja con el envío de A.
- [x] **W0.4 [owner] Play Console → Seguridad de los datos:** hecho 25-09 desde el navegador del owner
      (con su permiso explícito): «Interacciones con la aplicación» nueva (recogida + compartida, no
      temporal, necesaria, Análisis + Publicidad); «IDs de dispositivo» pasa a compartida (Análisis +
      Publicidad) y su recogida suma Publicidad (ya tenía Análisis + Comunicaciones). Guardado sin
      enviar a revisión. agregar «Identificadores del
      dispositivo u otros» y «Actividad en la app → Interacciones con la app», recopilados **y
      compartidos**, fines Analítica + Publicidad o marketing, cifrados en tránsito. Guardar como
      borrador; se envía junto con A.
- [x] **W0.5 [owner] Permiso de la cuenta de servicio:** el owner lo marcó 25-09 (4 → 7 permisos). verificado 25-09: `eas-submit-eva@gplayeva.iam.gserviceaccount.com`
      tiene «Lanzar aplicaciones en canales de pruebas» y «Gestionar canales de pruebas», **no** «Lanzar a
      producción…». Falta que el owner lo marque (cambio de permisos: no lo hace el agente). Play Console → Usuarios y permisos → la
      cuenta de servicio de CI tiene «Publicar en producción…» (hoy sube a alpha). Sin él, W2.3
      falla y el AAB se sube a mano el mismo día.
- [x] **W0.6 [owner] Publicación gestionada:** confirmado 25-09: desactivada (A sale sola al
      aprobarse). Palanca opcional para B: encenderla solo durante B (W5.2).

- [ ] **W0.7 [owner] Declaración «Permisos de servicios en primer plano» pendiente** (Contenido de la
      app → Requiere atención; plazo vencido en ene 2024). Se resuelve por la vía «quitar el permiso»:
      A ya no trae `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. **No** declarar un tipo que la app no usa. Si al
      subir A Play la sigue exigiendo por la 86 activa en alpha, pausar alpha (adelanta W3.3).

## W1 · Código del binario A

- [x] **W1.1 [agente] Plugin** `apps/mobile/plugins/with-android-strip-audio-services.js` según
      PLAN §2.2 (cabecera con el porqué y el link a SPEC §1; exporta `stripAudioServices`).
- [x] **W1.2 [agente] `app.json`:** registrar el plugin; `android.blockedPermissions:
      ["android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"]`; `android.permissions` intacto.
      Borrar los 2 `intentFilters` de `/coach/subscription` (D5, PLAN §2.4).
- [x] **W1.3 [agente] Test** `tests/mobile/android-strip-audio-services.test.ts` (PLAN §2.3.1).
- [x] **W1.4 [agente] Script** `scripts/mobile/verify-android-aab.mjs` + test de sus listas
      `tests/mobile/verify-android-aab.test.ts` (PLAN §2.3.2). Contrato: `node
      scripts/mobile/verify-android-aab.mjs --manifest <salida de bundletool dump manifest>`; sale 1
      con la lista de violaciones, 2 sin argumentos; escribe el resumen en `$GITHUB_STEP_SUMMARY` si
      existe. (B le suma `--aab` / `--min-obfuscation`.)
- [x] **W1.5 [agente] `mobile-build.yml`:** paso «Guard manifest del AAB» (solo `production`,
      después de «Build Android», antes de «Submit AAB»): descarga bundletool con versión y SHA-256
      fijos, `dump manifest`, corre el script. Input `android_track` (`alpha` default |
      `production`) y `eas.json` → `submit.production-store` (`extends: production`,
      `android.track: production`, `android.releaseStatus: completed`). Actualizar el comentario del
      paso de submit (hoy dice «closed testing / Alpha»).
- [x] **W1.6 [agente] App Links (D5):** `applinks-claims.test.ts` (Android y AASA sin
      `/coach/subscription`), AASA en `apps/web/public/.well-known/apple-app-site-association` y el
      comentario de `OpenInAppCard.tsx` (PLAN §2.4). El AASA viaja con el deploy web de W0.2.
- [x] **W1.7 [agente] Gates proporcionales:** `vitest run` de los 5 archivos de PLAN §6;
      `eslint` de los archivos tocados; `expo config --type introspect` (PLAN §2.5) mostrando los 2
      `remove` y el permiso bloqueado; `pnpm --filter @eva/mobile exec expo install --check`.
      Sin `tsc` completo (no hay TS de app tocado) salvo que el owner lo pida.
      **Resultado 25-09:** vitest 6 archivos / 51 tests verdes (+ re-corridas del guard 9/9 y del
      plugin 7/7); eslint 0 errores / 0 avisos; `expo config --type introspect` muestra los 2
      `<service tools:node="remove">`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK [remove]`, `AD_ID` y los
      intent filters sin `/coach/subscription`; `expo install --check` al día; `pnpm typecheck` web
      0 errores (antes hubo que regenerar los tipos de rutas con `next typegen`: el
      `.next/dev/types/routes.d.ts` estaba corrupto, gotcha conocido). `eas.json` validado con
      `@expo/eas-json` (`production-store` ⇒ track production, releaseStatus completed).
- [x] **W1.8 [agente] Commit** en `rnmobiledenuevo` con rutas explícitas. **Push / PR a `master`
      solo con OK del owner.** CI del PR verde (`ci.yml`, `Mobile Integration CI`). **25-09:** push directo a
      `master` con OK del owner (`89bd9d9c`); CI y Mobile Integration CI verdes; deploy de Vercel OK; AASA sin
      `/coach/subscription`.

## W2 · Build y producción de A (directo, D6)

Precondición: W0.2–W0.6 hechos y el deploy web (privacidad + AASA) en producción.

- [x] **W2.1 [agente] Preflight OTA:** `eas update:list --branch production --json` — registrar el
      último grupo Android de runtime 1.1.3 (hoy `4fea95fe`, viejo, de `90d7907`) y el último de
      1.1.2. `eas build:version:get -p android` = 86.
- [x] **W2.2 [agente, con OK] OTA de alineación, ANTES del binario:** 25-09 grupo
      `0ef6dfe1-e86e-4fd2-a7b4-45e8aad493f3` (run 36184716825, verde), runtime 1.1.3 android. `mobile-ota.yml`
      `platform=android` desde el commit que se va a compilar, mensaje «alineación OTA Android 1.1.3
      con el binario 87». Hoy no hay ningún Android 1.1.3 instalado ⇒ no llega a nadie; deja de ser
      `4fea95fe` lo último del canal para Android 1.1.3. Verificar con `eas update:list`.
- [x] **W2.3 [agente, con OK] Build + submit a producción:** 25-09 run 36184729637 verde: guard «Sin errores»
      y sin avisos (1.1.3 / versionCode 87, 15 servicios, 3 receptores de reinicio, AD_ID sí); `eas submit`
      perfil `production-store` → track production, status COMPLETED (submission `15072e5c`). `gh workflow run mobile-build.yml
      --ref master -f app=mobile -f platform=android -f profile=production -f submit_android=true
      -f android_track=production`. Guard del AAB verde; anotar run, versionCode (esperado 87) y la
      versión resuelta de `facebook-android-sdk` que imprime Gradle.
- [ ] **W2.4 [owner] Play Console:** la versión 87 está en revisión en Producción; en su panel de
      la versión **P1 ya no figura** (si figura: avisar, el guard no debería haberlo dejado pasar).
      Los cambios de ID de publicidad y Seguridad de los datos van en el mismo envío.
- [ ] **W2.5 [owner, opcional] QA durante la revisión:** Explorador de app bundles → 87 →
      «Descargar APK universal firmado», instalar encima de 1.1.2 y recorrer la lista de W2.6.
      Si algo falla antes de la aprobación: avisar; un build corregido reemplaza al que está en
      revisión.
- [ ] **W2.6 [owner] Smoke tras la publicación** (actualizar desde Play **encima** de 1.1.2, no
      instalación limpia; Android 14+ y, si hay, 12–13):
  - [ ] Arranca, sesión conservada (no pide login de nuevo), marca/colores correctos.
  - [ ] Cronómetro: 4 timbres, tick 3-2-1, tono del sistema, volumen; silencio in-app respeta.
  - [ ] Descanso con la app en segundo plano: notificación en vivo con botones; en pantalla bloqueada.
  - [ ] Reiniciar el teléfono ⇒ recordatorios/notificaciones programadas siguen llegando; push llega.
  - [ ] Login email + Google (cerrar sesión y volver a entrar); biometría si está activa.
  - [ ] Salud Conectada (conectar, leer pasos); sensor BLE si hay a mano.
  - [ ] Cámara y escáner de código de barras; galería/foto de progreso.
  - [ ] Share Entreno: generar tarjeta, guardar en galería, compartir a Instagram/WhatsApp.
  - [ ] Video de técnica de un ejercicio (WebView).
  - [ ] App Links: `https://www.eva-app.cl/c/<coach>/login` desde WhatsApp abre la app;
        `…/c/<coach>` pelado termina en la app o en el login web (sin error); `…/c/<coach>/dashboard`
        abre la **web** (arreglo «Vive tu app»); `/reset-password` desde el correo abre la app;
        un CTA de correo de venta a `/coach/subscription` abre la **web** (D5), en Android y en iPhone.
  - [ ] Meta: Administrador de eventos → «Probar eventos» muestra `fb_mobile_activate_app` del
        device Android (sin crear cuentas nuevas: contaminan el píxel).

## W3 · Después de A

- [ ] **W3.1 [agente] 48 h de vigilancia:** Sentry `eva-mobile` filtrado por release 1.1.3 (87) y
      Play → Android vitals: sin crashes nuevos. Reporte al owner.
- [ ] **W3.2 [owner] Panel de la versión de producción:** P1 desaparecido; captura para el registro.
- [ ] **W3.3 [owner] Pistas de prueba:** alpha (y prueba interna si tiene algo) pausadas o con 87,
      para que ningún artefacto activo ≤ 86 siga cargando los servicios.
- [ ] **W3.4 [agente] OTA de transición:** mientras `eas channel:insights --channel production
      --runtime-version 1.1.2` muestre usuarios Android, cada OTA sale doble (runtime 1.1.3 desde
      `master` para android e iOS + tag `ota/1.1.2-*` para 1.1.2). Con Android 1.1.2 ≈ 0 ⇒ retirar
      1.1.2 y actualizar la tabla de `docs/operations/MOBILE_RELEASES_OTA.md`.

## W4 · Código del binario B (R8)

- [ ] **W4.1 [agente] `expo-build-properties`** según PLAN §3.1; `extraProguardRules` según PLAN
      §3.2, con un comentario por bloque que diga por qué existe cada keep.
- [ ] **W4.2 [agente] Confirmar reglas de `expo-notifications`:** ¿el `expo-module-gradle-plugin`
      aplica su `proguard-rules.pro` como consumer? Si no, sumar
      `-keep class expo.modules.notifications.** { *; }` a `extraProguardRules`. Dejar la evidencia
      en el commit.
- [ ] **W4.3 [agente] Sentry `experimental_android`** según PLAN §3.1. `expo config --type
      introspect`: `app/build.gradle` con `apply plugin: "io.sentry.android.gradle"` y el bloque
      `sentry { … }` sin `autoInstallation`.
- [ ] **W4.4 [agente] Piso de ofuscación en CI** (`verify-android-aab.mjs --min-obfuscation 30`,
      PLAN §3.4.1) + test; `mobile-build.yml` pasa el flag cuando `app.json` tiene
      `enableMinifyInReleaseBuilds: true`. Falla también si el AAB no trae mapping.
- [ ] **W4.5 [agente] Gates** como W1.7 + commit. Push solo con OK.

## W5 · Build, medición y producción de B (directo, D6)

- [ ] **W5.1 [agente, con OK] Build + submit de B** (`android_track=production`), **solo con A
      publicada** y 48 h limpias (W3.1). Guard y piso de ofuscación verdes; anotar versionCode
      (esperado 88) y el proxy.
- [ ] **W5.2 [owner] Explorador de app bundles** (versión 88): ofuscación, optimización y reducción.
      Meta ≥ 35 % las tres; < 25 % en alguna ⇒ avisar (el aviso de Play sigue y hay que aflojar keeps
      en un binario siguiente). Si el owner encendió «Publicación gestionada» (W0.6), acá decide
      publicar tras W5.3.
- [ ] **W5.3 [owner] Matriz de QA por librería — muy recomendada DURANTE la revisión** con el APK
      universal firmado de la versión 88 (instalado encima de A); si no, tras la publicación:
  - [ ] Todo W2.6.
  - [ ] Biometría: activar, bloquear y desbloquear (SecureStore, el crash conocido).
  - [ ] Health Connect: pedir permisos desde cero (desinstalar permisos antes) y leer.
  - [ ] BLE: escanear y conectar el sensor de FC; desconectar.
  - [ ] Skia/Share Entreno, view-shot, media-library (guardar), share a 3 apps.
  - [ ] Image picker + image manipulator (foto de progreso recortada); cámara/escáner.
  - [ ] expo-print (exportar dossier/plan a PDF); document-picker si hay flujo.
  - [ ] WebView de video; `expo-image` con fotos remotas; SVG/íconos; animaciones (reanimated).
  - [ ] Notificaciones: local, push, acción desde la notificación de descanso, tras reinicio.
  - [ ] OTA: con el siguiente OTA de runtime 1.1.3, confirmar que B lo aplica al reabrir.
  - [ ] Deep links (lista de W2.6) y login Google.
  - [ ] Cualquier crash ⇒ Sentry lo muestra **desofuscado** (prueba de que el mapping subió) ⇒
        keep rule ⇒ W4 ⇒ build nuevo.
- [ ] **W5.4 [agente] Sentry → Settings → Debug Files** de `eva-mobile`: existe el mapping de
      ProGuard del build 88.
- [ ] **W5.5 [agente] 48 h de vigilancia** tras la publicación (como W3.1) + panel de la versión:
      P2 desaparecido.

## W6 · Cierre

- [ ] **W6.1 [agente] Docs:** `MOBILE_RELEASES_OTA.md` (guard del AAB, R8 activo, keeps, cómo leer
      el explorador de bundles, fila Android 1.1.3); `docs/status/CURRENT.md`; `docs/README.md`
      mueve la spec a `done`; `pnpm docs:check`.
- [ ] **W6.2 [agente] Memoria** del proyecto actualizada (releases/tiendas y la de este tren).

---

## Juicio del jefe (2026-09-25)

Ataque propio al plan de ayer antes de entregarlo. Lo que cambió respecto de la memoria del 25-09:

1. **BLOQUEA → W0.2.** `/privacidad` no nombra a Meta (ni a Sentry, Flow o Google) y su §9 dice «No
   usamos cookies de rastreo de terceros». Con `AD_ID` + «compartido con Meta» en Seguridad de los
   datos, la política enlazada en Play contradice la declaración: riesgo de rechazo o de violación
   de la política de Datos del usuario, y queda mal parada frente a la Ley 21.719 (01-12).
2. **BLOQUEA → W2.2.** Ya existe un OTA **Android** de runtime 1.1.3 (`4fea95fe`, de `90d7907`,
   anterior a «Vuelta nueva» y a «Clave temporal»). Hoy no llega a nadie porque no hay binario
   Android 1.1.3; el día que salga A será «lo último» del canal para Android 1.1.3. expo-updates
   no debería aplicar un OTA más viejo que el bundle embebido, pero no se deja una bomba así:
   se publica el commit del binario antes de promover.
3. **MEJORA → Q1 ⇒ D5 (sale de ambas).** El App Link `/coach/subscription` convierte los CTA de los correos de venta en
   un callejón sin salida para coaches con EVA en Android: abre «Mi plan», que no puede tener
   camino de pago. Lo mismo pasa hoy en iOS por el AASA. Se decide antes de cerrar `app.json`.
4. **MEJORA → Q4 ⇒ D8 (se mantiene y se declara).** El `fb_mobile_activate_app` automático sale de **todos** los Android (alumnos
   incluidos) con el ID de publicidad y sin hoja de consentimiento. La cabecera de
   `lib/meta-sdk.ts` promete «Los alumnos no emiten ni un solo evento de Meta» para eventos de
   negocio, pero el automático no distingue rol. El owner eligió declararlo (W0.4, W0.2).
5. **MEJORA → W1.4/W1.5.** La verificación del manifest era manual (`bundletool` a mano en A5). Pasa
   a guard de CI **antes del submit**: un AAB con los servicios o sin los receptores de reinicio no
   llega a Play.
6. **MEJORA → PLAN §3.2.** Las keeps de B pasan de «las 2 conocidas + arreglar lo que rompa» a
   «frontera JS↔nativo intacta»: con producción 100 % directo, una ruta rara no cubierta por el QA
   es un crash sin OTA posible. Es código chico, así que la métrica debería quedar holgada sobre el
   25 %; lo frena un piso en CI antes del submit y se confirma en el explorador de bundles.
7. **MEJORA → W3.3.** Play evalúa «artefactos activos» de todas las pistas: si alpha sigue con 86,
   el aviso puede seguir listado aunque producción esté limpia.
8. **Dato nuevo:** el umbral de Play son **tres** métricas (ofuscación, optimización y reducción),
   no solo ofuscación; la meta de B se fija ≥ 35 % en las tres.
9. **Consecuencia de D6 (directo a producción, sin pista de prueba).** Lo que antes frenaba en la
   pista de QA pasa a CI **antes del submit**: guard del manifest (A y B) y piso de ofuscación con
   el mapping del AAB (B). El QA en teléfono se hace con el APK universal firmado del explorador de
   app bundles mientras Google revisa (opcional en A, muy recomendado en B), y un build corregido
   reemplaza al que está en revisión. El OTA de alineación (W2.2) sube **antes** de compilar,
   porque ya no hay una pista intermedia que dé tiempo.
