import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl'

    return {
        rules: {
            userAgent: '*',
            allow: ['/'],
            disallow: ['/coach/', '/c/', '/api/', '/payments/'],
        },
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}
