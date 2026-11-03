import type { MetadataRoute } from 'next'
import { getSagasuPaths, dataDate } from '@/lib/sagasu'
import { SITE_URL } from '@/lib/seo'

// /sagasu/sitemap.xml（同じURLは /sitemap/0.xml にも載っている。どちらか一方でも辿れる）
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = dataDate() || undefined
  return getSagasuPaths().map((p) => ({ url: `${SITE_URL}${p}`, lastModified }))
}
