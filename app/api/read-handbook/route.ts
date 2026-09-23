import { NextResponse } from 'next/server';
import { getSlimItems, type SlimItem } from '@/lib/otc-similar-items';
import { SWITCH_DRUGS } from '@/lib/switch-data';

// 配置先: app/api/read-handbook/route.ts
//
// お薬手帳・薬袋の写真 → Claude（画像読み取り）→ 薬名の一覧 → 688品目の辞書に照合。
// - 画像は保存しない（メモリ上で処理して破棄）
// - 薬名以外（氏名・生年月日・保険証番号など）は読み取らない指示を出す
// - 1日の回数上限を Supabase の関数 bump_daily_counter で管理（未設定なら制限なしで動く）
//
// 必要な環境変数（Vercel）:
//   ANTHROPIC_API_KEY            必須
//   NEXT_PUBLIC_SUPABASE_URL     回数制限用（既存）
//   NEXT_PUBLIC_SUPABASE_ANON_KEY 回数制限用（既存）
//   HANDBOOK_DAILY_LIMIT         任意。既定 300回/日

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-4-6';
const DAILY_LIMIT = Number(process.env.HANDBOOK_DAILY_LIMIT ?? 300);
const MAX_BASE64_CHARS = 3_000_000; // ≒ 2.2MB

type ReadLine = {
  text: string; // 読み取った文字列
  status: 'matched' | 'ambiguous' | 'not_target' | 'unknown';
  item?: SlimItem; // 一致した品目
  candidates?: SlimItem[]; // 候補（ambiguous のとき）
  guideSlug?: string; // 対象外だが切替ガイドがある薬
  label?: string; // 対象外の薬の表示名
};

const SYSTEM = `あなたは日本の薬局で発行される「お薬手帳」「薬袋」「薬剤情報提供書」の写真から、薬の名前だけを書き写す係です。

出力は次のJSONのみ（説明文・前置き・コードフェンス禁止）:
{"drugs":[{"name":"ロキソニン錠60mg"},{"name":"ロキソプロフェンNa錠60mg「サワイ」"}]}

ルール:
- 薬の製品名を、印字どおり（規格・「メーカー名」も含めて）書き写す。1行に複数の薬があれば分ける
- 同じ薬が複数回出てきても1回だけ
- 用法（1日3回など）、日数、数量、効能の説明文、注意書きは書かない
- 患者の氏名・生年月日・年齢・性別・保険証番号・住所・電話番号・医療機関名・医師名・薬局名・日付は絶対に出力しない
- 薬の名前が1つも読み取れない場合は {"drugs":[]} を返す
- 写真が薬に関係ない場合も {"drugs":[]} を返す`;

function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s\u3000]/g, '')
    .replace(/[「」『』()（）\[\]]/g, '')
    .toLowerCase();
}

// 剤形・規格の手前までを「薬の核」とみなす（ロキソニン錠60mg → ロキソニン）
const FORM_RE = /(錠|od錠|カプセル|顆粒|細粒|散|末|シロップ|ドライシロップ|ds|テープ|パップ|ゲル|クリーム|軟膏|ローション|液|点鼻|点眼|坐|坐薬|坐剤|内用|外用|吸入|噴霧|スプレー|配合|ソフト|\d)/;
function core(n: string): string {
  const m = n.match(FORM_RE);
  const c = m && m.index !== undefined ? n.slice(0, m.index) : n;
  return c.length >= 2 ? c : n;
}

function matchOne(text: string, items: SlimItem[], notTargets: { key: string; label: string; slug: string }[]): ReadLine {
  const rn = norm(text);
  if (!rn) return { text, status: 'unknown' };

  // 1) 完全一致
  const exact = items.filter((i) => norm(i.name) === rn);
  if (exact.length === 1) return { text, status: 'matched', item: exact[0] };
  if (exact.length > 1) return { text, status: 'ambiguous', candidates: exact.slice(0, 5) };

  // 2) 包含（読み取りに余分な文字が付いた/欠けた場合）
  const contains = items.filter((i) => {
    const n = norm(i.name);
    return n.length >= 4 && (rn.includes(n) || n.includes(rn));
  });
  if (contains.length === 1) return { text, status: 'matched', item: contains[0] };
  if (contains.length > 1) {
    // 規格（mg/%/g）が一致するものを優先
    const strength = rn.match(/\d+(?:\.\d+)?(?:mg|%|g|ml|μg|µg)/);
    const same = strength ? contains.filter((i) => norm(i.name).includes(strength[0])) : [];
    if (same.length === 1) return { text, status: 'matched', item: same[0] };
    return { text, status: 'ambiguous', candidates: (same.length ? same : contains).slice(0, 5) };
  }

  // 3) 核（ブランド名/一般名の頭）で前方一致
  const c = core(rn);
  if (c.length >= 3) {
    const byCore = items.filter((i) => norm(i.name).startsWith(c));
    if (byCore.length === 1) return { text, status: 'matched', item: byCore[0] };
    if (byCore.length > 1) {
      const strength = rn.match(/\d+(?:\.\d+)?(?:mg|%|g|ml|μg|µg)/);
      const same = strength ? byCore.filter((i) => norm(i.name).includes(strength[0])) : [];
      if (same.length === 1) return { text, status: 'matched', item: same[0] };
      return { text, status: 'ambiguous', candidates: (same.length ? same : byCore).slice(0, 5) };
    }
    // 4) 成分名で照合（一般名処方「【般】ロキソプロフェンNa錠60mg」など）
    const byIng = items.filter((i) => norm(i.ingredient).startsWith(c) || norm(i.ingredient).includes(c));
    if (byIng.length > 0) {
      const strength = rn.match(/\d+(?:\.\d+)?(?:mg|%|g|ml|μg|µg)/);
      const same = strength ? byIng.filter((i) => norm(i.name).includes(strength[0])) : [];
      const pool = same.length ? same : byIng;
      const brand = pool.filter((i) => i.kind === '先発');
      return { text, status: 'ambiguous', candidates: (brand.length ? [...brand, ...pool.filter((i) => i.kind !== '先発')] : pool).slice(0, 5) };
    }
  }

  // 5) 対象外だと分かっている薬（カロナール・ガスター等）
  for (const nt of notTargets) {
    if (rn.includes(nt.key)) return { text, status: 'not_target', guideSlug: nt.slug, label: nt.label };
  }
  return { text, status: 'unknown' };
}

async function checkDailyLimit(): Promise<'ok' | 'limit' | 'skip'> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return 'skip';
  try {
    const r = await fetch(`${url}/rest/v1/rpc/bump_daily_counter`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: 'read-handbook', p_limit: DAILY_LIMIT }),
      cache: 'no-store',
    });
    if (!r.ok) return 'skip'; // 関数未作成などは制限なしで続行
    const allowed = await r.json();
    return allowed === true ? 'ok' : 'limit';
  } catch {
    return 'skip';
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'not_configured' }, { status: 500 });

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const image = (body.image || '').replace(/^data:[^;]+;base64,/, '');
  const mediaType = body.mediaType || 'image/jpeg';
  if (!image || image.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  }

  const limit = await checkDailyLimit();
  if (limit === 'limit') return NextResponse.json({ error: 'daily_limit' }, { status: 429 });

  let drugs: string[] = [];
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'この写真に写っている薬の名前だけをJSONで書き出してください。' },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[read-handbook] anthropic error', r.status, t.slice(0, 300));
      return NextResponse.json({ error: 'upstream' }, { status: 502 });
    }
    const data = await r.json();
    const text: string = (data.content || []).map((b: { text?: string }) => b.text || '').join('');
    const m = text.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : { drugs: [] };
    drugs = Array.isArray(parsed.drugs)
      ? parsed.drugs.map((d: { name?: string }) => String(d?.name || '').trim()).filter(Boolean)
      : [];
  } catch (e) {
    console.error('[read-handbook] parse error', e);
    return NextResponse.json({ error: 'parse' }, { status: 502 });
  }

  // 重複除去（正規化後）
  const seen = new Set<string>();
  drugs = drugs.filter((d) => {
    const k = norm(d);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 30);

  const items = getSlimItems();
  const notTargets = SWITCH_DRUGS.filter((d) => d.otcSimilarNo == null).map((d) => ({
    key: core(norm(d.rxName.replace(/\(.*?\)/g, ''))),
    label: d.rxName,
    slug: d.slug,
  }));
  const lines = drugs.map((d) => matchOne(d, items, notTargets));

  return NextResponse.json({ lines, model: MODEL });
}
