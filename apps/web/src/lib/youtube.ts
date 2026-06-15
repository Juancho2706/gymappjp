const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

function parseUrlOrNull(url: string): URL | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return null
  }
  try {
    return new URL(url.trim())
  } catch {
    return null
  }
}

export function isYoutubeUrl(url: string): boolean {
  const parsed = parseUrlOrNull(url)
  if (!parsed) return false
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
}

export function extractYoutubeVideoId(url: string): string | null {
  const parsed = parseUrlOrNull(url)
  if (!parsed) return null

  const host = parsed.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0]
    return id && VIDEO_ID_PATTERN.test(id) ? id : null
  }

  const v = parsed.searchParams.get('v')
  if (v && VIDEO_ID_PATTERN.test(v)) return v

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const [prefix, candidate] = segments
    if (
      (prefix === 'embed' || prefix === 'shorts' || prefix === 'live' || prefix === 'v') &&
      VIDEO_ID_PATTERN.test(candidate)
    ) {
      return candidate
    }
  }

  return null
}

export function normalizeYoutubeEmbedUrl(url: string): string | null {
  const id = extractYoutubeVideoId(url)
  if (!id) return null
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`
}

/**
 * Embed CANÓNICO para TODO video de EJERCICIO: silencioso, en loop, SIN controles de YouTube
 * (se comporta como un GIF). Regla global del dueño: los videos de ejercicio NO muestran controles
 * ni reproducen sonido. `controls=0` (sin barra), `mute=1` (sin sonido), `autoplay=1` + `loop`
 * (requiere `playlist=<id>` para loopear un solo video), `fs=0`/`disablekb=1`/`iv_load_policy=3`
 * (sin pantalla completa, teclado ni anotaciones), `playsinline=1` (iOS no abre fullscreen).
 * Acepta `value` como id de 11 chars o cualquier URL de YouTube. youtube-nocookie (sin tracking).
 *
 * USAR ESTE helper en TODO sitio que renderice el video de un ejercicio (no armar el iframe a mano)
 * para que la regla viva en un solo lugar.
 */
export function exerciseEmbedUrl(
  idOrUrl: string,
  opts?: { start?: number | null; end?: number | null },
): string | null {
  const id = VIDEO_ID_PATTERN.test(idOrUrl) ? idOrUrl : extractYoutubeVideoId(idOrUrl)
  if (!id) return null
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: id,
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    iv_load_policy: '3',
    fs: '0',
  })
  if (opts?.start != null) params.set('start', String(opts.start))
  if (opts?.end != null) params.set('end', String(opts.end))
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
}

type ThumbnailQuality = 'default' | 'mq' | 'hq' | 'sd' | 'maxres'

const THUMBNAIL_FILENAMES: Record<ThumbnailQuality, string> = {
  default: 'default.jpg',
  mq: 'mqdefault.jpg',
  hq: 'hqdefault.jpg',
  sd: 'sddefault.jpg',
  maxres: 'maxresdefault.jpg',
}

export function getYoutubeThumbnailUrl(
  url: string,
  quality: ThumbnailQuality = 'mq',
): string | null {
  const id = extractYoutubeVideoId(url)
  if (!id) return null
  return `https://i.ytimg.com/vi/${id}/${THUMBNAIL_FILENAMES[quality]}`
}
