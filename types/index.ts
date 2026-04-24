// 薬品データ型 (medicines.json の構造に準拠)
export type Medicine = {
  id: number;
  name: string;
  cat: string;
  maker: string;
  price: number | null;
  risk: number;              // 1 | 2 | 2.5 | 3
  drowsy: boolean;
  symptoms: string[];
  effect: string;
  ings: string[];            // "ロキソプロフェンNa水和物(68mg)" など
  warnIngs: string[];
  note: string;
  noteType: 'warn' | 'danger' | '';
  pmda_url: string;
  itype: string;
  source?: string;
  asin?: string;
  rakuten_url?: string;

  // 拡張フィールド(ビルド時生成)
  slug: string;
};

// カテゴリ定義
export type Category = {
  id: string;
  label: string;
};

// 症状グループ定義
export type SymptomGroup = {
  group: string;
  symptoms: string[];
  slug: string;
};

// 成分(集約)
export type Ingredient = {
  name: string;              // 正規化済み(例: "ロキソプロフェン")
  slug: string;
  rawNames: string[];        // 正規化元の表記バリエーション
  description?: string;      // ING 辞書から
  medicineIds: number[];     // 含まれる薬品ID
};

// 症状(集約)
export type Symptom = {
  name: string;              // "頭痛"
  slug: string;
  group?: string;            // "痛み・熱"
  medicineIds: number[];
};

// アキネーター決定木
export type AkinatorResult = {
  kw: string[];
  adv: string;
};
export type AkinatorChoice = {
  l: string;
  next?: AkinatorNode;
  result?: AkinatorResult;
};
export type AkinatorNode = {
  q: string;
  choices: AkinatorChoice[];
};

// コラム(Supabase)
export type Column = {
  id: string;
  title: string;
  date: string | null;
  tag: string | null;
  summary: string | null;
  body: string | null;
  thumb: string | null;
  status: string;
  publish_at: string | null;
  updated_at: string;
  slug: string | null;
};

// 被害報告(Supabase)
export type DamageReport = {
  id: number;
  medicine_id: number | null;
  medicine_name: string;
  maker: string | null;
  damage_types: string[];
  damage_amount: number | null;
  detail: string | null;
  resolved: boolean;
  created_at: string;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  purchase_route: string | null;
  purchase_date: string | null;
  resolve_status: string | null;
  consulted: string[] | null;
  screenshot_url: string | null;
  is_public: boolean;
  report_count: number;
};
