import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-gray-200 bg-gray-50">
      <div className="container-wide grid gap-8 py-10 md:grid-cols-4">
        <div>
          <div className="mb-2 text-lg font-bold text-brand-ink">
            クスリノ<em className="not-italic text-brand">コンパス</em>
          </div>
          <p className="text-sm text-gray-600">
            市販薬7,500品を成分・効能・リスク区分から無料で比較。広告・案件なし。
          </p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">探す</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/switch/">処方薬から探す</Link></li>
            <li><Link href="/medicines/">薬を探す</Link></li>
            <li><Link href="/symptoms/">症状から選ぶ</Link></li>
            <li><Link href="/ingredients/">成分辞典</Link></li>
            <li><Link href="/akinator/">症状アキネーター</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">読む</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/columns/">コラム</Link></li>
            <li><Link href="/damage-reports/">被害報告一覧</Link></li>
            <li><Link href="/damage-reports/submit/">被害を報告する</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">サイトについて</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li><Link href="/about/">当サイトについて</Link></li>
            <li><Link href="/privacy/">プライバシーポリシー</Link></li>
            <li><Link href="/contact/">お問い合わせ</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} クスリノコンパス. Data source: PMDA.
      </div>
    </footer>
  );
}
