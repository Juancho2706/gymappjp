// RN equivalent: View footer with SafeAreaView + links

import Link from 'next/link'
import Image from 'next/image'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { CONTACT_EMAIL } from '../../_data/enterprise-content'

const FOOTER_LINKS = [
  { label: 'Aviso Legal', href: '/legal' },
  { label: 'Privacidad', href: '/privacidad' },
  { label: 'Contrato Enterprise', href: '/legal/contrato-enterprise' },
]

export function EnterpriseFooter() {
  return (
    <footer className="border-t border-zinc-800 py-10 px-4 sm:px-6 lg:px-8 pb-safe">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Image src={BRAND_APP_ICON} alt="" width={28} height={28} className="rounded-lg" />
            <div>
              <p className="text-sm font-bold text-zinc-200">EVA Enterprise</p>
              <p className="text-xs text-zinc-600">enterprise.eva-app.cl</p>
            </div>
          </div>

          {/* Links */}
          <nav aria-label="Footer legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Contact */}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="mt-8 border-t border-zinc-800/60 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} EVA · Todos los derechos reservados
          </p>
          <p className="text-xs text-zinc-700">
            Hecho en Chile 🇨🇱 · Conforme a Ley 19.628 y 21.719
          </p>
        </div>
      </div>
    </footer>
  )
}
