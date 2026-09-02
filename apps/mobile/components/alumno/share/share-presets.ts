/**
 * Share Entreno (F2) — los 6 presets, como DATOS.
 *
 * Regla de arquitectura del PLAN: "preset = datos, no componente". Un preset NO renderiza nada;
 * declara dónde arranca cada sticker (centro normalizado + escala + visible), qué fondo pide y cómo
 * dibuja los músculos. Cambiar de preset = aplicar estos defaults (posiciones se resetean, los
 * toggles de contenido los conserva el composer — decisión del owner, SPEC §Editor).
 *
 * Las coordenadas son el CENTRO del sticker en 0..1 sobre el canvas 1080×1920. Están razonadas para
 * que cada preset se vea bien DE FÁBRICA (sin tocar nada): los comentarios anotan las tres o cuatro
 * colisiones que obligaron a mover algo respecto del mockup.
 *
 * ── REAJUSTE DEL REDISEÑO F (datos sin fondo) ──
 * El canvas ancla cada sticker por su CENTRO medido, así que al sacarle a los chips su pill (52 px
 * de diseño de padding horizontal, 24 de vertical) su caja se angostó y el centro dejó de dar el
 * mismo margen contra el borde de la story. Los stickers que se apoyan en un borde —`fecha` y
 * `racha`— corrigieron su x para CONSERVAR EL BORDE que tenían, no el número: el desplazamiento es
 * exactamente la mitad del padding perdido. Los que viven al centro o en columna (`volumen`,
 * `stats`, `records`, `setlist`, `marca`, `musculos`, `qr`) no se movieron: encogen alrededor de su
 * propio centro, que es donde el canvas los ancla.
 */

import type { SharePreset, SharePresetId, StickerId, StickerState } from './share-types'

/** Sticker apagado. Sus x/y igual existen: si el usuario lo enciende, aparece en un lugar sensato. */
const off = (x: number, y: number, scale = 1, rotation?: number): StickerState => ({ x, y, scale, visible: false, rotation })
const on = (x: number, y: number, scale = 1, rotation?: number): StickerState => ({ x, y, scale, visible: true, rotation })

/**
 * Placa — el default. Foto del alumno + banda inferior compacta con todo lo importante.
 * La silueta va chica al costado derecho para no pelear con el volumen (columna izquierda).
 */
const PLACA: SharePreset = {
    id: 'placa',
    label: 'Placa',
    background: 'photo',
    muscleView: 'front',
    stickers: {
        // 0.14 (era 0.16): sin la pill, la fecha se angostó ~47 px de diseño y su borde izquierdo se
        // metía hacia adentro. Corrida media caja, el margen contra el borde es el mismo de antes.
        fecha: on(0.14, 0.05, 0.9),
        // 0.82 (era 0.80): la racha es la más ancha de las dos (copy "N de M esta semana") y por eso
        // no podía ir en 0.84 con pill. Sin pill entra, con el mismo aire contra el borde derecho.
        racha: on(0.82, 0.05, 0.9),
        records: on(0.5, 0.64),
        volumen: on(0.32, 0.76),
        stats: on(0.32, 0.85),
        // 0.79 (no 0.80): la silueta a escala 0.85 mide ~0.23 de alto, así que su base quedaba
        // pisando el footer de marca (0.94).
        musculos: on(0.82, 0.79, 0.85),
        marca: on(0.5, 0.94),
        setlist: off(0.5, 0.5),
        qr: off(0.82, 0.86, 0.8),
    },
}

/**
 * Heatmap — sin foto: el cuerpo ES el card. Fondo de marca y silueta frente+espalda gigante al
 * centro; el resto son satélites arriba y abajo.
 */
const HEATMAP: SharePreset = {
    id: 'heatmap',
    label: 'Heatmap',
    background: 'brand',
    muscleView: 'both',
    stickers: {
        fecha: on(0.14, 0.04),
        // Volumen a 0.12 y stats a 0.20 (no 0.10/0.18): el héroe mide ~0.09 de alto y su borde
        // superior tocaba la fecha. Stats NO baja más por el rediseño F: los stickers se anclan por
        // el CENTRO (`ShareCanvas`), así que perder los 44 px de diseño del panel ya subió su borde
        // superior 22 px — el hueco contra la cifra CRECIÓ, no se cerró.
        volumen: on(0.5, 0.12),
        stats: on(0.5, 0.2, 0.9),
        musculos: on(0.5, 0.47, 1.5),
        records: on(0.5, 0.82),
        marca: on(0.5, 0.93),
        racha: off(0.82, 0.04, 0.9),
        setlist: off(0.5, 0.5),
        qr: off(0.5, 0.72, 0.8),
    },
}

/**
 * Sello — tarjeta-recibo en columna: la foto respira a la izquierda, los datos se apilan a la
 * derecha. Es el único preset con QR encendido de fábrica (SPEC: QR solo tiene sentido presencial;
 * el composer lo apaga igual fuera de la variante Guardar).
 *
 * Columna en x=0.72 y no 0.78: la banda de récords y el héroe superan 0.44 de ancho, y centrados en
 * 0.78 sangraban por el borde derecho. 0.72 mantiene la lectura de columna sin recortar nada.
 */
const SELLO: SharePreset = {
    id: 'sello',
    label: 'Sello',
    background: 'photo',
    muscleView: 'chips',
    stickers: {
        fecha: on(0.72, 0.1),
        volumen: on(0.72, 0.22, 0.85),
        stats: on(0.72, 0.33, 0.8),
        musculos: on(0.72, 0.45, 0.85),
        records: on(0.72, 0.58, 0.85),
        marca: on(0.72, 0.72),
        qr: on(0.72, 0.85, 0.8),
        setlist: off(0.5, 0.5),
        racha: off(0.72, 0.04, 0.85),
    },
}

/**
 * Marcador — scoreboard de transmisión: cifras arriba a la izquierda, franja de contexto a la
 * derecha, silueta chica abajo. Pensado para foto vertical con el sujeto al centro.
 */
const MARCADOR: SharePreset = {
    id: 'marcador',
    label: 'Marcador',
    background: 'photo',
    muscleView: 'front',
    stickers: {
        volumen: on(0.35, 0.08),
        stats: on(0.35, 0.16, 0.9),
        // Riel lateral derecho: fecha y racha giran +90° (leen de arriba hacia abajo, pegados al
        // borde). Rotados, su caja ocupa de ANCHO lo que miden de ALTO por larga que sea la copy —
        // que era justo lo que impedía tenerlos ahí en horizontal. Con el rediseño F ese alto bajó
        // de ~64 a ~36 px de diseño, así que x pasa de 0.93 a 0.94 para conservar el mismo riel.
        fecha: on(0.94, 0.35, 0.85, 90),
        racha: on(0.94, 0.5, 0.85, 90),
        // Récords sube a 0.70 y la silueta baja a 0.84: en 0.75/0.85 la banda y la cabeza de la
        // figura se solapaban.
        records: on(0.5, 0.7),
        musculos: on(0.15, 0.84, 0.7),
        marca: on(0.5, 0.95),
        setlist: off(0.5, 0.5),
        qr: off(0.85, 0.7, 0.7),
    },
}

/**
 * Póster — una sola cifra, enorme, sobre la foto.
 *
 * F2: el número va DELANTE del sujeto con alpha bajo (lo aplica el canvas al componer el sticker de
 * volumen en este preset). La versión "detrás del sujeto" exige segmentación nativa del OS
 * (VisionKit / ML Kit) y es fase posterior — ver PLAN §Póster; si nunca llega, esta degradación es
 * el comportamiento definitivo y el preset igual existe.
 */
const POSTER: SharePreset = {
    id: 'poster',
    label: 'Póster',
    background: 'photo',
    muscleView: 'front',
    stickers: {
        volumen: on(0.5, 0.45, 2.4),
        // Riel vertical del borde izquierdo, -90° (lee de abajo hacia arriba, como el lomo de un
        // afiche). A media altura queda al costado del héroe gigante, no debajo: rotado ocupa lo que
        // mide de alto, así que convive con la cifra sin pisarla. 0.06 y no 0.07 desde el rediseño
        // F: sin la pill mide la mitad de ancho y se despegaba del lomo.
        fecha: on(0.06, 0.45, 1, -90),
        stats: on(0.5, 0.83, 0.85),
        marca: on(0.5, 0.92),
        records: off(0.5, 0.68),
        musculos: off(0.82, 0.7, 0.8),
        setlist: off(0.5, 0.5),
        racha: off(0.82, 0.05, 0.9),
        qr: off(0.82, 0.7, 0.8),
    },
}

/**
 * Set-list — el pedido literal del socio: los ejercicios del día con series×reps×kg. Fondo de marca
 * (la lista necesita contraste parejo) y los récords viajan como ★ dentro de las filas, así que la
 * banda de récords sobra.
 */
const SETLIST: SharePreset = {
    id: 'setlist',
    label: 'Set-list',
    background: 'brand',
    muscleView: 'chips',
    stickers: {
        fecha: on(0.14, 0.05),
        volumen: on(0.5, 0.13, 0.8),
        setlist: on(0.5, 0.5),
        stats: on(0.5, 0.82, 0.9),
        marca: on(0.5, 0.93),
        records: off(0.5, 0.72),
        musculos: off(0.82, 0.72, 0.8),
        racha: off(0.82, 0.05, 0.9),
        qr: off(0.82, 0.72, 0.8),
    },
}

/** Orden de aparición en el selector del editor. `placa` primero: es el default. */
export const SHARE_PRESETS: SharePreset[] = [PLACA, HEATMAP, SELLO, MARCADOR, POSTER, SETLIST]

export const SHARE_PRESET_BY_ID: Record<SharePresetId, SharePreset> = {
    placa: PLACA,
    heatmap: HEATMAP,
    sello: SELLO,
    marcador: MARCADOR,
    poster: POSTER,
    setlist: SETLIST,
}

export const DEFAULT_SHARE_PRESET_ID: SharePresetId = 'placa'

/** Orden de pintado del canvas: lo de más abajo en la lista se dibuja ENCIMA. */
export const STICKER_PAINT_ORDER: StickerId[] = [
    'musculos',
    'setlist',
    'records',
    'volumen',
    'stats',
    'fecha',
    'racha',
    'qr',
    'marca',
]

/** Copia defensiva de los defaults de un preset (el composer los muta al arrastrar). */
export function cloneStickerLayout(preset: SharePreset): Record<StickerId, StickerState> {
    const out = {} as Record<StickerId, StickerState>
    for (const id of Object.keys(preset.stickers) as StickerId[]) out[id] = { ...preset.stickers[id] }
    return out
}
