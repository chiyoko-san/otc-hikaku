import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicDamageReports, getDamageReportStats } from '@/lib/supabase/damage-reports';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { buildMetadata } from '@/lib/seo';

export const revalidate = 600; // 10分

export const metadata: Metadata = buildMetadata({
  title: '市販薬・健康食品の被害報告一覧',
  description:
    '市販薬・健康食品の副作用・定期購入トラブル・広告表現などについて、利用者から寄せられた被害報告の一覧です。',
  path: '/damage-reports/',
});

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  side_effect: '副作用',
  ineffective: '効果がなかった',
  contract: '定期購入・契約トラブル',
  overpriced: '過大請求',
  misleading_ad: '広告表現が違う',
  other: 'その他',
};

export default async function DamageReportsIndexPage() {
  const [reports, stats] = await Promise.all([
    getPublicDamageReports(100),
    getDamageReportStats(),
  ]);

  const sortedTypes = Object.entries(stats.byType).sort(
    ([, a], [, b]) => b - a
  );
  const maxCount = sortedTypes[0]?.[1] || 1;

  return (
    <div className="container-wide py-6 md:py-10">
      <Breadcrumb
        items={[{ name: 'ホーム', href: '/' }, { name: '被害報告' }]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold md:text-4xl">被害報告一覧</h1>
        <p className="text-gray-600">
          市販薬・健康食品について、利用者から寄せられた被害報告です。
        </p>
        <div className="mt-4">
          <Link href="/damage-reports/submit/" className="btn-primary">
            被害を報告する
          </Link>
        </div>
      </header>

      {/* 統計 */}
      <section className="mb-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-sm text-gray-500">総報告件数</div>
          <div className="text-4xl font-bold text-brand">{stats.total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-3 text-sm font-bold">被害内容の内訳</div>
          <div className="space-y-2">
            {sortedTypes.slice(0, 5).map(([t, c]) => (
              <div key={t} className="flex items-center gap-2 text-sm">
                <span className="w-40 flex-shrink-0">
                  {DAMAGE_TYPE_LABELS[t] || t}
                </span>
                <div className="h-4 flex-1 rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-brand"
                    style={{ width: `${(c / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right font-bold">{c}件</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 報告一覧 */}
      <section>
        <h2 className="mb-4 border-l-4 border-brand pl-3 text-xl font-bold">
          最近の報告
        </h2>
        {reports.length === 0 ? (
          <p className="text-gray-500">まだ被害報告はありません。</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-gray-200 bg-white p-5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{r.medicine_name}</h3>
                  {r.maker && (
                    <span className="text-sm text-gray-500">{r.maker}</span>
                  )}
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {(r.damage_types || []).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
                    >
                      {DAMAGE_TYPE_LABELS[t] || t}
                    </span>
                  ))}
                </div>
                {r.detail && (
                  <p className="line-clamp-3 text-sm text-gray-700">
                    {r.detail}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                  {r.nickname && <span>{r.nickname}</span>}
                  {r.age && <span>{r.age}代</span>}
                  {r.gender && <span>{r.gender}</span>}
                  <span>
                    {new Date(r.created_at).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
