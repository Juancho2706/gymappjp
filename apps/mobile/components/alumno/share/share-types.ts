/**
 * Share Entreno — contratos PUROS de la capa visual del composer.
 *
 * Sin React ni React Native a propósito: estos tipos los consumen tanto el sticker (RN) como el
 * adaptador de datos (`build-share-data.ts`, lógica pura), el layout (`share-layout.ts`, datos) y el
 * helper del bloque (`share-block.ts`). Mantenerlo libre de RN permite testear layout/adaptador en
 * Node sin montar el runtime nativo.
 *
 * El QUÉ está en `docs/specs/workout-share/SPEC.md`; la arquitectura por capas en `PLAN.md`.
 */

/**
 * El ÚNICO elemento posicionable del canvas (decisión del owner, 06-09-2026): un solo bloque de
 * texto con volumen + fila de stats + grupo top + firma del coach.
 *
 * Sigue siendo una unión y no un literal suelto porque todo el motor (canvas, capa de gestos,
 * `liveDeltaFor`) está escrito contra un `Record<StickerId, …>` y las medidas se reportan por id:
 * degradarlo a `string` perdería el chequeo de exhaustividad y no ahorraría una línea.
 */
export type StickerId = 'bloque'

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
}

/**
 * Medida REAL del sticker ya montado, en px de PANTALLA (no de diseño-1080).
 *
 * La emite el canvas (`ShareCanvas.reportSizes`) porque es el único que la conoce: el bloque es una
 * caja de contenido y su tamaño depende de la copy (un volumen de 5 cifras y un nombre de marca
 * largo lo ensanchan). La capa de gestos la necesita para poner su zona de arrastre EXACTAMENTE
 * encima del bloque, y el pellizco para calcular su tope real (`maxScaleFor`).
 */
export interface StickerSize {
    w: number
    h: number
}

/**
 * Escala mínima y máxima ABSOLUTAS del sticker: el rango del pellizco.
 *
 * Viven en los contratos y no en la capa de gestos porque el tope que de verdad se aplica no es este
 * número sino `maxScaleFor` — aritmética pura que se testea sin montar RN.
 */
export const STICKER_SCALE_MIN = 0.5
export const STICKER_SCALE_MAX = 3

/**
 * Holgura mínima para considerar que TODAVÍA hay lugar donde crecer.
 *
 * Yoga mide al sticker con `FitContent` contra el ancho del lienzo (ver `ShareCanvas`), así que la
 * medida que llega por `onLayout` nunca supera ese ancho: un sticker que ya se sale reporta "justo
 * el lienzo" y la razón `lienzo / caja` se queda pegada apenas por encima de 1. Sin este piso, cada
 * pellizco lo agrandaría otro 2-3 % para siempre, recortando un poco más de texto cada vez.
 */
const SCALE_ROOM_EPSILON = 1.05

/**
 * Tope de escala REAL de UN sticker: lo que el catálogo permite (`STICKER_SCALE_MAX`) acotado por lo
 * que entra en el lienzo.
 *
 * ── POR QUÉ NO ALCANZA UN TOPE FIJO ──
 * `3` es un número sensato para una caja chica y absurdo para el bloque: su cifra héroe con 4
 * dígitos mide ~540 px de diseño ⇒ a escala 3 pide 1620 sobre un canvas de 1080. Como Yoga acota la
 * caja al ancho del lienzo y los textos van con `numberOfLines={1}`, el resultado no es un bloque
 * gigante sino un "375…" recortado con la unidad `kg` empujada fuera del canvas — el alumno lo lee
 * como que el elemento DESAPARECIÓ. Fue el bug que reportó el owner en el QA de Android (02-09).
 *
 * La regla es por medida real: nadie puede crecer más allá de la caja del lienzo.
 *
 * NUNCA devuelve menos que `current`: forzar un achique al primer pellizco sería mover algo que el
 * alumno no pidió mover. Lo que se corta es el CRECIMIENTO, no lo ya elegido.
 *
 * @param current  Escala ya commiteada, la que corresponde a `size`.
 * @param size     Medida real del sticker a `current` (px de pantalla). Sin ella no hay tope fino.
 * @param rotation Grados del sticker: a ±90 la caja intercambia ancho y alto. El layout único ya
 *                 no rota nada (los rieles laterales eran de los presets, que se retiraron), pero
 *                 el parámetro se queda: es aritmética pura ya testeada y su default `0` es
 *                 exactamente el caso vigente. Borrarlo solo rompería el test que la fija.
 */
export function maxScaleFor(
    current: number,
    size: StickerSize | undefined,
    canvasW: number,
    canvasH: number,
    rotation = 0,
): number {
    if (!(current > 0) || !size || size.w <= 0 || size.h <= 0 || canvasW <= 0 || canvasH <= 0) {
        return STICKER_SCALE_MAX
    }
    // Rotado ±90 el sticker ocuparía de ancho lo que mide de alto. Hoy `rotation` siempre llega 0.
    const onEdge = Math.abs(Math.round(rotation / 90)) % 2 === 1
    const boxW = onEdge ? size.h : size.w
    const boxH = onEdge ? size.w : size.h
    const room = Math.min(canvasW / boxW, canvasH / boxH)
    if (room <= SCALE_ROOM_EPSILON) return Math.min(STICKER_SCALE_MAX, current)
    return Math.min(STICKER_SCALE_MAX, current * room)
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
 * mismo desplazamiento — si se desincronizan, el marco punteado deja de coincidir con el bloque y
 * el alumno arrastra "al lado" de lo que ve.
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
 * Fondo del canvas.
 *
 * `transparent` = sticker mode (PNG con alpha). El composer ya NO lo ofrece (decisión del owner
 * 06-09-2026: la única edición es mover y escalar el bloque), pero el MOTOR lo conserva: el canvas
 * lo resuelve en una línea y `share-targets.ts` lo usa para decidir `stickerImage` vs
 * `backgroundImage` en el payload de Stories. Sacarlo del tipo obligaría a tocar los destinos y sus
 * tests para no ganar nada — la regla del tren es diff mínimo en el motor.
 */
export type ShareBackground = 'photo' | 'brand' | 'transparent'

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
    /**
     * Fecha del entreno en `YYYY-MM-DD`, día LOCAL y no UTC. El bloque no la imprime, pero viaja en
     * el nombre del PNG (`eva-entreno-<fecha>`): armada con `toISOString()` en Chile (UTC-4) el
     * archivo saldría fechado el día anterior.
     */
    dateISO: string
    durationSec: number | null
    totalVolumeKg: number
    completedSets: number
    totalReps: number
    records: ShareRecord[]
    /**
     * `session.muscleWork` CRUDO, ya ordenado DESC por volumen. El bloque imprime solo el nombre del
     * primero (`share-block.ts`); se guarda crudo y no como `topMuscle` ya resuelto porque el
     * adaptador no tiene por qué saber cuántos grupos pinta la capa visual.
     */
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
