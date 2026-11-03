import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  PAGES, SYMPTOMS, CONDS, MIN_ITEMS, isPage, getPageData, pageTitle,
  RISK_GROUPS, shortIngs, medicineHref, dataDate,
} from '@/lib/sagasu'

type Props = { params: { symptom: string; cond: string } }

export const dynamicParams = false

export function generateStaticParams() {
  return PAGES.map(([symptom, cond]) => ({ symptom, cond }))
}

export function generateMetadata({ params }: Props): Metadata {
  const { symptom, cond } = params
  if (!isPage(symptom, cond)) return {}
  const { items, S, C } = getPageData(symptom, cond)
  const title = pageTitle(symptom, cond, items.length)
  const description = `${S.label}のうち、${C.label}市販薬${items.length}品を、PMDAの添付文書データの成分から一覧にしました。区分ごとに製品名・メーカー・主な成分を載せています。`
  return {
    title,
    description,
    alternates: { canonical: `https://kusuri-compass.com/sagasu/${symptom}/${cond}/` },
    robots: items.length >= MIN_ITEMS ? undefined : { index: false, follow: true },
    openGraph: { title, description },
  }
}

function Lead({ symptom, cond, n, base, kampo }: { symptom: string; cond: string; n: number; base: number; kampo: number }) {
  const S = SYMPTOMS[symptom]
  const lines: string[] = []
  if (cond === 'nemuke-nashi') {
    lines.push(`${S.label}${base}品のうち、眠気の注意がある成分を含まないものは${n}品です。`)
    if (kampo * 2 > n) lines.push(`このうち${kampo}品は漢方薬です。`)
    if (symptom === 'kaze') lines.push('総合かぜ薬の多くは、鼻水を抑える抗ヒスタミン成分が入っているため眠気の注意があります。')
    if (symptom === 'zutsu') lines.push('鎮静成分（アリルイソプロピルアセチル尿素・ブロモバレリル尿素）入りの頭痛薬はここに入りません。')
  } else if (cond === 'kodomo') {
    lines.push(`商品名に「小児用」「こども」などとある${S.label}は${n}品です。`)
    lines.push('何歳から使えるか・1回の量は製品ごとに違います。必ずパッケージで確かめてください。')
  } else {
    lines.push(`${S.label}${base}品のうち、${CONDS[cond].label}ものは${n}品です。`)
  }
  return (
    <section className="panel mt-6 p-5">
      <h2 className="text-lg font-bold">まず結論</h2>
      {lines.map((l) => (
        <p key={l} className="mt-2 leading-relaxed">{l}</p>
      ))}
    </section>
  )
}

export default function Page({ params }: Props) {
  const { symptom, cond } = params
  if (!isPage(symptom, cond)) notFound()
  const { S, C, items, baseCount, kampo } = getPageData(symptom, cond)
  const title = pageTitle(symptom, cond, items.length)
  const date = dataDate()

  const sameSymptom = Object.keys(CONDS).filter((c) => c !== cond && isPage(symptom, c))
  const sameCond = Object.keys(SYMPTOMS).filter((s) => s !== symptom && isPage(s, cond))

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-6">
      <nav aria-label="パンくず" className="text-sm">
        <Link href="/" className="underline">トップ</Link>
        <span className="mx-1">›</span>
        <Link href="/sagasu/" className="underline">条件で探す</Link>
      </nav>

      <h1 className="mt-4 text-[26px] font-bold leading-snug">{title}</h1>

      <Lead symptom={symptom} cond={cond} n={items.length} base={baseCount} kampo={kampo} />

      <section className="mt-12">
        <h2 className="text-[22px] font-bold">一覧（{items.length}品）</h2>
        <p className="mt-2 text-sm leading-relaxed">製品名を押すと、成分・効能・注意の詳しいページに進みます。</p>
        {RISK_GROUPS.map((g, gi) => {
          const list = items.filter((m) => g.test(m.risk))
          if (list.length === 0) return null
          return (
            <details key={g.key} className="panel mt-4" open={gi === 0 || list.length <= 40}>
              <summary className="cursor-pointer p-5 text-lg font-bold">
                {g.label}（{list.length}品）
              </summary>
              <ul className="border-t border-gray-200">
                {list.map((m) => (
                  <li key={m.id} className="border-b border-gray-200 px-5 py-4 last:border-b-0">
                    <Link href={medicineHref(m)} className="text-lg font-bold underline">{m.name}</Link>
                    <p className="mt-1 text-sm">{m.maker}</p>
                    <p className="mt-1 text-sm leading-relaxed">主な成分：{shortIngs(m)}</p>
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </section>

      <section className="mt-12">
        <h2 className="text-[22px] font-bold">どうやって選んだか</h2>
        <p className="mt-3 leading-relaxed">{C.how}</p>
        <p className="mt-3 leading-relaxed">
          元のデータは、PMDA（医薬品医療機器総合機構）が公開している市販薬の添付文書です{date ? `（${date}時点）` : ''}。同じ名前の製品は1つにまとめています。
        </p>
      </section>

      <section className="panel mt-12 p-5">
        <h2 className="text-lg font-bold">買う前に</h2>
        <p className="mt-2 leading-relaxed">
          この一覧は成分で絞り込んだもので、効き方や副作用がないことを約束するものではありません。体質やほかに飲んでいる薬によっては合わないことがあります。迷ったら、お店の薬剤師か登録販売者に「この症状で、この条件の薬はどれですか」と聞いてください。
        </p>
      </section>

      {(sameSymptom.length > 0 || sameCond.length > 0) && (
        <section className="mt-12">
          <h2 className="text-[22px] font-bold">ほかの条件で探す</h2>
          <ul className="mt-3 space-y-3">
            {sameSymptom.map((c) => (
              <li key={c}>
                <Link href={`/sagasu/${symptom}/${c}/`} className="text-lg underline">
                  {S.noun}：{CONDS[c].label}
                </Link>
              </li>
            ))}
            {sameCond.map((s) => (
              <li key={s}>
                <Link href={`/sagasu/${s}/${cond}/`} className="text-lg underline">
                  {SYMPTOMS[s].noun}：{C.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
