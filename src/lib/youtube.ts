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
