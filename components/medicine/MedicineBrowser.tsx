'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

type IndexItem = {
  n: string; // name
  s: string; // slug
  m: string; // maker
  sl: string; // seller(発売元)
  c: string; // category id
  r: number; // risk (1/2/2.5/3/0=不明/-1=機能性/-2=医薬部外品)
  d: number; // drowsy 0/1
  g: string[]; // symptom tags
  i: string[]; // ingredients
};

type CategoryOption = { id: string; label: string; count: number };

const RISK_FILTERS: { value: number; label: string }[] = [
  { value: 1, label: '第1類' },
  { value: 2.5, label: '指定第2類' },
  { value: 2, label: '第2類' },
  { value: 3, label: '第3類' },
  { value: -3, label: '指定医薬部外品' },
  { value: -2, label: '医薬部外品' },
  { value: -1, label: '機能性表示' },
];

type SortKey = 'rec' | 'name' | 'risk-asc' | 'risk-desc';

/** リスクの強さ(並び替え用): 第1類が最も高い */
function riskSeverity(r: number): number {
  if (r === 1) return 5;
  if (r === 2.5) return 4;
  if (r === 2) return 3;
  if (r === 3) return 2;
  if (r === -3) return 1.5;
  if (r === -2) return 1;
  if (r === -1) return 0.5;
  return 0;
}

function riskLabel(r: number): string {
  if (r === -1) return '機能性';
  if (r === -2) return '医薬部外品';
  if (r === -3) return '指定医薬部外品';
  if (r === 1) return '第1類';
  if (r === 2) return '第2類';
  if (r === 2.5) return '指定第2類';
  if (r === 3) return '第3類';
  return '不明';
}

function riskBadgeClass(r: number): string {
  if (r === -1) return 'risk-functional';
  if (r === -2) return 'risk-quasi';
  if (r === -3) return 'risk-dquasi';
  if (r === 1) return 'risk-1';
  if (r === 2) return 'risk-2';
  if (r === 2.5) return 'risk-2-5';
  if (r === 3) return 'risk-3';
  return 'risk-none';
}

function spineClass(r: number): string {
  if (r === -1) return 'spine-functional';
  if (r === -2) return 'spine-quasi';
  if (r === -3) return 'spine-dquasi';
  if (r === 1) return 'spine-1';
  if (r === 2) return 'spine-2';
  if (r === 2.5) return 'spine-2-5';
  if (r === 3) return 'spine-3';
  return 'spine-none';
}

/** ひらがな→カタカナ・全角英数→半角・小文字化して比較用に正規化 */
function normalize(s: string): string {
  return s
    .replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase()
    .trim();
}

const PAGE_SIZE = 24;

/** 絞り込みパネルで使う共通のセレクト */
const SELECT_CLASS =
  'w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 ' +
  'text-sm text-brand-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

/**
 * 一覧ページの絞り込みブラウザ。
 *
 * 【一覧ページ(/medicines/)での使い方】
 *   絞り込みなし → children(カテゴリ別のサーバーレンダリング一覧)を表示。
 *   絞り込みあり → childrenを隠し、検索結果をページ本体として全幅表示。
 *
 * 【成分ページなどでの使い方】
 *   restrictTo に対象の slug 配列を渡すと、その範囲内だけを検索対象にする。
 *   showResultsWithoutQuery を付けると、条件未入力でも結果一覧を表示する。
 *
 * 【スクロール時の挙動】
 *   絞り込みパネル自体は追従させない(展開すると縦700px級になり、結果一覧を覆うため)。
 *   代わりに、パネルを通り過ぎたら高さ約56pxの「条件バー」を固定表示する。
 *   条件はチップで表示し、✕ で個別に外せる。全面的に変えたいときは
 *   「条件を変更」でパネルまでスクロールして戻る。
 */
export function MedicineBrowser({
  categories,
  children,
  restrictTo,
  placeholder = '商品名・成分名で検索',
  showResultsWithoutQuery = false,
}: {
  categories: CategoryOption[];
  children: ReactNode;
  /** 指定したslugの薬だけを検索対象にする(成分ページなどで使用) */
  restrictTo?: string[];
  /** 検索窓のプレースホルダ */
  placeholder?: string;
  /** 条件未入力でも結果一覧を表示する */
  showResultsWithoutQuery?: boolean;
}) {
  const [items, setItems] = useState<IndexItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [risks, setRisks] = useState<number[]>([]);
  const [noDrowsy, setNoDrowsy] = useState(false);
  const [symptom, setSymptom] = useState('');
  const [sort, setSort] = useState<SortKey>('rec');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/medicine-index/')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: { items: IndexItem[] }) => {
        if (alive) setItems(data.items || []);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // パネル直下のセンチネルが画面上端(ヘッダー分)より上に出たら条件バーを出す
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting),
      { rootMargin: '-72px 0px 0px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 検索実行の計測(800msデバウンス)
  useEffect(() => {
    if (!q.trim()) return;
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      trackEvent('explorer_search', { q: q.trim() });
    }, 800);
    return () => {
      if (trackTimer.current) clearTimeout(trackTimer.current);
    };
  }, [q]);

  // 検索対象を限定する場合のslug集合
  const restrictSet = useMemo(
    () => (restrictTo ? new Set(restrictTo) : null),
    [restrictTo]
  );

  // ユーザーが何らかの条件を入力しているか
  const hasCondition =
    q.trim().length > 0 ||
    cat !== '' ||
    risks.length > 0 ||
    noDrowsy ||
    symptom !== '';

  // 結果一覧を表示するか
  const isFiltering = showResultsWithoutQuery || hasCondition;

  const advancedCount = risks.length + (noDrowsy ? 1 : 0);

  // 症状タグの候補(データから頻度順に集計)
  const symptomOptions = useMemo(() => {
    if (!items) return [];
    const count = new Map<string, number>();
    for (const it of items) {
      if (restrictSet && !restrictSet.has(it.s)) continue;
      for (const t of it.g) count.set(t, (count.get(t) || 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40);
  }, [items, restrictSet]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const nq = normalize(q);
    const hasQuery = nq.length > 0;

    type Scored = { item: IndexItem; score: number };
    const out: Scored[] = [];

    for (const it of items) {
      if (restrictSet && !restrictSet.has(it.s)) continue;
      if (cat && it.c !== cat) continue;
      if (risks.length > 0 && !risks.includes(it.r)) continue;
      if (noDrowsy && it.d === 1) continue;
      if (symptom && !it.g.includes(symptom)) continue;

      if (!hasQuery) {
        out.push({ item: it, score: 0 });
        continue;
      }

      const name = normalize(it.n);
      let score = -1;
      if (name.startsWith(nq)) score = 100;
      else if (name.includes(nq)) score = 80;
      else if (it.i.some((x) => normalize(x).includes(nq))) score = 60;
      else if (it.g.some((x) => normalize(x).includes(nq))) score = 40;
      else if (normalize(it.m).includes(nq)) score = 20;
      else if (normalize(it.sl || '').includes(nq)) score = 20;
      if (score >= 0) out.push({ item: it, score });
    }

    if (sort === 'name') {
      out.sort((a, b) => a.item.n.localeCompare(b.item.n, 'ja'));
    } else if (sort === 'risk-asc') {
      out.sort((a, b) => riskSeverity(a.item.r) - riskSeverity(b.item.r));
    } else if (sort === 'risk-desc') {
      out.sort((a, b) => riskSeverity(b.item.r) - riskSeverity(a.item.r));
    } else if (hasQuery) {
      out.sort((a, b) => b.score - a.score);
    }
    return out.map((s) => s.item);
  }, [items, q, cat, risks, noDrowsy, symptom, sort, restrictSet]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [q, cat, risks, noDrowsy, symptom, sort]);

  const toggleRisk = useCallback((value: number) => {
    setRisks((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
    trackEvent('explorer_filter', { type: 'risk', value: String(value) });
  }, []);

  const clearAll = () => {
    setQ('');
    setCat('');
    setRisks([]);
    setNoDrowsy(false);
    setSymptom('');
    setSort('rec');
  };

  const catLabel = cat ? categories.find((c) => c.id === cat)?.label : '';

  // 条件バーの「条件を変更」: 絞り込みパネルまで戻る
  const scrollToPanel = useCallback(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    trackEvent('explorer_filter', { type: 'reopen_panel', value: '1' });
  }, []);

  // 条件バーに並べるチップ(✕ で個別に解除できる)
  const conditionChips = useMemo(() => {
    const list: { key: string; label: string; remove: () => void }[] = [];
    if (q.trim())
      list.push({ key: 'q', label: `「${q.trim()}」`, remove: () => setQ('') });
    if (cat)
      list.push({
        key: 'cat',
        label: catLabel || '分類',
        remove: () => setCat(''),
      });
    if (symptom)
      list.push({ key: 'sym', label: symptom, remove: () => setSymptom('') });
    for (const r of risks)
      list.push({
        key: `risk-${r}`,
        label: riskLabel(r),
        remove: () => toggleRisk(r),
      });
    if (noDrowsy)
      list.push({
        key: 'drowsy',
        label: '眠気成分なし',
        remove: () => setNoDrowsy(false),
      });
    return list;
  }, [q, cat, catLabel, symptom, risks, noDrowsy, toggleRisk]);

  const showBar = hasCondition && barVisible;

  return (
    <>
      {/* ===== 検索・フィルタパネル ===== */}
      {/* 追従させない。展開時に縦へ伸びるため、追従させると結果一覧を覆ってしまう */}
      <section
        ref={panelRef}
        className="scroll-mt-20 rounded-2xl border border-gray-200 bg-white p-5 md:p-7"
      >
        {/* キーワード検索 */}
        <div className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label="市販薬を検索"
            className="w-full rounded-xl border border-gray-300 bg-white py-4 pl-12 pr-4 text-base text-brand-ink placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* 分類・悩み/症状 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500">
              分類
            </span>
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                trackEvent('explorer_filter', {
                  type: 'cat',
                  value: e.target.value,
                });
              }}
              aria-label="分類で絞り込み"
              className={SELECT_CLASS}
            >
              <option value="">すべての分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}({c.count})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500">
              悩み・症状
            </span>
            <select
              value={symptom}
              onChange={(e) => {
                setSymptom(e.target.value);
                trackEvent('explorer_filter', {
                  type: 'symptom',
                  value: e.target.value,
                });
              }}
              aria-label="症状で絞り込み"
              className={SELECT_CLASS}
            >
              <option value="">すべての症状</option>
              {symptomOptions.map(([t, n]) => (
                <option key={t} value={t}>
                  {t}({n})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 詳しく絞り込む(普段は閉じておく) */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-brand-dark"
          >
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                showAdvanced ? 'rotate-90' : ''
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            詳しく絞り込む
            {advancedCount > 0 && (
              <span className="ml-1 rounded-full bg-brand-dark px-2 py-0.5 text-xs font-semibold text-white">
                {advancedCount}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <div>
                <span className="mb-2 block text-xs font-semibold tracking-wide text-gray-500">
                  リスク区分
                </span>
                <div className="flex flex-wrap gap-2">
                  {RISK_FILTERS.map((rf) => (
                    <button
                      key={rf.value}
                      type="button"
                      onClick={() => toggleRisk(rf.value)}
                      aria-pressed={risks.includes(rf.value)}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                        risks.includes(rf.value)
                          ? 'border-brand-dark bg-brand-dark text-white'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-brand hover:text-brand-dark'
                      }`}
                    >
                      {rf.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold tracking-wide text-gray-500">
                  その他の条件
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNoDrowsy((v) => !v);
                    trackEvent('explorer_filter', {
                      type: 'no_drowsy',
                      value: String(!noDrowsy),
                    });
                  }}
                  aria-pressed={noDrowsy}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    noDrowsy
                      ? 'border-brand-dark bg-brand-dark text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-brand hover:text-brand-dark'
                  }`}
                >
                  眠気成分なし
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 並び替え・条件クリア(条件入力中のみ) */}
        {hasCondition && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="並び替え"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-brand-ink focus:border-brand focus:outline-none"
            >
              <option value="rec">おすすめ順</option>
              <option value="name">名前順</option>
              <option value="risk-asc">リスクが低い順</option>
              <option value="risk-desc">リスクが高い順</option>
            </select>
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto text-sm font-medium text-gray-500 underline underline-offset-2 hover:text-brand-dark"
            >
              条件をクリア
            </button>
          </div>
        )}
      </section>

      {/* パネル通過の検知点。条件バーの出し入れに使う */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      <div className="mb-10" />

      {/* ===== 条件バー(スクロール時のみ固定表示) ===== */}
      {/* position:fixed なのでレイアウトを押し下げない = 高さが変わっても表示が跳ねない */}
      {showBar && (
        <div className="fixed inset-x-0 top-16 z-30 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="container-wide flex items-center gap-3 py-2.5">
            <span className="hidden flex-shrink-0 text-sm font-bold text-brand-ink sm:inline">
              {filtered.length.toLocaleString()}
              <span className="text-xs font-semibold">件</span>
            </span>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {conditionChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-light py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-deep"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.remove}
                    aria-label={`${chip.label}の条件を外す`}
                    className="rounded-full p-0.5 text-brand-deep/70 transition hover:bg-white hover:text-brand-deep focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={scrollToPanel}
              className="flex flex-shrink-0 items-center gap-1 rounded-full border border-gray-300 px-3.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand hover:text-brand-dark"
            >
              条件を変更
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ===== 結果一覧 ===== */}
      {isFiltering && (
        <section aria-live="polite">
          {loadError && (
            <p className="text-sm text-gray-600">
              検索データの読み込みに失敗しました。ページを再読み込みしてお試しください。
            </p>
          )}
          {!loadError && !items && (
            <p className="text-sm text-gray-500">検索データを読み込み中…</p>
          )}

          {items && (
            <>
              {/* 見出しは条件入力中のみ(未入力時は呼び出し側の見出しを使う) */}
              {hasCondition && (
                <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-2xl font-extrabold tracking-tight text-brand-ink">
                    検索結果{' '}
                    <span className="text-brand-dark">{filtered.length}</span>
                    <span className="text-base font-bold">件</span>
                  </h2>
                  <p className="text-sm text-gray-500">
                    {[
                      q.trim() && `「${q.trim()}」`,
                      catLabel,
                      symptom,
                      ...risks.map((r) => riskLabel(r)),
                      noDrowsy && '眠気成分なし',
                    ]
                      .filter(Boolean)
                      .join(' × ')}
                  </p>
                </div>
              )}

              {filtered.length === 0 && (
                <div className="card p-8 text-center">
                  <p className="mb-2 font-bold text-brand-ink">
                    該当する薬が見つかりませんでした
                  </p>
                  <p className="text-sm text-gray-500">
                    キーワードを短くするか、フィルタを外してお試しください。
                  </p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filtered.slice(0, visible).map((it) => (
                  <Link
                    key={it.s}
                    href={`/medicines/${it.s}/`}
                    className={`card block p-4 ${spineClass(it.r)}`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <span className="text-base font-bold leading-tight text-brand-ink">
                        {it.n}
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1">
                        {it.d === 1 && (
                          <span className="whitespace-nowrap rounded bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-800">
                            眠気あり
                          </span>
                        )}
                        <span className={riskBadgeClass(it.r)}>
                          {riskLabel(it.r)}
                        </span>
                      </span>
                    </div>
                    {(it.m || it.sl) && (
                      <div className="mb-1.5 text-xs text-gray-500">
                        {it.m}
                        {it.sl && (
                          <span className={it.m ? 'ml-2' : ''}>
                            発売元 {it.sl}
                          </span>
                        )}
                      </div>
                    )}
                    {it.g.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {it.g.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-deep"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>

              {filtered.length > visible && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="btn-primary px-8 py-3"
                  >
                    さらに表示(残り{filtered.length - visible}件)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ===== 絞り込みなし: カテゴリ別一覧(サーバーレンダリング) ===== */}
      <div className={isFiltering ? 'hidden' : ''}>{children}</div>
    </>
  );
}
