import { describe, expect, it } from 'vitest'
import {
  extractYoutubeVideoId,
  getYoutubeThumbnailUrl,
  isYoutubeUrl,
  normalizeYoutubeEmbedUrl,
} from './youtube'

describe('youtube — extractYoutubeVideoId', () => {
  it('extracts id from standard watch URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from youtu.be short URL', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from youtu.be with timestamp query', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from m.youtube.com mobile URL', () => {
    expect(extractYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from embed URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from shorts URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id from /live/ URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts id when extra query params present', () => {
    expect(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2'),
    ).toBe('dQw4w9WgXcQ')
  })

  it('returns null for invalid id length (10 chars)', () => {
    expect(extractYoutubeVideoId('https://youtu.be/abcdefghij')).toBeNull()
  })

  it('returns null for invalid id length (12 chars)', () => {
    expect(extractYoutubeVideoId('https://youtu.be/abcdefghijkl')).toBeNull()
  })

  it('returns null for id with invalid characters', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9!gXcQ')).toBeNull()
  })

  it('rejects attacker host (youtube.com.evil.com)', () => {
    expect(extractYoutubeVideoId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects attacker host (evil.com/youtube.com)', () => {
    expect(extractYoutubeVideoId('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects vimeo URL', () => {
    expect(extractYoutubeVideoId('https://vimeo.com/123456789')).toBeNull()
  })

  it('rejects malformed URL', () => {
    expect(extractYoutubeVideoId('not a url')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(extractYoutubeVideoId('')).toBeNull()
  })

  it('rejects URL without video id', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch')).toBeNull()
  })

  it('extracts id from youtube-nocookie embed URL', () => {
    expect(
      extractYoutubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ')
  })
})

describe('youtube — normalizeYoutubeEmbedUrl', () => {
  it('normalizes watch URL to youtube-nocookie embed', () => {
    expect(normalizeYoutubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    )
  })

  it('normalizes youtu.be to youtube-nocookie embed', () => {
    expect(normalizeYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    )
  })

  it('normalizes shorts URL', () => {
    expect(normalizeYoutubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    )
  })

  it('returns null for invalid URL', () => {
    expect(normalizeYoutubeEmbedUrl('https://example.com')).toBeNull()
  })
})

describe('youtube — isYoutubeUrl', () => {
  it('accepts standard youtube.com', () => {
    expect(isYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
  })

  it('accepts youtu.be', () => {
    expect(isYoutubeUrl('https://youtu.be/abc')).toBe(true)
  })

  it('accepts youtube-nocookie.com', () => {
    expect(isYoutubeUrl('https://www.youtube-nocookie.com/embed/abc')).toBe(true)
  })

  it('rejects attacker subdomain', () => {
    expect(isYoutubeUrl('https://youtube.com.evil.com/watch?v=abc')).toBe(false)
  })

  it('rejects non-https/http protocol', () => {
    expect(isYoutubeUrl('javascript:alert(1)//youtube.com')).toBe(false)
  })
})

describe('youtube — getYoutubeThumbnailUrl', () => {
  it('returns mqdefault by default', () => {
    expect(getYoutubeThumbnailUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    )
  })

  it('respects maxres quality', () => {
    expect(getYoutubeThumbnailUrl('https://youtu.be/dQw4w9WgXcQ', 'maxres')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    )
  })

  it('returns null for invalid URL', () => {
    expect(getYoutubeThumbnailUrl('https://vimeo.com/123')).toBeNull()
  })
})
