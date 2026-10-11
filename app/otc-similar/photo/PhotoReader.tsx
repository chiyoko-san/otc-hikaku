'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ShareCard } from '@/components/ShareCard';
import { useRouter } from 'next/navigation';
import type { SlimItem } from '@/lib/otc-similar-items';

// 配置先: app/otc-similar/photo/PhotoReader.tsx

type Line = {
  text: string;
  status: 'matched' | 'ambiguous' | 'not_target' | 'unknown';
  item?: SlimItem;
  candidates?: SlimItem[];
  guideSlug?: string;
  label?: string;
};

type Row = Line & { id: number; chosen?: SlimItem; removed?: boolean };

const MAX_EDGE = 1600;

async function fileToJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

export default function PhotoReader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  const onPick = (f: File | null) => {
    setRows(null);
    setError(null);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const read = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await fileToJpegBase64(file);
      const r = await fetch('/api/read-handbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      if (r.status === 429) {
        setError('本日の読み取り回数の上限に達しました。明日またお試しいただくか、「薬の名前で探す」をご利用ください。');
        return;
      }
      if (!r.ok) {
        setError('読み取りに失敗しました。少し時間をおいてもう一度お試しください。');
        return;
      }
      const data = (await r.json()) as { lines: Line[] };
      setRows(
        data.lines.map((l, i) => ({
          ...l,
          id: i,
          chosen: l.status === 'matched' ? l.item : l.status === 'ambiguous' ? l.candidates?.[0] : undefined,
        }))
      );
    } catch {
      setError('読み取りに失敗しました。通信環境を確認してもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  const active = (rows ?? []).filter((r) => !r.removed);
  const codes = active.filter((r) => r.chosen).map((r) => r.chosen!.code);
  const notTargets = active.filter((r) => r.status === 'not_target');
  const unknowns = active.filter((r) => r.status === 'unknown');

  const goSimulator = () => {
    if (codes.length === 0) return;
    router.push(`/otc-similar/simulator/?items=${codes.join(',')}`);
  };

  return (
    <div className="mt-6">
      {/* ① 撮る */}
      <section>
        <h2 className="text-xl font-bold md:text-2xl">
          <span className="mr-2 inline-block rounded-full bg-brand px-3 py-0.5 text-base text-white align-middle">1</span>
          お薬手帳か薬袋を撮る
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-base text-gray-700">
          <li>「写真を撮る・選ぶ」を押すとカメラが開きます。「カメラの使用を許可しますか」と出たら「許可」を押してください</li>
          <li>薬の名前が書いてあるページを、明るい場所でまっすぐ撮ってください</li>
          <li>お名前の部分は指で隠すか、写らないようにしてください（写っても読み取りません）</li>
          <li>写真は保存しません。読み取りが終わるとすぐに捨てられます</li>
        </ul>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="min-h-[60px] rounded-xl bg-brand px-6 py-3 text-xl font-bold text-white"
          >
            写真を撮る・選ぶ
          </button>
          {file && !rows && (
            <button
              type="button"
              onClick={read}
              disabled={busy}
              className="min-h-[60px] rounded-xl bg-alert px-6 py-3 text-xl font-bold text-white disabled:opacity-60"
            >
              {busy ? '読み取っています…' : '読み取る'}
            </button>
          )}
        </div>

        {preview && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="選んだ写真" className="max-h-72 rounded-xl border border-gray-200" />
          </div>
        )}
        {busy && (
          <p className="mt-4 rounded-xl bg-brand-light p-4 text-lg" aria-live="polite">
            読み取っています。10秒ほどお待ちください。画面はそのままで大丈夫です。
          </p>
        )}
        {error && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-lg">{error}</p>}
      </section>

      {/* ② 確認 */}
      {rows && (
        <section className="mt-12">
          <h2 className="text-xl font-bold md:text-2xl">
            <span className="mr-2 inline-block rounded-full bg-brand px-3 py-0.5 text-base text-white align-middle">2</span>
            読み取った薬を確認
          </h2>
          {active.length === 0 ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-lg">
              薬の名前が読み取れませんでした。もう少し近づいて、文字がはっきり写るように撮り直してください。
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {active.map((r) => (
                <li key={r.id} className="panel">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-base text-gray-600">読み取り：{r.text}</div>
                      {r.chosen && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-block rounded-md bg-alert px-2.5 py-1 text-sm font-bold text-white">上乗せ対象</span>
                          <span className="text-xl font-bold">{r.chosen.name}</span>
                          <span className="text-base text-gray-600">{r.chosen.spec}・薬価{r.chosen.price}円</span>
                        </div>
                      )}
                      {r.status === 'not_target' && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-block rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-700">対象外</span>
                          <span className="text-xl font-bold">{r.label}</span>
                          {r.guideSlug && (
                            <Link href={`/switch/${r.guideSlug}/`} className="text-base text-brand underline">同じ成分の市販薬</Link>
                          )}
                        </div>
                      )}
                      {r.status === 'unknown' && (
                        <div className="mt-1 text-lg">
                          <span className="inline-block rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-700">対象外の見込み</span>
                          <span className="ml-2 text-base text-gray-700">対象77成分の処方薬一覧にありません（読み取り違いの場合は「薬の名前で探す」でご確認ください）</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, removed: true } : x)))}
                      className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-base text-gray-700"
                    >
                      削除
                    </button>
                  </div>

                  {r.status === 'ambiguous' && r.candidates && r.candidates.length > 1 && (
                    <div className="mt-3">
                      <p className="text-base text-gray-700">どれですか？（近いものを選んであります）</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.candidates.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, chosen: c } : x)))}
                            aria-pressed={r.chosen?.code === c.code}
                            className={
                              'min-h-[48px] rounded-lg border-2 px-3 py-2 text-base font-bold ' +
                              (r.chosen?.code === c.code ? 'border-brand bg-brand text-white' : 'border-gray-300 bg-white text-brand-ink')
                            }
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {active.length > 0 && (
            <div className="panel mt-6">
              <p className="text-lg">
                上乗せ対象 <strong>{codes.length}件</strong>、対象外 <strong>{notTargets.length}件</strong>、一覧にないもの <strong>{unknowns.length}件</strong>
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goSimulator}
                  disabled={codes.length === 0}
                  className="min-h-[60px] rounded-xl bg-alert px-6 py-3 text-xl font-bold text-white disabled:opacity-50"
                >
                  この薬でいくら増えるか計算する
                </button>
                <button
                  type="button"
                  onClick={() => { setRows(null); inputRef.current?.click(); }}
                  className="min-h-[56px] rounded-xl border-2 border-brand bg-white px-6 py-3 text-lg font-bold text-brand"
                >
                  撮り直す
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[56px] rounded-xl border border-gray-300 bg-white px-6 py-3 text-lg font-bold text-gray-700"
                >
                  この一覧を印刷する
                </button>
              </div>
              {codes.length === 0 && (
                <p className="mt-3 text-base text-gray-700">上乗せ対象の薬がないので、計算するものはありません。</p>
              )}
            </div>
          )}

          {codes.length > 0 && (
            <ShareCard
              heading="読み取った結果を、本人や家族に送る"
              lead="離れて住む親の薬を調べた人へ。送った相手は押すだけで、この薬で計算する画面が開きます。"
              message={
                `お薬手帳を読み取ったら、2027年3月からの「上乗せ料金」の対象が${codes.length}件ありました。\n` +
                active.filter((r) => r.chosen).map((r) => `・${r.chosen!.name}`).join('\n')
              }
              url={`${typeof window !== 'undefined' ? window.location.origin : ''}/otc-similar/simulator/?items=${codes.join(',')}`}
              xText={`お薬手帳を撮って調べたら、2027年3月からの「上乗せ料金」の対象が${codes.length}件ありました。自分の薬は対象？写真1枚で分かります。`}
              hashtags={['上乗せ料金', 'OTC類似薬']}
            />
          )}
        </section>
      )}
    </div>
  );
}
