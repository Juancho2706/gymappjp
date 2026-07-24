---
status: active
owner: mobile-release
last_verified: "2026-07-21 @ f5301858"
canonical: true
---

# Releases móviles y OTA

Política operativa para `apps/mobile`. La configuración ejecutable prevalece:

- `apps/mobile/app.json`: identidad nativa, `expo-updates` y `runtimeVersion`;
- `apps/mobile/eas.json`: perfiles, canales y firma;
- `.github/workflows/mobile-build.yml`: build y submit manuales;
- `apps/mobile/lib/ota.ts`: descarga y aplicación en runtime.

`apps/enterprise` no está cubierto por esta guía: conserva identificadores EAS placeholder y no tiene `expo-updates` configurado.

## Estado efectivo

- Expo SDK 54, React Native 0.81 y Expo Router 6.
- `runtimeVersion.policy = appVersion`: un OTA solo llega a binarios con la misma versión compatible.
- EAS CLI no está fijado a una versión exacta: `eas.json` exige `>= 14.0.0` y GitHub Actions instala `latest`.
- Solo `staging` y `production` declaran un canal OTA.
- `prodpreview` y `previewv2` generan binarios internos, pero no declaran canal; no prometer ni publicar OTA para esos binarios sin configurar primero un canal explícito.
- El build ocurre localmente dentro de GitHub Actions con `eas build --local`; no consume créditos de EAS Build.

| Perfil | Uso | Android | iOS | OTA |
|---|---|---|---|---|
| `development` | cliente de desarrollo/simulador | interno | simulador | no configurado |
| `staging` | QA interna | APK | IPA firmada (`distribution=store`) | canal `staging` |
| `prodpreview` | QA contra backend live | APK | IPA firmada para distribución | sin canal |
| `previewv2` | QA de la rama móvil | APK | IPA firmada para distribución | sin canal |
| `production` | stores | AAB | IPA | canal `production` |

## Elegir OTA o binario nuevo

Publicar OTA únicamente cuando todo el cambio sea JavaScript/TypeScript o assets cargados por el bundle y funcione con las capacidades nativas ya instaladas.

Forzar build nuevo si cambia cualquiera de estos elementos:

- Expo SDK, React Native o una dependencia con código nativo;
- plugins, permisos, entitlements, privacy manifest o configuración de `app.json`;
- icono, splash, firma, bundle/package identifier o credenciales;
- `runtimeVersion`/versión de app;
- comportamiento que invoque una API nativa ausente en el binario instalado.

Ante duda, usar binario nuevo. Una migración de base de datos nunca se revierte publicando otro binario u OTA.

## Build y distribución

1. Esperar CI verde, incluido `Mobile Integration CI` para cambios en `apps/mobile` o `packages`.
2. En GitHub Actions, ejecutar `Mobile Build (Local — no EAS credits)` con `app=mobile`, plataforma y perfil correctos.
3. Para `prodpreview`, `previewv2` y `production`, el workflow inyecta las variables públicas de Supabase desde GitHub Secrets y falla si faltan.
4. Descargar y probar el artefacto el mismo día. El workflow solicita 14 días, pero la política efectiva actual del repositorio limita la retención a un día; no depender del valor solicitado sin verificar primero la configuración del repositorio.
5. Activar `submit_ios` solo para una IPA destinada a TestFlight. Activar `submit_android` solo con perfil `production`; el destino es el track interno de Google Play.
6. Promover a producción solo después de smoke test en dispositivo real, sin errores de arranque, autenticación, navegación, cámara, notificaciones ni persistencia offline.

Los nombres de secretos y el procedimiento de firma viven en el workflow. Sus valores nunca se copian a Markdown, commits, logs ni comentarios de PR.

## Publicación OTA

No existe un workflow de publicación OTA. La operación es manual y debe ejecutarla una persona autenticada en Expo desde `apps/mobile`.

Antes de publicar:

- confirmar por diff que no hay cambios nativos;
- correr `pnpm --filter @eva/mobile exec tsc --noEmit` y las pruebas afectadas;
- registrar commit, versión de app, canal y motivo;
- probar primero en `staging` con un binario de la misma `runtimeVersion`.

Publicación:

```bash
cd apps/mobile
eas update --channel staging --message "<motivo y commit>"
```

Tras validar `staging`, repetir explícitamente para `production`. No usar `prodpreview` ni `previewv2` como destino mientras sigan sin canal.

En runtime, `checkForOtaUpdate()` consulta al abrir y al volver a foreground, con máximo un intento por hora. Descarga en segundo plano y ofrece reiniciar; en desarrollo, cuando Updates está deshabilitado o ante error, no altera el arranque.

## Rollback e incidente

- OTA defectuoso: publicar el commit JS conocido-bueno al mismo canal y la misma `runtimeVersion`; luego verificar en un binario real.
- Cambio nativo defectuoso: detener rollout/submit y preparar otro binario. El OTA no puede retirar código nativo.
- Crash de arranque: conservar el artefacto, commit, perfil y logs de Actions/Sentry; no publicar cambios adicionales hasta aislar si el fallo es bundle, entorno, firma o código nativo.
- Base de datos: aplicar solo correcciones forward-only mediante el runbook de DB; no hacer rollback destructivo desde la app.
