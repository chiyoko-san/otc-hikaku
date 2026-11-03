import type { MetadataRoute } from 'next'
import { PAGES, dataDate } from '@/lib/sagasu'

const BASE = 'https://kusuri-compass.com'

// /sagasu/sitemap.xml として出る（Search Console に別途送信）
export default function sitemap(): MetadataRoute.Sitemap {
  const d = dataDate()
  const lastModified = d ? new Date(d) : undefined
  return [
    { url: `${BASE}/sagasu/`, lastModified },
    ...PAGES.map(([s, c]) => ({ url: `${BASE}/sagasu/${s}/${c}/`, lastModified })),
  ]
}
