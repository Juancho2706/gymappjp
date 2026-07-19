import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

/**
 * Tarjeta Open Graph de marca EVA — 1200×630 (ratio 1.91:1, el óptimo de
 * WhatsApp/Facebook; auditoría SEO 2026-07-18, R1). La consumen los
 * `opengraph-image.tsx` de `/` (root), `/pricing` y `/enterprise` vía la
 * convención de archivos de Next (los segmentos con `openGraph` propio en
 * config NO heredan la imagen del root — el merge de Next reemplaza el objeto
 * completo — por eso cada segmento público con openGraph propio re-exporta
 * esta tarjeta).
 *
 * Assets locales leídos con `join(process.cwd(), '<literal>')` (patrón oficial
 * de Next; trazable por NFT y resuelto en build — la ruta es estática, sin
 * APIs dinámicas). Fuente Archivo (display del DS EVA) vendorizada en
 * `./fonts` (SIL OFL) porque `next/og` solo trae un peso 400 por defecto y
 * satori no sintetiza negritas.
 */

export const BRAND_OG_SIZE = { width: 1200, height: 630 }
export const BRAND_OG_ALT = 'EVA — Una plataforma. Tu marca.'
export const BRAND_OG_CONTENT_TYPE = 'image/png'

// Paleta sport-* de globals.css (tema dark de la landing).
const BG_NAVY = '#050B16'
// Glows: rgba(38,128,255,…) = --sport-500 #2680FF; rgba(34,211,238,…) = cyan del wordmark.
const BRAND_BLUE_SOFT = '#5C9DFF' // --sport-400 (legible sobre navy)
const TEXT_MUTED = '#A6B6D4'
const TEXT_PILL = '#C5DCFF' // --sport-200

export async function renderBrandOgImage(): Promise<ImageResponse> {
  const [wordmark, archivoBold, archivoRegular] = await Promise.all([
    readFile(join(process.cwd(), 'public/LOGOS/eva-wordmark-outline.png')),
    readFile(join(process.cwd(), 'src/lib/og/fonts/Archivo-Bold.ttf')),
    readFile(join(process.cwd(), 'src/lib/og/fonts/Archivo-Regular.ttf')),
  ])

  const wordmarkSrc = `data:image/png;base64,${wordmark.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BG_NAVY,
          backgroundImage:
            `radial-gradient(ellipse 900px 560px at 16% -10%, rgba(38, 128, 255, 0.30), transparent 62%), ` +
            `radial-gradient(ellipse 840px 540px at 88% 112%, rgba(34, 211, 238, 0.22), transparent 60%)`,
          fontFamily: 'Archivo',
          padding: '48px 80px',
        }}
      >
        {/* Wordmark EVA (PNG con márgenes transparentes grandes → márgenes
            negativos para compactar el layout sin recortar el asset).
            <img> crudo es obligatorio: esto lo rasteriza satori, no el DOM. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wordmarkSrc}
          width={960}
          height={387}
          style={{ marginTop: -100, marginBottom: -88 }}
          alt=""
        />

        <div
          style={{
            display: 'flex',
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
          }}
        >
          <span style={{ color: '#FFFFFF' }}>Una plataforma.&nbsp;</span>
          <span style={{ color: BRAND_BLUE_SOFT }}>Tu marca.</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 24,
            maxWidth: 920,
            fontSize: 27,
            fontWeight: 400,
            lineHeight: 1.45,
            color: TEXT_MUTED,
            textAlign: 'center',
          }}
        >
          Rutinas, nutrición y una app instalable con tu logo y tu color.
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 40,
            padding: '10px 28px',
            borderRadius: 999,
            border: `1px solid rgba(92, 157, 255, 0.40)`,
            backgroundColor: 'rgba(38, 128, 255, 0.10)',
            color: TEXT_PILL,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '1px',
          }}
        >
          www.eva-app.cl
        </div>
      </div>
    ),
    {
      ...BRAND_OG_SIZE,
      fonts: [
        { name: 'Archivo', data: archivoBold, weight: 700, style: 'normal' },
        { name: 'Archivo', data: archivoRegular, weight: 400, style: 'normal' },
      ],
    },
  )
}
