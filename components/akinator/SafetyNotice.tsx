import Link from 'next/link';

export function SafetyNotice({ showLinks = false }: { showLinks?: boolean }) {
  return (
    <aside className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
      <p className="leading-relaxed">
        妊娠・授乳中の方、15歳未満、65歳以上、持病の治療中・服薬中の方は、結果にかかわらず薬剤師または医師にご相談ください
      </p>
      {showLinks ? (
        <ul className="mt-3 space-y-1">
          <li>
            <Link
              href="/columns/auto_20260824_1/"
              className="text-brand underline underline-offset-2"
            >
              妊娠中の市販薬についてのコラム
            </Link>
          </li>
          <li>
            <Link
              href="/about/"
              className="text-brand underline underline-offset-2"
            >
              リスク区分と薬剤師相談の要否について
            </Link>
          </li>
        </ul>
      ) : null}
    </aside>
  );
}