import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { deriveSportTokens } from '@eva/brand-kit'
import {
    cloneStickerLayout,
    SHARE_LAYOUT,
    ShareCanvas,
    WorkoutShareComposer,
    type WorkoutShareData,
} from '../../components/alumno/share'

/**
 * Harness de QA del `ShareCanvas` (Share Entreno). HERRAMIENTA INTERNA, no producto.
 *
 * Existe porque el canvas solo se puede juzgar en un device real: el centrado por medición, el
 * contorno sub-píxel del texto y el ancho del bloque con una marca larga no se ven en un
 * `tsc --noEmit` ni en un export. Acá se mira el card sin tener que terminar un entreno de verdad
 * para llegar al composer.
 *
 * Datos MOCK y ricos a propósito (volumen de 4 cifras, marca con nombre largo, varios grupos): un
 * mock pobre esconde exactamente los bugs que importan — textos que desbordan y líneas que se
 * pisan. `records` / `exercises` / `streakCopy` siguen poblados aunque el bloque no los pinte: el
 * tipo `WorkoutShareData` no cambió y el harness tiene que seguir siendo un mock realista.
 */

/** Hoy en LOCAL (`YYYY-MM-DD`). `toISOString()` es UTC y en Chile devolvía el día anterior. */
function todayISO(): string {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MOCK: WorkoutShareData = {
    title: 'Superior Día 1',
    contextLine: 'Semana 3 · Hipertrofia',
    dateISO: todayISO(),
    durationSec: 52 * 60,
    totalVolumeKg: 6240,
    completedSets: 21,
    totalReps: 214,
    records: [
        { exerciseId: 'ex-press-banca', exerciseName: 'Press banca', weightKg: 82.5, pct: 3.1, oneRmEstKg: 96.3 },
        { exerciseId: 'ex-press-militar', exerciseName: 'Press militar', weightKg: 47.5, pct: 5.6, oneRmEstKg: 55.4 },
    ],
    // Orden DESC por volumen: el bloque asume que el primero con volumen es el grupo top, igual que
    // el `muscleWork` real del motor.
    muscles: [
        { group: 'pecho', vol: 2480 },
        { group: 'hombros', vol: 1520 },
        { group: 'tríceps', vol: 1180 },
        { group: 'espalda', vol: 640 },
        { group: 'core', vol: 420 },
    ],
    exercises: [
        { exerciseId: 'ex-press-banca', name: 'Press banca', setsCount: 4, topSetLabel: '3×8 · 82,5 kg', isRecord: true },
        { exerciseId: 'ex-press-inclinado', name: 'Press inclinado con mancuernas', setsCount: 4, topSetLabel: '3×10 · 32 kg', isRecord: false },
        { exerciseId: 'ex-press-militar', name: 'Press militar', setsCount: 4, topSetLabel: '4×6 · 47,5 kg', isRecord: true },
        { exerciseId: 'ex-elevaciones', name: 'Elevaciones laterales', setsCount: 3, topSetLabel: '3×15 · 10 kg', isRecord: false },
        { exerciseId: 'ex-fondos', name: 'Fondos en paralelas', setsCount: 3, topSetLabel: '3×12', isRecord: false },
        { exerciseId: 'ex-extension-tricep', name: 'Extensión de tríceps en polea', setsCount: 3, topSetLabel: '3×12 · 27,5 kg', isRecord: false },
    ],
    streakCopy: '3 de 4 esta semana',
    brand: {
        name: 'Costa Fitness',
        logoUrl: null,
        accent: '#8B5CF6',
        instagramHandle: 'costa.fitness',
    },
    inviteUrl: 'https://www.eva-app.cl/join/EVADEMO',
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? '#8B5CF6' : 'rgba(255,255,255,0.18)',
                backgroundColor: active ? 'rgba(139,92,246,0.22)' : 'transparent',
            }}
        >
            <Text style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' }}>
                {label}
            </Text>
        </Pressable>
    )
}

export default function ShareCanvasHarness() {
    // Expo Router NO hace tree-shaking de rutas por entorno: el archivo entra al bundle de producción
    // por el solo hecho de existir en `app/`. El guard es de RUNTIME — en un build de release la ruta
    // existe pero no lleva a ninguna parte.
    if (!__DEV__) return <Redirect href="/" />

    return <ShareCanvasHarnessBody />
}

function ShareCanvasHarnessBody() {
    const insets = useSafeAreaInsets()
    const { width: screenW } = useWindowDimensions()
    const [composerOpen, setComposerOpen] = useState(false)

    // Copia del layout de fábrica: `ShareCanvas` no lo muta, pero así el harness se comporta igual
    // que el composer real (que sí lo muta al arrastrar) y no comparte referencia con el catálogo.
    const stickers = useMemo(() => cloneStickerLayout(SHARE_LAYOUT), [])
    const tokens = useMemo(() => deriveSportTokens(MOCK.brand.accent), [])

    const canvasW = screenW - 32
    const canvasH = (canvasW * 1920) / 1080

    return (
        <View style={{ flex: 1, backgroundColor: '#0B0E13', paddingTop: insets.top }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 12 }}
            >
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                    ShareCanvas · harness
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    Layout único · bloque en {stickers.bloque.x} / {stickers.bloque.y}
                </Text>

                {/* Composer completo. `embedded={false}`: acá el harness es una ruta normal, no hay
                    Modal host, así que el composer abre su PROPIA ventana nativa — que es el camino
                    que hay que probar en device (el `embedded` se ejercita desde el resumen
                    post-entreno, que sí es un Modal). */}
                <Pressable
                    onPress={() => setComposerOpen(true)}
                    style={{
                        minHeight: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        backgroundColor: '#8B5CF6',
                    }}
                >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Abrir composer</Text>
                </Pressable>

                {/* El harness pinta SIEMPRE sobre fondo de marca: no pide permisos de cámara ni
                    galería (eso se prueba en el composer) y con `photoUri: null` el canvas ya cae a
                    marca de todos modos. El chip está para dejarlo dicho, no para elegir. */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Chip label="Marca" active onPress={() => {}} />
                </View>

                <View style={{ width: canvasW, height: canvasH, alignSelf: 'center' }}>
                    <ShareCanvas
                        data={MOCK}
                        stickers={stickers}
                        background="brand"
                        photoUri={null}
                        width={canvasW}
                        tokens={tokens}
                    />
                </View>
            </ScrollView>

            <WorkoutShareComposer visible={composerOpen} onClose={() => setComposerOpen(false)} data={MOCK} />
        </View>
    )
}
