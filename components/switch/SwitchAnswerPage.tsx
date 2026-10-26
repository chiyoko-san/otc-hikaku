import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Medicine } from '@/types';
import {
  type SwitchDrug,
  type SwitchMonthly,
  getOtcCombosForSwitch,
  getOtcMatchesForSwitch,
  getOtcVariantsForSwitch,
  getSwitchMonthly,
  getSwitchSiblings,
} from '@/lib/switch-data';
import { GENERATED_SOURCE_LABEL } from '@/lib/switch-generated';
import { getCategoryLabel } from '@/lib/categories';
import { OTC_SIMILAR_META, getOtcSimilarByNo } from '@/lib/otc-similar-77';
import { OTC_SIMILAR_PATHS } from '@/lib/otc-similar-data';
import { getItemsByNo, getYakkaDateLabel, yen } from '@/lib/otc-similar-items';
import { pickRelatedColumns, columnHref } from '@/lib/related-columns';
import { SITE_URL, buildBreadcrumbJsonLd, buildFaqJsonLd } from '@/lib/seo';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { JsonLd } from '@/components/layout/JsonLd';
import { MedicineCard } from '@/components/medicine/MedicineCard';
import { ShareCard } from '@/components/ShareCard';
import OtcSimilarPriceTable from '@/components/OtcSimilarPriceTable';

// 配置先: components/switch/SwitchAnswerPage.tsx
//
// 2026-10 作り直し版の切替ページ（answer が入っている薬だけこちらで表示）。
// 検索意図「〇〇と同じ成分の市販薬・ネットで買える？・いくら上乗せ？」に、
// 冒頭1画面の「答えの箱」で4点まとめて答え、その下に根拠（一覧・区分・薬価・違い・FAQ）を置く。
// スマホの型: 緑1色（brand）、赤（alert）は「増える額」だけ、囲みは .panel、見出しサイズはCSSで固定。

type RiskInfo = { label: string; cls: string; short: string; detail: string };

/** 区分ごとの「ネットで買えるか」。一般用医薬品（第1〜3類）はいずれもネット販売可、要指導医薬品は不可 */
const RISK_INFO: Record<string, RiskInfo> = {
  '1': {
    label: '第1類医薬品',
    cls: 'risk-1',
    short: 'ネットでも買えます（薬剤師の確認あり）',
    detail:
      'ドラッグストアでは薬剤師がいる時間帯に買えます。ネット通販でも買えますが、注文のあとに薬剤師からの情報提供（質問への回答）を受けてから発送されます。',
  },
  '2': {
    label: '第2類医薬品',
    cls: 'risk-2',
    short: 'ドラッグストアでもネットでも買えます',
    detail:
      'ドラッグストアの棚から選べるほか、薬局・ドラッグストアのネット通販でも普通に買えます。薬剤師または登録販売者のいる店なら、その場で質問できます。',
  },
  '2.5': {
    label: '指定第2類医薬品',
    cls: 'risk-2-5',
    short: 'ドラッグストアでもネットでも買えます',
    detail:
      'ネット通販でも買えますが、「使ってはいけない人」が決められている薬です。パッケージの「してはいけないこと」を読んでから買ってください。',
  },
  '3': {
    label: '第3類医薬品',
    cls: 'risk-3',
    short: 'ドラッグストアでもネットでも買えます',
    detail: 'ドラッグストアの棚からも、ネット通販でも買えます。',
  },
};

export function riskInfoFor(risk: number): RiskInfo {
  return RISK_INFO[String(risk)] ?? RISK_INFO['2'];
}

const KIDS_RE = /ジュニア|こども|子ども|子供|小児|キッズ/;
/** 貼り薬・塗り薬（外用）らしい製品名。groupBy: 'route' のときだけ使う */
const TOPICAL_RE = /テープ|パップ|ゲル|ローション|クリーム|軟膏|スプレー|プラスター|シップ|湿布|液|貼|塗|外用/;

/** ページ本文・meta・OG画像が共通で使う要約（市販薬一覧・1か月の上乗せ・区分・代表製品名2つ） */
export function switchAnswerSummary(entry: SwitchDrug) {
  const matches = getOtcMatchesForSwitch(entry, 9999);
  const monthly = getSwitchMonthly(entry);
  const risk = riskInfoFor(entry.answer?.otcRisk ?? 2);
  /** 区分の一言。otcRiskNote があればそれを優先 */
  const riskLine = entry.answer?.otcRiskNote ?? risk.short;
  // 代表製品名: 処方薬名で始まる製品（アレグラFX）と、名前で足した製品（アレルビ）を優先して2つ
  const brand = entry.rxName.replace(/[(（].*$/, '');
  const extra = entry.answer?.extraOtcNames ?? [];
  const picks: string[] = [];
  const first = matches.find((m) => m.name.startsWith(brand));
  const second = matches.find((m) => extra.some((n) => m.name.includes(n)));
  if (first) picks.push(first.name);
  if (second && !picks.includes(second.name)) picks.push(second.name);
  for (const m of matches) {
    if (picks.length >= 2) break;
    if (!picks.includes(m.name)) picks.push(m.name);
  }
  return { matches, monthly, risk, riskLine, topNames: picks };
}

function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold md:text-2xl">
      {children}
    </h2>
  );
}

function MedicineGrid({ list }: { list: Medicine[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((m) => (
        <MedicineCard key={m.id} med={m} badge="同成分" />
      ))}
    </div>
  );
}

export default async function SwitchAnswerPage({ entry }: { entry: SwitchDrug }) {
  const a = entry.answer;
  if (!a) return null;
  const { matches, monthly, risk, riskLine, topNames } = switchAnswerSummary(entry);
  const variants = getOtcVariantsForSwitch(entry);
  const combos = getOtcCombosForSwitch(entry, 12);
  const comboCount = entry.answer?.otcComboIds?.length ?? 0;
  const siblings = getSwitchSiblings(entry);
  const count = matches.length;
  // Phase1（生成薬で文章が未承認）: 「同じ／違う」の文章は出さず、データだけで組む
  const hasText = a.same.trim().length > 0 || a.differs.trim().length > 0;
  const generated = entry.source === 'generated';
  const rxList = entry.rxItems ?? []; // 生成薬の処方薬一覧（NDB順）
  const partial = a.partialMatchLabel ?? null; // 「同じ組み合わせは無いが一部同じ」ページ
  const exact = count > 0 && !partial;
  const groupBy = a.groupBy ?? 'age';
  const groupA = groupBy === 'age' ? matches.filter((m) => !KIDS_RE.test(m.name)) : groupBy === 'route' ? matches.filter((m) => !TOPICAL_RE.test(m.name)) : matches;
  const groupB = groupBy === 'age' ? matches.filter((m) => KIDS_RE.test(m.name)) : groupBy === 'route' ? matches.filter((m) => TOPICAL_RE.test(m.name)) : [];
  const groupLabels = groupBy === 'route' ? ['飲み薬', '貼り薬・塗り薬'] : ['大人用', '子ども用'];
  const isTarget = entry.otcSimilarNo != null;
  const ing = isTarget && entry.otcSimilarNo != null ? getOtcSimilarByNo(entry.otcSimilarNo) : null;
  const rxItems = isTarget && entry.otcSimilarNo != null ? getItemsByNo(entry.otcSimilarNo) : [];
  const dateLabel = getYakkaDateLabel();
  const path = `/switch/${entry.slug}/`;

  const relatedColumns = await pickRelatedColumns({
    ingredients: [entry.genericName, ...entry.ingredientKeys],
    keywords: [entry.rxName, entry.categoryLabel],
    limit: 3,
  });

  const breadcrumbs = [
    { name: 'ホーム', href: '/' },
    { name: '処方薬から探す', href: '/switch/' },
    { name: entry.rxName },
  ];

  const feeLine = (m: SwitchMonthly) =>
    `${m.qtyLabel}もらう場合、3割負担の方は薬代が約${yen(m.e3.before)}→約${yen(m.e3.after)}（+約${yen(m.e3.diff)}）、2割負担で+約${yen(m.e2.diff)}、1割負担で+約${yen(m.e1.diff)}増える計算です`;

  const faqs = [
    {
      q: `${entry.rxName}と同じ成分の市販薬はありますか？`,
      a: exact
        ? `あります。${entry.rxName}の有効成分（${entry.genericName}）を含む市販薬は${topNames.join('・')}など${count}品です。${a.same}`.trim()
        : partial
          ? `${a.same} ${a.differs}`
          : comboCount > 0
            ? `${entry.genericName}だけでできた市販薬はありませんが、${entry.genericName}にほかの成分が加わった市販薬が${comboCount}品あります。${entry.altNote ?? ''}`.trim()
            : `${a.same} ${entry.altNote ?? ''}`.trim(),
    },
    {
      q: `${entry.rxName}と同じ成分の市販薬はネット通販で買えますか？`,
      a:
        count > 0
          ? `${risk.label}なので買えます。${riskLine} ${risk.detail}`
          : '同じ成分の市販薬が販売されていないため、ネットでも店頭でも買えません。',
    },
    {
      q: `${entry.rxName}は2027年3月からの上乗せ料金（OTC類似薬の特別料金）の対象ですか？`,
      a: isTarget
        ? `厚生労働省の案では対象です。処方のときに薬代の4分の1が上乗せされる見込みで、${monthly ? `${monthly.item.name}を${feeLine(monthly)}。` : ''}市販薬として買う場合は上乗せはありません。お子さん、がん・難病など配慮が必要な方、低所得の方、入院中の方、医師が長期使用を必要と判断した方などは対象外の方向で検討されています。最終的な対象は国の告示で決まります。`
        : `厚生労働省の案（77成分）には含まれていないため、現時点では対象外です。ただし令和9年度以降に対象範囲の拡大が検討されており、今後変わる可能性があります。`,
    },
    ...(hasText
      ? [
          {
            q: '処方薬と市販薬で何が違いますか？',
            a: exact ? `${a.same} 違うのは使える範囲です。${a.differs}` : `${a.same} ${a.differs}`,
          },
        ]
      : []),
    {
      q: '購入するときに気をつけることはありますか？',
      a: `${entry.caution} 症状が続く場合や判断に迷う場合は、自己判断せず医師・薬剤師に相談してください。`,
    },
  ];
  const similarCategory = entry.siteCategory ? { id: entry.siteCategory, label: getCategoryLabel(entry.siteCategory) } : null;

  const shareMessage =
    `【${entry.rxName}と同じ成分の市販薬】\n` +
    (exact
      ? `・市販薬は${count}品（${topNames.join('、')} など）\n`
      : partial
        ? `・同じ組み合わせの市販薬はなし。${partial}が${count}品\n`
        : `・同じ成分の市販薬はありません\n`) +
    (count > 0 ? `・${risk.label}：${riskLine}\n` : '') +
    (isTarget
      ? monthly
        ? `・2027年3月から処方の${entry.rxName}は上乗せ料金の対象。${monthly.qtyLabel}で3割負担なら+約${yen(monthly.e3.diff)}`
        : `・2027年3月から処方の${entry.rxName}は上乗せ料金の対象`
      : `・2027年3月からの上乗せ料金は対象外（厚労省案）`);
  const shareX =
    exact
      ? `${entry.rxName}と同じ成分の市販薬は${count}品。${risk.label}なので${risk.short.replace('ます', 'る')}。` +
        (monthly ? `3月からの上乗せ料金は${monthly.qtyLabel.replace(/（.*$/, '')}で+約${yen(monthly.e3.diff)}。` : '')
      : `${entry.rxName}と同じ成分の市販薬は、いまのところありません。`;

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd(breadcrumbs.map((b) => ({ name: b.name, url: b.href || path })))}
      />
      <JsonLd data={buildFaqJsonLd(faqs)} />

      <article className="container-narrow py-6 text-lg leading-relaxed text-brand-ink md:py-10">
        <Breadcrumb items={breadcrumbs} />

        <header className="mb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="pill-brand">処方薬からの切替</span>
            <span className="pill-muted">{entry.categoryLabel}</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight md:text-4xl">{entry.rxName}と同じ成分の市販薬</h1>
          <p className="text-gray-600">有効成分：{entry.genericName}</p>
        </header>

        {/* ── 答えの箱（この1画面で4点に答える） ── */}
        <section className="panel mb-8" aria-labelledby="answer-title">
          <h2 id="answer-title" className="mb-3 text-base font-bold text-gray-600">
            まず結論
          </h2>
          <dl className="divide-y divide-gray-200">
            <div className="py-3">
              <dt className="text-base font-bold text-gray-600">同じ成分の市販薬</dt>
              <dd className="mt-1">
                {exact ? (
                  <>
                    <span className="text-2xl font-bold">{count}品</span>
                    <span className="ml-2">あります（{topNames.join('、')} など）</span>
                    <a href="#otc" className="ml-2 whitespace-nowrap font-bold text-brand underline">
                      一覧へ
                    </a>
                  </>
                ) : partial ? (
                  <>
                    <span className="text-2xl font-bold">同じ組み合わせはありません</span>
                    <span className="mt-1 block text-base text-gray-700">
                      {partial}は{count}品あります
                      <a href="#otc" className="ml-2 whitespace-nowrap font-bold text-brand underline">
                        一覧へ
                      </a>
                    </span>
                  </>
                ) : comboCount > 0 ? (
                  <>
                    <span className="text-2xl font-bold">単剤はありません</span>
                    <span className="mt-1 block text-base text-gray-700">
                      {entry.genericName}にほかの成分が加わった市販薬は{comboCount}品あります
                      <a href="#combo" className="ml-2 whitespace-nowrap font-bold text-brand underline">
                        一覧へ
                      </a>
                    </span>
                  </>
                ) : (
                  <span className="text-2xl font-bold">ありません</span>
                )}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-base font-bold text-gray-600">ネットで買える？</dt>
              <dd className="mt-1">
                {count > 0 ? (
                  <>
                    <span className="text-2xl font-bold">買えます</span>
                    <span className={`${risk.cls} ml-2 align-middle`}>{risk.label}</span>
                    <span className="mt-1 block text-base text-gray-700">{riskLine}</span>
                  </>
                ) : comboCount > 0 ? (
                  <>
                    <span className="text-2xl font-bold">配合剤なら買えます</span>
                    <span className="mt-1 block text-base text-gray-700">同じ成分だけの市販薬は無く、ほかの成分が加わった製品になります。区分は製品ごとに違います。</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold">買えません</span>
                    <span className="mt-1 block text-base text-gray-700">同じ成分の市販薬が販売されていません</span>
                  </>
                )}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-base font-bold text-gray-600">2027年3月からの上乗せ料金</dt>
              <dd className="mt-1">
                {isTarget ? (
                  <>
                    <span className="text-2xl font-bold">対象</span>
                    {monthly && (
                      <>
                        <span className="ml-2">
                          処方の{monthly.item.name}を{monthly.qtyLabel}もらうと
                        </span>
                        <span className="mt-1 block">
                          <span className="text-2xl font-bold text-alert">+約{yen(monthly.e3.diff)}</span>
                          <span className="ml-1 text-base text-gray-700">
                            （3割負担。2割なら+約{yen(monthly.e2.diff)}、1割なら+約{yen(monthly.e1.diff)}）
                          </span>
                        </span>
                      </>
                    )}
                    <span className="mt-1 block text-base text-gray-700">市販薬として買う場合、上乗せはありません。</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold">対象外</span>
                    <span className="ml-2 text-base text-gray-700">厚労省案の77成分に入っていません</span>
                  </>
                )}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-base font-bold text-gray-600">処方薬との違い</dt>
              <dd className="mt-1 text-base">
                {hasText ? (
                  <>
                    <span className="font-bold">同じ：</span>
                    {a.same}
                    <span className="mt-1 block">
                      <span className="font-bold">違う：</span>
                      {a.differs}
                    </span>
                  </>
                ) : count > 0 || comboCount > 0 ? (
                  <>市販薬は製品ごとに対象年齢・使える症状・1回の量が違います。購入の前にパッケージと添付文書で確認してください。処方薬との詳しい違いは、添付文書を照合したうえで順次追記します。</>
                ) : (
                  <>{entry.altNote}</>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-gray-600">
            市販薬の一覧はPMDA（医薬品医療機器総合機構）の承認情報、上乗せ額は厚生労働省の薬価基準（{dateLabel}時点）から計算。
            {generated && `処方薬の一覧は${GENERATED_SOURCE_LABEL}から作成。`}
            対象は厚労省案で、最終的には国の告示で決まります。
          </p>
        </section>

        <ShareCard
          heading="家族にも送っておきませんか？"
          lead="「病院の薬、市販で買えるの？」と聞かれたときに、この文章をそのまま送れます。"
          message={shareMessage}
          url={`${SITE_URL}${path}`}
          xText={shareX}
          hashtags={['上乗せ料金', 'OTC類似薬']}
        />

        {/* ── 同じ成分の市販薬 一覧 ── */}
        {count > 0 && (
          <section className="mb-10">
            <H2 id="otc">
              {partial ? `${partial}（${count}品）` : `${entry.rxName}と同じ成分の市販薬 ${count}品`}
            </H2>
            {groupA.length > 0 && groupB.length > 0 ? (
              <>
                <h3 className="mb-3 text-lg font-bold">
                  {groupLabels[0]}（{groupA.length}品）
                </h3>
                <MedicineGrid list={groupA} />
                <h3 className="mb-3 mt-6 text-lg font-bold">
                  {groupLabels[1]}（{groupB.length}品）
                </h3>
                <MedicineGrid list={groupB} />
              </>
            ) : (
              <MedicineGrid list={matches} />
            )}
            {variants.length > 0 && a.variantNote && (
              <div className="callout-warn mt-4">
                <div className="callout-title">一覧に入れていない製品</div>
                <p className="text-base">
                  {a.variantNote}（
                  {variants.map((v, i) => (
                    <span key={v.id}>
                      {i > 0 && '、'}
                      <Link href={`/medicines/${v.slug}/`} className="font-bold text-brand underline">
                        {v.name}
                      </Link>
                    </span>
                  ))}
                  ）
                </p>
              </div>
            )}
            <p className="mt-3 text-sm text-gray-600">
              一覧はPMDAの承認情報にもとづきます。値段は販売店ごとに違うため載せていません。対象年齢・1回の量は製品ごとにパッケージで確認してください。
            </p>
          </section>
        )}

        {comboCount > 0 && (
          <section className="mb-10">
            <H2 id="combo">{entry.genericName}にほかの成分が加わった市販薬 {comboCount}品</H2>
            <p className="mb-3 text-base text-gray-700">
              {entry.rxName}の成分に、別の成分を組み合わせた製品です。同じ成分が入っていても、ほかの成分の分だけ効能や注意点が変わります。
            </p>
            <MedicineGrid list={combos} />
            {comboCount > combos.length && (
              <p className="mt-2 text-sm text-gray-600">処方数量の多い順に{combos.length}品を表示（全{comboCount}品）。</p>
            )}
          </section>
        )}

        {count === 0 && comboCount === 0 && (
          <section className="mb-10">
            <H2>同じ成分の市販薬は確認できません</H2>
            <div className="callout-warn">
              <p className="text-base">{entry.altNote ?? a.same}</p>
            </div>
            {similarCategory && (
              <p className="mt-3">
                <Link href={`/categories/${similarCategory.id}/`} className="font-bold text-brand underline">
                  似た用途の市販薬（{similarCategory.label}）を成分で探す →
                </Link>
                <span className="ml-1 text-sm text-gray-600">成分は違うので、処方薬の代わりになるとは限りません。</span>
              </p>
            )}
          </section>
        )}

        {/* ── 処方薬の一覧（生成薬で、上乗せ対象でない薬）── */}
        {generated && entry.otcSimilarNo == null && rxList.length > 0 && (
          <section className="mb-10">
            <H2 id="rx">{entry.rxName}の処方薬一覧（先発・ジェネリック・薬価）</H2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-base">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 font-bold">処方薬</th>
                    <th className="px-3 py-2 font-bold">区分</th>
                    <th className="px-3 py-2 font-bold">薬価</th>
                  </tr>
                </thead>
                <tbody>
                  {rxList.slice(0, 10).map((it) => (
                    <tr key={`${it.code}-${it.name}`} className="border-t border-gray-200">
                      <td className="px-3 py-2">
                        {it.name}
                        <span className="ml-2 text-sm text-gray-600">{it.maker}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">{it.kind === '後発' ? 'ジェネリック' : it.kind}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {yen(it.price)}
                        <span className="text-sm text-gray-600">／{it.spec}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              処方数量の多い順に{Math.min(10, rxList.length)}品目（全{rxList.length}品目）。薬価は{dateLabel}時点の薬価基準。
              {entry.rxName}は2027年3月からの上乗せ料金の対象（厚労省案）に入っていないため、薬代に上乗せはありません。
            </p>
          </section>
        )}

        {/* ── ネットで買える区分 ── */}
        {count > 0 && (
        <section className="mb-10">
          <H2 id="online">ネットで買えるか（{risk.label}）</H2>
          <div className="panel">
            <p>
              <span className={`${risk.cls} mr-2 align-middle`}>{risk.label}</span>
              <span className="font-bold">{riskLine}</span>
            </p>
            <p className="mt-2 text-base text-gray-700">{risk.detail}</p>
            <p className="mt-2 text-base text-gray-700">
              市販薬には「要指導医薬品」「第1類」「指定第2類」「第2類」「第3類」の区分があり、要指導医薬品だけはネットで買えません（薬剤師と対面が必要）。
              {entry.rxName}と同じ成分の市販薬は{risk.label}なので、この制限はありません。
            </p>
          </div>
        </section>
        )}

        {/* ── 上乗せ料金 ── */}
        <section className="mb-10">
          <H2 id="fee">2027年3月からの上乗せ料金</H2>
          {isTarget && entry.otcSimilarNo != null ? (
            <>
              <p>
                処方薬の{entry.rxName}は、{OTC_SIMILAR_META.effectiveLabel}から始まる「OTC類似薬の特別の料金」の対象です（厚労省案 No.
                {entry.otcSimilarNo}
                {ing ? `・${ing.name}` : ''}）。通常の1〜3割負担とは別に、薬代の4分の1を上乗せで払う見込みです。
              </p>
              {monthly && (
                <div className="panel mt-4">
                  <p className="text-base font-bold text-gray-600">1か月分の目安</p>
                  <p className="mt-1">
                    {monthly.item.name}（薬価{yen(monthly.item.price)}／{monthly.item.spec}）を{monthly.qtyLabel}もらった場合
                  </p>
                  <ul className="mt-2 space-y-1 text-base">
                    <li>
                      上乗せ額：<span className="font-bold text-alert">+{yen(monthly.e3.surcharge)}</span>（薬代{yen(monthly.e3.drugCost)}の4分の1）
                    </li>
                    <li>
                      3割負担の方：約{yen(monthly.e3.before)} → 約{yen(monthly.e3.after)}（<span className="font-bold text-alert">+約{yen(monthly.e3.diff)}</span>）
                    </li>
                    <li>
                      2割負担の方：約{yen(monthly.e2.before)} → 約{yen(monthly.e2.after)}（<span className="font-bold text-alert">+約{yen(monthly.e2.diff)}</span>）
                    </li>
                    <li>
                      1割負担の方：約{yen(monthly.e1.before)} → 約{yen(monthly.e1.after)}（<span className="font-bold text-alert">+約{yen(monthly.e1.diff)}</span>）
                    </li>
                  </ul>
                  <p className="mt-2 text-sm text-gray-600">
                    金額は薬代の部分だけで、診察料・調剤料は含みません。上乗せ分には定率負担がかからないため、負担割合が低い方ほど増える額が大きくなります。
                  </p>
                  <Link
                    href={`${OTC_SIMILAR_PATHS.simulator}?item=${monthly.item.code}`}
                    className="mt-3 inline-block min-h-[48px] rounded-lg border-2 border-brand bg-white px-4 py-2 text-base font-bold text-brand"
                  >
                    自分の量・負担割合で計算する
                  </Link>
                </div>
              )}
              <OtcSimilarPriceTable no={entry.otcSimilarNo} limit={3} />
              {rxItems.length > 0 && (
                <p className="mt-3">
                  <Link href={OTC_SIMILAR_PATHS.ingredient(entry.otcSimilarNo)} className="font-bold text-brand underline">
                    {entry.genericName}の処方薬{rxItems.length}品目すべての薬価と上乗せ額を見る
                  </Link>
                </p>
              )}
            </>
          ) : (
            <div className="panel">
              <p>
                <span className="mr-2 inline-block rounded-md border-2 border-gray-500 px-2.5 py-0.5 text-base font-bold text-gray-800">対象外</span>
                {entry.rxName}は、{OTC_SIMILAR_META.effectiveLabel}からの上乗せ料金の対象（厚労省案 77成分）に入っていません。
              </p>
              <p className="mt-2 text-base text-gray-700">令和9年度以降に対象の拡大が検討されているため、今後変わる可能性があります。</p>
              <Link href={OTC_SIMILAR_PATHS.hub} className="mt-2 inline-block font-bold text-brand underline">
                上乗せ料金の説明と対象成分を見る
              </Link>
            </div>
          )}
        </section>

        {/* ── 処方薬との違い・注意 ── */}
        <section className="mb-10">
          <H2 id="diff">{hasText ? '処方薬と市販薬の違い・切り替えるときの注意' : '切り替えるときの注意'}</H2>
          {hasText && (
            <div className="panel">
              <p>
                <span className="font-bold">同じところ：</span>
                {a.same}
              </p>
              <p className="mt-3">
                <span className="font-bold">違うところ：</span>
                {a.differs}
              </p>
              {a.sources && a.sources.length > 0 && (
                <p className="mt-3 text-sm text-gray-600">
                  出典：
                  {a.sources.map((u, i) => (
                    <span key={u}>
                      {i > 0 && '、'}
                      <a href={u} target="_blank" rel="noopener noreferrer" className="underline">
                        {u.replace(/^https?:\/\//, '').slice(0, 40)}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
          <div className="callout-warn mt-4">
            <div className="callout-title">注意</div>
            <p className="text-base leading-relaxed">{entry.caution}</p>
          </div>
        </section>

        {/* ── よくある質問（JSON-LD と同じ内容を本文にも出す） ── */}
        <section className="mb-10">
          <H2 id="faq">よくある質問</H2>
          <dl className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="panel">
                <dt className="font-bold">Q. {f.q}</dt>
                <dd className="mt-2 text-base text-gray-800">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── 同じ用途のほかの処方薬 ── */}
        {siblings.length > 0 && (
          <section className="mb-10">
            <H2>同じ用途のほかの処方薬</H2>
            <ul className="grid gap-2 md:grid-cols-2">
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/switch/${s.slug}/`}
                    className="flex min-h-[52px] items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 font-bold text-brand"
                  >
                    <span>{s.rxName}と同じ成分の市販薬</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 関連コラム ── */}
        {relatedColumns.length > 0 && (
          <section className="mb-10">
            <H2>関連コラム</H2>
            <ul className="grid gap-3 md:grid-cols-3">
              {relatedColumns.map((c) => (
                <li key={c.id} className="card p-4">
                  <Link href={columnHref(c)} className="block">
                    {c.tag && <span className="pill-brand mb-1">{c.tag}</span>}
                    <span className="block text-base font-bold leading-snug text-brand">{c.title}</span>
                    {c.summary && (
                      <span className="mt-1 block text-sm leading-relaxed text-gray-600">
                        {c.summary.length > 70 ? `${c.summary.slice(0, 70)}…` : c.summary}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 制度の背景（1行） ── */}
        <section className="mb-8 rounded-xl bg-gray-50 p-4 text-base">
          <p>
            市販薬と同じ成分の処方薬（OTC類似薬）に薬代の4分の1を上乗せする制度は、{OTC_SIMILAR_META.lawLabel}で決まり、
            対象は厚生労働省の案で{OTC_SIMILAR_META.ingredientCount}成分・{OTC_SIMILAR_META.itemCountLabel}です。
          </p>
          <p className="mt-2">
            <Link href={OTC_SIMILAR_PATHS.hub} className="font-bold text-brand underline">
              なぜ上乗せ？いくら増える？かからない人は？
            </Link>
          </p>
        </section>

        <aside className="mt-10 rounded bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
          <p>
            当ページは処方薬から市販薬への切替を保証・推奨するものではなく、PMDA・厚生労働省の公開情報を整理した参考情報です。同じ成分でも効果・安全性が同一であることを意味しません。購入・使用の前に必ず薬剤師または登録販売者に相談し、症状が続く場合・悪化する場合は医療機関を受診してください。
          </p>
        </aside>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-base">
          <Link href="/switch/" className="text-brand underline">
            ← 他の処方薬から探す
          </Link>
          <Link href={OTC_SIMILAR_PATHS.name} className="text-brand underline">
            薬の名前で上乗せ対象か調べる →
          </Link>
        </div>
      </article>
    </>
  );
}
