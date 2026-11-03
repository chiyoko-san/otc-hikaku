import type { Metadata } from 'next'
import Link from 'next/link'
import { getPages, SYMPTOMS, CONDS, getPageData } from '@/lib/sagasu'
import { buildMetadata } from '@/lib/seo'

export const metadata: Metadata = buildMetadata({
  title: '条件で市販薬を探す｜眠くならない・カフェインなし・子ども用など',
  description:
    '風邪薬・鼻炎薬・咳止め・頭痛薬などを、「眠気の注意がある成分を含まない」「カフェインなし」「子ども用」などの条件で絞り込んだ一覧です。PMDAの添付文書データの成分から作っています。',
  path: '/sagasu/',
})

export default function SagasuIndex() {
  const groups = Object.keys(SYMPTOMS)
    .map((s) => ({ s, conds: getPages().filter(([a]) => a === s).map(([, c]) => c) }))
    .filter((g) => g.conds.length > 0)
  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-6">
      <nav aria-label="パンくず" className="text-sm">
        <Link href="/" className="underline">トップ</Link>
      </nav>
      <h1 className="mt-4 text-[26px] font-bold leading-snug">条件で市販薬を探す</h1>
      <p className="mt-3 leading-relaxed">
        「眠くなると困る」「カフェインを控えたい」「子どもに使いたい」など、条件に合う市販薬を成分から絞り込みました。
      </p>
      {groups.map(({ s, conds }) => (
        <section key={s} className="panel mt-8 p-5">
          <h2 className="text-[22px] font-bold">{SYMPTOMS[s].label}</h2>
          <ul className="mt-3 space-y-3">
            {conds.map((c) => {
              const n = getPageData(s, c).items.length
              return (
                <li key={c}>
                  <Link href={`/sagasu/${s}/${c}/`} className="text-lg underline">
                    {CONDS[c].label}（{n}品）
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </main>
  )
}
