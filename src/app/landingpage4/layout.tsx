import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './forge-theme.css'

const archivo = Archivo({
    subsets: ['latin'],
    variable: '--font-forge-display',
    weight: ['400', '600', '700', '800', '900'],
    display: 'swap',
})

const forgeMono = IBM_Plex_Mono({
    subsets: ['latin'],
    variable: '--font-forge-mono',
    weight: ['400', '500', '600'],
    display: 'swap',
})

export default function LandingPage4Layout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={`landing-forge ${archivo.variable} ${forgeMono.variable} relative min-h-dvh overflow-x-hidden`}
        >
            <div className="landing-forge-grid pointer-events-none absolute inset-0 z-0" aria-hidden />
            <div className="relative z-[1]">{children}</div>
        </div>
    )
}
