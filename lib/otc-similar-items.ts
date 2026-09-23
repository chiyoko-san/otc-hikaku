import raw from '@/data/otc-similar-items.json';
import { OTC_SIMILAR_77 } from './otc-similar-77';

// 配置先: lib/otc-similar-items.ts
// data/otc-similar-items.json（scraper/build_otc_similar_items.py が薬価基準リストから生成）を読む。

export type OtcSimilarItem = {
  no: number; // 対象77成分の番号
  code: string; // 薬価基準収載医薬品コード
  name: string; // 品名（例: ロキソニン錠60mg）
  maker: string;
  ingredient: string; // 薬価リスト上の成分名
  spec: string; // 規格（例: 60mg1錠）
  route: '内用薬' | '外用薬' | '歯科用薬剤' | string;
  price: number; // 薬価（円、規格単位あたり）
  surcharge: number; // 上乗せ額（薬価の1/4、規格単位あたり）
  kind: '先発' | '後発' | 'その他' | string;
  expiry: string; // 経過措置期限（あれば）
};

type Dataset = {
  generated_at: string;
  source_files: string[];
  note: string;
  total: number;
  items: OtcSimilarItem[];
};

const DATA = raw as Dataset;

/** 薬価データの基準日ラベル（ファイル名 tpYYYYMMDD-… から取る） */
export function getYakkaDateLabel(): string {
  const m = DATA.source_files.map((f) => f.match(/tp(\d{4})(\d{2})(\d{2})/)).filter(Boolean)
    .sort((a, b) => (b![0] > a![0] ? 1 : -1))[0];
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : '';
}

export function getItemsByNo(no: number): OtcSimilarItem[] {
  return DATA.items.filter((i) => i.no === no);
}

/** 先発品を優先して上位 n 件（表示用） */
export function getRepresentativeItems(no: number, n = 3): OtcSimilarItem[] {
  const items = getItemsByNo(no);
  const brand = items.filter((i) => i.kind === '先発');
  const rest = items.filter((i) => i.kind !== '先発');
  return [...brand, ...rest].slice(0, n);
}

/** 品名の前方一致で1件探す（例: 'ロキソニン錠60mg'） */
export function findItemByName(prefix: string): OtcSimilarItem | null {
  return DATA.items.find((i) => i.name.startsWith(prefix)) || null;
}

/** 規格単位の呼び名（「1錠」「1g」「1枚」など）。規格文字列の末尾から取る */
export function unitLabel(spec: string): string {
  const m = spec.match(/(\d+(?:\.\d+)?)?(錠|カプセル|包|g|mL|枚|管|瓶|個|本|袋)$/);
  if (!m) return '1単位';
  return `1${m[2]}`;
}

export function yen(n: number): string {
  // 1円未満は小数1桁、それ以上は整数丸め（表示用）
  return n < 10 ? `${Math.round(n * 10) / 10}円` : `${Math.round(n).toLocaleString('ja-JP')}円`;
}

/** 数量をかけたときの「これまで」「これから」（定率負担 rate = 0.1 / 0.2 / 0.3） */
export function estimate(item: OtcSimilarItem, qty: number, rate: number) {
  const drugCost = item.price * qty;
  const before = drugCost * rate;
  const surcharge = drugCost / 4;
  const after = surcharge + (drugCost - surcharge) * rate;
  return { drugCost, before, surcharge, after, diff: after - before };
}

export const OTC_SIMILAR_ITEMS_META = {
  total: DATA.total,
  generatedAt: DATA.generated_at,
  note: DATA.note,
};

/** シミュレーター（クライアント側）に渡す軽量版 */
export type SlimItem = {
  code: string;
  name: string;
  spec: string;
  price: number;
  kind: string;
  route: string;
  ingredient: string;
  no: number;
  group: string;
};

export function getSlimItems(): SlimItem[] {
  const groupOf = new Map(OTC_SIMILAR_77.map((i) => [i.no, i.group as string]));
  return DATA.items.map((i) => ({
    code: i.code,
    name: i.name,
    spec: i.spec,
    price: i.price,
    kind: i.kind,
    route: i.route,
    ingredient: i.ingredient,
    no: i.no,
    group: groupOf.get(i.no) ?? 'other',
  }));
}
