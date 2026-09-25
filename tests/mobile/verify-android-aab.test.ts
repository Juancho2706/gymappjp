import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { verifyManifest } from '../../scripts/mobile/verify-android-aab.mjs'

// Contrato del guard que corre en mobile-build.yml sobre `bundletool dump manifest` del AAB, antes
// del submit a Play (docs/specs/android-113-play, PLAN §2.3.2).

const SCRIPT = path.resolve(__dirname, '../../scripts/mobile/verify-android-aab.mjs')

const BOOT_RECEIVERS = `
    <receiver android:exported="false" android:name="app.notifee.core.RebootBroadcastReceiver">
      <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/></intent-filter>
    </receiver>
    <receiver android:enabled="false" android:exported="false" android:name="androidx.work.impl.background.systemalarm.RescheduleReceiver">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
        <action android:name="android.intent.action.TIME_SET"/>
      </intent-filter>
    </receiver>
    <receiver android:enabled="true" android:exported="false" android:name="expo.modules.notifications.service.NotificationsService">
      <intent-filter android:priority="-1">
        <action android:name="expo.modules.notifications.NOTIFICATION_EVENT"/>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
      </intent-filter>
    </receiver>`

function manifest({
    permissions = ['android.permission.INTERNET', 'android.permission.FOREGROUND_SERVICE', 'com.google.android.gms.permission.AD_ID'],
    services = '<service android:exported="false" android:name="app.notifee.core.ForegroundService"/>',
    receivers = BOOT_RECEIVERS,
}: { permissions?: string[]; services?: string; receivers?: string } = {}): string {
    return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="87" android:versionName="1.1.3" package="cl.evaapp.eva">
  ${permissions.map((p) => `<uses-permission android:name="${p}"/>`).join('\n  ')}
  <application android:name=".MainApplication">
    ${services}
    ${receivers}
  </application>
</manifest>`
}

describe('verifyManifest', () => {
    it('un AAB limpio pasa sin errores ni avisos y lee versión y paquete', () => {
        const { parsed, errors, warnings } = verifyManifest(manifest())
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
        expect(parsed).toMatchObject({ packageName: 'cl.evaapp.eva', versionName: '1.1.3', versionCode: '87' })
        expect(parsed.receivers.filter((r: { onBoot: boolean }) => r.onBoot)).toHaveLength(3)
    })

    it('falla si vuelve un servicio de expo-audio', () => {
        const { errors } = verifyManifest(
            manifest({
                services:
                    '<service android:exported="false" android:foregroundServiceType="mediaPlayback" android:name="expo.modules.audio.service.AudioControlsService"/>',
            }),
        )
        expect(errors.join('\n')).toContain('expo.modules.audio.service.AudioControlsService')
        expect(errors.join('\n')).toContain('mediaPlayback')
    })

    it('falla con cualquier servicio de tipo restringido, también si el tipo viene compilado como entero', () => {
        const byName = verifyManifest(
            manifest({ services: '<service android:foregroundServiceType="camera|location" android:name="com.acme.CamService"/>' }),
        )
        expect(byName.errors.join('\n')).toContain('com.acme.CamService (camera)')

        const byBits = verifyManifest(
            manifest({ services: '<service android:foregroundServiceType="0x00000080" android:name="com.acme.MicService"/>' }),
        )
        expect(byBits.errors.join('\n')).toContain('com.acme.MicService (microphone)')
    })

    it('deja pasar tipos permitidos (shortService, connectedDevice, health)', () => {
        const { errors } = verifyManifest(
            manifest({
                services:
                    '<service android:foregroundServiceType="shortService" android:name="a.Short"/><service android:foregroundServiceType="connectedDevice|health" android:name="a.Ble"/>',
            }),
        )
        expect(errors).toEqual([])
    })

    it('falla si reaparece FOREGROUND_SERVICE_MEDIA_PLAYBACK', () => {
        const { errors } = verifyManifest(
            manifest({
                permissions: [
                    'android.permission.FOREGROUND_SERVICE',
                    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
                    'com.google.android.gms.permission.AD_ID',
                ],
            }),
        )
        expect(errors.join('\n')).toContain('FOREGROUND_SERVICE_MEDIA_PLAYBACK')
    })

    it('falla si falta un receptor de reinicio o si deja de escuchar BOOT_COMPLETED', () => {
        const missing = verifyManifest(manifest({ receivers: BOOT_RECEIVERS.split('</receiver>').slice(1).join('</receiver>') }))
        expect(missing.errors.join('\n')).toContain('app.notifee.core.RebootBroadcastReceiver')

        const deaf = verifyManifest(
            manifest({
                receivers: BOOT_RECEIVERS.replace(
                    '<intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/></intent-filter>',
                    '',
                ),
            }),
        )
        expect(deaf.errors.join('\n')).toContain('ya no escucha')
    })

    it('sin AD_ID solo avisa; otro permiso FGS restringido también solo avisa', () => {
        const { errors, warnings } = verifyManifest(
            manifest({ permissions: ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_CAMERA'] }),
        )
        expect(errors).toEqual([])
        expect(warnings.join('\n')).toContain('AD_ID')
        expect(warnings.join('\n')).toContain('FOREGROUND_SERVICE_CAMERA')
    })

    it('falla si el archivo no es un manifest', () => {
        expect(verifyManifest('Error: no bundle').errors.length).toBeGreaterThan(0)
    })
})

describe('CLI', () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), 'verify-aab-'))
    afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

    function run(args: string[]): number {
        try {
            execFileSync(process.execPath, [SCRIPT, ...args], { stdio: 'pipe', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } })
            return 0
        } catch (error) {
            return (error as { status: number }).status
        }
    }

    it('sale 0 con un manifest limpio, 1 con violaciones y 2 sin argumentos', () => {
        const clean = path.join(sandbox, 'clean.xml')
        const dirty = path.join(sandbox, 'dirty.xml')
        writeFileSync(clean, manifest())
        writeFileSync(
            dirty,
            manifest({ services: '<service android:foregroundServiceType="microphone" android:name="expo.modules.audio.service.AudioRecordingService"/>' }),
        )
        expect(run(['--manifest', clean])).toBe(0)
        expect(run(['--manifest', dirty])).toBe(1)
        expect(run([])).toBe(2)
    })
})
