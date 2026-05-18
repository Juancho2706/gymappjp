import { Metadata } from 'next'
import { getAllNewsItems } from './_data/novedades.queries'
import { NewsAdminList } from './_components/NewsAdminList'
import { NewsCreateSheet } from './_components/NewsCreateSheet'

export const metadata: Metadata = {
  title: 'Novedades | EVA CEO',
}

export default async function AdminNovedadesPage() {
  const items = await getAllNewsItems()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Novedades</h1>
          <p className="text-xs text-[--admin-text-3]">
            {items.length} novedad{items.length !== 1 ? 'es' : ''} en total.
          </p>
        </div>
        <NewsCreateSheet />
      </div>

      <NewsAdminList items={items} />
    </div>
  )
}
