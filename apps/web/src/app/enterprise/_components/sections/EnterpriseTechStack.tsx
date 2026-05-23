'use client'

import type { ReactElement } from 'react'
import { Reveal, RevealStagger, RevealItem } from '../atoms/Reveal'
import { SectionEyebrow } from '../atoms/SectionEyebrow'

type StackItem = {
  name: string
  blurb: string
  brandColor: string
  Logo: () => ReactElement
}

const VercelLogo = () => (
  <svg viewBox="0 0 76 65" className="h-10 w-auto" aria-hidden>
    <path d="M37.59.25l36.95 64H.64l36.95-64z" fill="#000" />
  </svg>
)

const SupabaseLogo = () => (
  <svg viewBox="0 0 109 113" className="h-10 w-auto" aria-hidden>
    <defs>
      <linearGradient id="sb-a" x1="53.974" x2="94.163" y1="54.974" y2="71.829" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#249361" />
        <stop offset="1" stopColor="#3ECF8E" />
      </linearGradient>
      <linearGradient id="sb-b" x1="36.156" x2="54.484" y1="30.578" y2="65.081" gradientUnits="userSpaceOnUse">
        <stop offset="0" />
        <stop offset="1" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      fill="url(#sb-a)"
      d="M63.708 110.284c-2.86 3.601-8.658 1.628-8.727-2.97l-1.007-67.251h45.22c8.19 0 12.758 9.46 7.665 15.874l-43.151 54.347Z"
    />
    <path
      fill="url(#sb-b)"
      fillOpacity=".2"
      d="M63.708 110.284c-2.86 3.601-8.658 1.628-8.727-2.97l-1.007-67.251h45.22c8.19 0 12.758 9.46 7.665 15.874l-43.151 54.347Z"
    />
    <path
      fill="#3ECF8E"
      d="M45.317 2.071c2.86-3.602 8.657-1.628 8.726 2.97l.442 67.251H9.83c-8.19 0-12.759-9.46-7.665-15.875L45.317 2.07Z"
    />
  </svg>
)

const AnthropicLogo = () => (
  <svg viewBox="0 0 92 65" className="h-10 w-auto" aria-hidden>
    <path
      d="M66.04 0H51.92l25.74 64.5H91.78L66.04 0ZM25.74 0 0 64.5h14.41l5.26-13.59h26.93l5.26 13.59h14.41L40.55 0H25.74Zm-1.79 39.05 8.78-22.66 8.78 22.66H23.95Z"
      fill="#181818"
    />
  </svg>
)

const GeminiLogo = () => (
  <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 65" className="h-10 w-auto" aria-hidden>
    <mask id="gm-mask" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="0" y="0" width="65" height="65">
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="#000"/>
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="url(#gm-grad)"/>
    </mask>
    <g mask="url(#gm-mask)">
      <g filter="url(#gm-f0)"><path d="M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z" fill="#FFE432"/></g>
      <g filter="url(#gm-f1)"><path d="M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z" fill="#FC413D"/></g>
      <g filter="url(#gm-f2)"><path d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z" fill="#00B95C"/></g>
      <g filter="url(#gm-f3)"><path d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z" fill="#00B95C"/></g>
      <g filter="url(#gm-f4)"><path d="M30.954 74.181c9.014-5.485 11.427-17.976 5.389-27.9-6.038-9.925-18.241-13.524-27.256-8.04-9.015 5.486-11.428 17.977-5.39 27.902 6.04 9.924 18.242 13.523 27.257 8.038z" fill="#00B95C"/></g>
      <g filter="url(#gm-f5)"><path d="M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z" fill="#3186FF"/></g>
      <g filter="url(#gm-f6)"><path d="M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z" fill="#FBBC04"/></g>
      <g filter="url(#gm-f7)"><path d="M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z" fill="#3186FF"/></g>
      <g filter="url(#gm-f8)"><path d="M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727-7.324 5.387-15.557 6.631-18.39 2.78-2.833-3.853.807-11.342 8.13-16.728 7.324-5.387 15.558-6.631 18.39-2.78z" fill="#749BFF"/></g>
      <g filter="url(#gm-f9)"><path d="M31.727 16.104C43.053 5.598 46.94-8.626 40.41-15.666c-6.53-7.04-21.006-4.232-32.332 6.274s-15.214 24.73-8.683 31.77c6.53 7.04 21.006 4.232 32.332-6.274z" fill="#FC413D"/></g>
      <g filter="url(#gm-f10)"><path d="M8.51 53.838c6.732 4.818 14.46 5.55 17.262 1.636 2.802-3.915-.384-10.994-7.116-15.812-6.731-4.818-14.46-5.55-17.261-1.636-2.802 3.915.383 10.994 7.115 15.812z" fill="#FFEE48"/></g>
    </g>
    <defs>
      <filter id="gm-f0" x="-19.824" y="13.152" width="39.274" height="43.217" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="2.46" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f1" x="-15.001" y="-40.257" width="84.868" height="85.688" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="11.891" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f2" x="-20.776" y="11.927" width="79.454" height="90.916" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f3" x="-20.776" y="11.927" width="79.454" height="90.916" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f4" x="-19.845" y="15.459" width="79.731" height="81.505" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f5" x="29.832" y="-11.552" width="75.117" height="73.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="9.606" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f6" x="-38.583" y="-16.253" width="78.135" height="78.758" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="8.706" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f7" x="8.107" y="-5.966" width="78.877" height="77.539" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="7.775" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f8" x="13.587" y="-18.488" width="56.272" height="51.81" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="6.957" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f9" x="-15.526" y="-31.297" width="70.856" height="69.306" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="5.876" result="effect1_foregroundBlur"/></filter>
      <filter id="gm-f10" x="-14.168" y="20.964" width="55.501" height="51.571" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="7.273" result="effect1_foregroundBlur"/></filter>
      <linearGradient id="gm-grad" x1="18.447" y1="43.42" x2="52.153" y2="15.004" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4893FC"/>
        <stop offset=".27" stopColor="#4893FC"/>
        <stop offset=".777" stopColor="#969DFF"/>
        <stop offset="1" stopColor="#BD99FE"/>
      </linearGradient>
    </defs>
  </svg>
)

const STACK: StackItem[] = [
  {
    name: 'Vercel',
    blurb: 'Edge runtime global. <50 ms latencia desde Santiago. Deploys atómicos.',
    brandColor: '#000000',
    Logo: VercelLogo,
  },
  {
    name: 'Supabase',
    blurb: 'PostgreSQL + Row-Level Security. Datos aislados por organización a nivel DB.',
    brandColor: '#3ECF8E',
    Logo: SupabaseLogo,
  },
  {
    name: 'Anthropic Claude',
    blurb: 'EVA fue construido con Claude. Arquitectura, flujos y lógica de negocio diseñados con IA de clase enterprise.',
    brandColor: '#D97757',
    Logo: AnthropicLogo,
  },
  {
    name: 'Google Gemini',
    blurb: 'Diseño asistido por visión multimodal. UX, validación de flujos y estructura de producto desarrollados con Gemini.',
    brandColor: '#1C69FF',
    Logo: GeminiLogo,
  },
]

export function EnterpriseTechStack() {
  return (
    <section
      id="stack"
      className="relative py-24 sm:py-32 overflow-hidden"
      style={{
        background: '#ffffff',
        backgroundImage:
          'linear-gradient(rgba(10,27,63,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,27,63,.04) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
      aria-labelledby="stack-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{ background: 'linear-gradient(180deg, #fff 0%, transparent 100%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{ background: 'linear-gradient(0deg, #F8FAFC 0%, transparent 100%)' }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <Reveal className="text-center mb-16 max-w-2xl mx-auto">
          <SectionEyebrow>{'// CONSTRUIDO SOBRE INFRAESTRUCTURA LÍDER'}</SectionEyebrow>
          <h2
            id="stack-heading"
            className="mt-4 text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-[#0A1B3F]"
          >
            Stack de clase mundial.
            <br />
            <span
              style={{
                background: 'linear-gradient(90deg, #007AFF 0%, #00E5FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Sin compromisos.
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed">
            La misma infraestructura que usan Vercel, Notion, GitHub y OpenAI. Tu gym opera
            sobre proveedores que mueven miles de millones de requests al día — no sobre un
            servidor improvisado.
          </p>
        </Reveal>

        <RevealStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STACK.map(item => (
            <RevealItem key={item.name}>
              <article
                className="group relative h-full rounded-2xl bg-white border border-gray-200 p-7 transition-all duration-300 hover:-translate-y-1"
                style={{
                  boxShadow: '0 1px 2px rgba(10,27,63,0.04)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = `0 12px 40px -8px ${item.brandColor}33, 0 0 0 1px ${item.brandColor}55`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(10,27,63,0.04)'
                }}
              >
                <div className="flex items-center justify-center h-16 mb-5">
                  <item.Logo />
                </div>
                <h3 className="text-base font-bold text-[#0A1B3F] mb-2 text-center">
                  {item.name}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed text-center">
                  {item.blurb}
                </p>
                <div
                  className="absolute inset-x-0 -bottom-px h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${item.brandColor} 50%, transparent 100%)`,
                  }}
                  aria-hidden
                />
              </article>
            </RevealItem>
          ))}
        </RevealStagger>

        <Reveal delay={0.2} className="mt-12 text-center">
          <p className="text-xs font-mono uppercase tracking-[0.18em] text-gray-400">
            {'// SLA combinado de 99.95% sobre toda la cadena de infraestructura'}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
