import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Android 1.1.3, binario A (docs/specs/android-113-play). El plugin
// `with-android-strip-audio-services` saca del manifest los dos servicios en primer plano de
// expo-audio para limpiar el aviso de Play «FGS restringidos desde BOOT_COMPLETED». Es seguro SOLO
// mientras la app no use controles de pantalla bloqueada ni grabación: este test lo hace cumplir.

const REPO_ROOT = path.resolve(__dirname, '../..')
const MOBILE_ROOT = path.join(REPO_ROOT, 'apps/mobile')
const mobileRequire = createRequire(path.join(MOBILE_ROOT, 'package.json'))

const plugin = mobileRequire('./plugins/with-android-strip-audio-services.js')
const appJson = JSON.parse(readFileSync(path.join(MOBILE_ROOT, 'app.json'), 'utf8'))

type ManifestService = { $: Record<string, string> }
type Manifest = {
    manifest: {
        $?: Record<string, string>
        application: { $: Record<string, string>; service?: ManifestService[] }[]
    }
}

function minimalManifest(services: ManifestService[] = []): Manifest {
    return {
        manifest: {
            $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
            application: [{ $: { 'android:name': '.MainApplication' }, service: services }],
        },
    }
}

function servicesOf(manifest: Manifest): ManifestService[] {
    return manifest.manifest.application[0].service ?? []
}

describe('plugin with-android-strip-audio-services', () => {
    it('marca los dos servicios de expo-audio con tools:node="remove" y declara el namespace tools', () => {
        const result: Manifest = plugin.stripAudioServices(minimalManifest())
        expect(result.manifest.$?.['xmlns:tools']).toBe('http://schemas.android.com/tools')
        expect(servicesOf(result).map((s) => s.$)).toEqual([
            { 'android:name': 'expo.modules.audio.service.AudioControlsService', 'tools:node': 'remove' },
            { 'android:name': 'expo.modules.audio.service.AudioRecordingService', 'tools:node': 'remove' },
        ])
    })

    it('es idempotente y no toca otros servicios', () => {
        const other = { $: { 'android:name': 'app.notifee.core.ForegroundService' } }
        const once: Manifest = plugin.stripAudioServices(minimalManifest([other]))
        const twice: Manifest = plugin.stripAudioServices(once)
        expect(servicesOf(twice)).toHaveLength(3)
        expect(servicesOf(twice)[0].$).toEqual({ 'android:name': 'app.notifee.core.ForegroundService' })
    })

    it('cubre exactamente los servicios que declara la versión instalada de expo-audio', () => {
        const audioDir = path.dirname(mobileRequire.resolve('expo-audio/package.json'))
        const libManifest = readFileSync(path.join(audioDir, 'android/src/main/AndroidManifest.xml'), 'utf8')
        const declared = [...libManifest.matchAll(/<service[^>]*android:name="([^"]+)"/g)].map((m) =>
            m[1].startsWith('.') ? `expo.modules.audio${m[1]}` : m[1],
        )
        // Si una versión nueva de expo-audio agrega o renombra un servicio, este test obliga a mirar
        // el plugin antes de publicar un binario.
        expect(declared.sort()).toEqual([...plugin.STRIPPED_SERVICES].sort())
    })
})

describe('app.json — config de Android que acompaña al plugin', () => {
    const android = appJson.expo.android

    it('registra el plugin', () => {
        expect(appJson.expo.plugins).toContain('./plugins/with-android-strip-audio-services')
    })

    it('bloquea FOREGROUND_SERVICE_MEDIA_PLAYBACK y nada más', () => {
        expect(android.blockedPermissions).toEqual(['android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'])
    })

    it('conserva los permisos que siguen haciendo falta (reinicio, micrófono de la cámara, notificaciones)', () => {
        for (const permission of [
            'android.permission.RECEIVE_BOOT_COMPLETED',
            'android.permission.RECORD_AUDIO',
            'android.permission.POST_NOTIFICATIONS',
            'android.permission.CAMERA',
        ]) {
            expect(android.permissions).toContain(permission)
        }
        expect(android.blockedPermissions).not.toContain('android.permission.FOREGROUND_SERVICE')
    })
})

// APIs de expo-audio que arrancan AudioControlsService (pantalla bloqueada) o AudioRecordingService
// (grabación). Con el plugin puesto, esos servicios NO existen en el binario.
const FORBIDDEN_AUDIO_APIS =
    /\b(setActiveForLockScreen|updateLockScreenMetadata|clearLockScreenControls|useAudioRecorder|useAudioRecorderState|AudioRecorder|RecordingPresets|requestRecordingPermissionsAsync|getRecordingPermissionsAsync)\b/

const SKIP_DIRS = new Set(['node_modules', 'android', 'ios', '.expo', 'dist', 'build'])

function sourceFiles(root: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(root)) {
        if (SKIP_DIRS.has(entry)) continue
        const full = path.join(root, entry)
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
}

describe('la app no usa pantalla bloqueada ni grabación de expo-audio', () => {
    it('ningún archivo de apps/mobile ni packages/ llama a esas APIs', () => {
        const files = [...sourceFiles(MOBILE_ROOT), ...sourceFiles(path.join(REPO_ROOT, 'packages'))]
        // Piso de cordura: si el barrido no encuentra archivos, el test pasaría sin mirar nada.
        expect(files.some((file) => file.endsWith(path.join('timers', 'sound.ts')))).toBe(true)
        const offenders = files
            .filter((file) => FORBIDDEN_AUDIO_APIS.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(REPO_ROOT, file))
        expect(
            offenders,
            'Estas APIs necesitan los servicios que quita plugins/with-android-strip-audio-services.js: ' +
                'saca el plugin de app.json (y vuelve a mirar el aviso de Play) antes de usarlas.',
        ).toEqual([])
    })
})
