/**
 * EVA DS — extractor de video de YouTube (mobile).
 *
 * Port 1:1 de `apps/web/src/lib/youtube.ts` (`extractYoutubeVideoId` / `isYoutubeUrl`):
 * parseo de URL + allowlist de hosts (más robusto que un regex de substring — maneja
 * watch `?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, `/v/`, y rechaza hosts que
 * no sean de YouTube). Fuente de verdad web: `apps/web/src/lib/youtube.ts:1-58`.
 *
 * Antes existían dos detectores divergentes en mobile (`lib/exercises.ts` youtubeId y el
 * regex `YT_ID` interno de `VideoPlayer`); este módulo unifica la detección con la web.
 */

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

/** True si la URL es de un host de YouTube conocido (mirror web `isYoutubeUrl`). */
export function isYoutubeUrl(url: string): boolean {
  const parsed = parseUrlOrNull(url)
  if (!parsed) return false
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
}

/** Extrae el id (11 chars) de una URL de YouTube; null si no es YouTube o no hay id válido. */
export function extractYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null
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
