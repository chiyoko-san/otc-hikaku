import Link from 'next/link';
import {
  getEnrichedMedicines,
  getAllSymptoms,
  getAllIngredients,
} from '@/lib/medicines';
import { SYMPTOM_GROUPS } from '@/lib/symptom-groups';
import { getPublishedColumns } from '@/lib/supabase/columns';
import { HomeSearchBox } from '@/components/home/HomeSearchBox';

export const revalidate = 3600;

export default async function HomePage() {
  const totalMeds = getEnrichedMedicines().length;
  const topSymptoms = getAllSymptoms().slice(0, 12);
  const topIngredients = getAllIngredients().slice(0, 12);
  const recentColumns = (await getPublishedColumns(6)) || [];

  return (
    <div>
      {/* HERO */}
      <section className="bg-gradient-to-br from-brand-light via-white to-white py-16 md:py-24">
        <div className="container-narrow text-center">
          <h1 className="mb-4 text-4xl font-bold leading-tight md:text-6xl">
            市販薬を、
            <em className="not-italic text-brand">成分</em>で選ぶ。
          </h1>
          <p className="mb-8 text-gray-700 md:text-lg">
            7,500品以上の市販薬を成分・効能・リスク区分から比較。
            <br />
            広告なし・PMDA公開情報ベース。
          </p>
          <div className="mx-auto mb-6 max-w-xl">
            <HomeSearchBox />
          </div>
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {[
              'ロキソプロフェン',
              'イブプロフェン',
              'アセトアミノフェン',
              '花粉症',
              '眠気なし',
              '胃腸薬',
              'かぜ薬',
              '頭痛',
            ].map((tag) => (
              <Link
                key={tag}
                href={`/search/?q=${encodeURIComponent(tag)}`}
                className="chip hover:border-brand"
              >
                {tag}
              </Link>
            ))}
          </div>
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-brand md:text-3xl">
                7,500+
              </div>
              <div className="text-xs text-gray-500">収録医薬品</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-brand md:text-3xl">0</div>
              <div className="text-xs text-gray-500">広告・案件</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-brand md:text-3xl">
                PMDA
              </div>
              <div className="text-xs text-gray-500">データソース</div>
            </div>
          </div>

          {/* アキネーター */}
          <div className="mt-10">
            <Link href="/akinator/" className="btn-primary">
              💊 症状から薬を探す(質問に答えるだけ)
            </Link>
          </div>
        </div>
      </section>

      {/* 症状から選ぶ */}
      <section className="container-wide py-12">
        <h2 className="mb-2 text-2xl font-bold md:text-3xl">症状から選ぶ</h2>
        <p className="mb-6 text-gray-600">
          気になる症状をタップして、該当する市販薬を確認できます。
        </p>
        <div className="flex flex-wrap gap-2">
          {topSymptoms.map((s) => (
            <Link
              key={s.slug}
              href={`/symptoms/${s.slug}/`}
              className="chip hover:border-brand"
            >
              {s.name}
              <span className="ml-1 text-xs text-gray-500">
                ({s.medicineIds.length})
              </span>
            </Link>
          ))}
          <Link
            href="/symptoms/"
            className="chip bg-brand text-white hover:bg-brand-dark"
          >
            すべての症状 →
          </Link>
        </div>
      </section>

      {/* 成分から選ぶ */}
      <section className="container-wide py-12">
        <h2 className="mb-2 text-2xl font-bold md:text-3xl">よく見る成分</h2>
        <p className="mb-6 text-gray-600">
          成分名をタップすると、その成分を含む市販薬が一覧表示されます。
        </p>
        <div className="flex flex-wrap gap-2">
          {topIngredients.map((ing) => (
            <Link
              key={ing.slug}
              href={`/ingredients/${ing.slug}/`}
              className="chip hover:border-brand"
            >
              {ing.name}
              <span className="ml-1 text-xs text-gray-500">
                ({ing.medicineIds.length})
              </span>
            </Link>
          ))}
          <Link
            href="/ingredients/"
            className="chip bg-brand text-white hover:bg-brand-dark"
          >
            成分辞典 →
          </Link>
        </div>
      </section>

      {/* 最新コラム */}
      {recentColumns.length > 0 && (
        <section className="container-wide py-12">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-bold md:text-3xl">最新コラム</h2>
            <Link
              href="/columns/"
              className="text-sm text-brand hover:underline"
            >
              すべて見る →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentColumns.map((c) => (
              <Link
                key={c.id}
                href={`/columns/${c.slug || c.id}/`}
                className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-brand hover:shadow-md"
              >
                {c.tag && (
                  <span className="mb-2 inline-block rounded bg-brand-light px-2 py-0.5 text-xs text-brand-dark">
                    {c.tag}
                  </span>
                )}
                <h3 className="mb-2 text-lg font-bold leading-tight">
                  {c.title}
                </h3>
                {c.summary && (
                  <p className="line-clamp-2 text-sm text-gray-600">
                    {c.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 被害報告への誘導 */}
      <section className="bg-gray-50 py-12">
        <div className="container-narrow text-center">
          <h2 className="mb-3 text-2xl font-bold">市販薬で困ったことはありませんか?</h2>
          <p className="mb-6 text-gray-600">
            副作用・定期購入トラブル・広告表現への疑問など、消費者の声を集めています。
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/damage-reports/" className="btn-outline">
              被害報告を見る
            </Link>
            <Link href="/damage-reports/submit/" className="btn-primary">
              被害を報告する
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
