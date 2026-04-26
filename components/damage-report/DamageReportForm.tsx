'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MedicineAutocomplete } from './MedicineAutocomplete';

const DAMAGE_TYPES = [
  { id: 'side_effect', label: '副作用が出た' },
  { id: 'ineffective', label: '効果がなかった' },
  { id: 'contract', label: '定期購入・契約トラブル' },
  { id: 'overpriced', label: '過大請求・料金トラブル' },
  { id: 'misleading_ad', label: '広告表現と違った' },
  { id: 'other', label: 'その他' },
];

function isValidUrl(s: string): boolean {
  if (!s) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

type ProductSelection = {
  name: string;
  maker?: string | null;
  medicine_id?: number | null;
  ad_product_id?: string | null;
  isFreeText: boolean;
};

export function DamageReportForm() {
  const [step, setStep] = useState(1);

  const [product, setProduct] = useState<ProductSelection>({
    name: '',
    maker: null,
    medicine_id: null,
    ad_product_id: null,
    isFreeText: false,
  });

  const [form, setForm] = useState({
    maker_manual: '',  // ユーザーが手動で書く maker(自由入力時の補助)
    damage_types: [] as string[],
    damage_amount: '',
    detail: '',
    purchase_route: '',
    purchase_date: '',
    purchase_url: '',
    ad_url: '',
    nickname: '',
    age: '',
    gender: '',
    is_public: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const toggleType = (id: string) => {
    setForm((prev) => ({
      ...prev,
      damage_types: prev.damage_types.includes(id)
        ? prev.damage_types.filter((t) => t !== id)
        : [...prev.damage_types, id],
    }));
  };

  const submit = async () => {
    if (!product.name.trim()) {
      setError('商品名を入力してください。');
      setStep(1);
      return;
    }
    if (form.damage_types.length === 0) {
      setError('被害内容を1つ以上選択してください。');
      setStep(2);
      return;
    }
    if (!isValidUrl(form.purchase_url.trim())) {
      setError('購入先URLの形式が正しくありません。');
      setStep(3);
      return;
    }
    if (!isValidUrl(form.ad_url.trim())) {
      setError('広告URLの形式が正しくありません。');
      setStep(3);
      return;
    }
    setSubmitting(true);
    setError('');

    // maker は選択時の値が優先、なければ手動入力
    const finalMaker =
      product.maker || form.maker_manual.trim() || null;

    const payload = {
      medicine_name: product.name.trim(),
      medicine_id: product.medicine_id ?? null,
      ad_product_id: product.ad_product_id ?? null,
      maker: finalMaker,
      damage_types: form.damage_types,
      damage_amount: form.damage_amount
        ? parseInt(form.damage_amount, 10)
        : null,
      detail: form.detail.trim() || null,
      purchase_route: form.purchase_route.trim() || null,
      purchase_date: form.purchase_date.trim() || null,
      purchase_url: form.purchase_url.trim() || null,
      ad_url: form.ad_url.trim() || null,
      nickname: form.nickname.trim() || null,
      age: form.age ? parseInt(form.age, 10) : null,
      gender: form.gender || null,
      is_public: form.is_public,
    };

    const { error: err } = await supabase
      .from('damage_reports')
      .insert(payload);

    if (err) {
      console.error(err);
      setError('投稿に失敗しました。時間をおいてやり直してください。');
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-8 text-center">
        <div className="mb-3 text-3xl">✓</div>
        <h2 className="mb-2 text-xl font-bold">ご報告ありがとうございました</h2>
        <p className="text-gray-700">
          情報は被害報告一覧に反映され、同じ悩みを持つ方の参考となります。
        </p>
      </div>
    );
  }

  const steps = ['商品', '被害', '詳細', '属性', '確認'];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* ステップインジケータ */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-1 items-center gap-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                i + 1 <= step
                  ? 'bg-brand text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
            <span className="hidden text-xs md:inline">{s}</span>
            {i < steps.length - 1 && (
              <div className="flex-1 border-t border-gray-200" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: 商品 */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">商品情報</h2>

          <div>
            <label className="mb-1 block text-sm font-bold">
              商品名 <span className="text-red-500">*</span>
            </label>
            <MedicineAutocomplete
              value={product}
              onChange={setProduct}
            />
            <div className="mt-1 text-xs text-gray-500">
              入力すると候補が表示されます。候補にない場合は自由入力もできます。
            </div>
          </div>

          {/* 自由入力時のみ、メーカー名の手動入力欄を出す */}
          {product.isFreeText && product.name && (
            <div>
              <label className="mb-1 block text-sm font-bold">
                メーカー名(任意)
              </label>
              <input
                type="text"
                value={form.maker_manual}
                onChange={(e) =>
                  setForm({ ...form, maker_manual: e.target.value })
                }
                placeholder="わかれば入力"
                className="w-full rounded border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Step 2: 被害 */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">被害の内容</h2>
          <p className="text-sm text-gray-600">
            当てはまるものをすべて選んでください。
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {DAMAGE_TYPES.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 ${
                  form.damage_types.includes(t.id)
                    ? 'border-brand bg-brand-light'
                    : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.damage_types.includes(t.id)}
                  onChange={() => toggleType(t.id)}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: 詳細 */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">詳細情報(任意)</h2>
          <div>
            <label className="mb-1 block text-sm font-bold">被害金額</label>
            <input
              type="number"
              value={form.damage_amount}
              onChange={(e) =>
                setForm({ ...form, damage_amount: e.target.value })
              }
              placeholder="円"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold">被害の詳細</label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              rows={5}
              placeholder="どんな症状が出たか、どんなトラブルがあったかなど"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold">購入先</label>
            <input
              type="text"
              value={form.purchase_route}
              onChange={(e) =>
                setForm({ ...form, purchase_route: e.target.value })
              }
              placeholder="例: ドラッグストア、Instagram広告、Amazonなど"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 text-sm font-bold text-gray-700">
              🌐 Web から購入した場合(任意)
            </div>
            <p className="mb-4 text-xs text-gray-600">
              該当する場合のみ、URL を貼り付けてください。同じ商品の被害をたどる手がかりになります。
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">
                  購入先のURL
                </label>
                <input
                  type="url"
                  value={form.purchase_url}
                  onChange={(e) =>
                    setForm({ ...form, purchase_url: e.target.value })
                  }
                  placeholder="https://example.com/product/..."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-gray-500">
                  例: 商品ページ、Amazon・楽天のページ、公式LP など
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-gray-700">
                  広告のURL
                </label>
                <input
                  type="url"
                  value={form.ad_url}
                  onChange={(e) =>
                    setForm({ ...form, ad_url: e.target.value })
                  }
                  placeholder="https://www.instagram.com/p/..."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-gray-500">
                  例: Instagram投稿、YouTube動画、Twitter広告 など
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: 属性 */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">あなたのこと(任意)</h2>
          <div>
            <label className="mb-1 block text-sm font-bold">ニックネーム</label>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="表示用(匿名可)"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold">年代</label>
              <select
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">選択しない</option>
                {[10, 20, 30, 40, 50, 60, 70, 80].map((a) => (
                  <option key={a} value={a}>
                    {a}代
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold">性別</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">選択しない</option>
                <option value="female">女性</option>
                <option value="male">男性</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: 確認 */}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">内容の確認</h2>
          <dl className="space-y-2 rounded border border-gray-200 bg-gray-50 p-4 text-sm">
            <div>
              <dt className="font-bold">商品:</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span>{product.name}</span>
                {product.medicine_id && (
                  <span className="rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand-dark">
                    💊 登録薬品
                  </span>
                )}
                {product.ad_product_id && (
                  <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
                    📦 広告商品DB
                  </span>
                )}
                {(product.maker || form.maker_manual) && (
                  <span className="text-gray-500">
                    ({product.maker || form.maker_manual})
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-bold">被害内容:</dt>
              <dd>
                {form.damage_types
                  .map((t) => DAMAGE_TYPES.find((d) => d.id === t)?.label || t)
                  .join(' / ')}
              </dd>
            </div>
            {form.detail && (
              <div>
                <dt className="font-bold">詳細:</dt>
                <dd className="whitespace-pre-wrap">{form.detail}</dd>
              </div>
            )}
            {form.purchase_url && (
              <div>
                <dt className="font-bold">購入先URL:</dt>
                <dd className="break-all text-xs text-gray-600">
                  {form.purchase_url}
                </dd>
              </div>
            )}
            {form.ad_url && (
              <div>
                <dt className="font-bold">広告URL:</dt>
                <dd className="break-all text-xs text-gray-600">
                  {form.ad_url}
                </dd>
              </div>
            )}
          </dl>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) =>
                setForm({ ...form, is_public: e.target.checked })
              }
              className="mt-1"
            />
            <span>
              この報告を公開して、同じ悩みを持つ他の利用者と共有する
              <span className="block text-xs text-gray-500">
                (個人を特定できる情報は編集部で確認・伏せ字処理します)
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ナビ */}
      <div className="mt-6 flex justify-between gap-2">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="btn border border-gray-300 bg-white text-gray-700"
          >
            戻る
          </button>
        )}
        <div className="flex-1" />
        {step < 5 && (
          <button
            onClick={() => setStep(step + 1)}
            className="btn-primary"
          >
            次へ →
          </button>
        )}
        {step === 5 && (
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? '送信中…' : 'この内容で報告する'}
          </button>
        )}
      </div>
    </div>
  );
}
