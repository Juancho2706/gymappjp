/**
 * Share Entreno (F2) — contratos PUROS de la capa visual del composer.
 *
 * Sin React ni React Native a propósito: estos tipos los consumen tanto los stickers (RN) como el
 * adaptador de datos (`build-share-data.ts`, lógica pura) y los presets (`share-presets.ts`, datos).
 * Mantenerlo libre de RN permite testear presets/adaptador en Node sin montar el runtime nativo.
 *
 * El QUÉ está en `docs/specs/workout-share/SPEC.md`; la arquitectura por capas en `PLAN.md`.
 */

/**
 * Elementos posicionables del canvas. CADA cosa visible del card es un sticker — no hay "layout
 * fijo": el preset solo aporta posiciones/escala/visibilidad por defecto y el alumno las mueve.
 */
export type StickerId =
    | 'volumen'
    | 'stats'
    | 'musculos'
    | 'records'
    | 'setlist'
    | 'marca'
    | 'fecha'
    | 'racha'
    | 'qr'

export interface StickerState {
    /**
     * Posición del CENTRO del sticker, normalizada 0..1 sobre el canvas (x = ancho, y = alto).
     * Normalizada y no en px porque el canvas se renderiza a ancho de pantalla pero se rasteriza a
     * 1080×1920: con px el layout se rompería entre preview y PNG.
     */
    x: number
    y: number
    /** Multiplicador de tamaño sobre el diseño base del sticker (1 = tamaño de diseño). */
    scale: number
    visible: boolean
    /**
     * Rotación en GRADOS (horario), alrededor del CENTRO del sticker. `undefined`/0 = sin rotar.
     *
     * El canvas la aplica como `transform: [{ rotate: '<n>deg' }]` sobre el wrapper posicionado —
     * y como ese wrapper ya se ancla por su centro, el giro sale centrado sin `transformOrigin`
     * (que RN no soporta). Existe para los rieles laterales del mockup: los chips de fecha/racha
     * pegados al borde derecho (`marcador`, +90°) y el título/fecha vertical del borde izquierdo
     * (`poster`, -90°) — horizontales no caben, se salen del canvas.
     *
     * Ojo al implementarla: el `transform` NO cambia la caja de layout, así que el clamp de bordes
     * del modo Acomodar tiene que medir contra la caja ROTADA (ancho y alto se intercambian en
     * ±90°), no contra la original.
     */
    rotation?: number
}

/**
 * Medida REAL de un sticker ya montado, en px de PANTALLA (no de diseño-1080).
 *
 * La emite el canvas (`ShareCanvas.reportSizes`) porque es el único que la conoce: los stickers son
 * cajas de contenido y su tamaño depende de la copy (el chip de racha mide distinto según el texto).
 * El modo Acomodar (F4) la necesita para poner su zona de gesto EXACTAMENTE encima del sticker.
 */
export interface StickerSize {
    w: number
    h: number
}

/**
 * Estado VIVO de un arrastre/pellizco: el sticker que el dedo está moviendo AHORA.
 *
 * Vive en un `SharedValue` de Reanimated (UI thread) y describe destinos ABSOLUTOS, no deltas:
 * `cx`/`cy` = centro objetivo en px del canvas, `scale` = escala objetivo. Es a propósito y es lo
 * que evita el parpadeo del commit: el canvas calcula su desplazamiento como `cx − (state.x·ancho)`
 * contra el estado YA commiteado que está pintando, así que en el mismo render en que React aplica
 * la posición nueva el delta pasa a valer 0 solo. Con deltas relativos habría que resetearlos al
 * soltar, y ese reset (UI thread, inmediato) llega SIEMPRE antes que el re-render de React: el
 * sticker volvía un par de frames a su posición vieja antes de saltar a la nueva.
 */
export interface StickerLiveTransform {
    id: StickerId | null
    /** Centro objetivo en px del canvas (eje X). Sin sentido si `id` es `null`. */
    cx: number
    cy: number
    /** Escala objetivo ABSOLUTA (mismo dominio que `StickerState.scale`), no un multiplicador. */
    scale: number
}

/** Estado de reposo. Función y no constante: asignar SIEMPRE un objeto fresco al `SharedValue`. */
export function idleStickerTransform(): StickerLiveTransform {
    return { id: null, cx: 0, cy: 0, scale: 1 }
}

/**
 * Desplazamiento vivo de UN sticker contra el estado que ese mismo render está pintando.
 *
 * WORKLET: corre en el UI thread (lo consumen los `useAnimatedStyle` del canvas y de la capa de
 * gestos). Vive acá, en los contratos, porque las DOS capas tienen que calcular exactamente el
 * mismo desplazamiento — si se desincronizan, el marco de selección deja de coincidir con el
 * sticker y el alumno arrastra "al lado" de lo que ve.
 */
export function liveDeltaFor(
    live: StickerLiveTransform,
    id: StickerId,
    baseX: number,
    baseY: number,
    baseScale: number,
): { dx: number; dy: number; k: number } {
    'worklet'
    if (live.id !== id) return { dx: 0, dy: 0, k: 1 }
    return {
        dx: live.cx - baseX,
        dy: live.cy - baseY,
        k: baseScale > 0 ? live.scale / baseScale : 1,
    }
}

/**
 * Cómo se dibuja el trabajo muscular: silueta anatómica (frente / espalda / ambas) o chips con los
 * grupos top. `chips` existe para los presets con poco espacio vertical (sello, set-list).
 */
export type MuscleView = 'front' | 'back' | 'both' | 'chips'

/**
 * Fondo del canvas. `transparent` = sticker mode (PNG con alpha para pegar DENTRO de Instagram
 * sobre la foto del propio usuario, ver SPEC §Editor).
 */
export type ShareBackground = 'photo' | 'brand' | 'transparent'

export type SharePresetId = 'placa' | 'heatmap' | 'sello' | 'marcador' | 'poster' | 'setlist'

export interface SharePreset {
    id: SharePresetId
    label: string
    /** Fondo por defecto (el usuario puede cambiarlo; 'photo' cae a 'brand' si no hay foto). */
    background: ShareBackground
    muscleView: MuscleView
    stickers: Record<StickerId, StickerState>
}

/** Récord del día ya formateado para el card (detección idéntica al resumen post-entreno). */
export interface ShareRecord {
    /**
     * `exercises.id` — la clave para cruzar récords con filas del set-list. El nombre NO sirve:
     * dos ejercicios distintos con el mismo nombre en una sesión se llevaban ambos la ★.
     */
    exerciseId: string
    exerciseName: string
    weightKg: number
    /** Mejora sobre el máximo histórico, en % con 1 decimal (misma redondeo que el overlay). */
    pct: number
    oneRmEstKg: number
}

export interface ShareExercise {
    /** `exercises.id` — identidad de la fila y cruce con `ShareRecord.exerciseId` para la ★. */
    exerciseId: string
    name: string
    setsCount: number
    /** Serie de MÁS peso del día, ej. '3×10 · 60 kg' (sin peso registrado ⇒ solo '3×10'). */
    topSetLabel: string
    isRecord: boolean
}

export interface WorkoutShareBrand {
    name: string
    logoUrl: string | null
    accent: string
    /** Handle de Instagram SIN arroba (`coaches.instagram_handle`); el `@` es prefijo visual. */
    instagramHandle: string | null
}

export interface WorkoutShareData {
    title: string
    contextLine: string | null
    /** Fecha del entreno en `YYYY-MM-DD` (día local, no UTC — ver `DateChipSticker`). */
    dateISO: string
    durationSec: number | null
    totalVolumeKg: number
    completedSets: number
    totalReps: number
    records: ShareRecord[]
    /** `session.muscleWork` CRUDO — es el input de `muscleGroupsToRegionIntensity`, no un derivado. */
    muscles: { group: string; vol: number }[]
    exercises: ShareExercise[]
    streakCopy: string | null
    brand: WorkoutShareBrand
    /** URL de invitación del coach para el QR (variante Guardar). */
    inviteUrl: string | null
}

/**
 * Canvas LÓGICO del card: 9:16 de stories. Todo tamaño de sticker se diseña contra este ancho y se
 * escala por `k = anchoPantalla / SHARE_CANVAS_W` (mismo patrón que `ShareCard.tsx`), de modo que el
 * preview en pantalla y el PNG rasterizado a 1080×1920 sean idénticos.
 */
export const SHARE_CANVAS_W = 1080
export const SHARE_CANVAS_H = 1920
