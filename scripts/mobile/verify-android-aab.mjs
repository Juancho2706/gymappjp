#!/usr/bin/env node
// Guard del manifest FUSIONADO de un AAB de Android (docs/specs/android-113-play).
//
// Uso (CI, .github/workflows/mobile-build.yml, despues del build y ANTES del submit):
//   java -jar bundletool.jar dump manifest --bundle build.aab > manifest.xml
//   node scripts/mobile/verify-android-aab.mjs --manifest manifest.xml
//
// POR QUE: Play marca «servicios en primer plano restringidos que se inician desde BOOT_COMPLETED»
// cuando el AAB declara servicios de tipo mediaPlayback/microphone/… y a la vez receptores de
// reinicio. Los traia expo-audio (los quita apps/mobile/plugins/with-android-strip-audio-services.js).
// El manifest que importa es el fusionado con TODAS las librerias, y ese solo existe tras Gradle:
// por eso el chequeo va sobre el AAB y no sobre app.json.
//
// Falla (exit 1) si:
//   · aparece algun servicio de expo-audio (AudioControlsService / AudioRecordingService);
//   · algun <service> declara un tipo que Android 15 no deja iniciar desde BOOT_COMPLETED;
//   · aparece FOREGROUND_SERVICE_MEDIA_PLAYBACK (bloqueado a proposito en app.json);
//   · falta alguno de los receptores de reinicio de los que dependen recordatorios y notificaciones.
// Avisa (sin fallar) si falta el AD_ID (el SDK de Meta lo necesita; D1 del spec) o si aparece otro
// permiso FOREGROUND_SERVICE_* de tipo restringido sin servicio que lo use.
//
// Sin dependencias: el dump de bundletool es XML plano y alcanza con expresiones regulares acotadas.

import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Tipos que un receptor de BOOT_COMPLETED no puede iniciar desde Android 15, con su bit en
// `android:foregroundServiceType` (por si el dump los imprime compilados como entero).
export const RESTRICTED_FGS_TYPES = {
  dataSync: 0x1,
  mediaPlayback: 0x2,
  phoneCall: 0x4,
  mediaProjection: 0x20,
  camera: 0x40,
  microphone: 0x80,
}

export const FORBIDDEN_SERVICE_PREFIX = 'expo.modules.audio.service.'

export const FORBIDDEN_PERMISSIONS = ['android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK']

export const RESTRICTED_FGS_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
]

// notify-kit (reprograma notificaciones), WorkManager y expo-notifications. Quitarlos rompe los
// recordatorios despues de reiniciar el telefono.
export const REQUIRED_BOOT_RECEIVERS = [
  'app.notifee.core.RebootBroadcastReceiver',
  'androidx.work.impl.background.systemalarm.RescheduleReceiver',
  'expo.modules.notifications.service.NotificationsService',
]

export const AD_ID_PERMISSION = 'com.google.android.gms.permission.AD_ID'

const BOOT_ACTION = 'android.intent.action.BOOT_COMPLETED'

function attr(attrs, name) {
  const match = new RegExp(`${name.replace(':', '\\:')}="([^"]*)"`).exec(attrs)
  return match ? match[1] : undefined
}

function restrictedTypesOf(rawType) {
  if (!rawType) return []
  const trimmed = rawType.trim()
  if (/^(0x[0-9a-f]+|\d+)$/i.test(trimmed)) {
    const bits = Number(trimmed)
    return Object.entries(RESTRICTED_FGS_TYPES)
      .filter(([, bit]) => (bits & bit) !== 0)
      .map(([name]) => name)
  }
  return trimmed.split('|').map((type) => type.trim()).filter((type) => type in RESTRICTED_FGS_TYPES)
}

export function parseManifest(xml) {
  const manifestAttrs = /<manifest\b([^>]*)>/.exec(xml)?.[1] ?? ''
  const permissions = [...xml.matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*?)\/?>/g)]
    .map((m) => attr(m[1], 'android:name'))
    .filter(Boolean)
  const services = [...xml.matchAll(/<service\b([^>]*?)\/?>/g)].map((m) => ({
    name: attr(m[1], 'android:name') ?? '',
    type: attr(m[1], 'android:foregroundServiceType'),
  }))
  const receivers = [...xml.matchAll(/<receiver\b([^>]*?)(?:\/>|>([\s\S]*?)<\/receiver>)/g)].map((m) => ({
    name: attr(m[1], 'android:name') ?? '',
    onBoot: (m[2] ?? '').includes(BOOT_ACTION),
  }))
  return {
    packageName: attr(manifestAttrs, 'package'),
    versionCode: attr(manifestAttrs, 'android:versionCode'),
    versionName: attr(manifestAttrs, 'android:versionName'),
    permissions,
    services,
    receivers,
  }
}

export function verifyManifest(xml) {
  const parsed = parseManifest(xml)
  const errors = []
  const warnings = []

  if (!parsed.packageName) {
    errors.push('No se pudo leer <manifest package=…>: ¿el archivo es la salida de `bundletool dump manifest`?')
  }

  for (const service of parsed.services) {
    if (service.name.startsWith(FORBIDDEN_SERVICE_PREFIX)) {
      errors.push(`Servicio de expo-audio presente: ${service.name} (¿se cayó el plugin with-android-strip-audio-services de app.json?)`)
    }
    const restricted = restrictedTypesOf(service.type)
    if (restricted.length > 0) {
      errors.push(`Servicio en primer plano de tipo restringido desde BOOT_COMPLETED: ${service.name} (${restricted.join('|')})`)
    }
  }

  for (const permission of FORBIDDEN_PERMISSIONS) {
    if (parsed.permissions.includes(permission)) {
      errors.push(`Permiso bloqueado presente: ${permission} (revisar android.blockedPermissions en app.json)`)
    }
  }

  for (const permission of RESTRICTED_FGS_PERMISSIONS) {
    if (!FORBIDDEN_PERMISSIONS.includes(permission) && parsed.permissions.includes(permission)) {
      warnings.push(`Permiso de servicio en primer plano restringido: ${permission} (¿qué librería lo trae?)`)
    }
  }

  for (const receiver of REQUIRED_BOOT_RECEIVERS) {
    const found = parsed.receivers.find((r) => r.name === receiver)
    if (!found) {
      errors.push(`Falta el receptor de reinicio ${receiver}`)
    } else if (!found.onBoot) {
      errors.push(`El receptor ${receiver} ya no escucha ${BOOT_ACTION}`)
    }
  }

  if (!parsed.permissions.includes(AD_ID_PERMISSION)) {
    warnings.push(`Falta ${AD_ID_PERMISSION}: el SDK de Meta no podrá leer el ID de publicidad (y la declaración de Play dice «Sí»)`)
  }

  return { parsed, errors, warnings }
}

function summary({ parsed, errors, warnings }) {
  const lines = [
    '### Guard del manifest del AAB',
    '',
    `- Paquete: \`${parsed.packageName ?? '?'}\` · versionName \`${parsed.versionName ?? '?'}\` · versionCode \`${parsed.versionCode ?? '?'}\``,
    `- Servicios: ${parsed.services.length} · receptores de reinicio: ${parsed.receivers.filter((r) => r.onBoot).map((r) => `\`${r.name}\``).join(', ') || 'ninguno'}`,
    `- AD_ID: ${parsed.permissions.includes(AD_ID_PERMISSION) ? 'sí' : 'no'}`,
    '',
    errors.length ? `**${errors.length} error(es):**` : '**Sin errores.**',
    ...errors.map((e) => `- ❌ ${e}`),
    ...(warnings.length ? ['', `**${warnings.length} aviso(s):**`, ...warnings.map((w) => `- ⚠️ ${w}`)] : []),
  ]
  return lines.join('\n')
}

function main(argv) {
  const index = argv.indexOf('--manifest')
  const manifestPath = index >= 0 ? argv[index + 1] : undefined
  if (!manifestPath) {
    console.error('Uso: node scripts/mobile/verify-android-aab.mjs --manifest <salida de bundletool dump manifest>')
    return 2
  }
  const result = verifyManifest(readFileSync(manifestPath, 'utf8'))
  const text = summary(result)
  process.stdout.write(`${text}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  return result.errors.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
