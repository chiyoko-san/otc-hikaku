// 配置先: lib/icon-map.ts
//
// どの症状・どの剤形に、どのアイコン（lib/icon-paths.ts のキー）を使うかの対応表。
// 2026-11-21 追加。症状は84種類あるが、絵は体の部位ごとに28種類を共有する
// （例: 頭痛・偏頭痛は同じ「頭」、下痢・便秘は同じ「腸」）。
// 表に無い症状・判定できない剤形はアイコンを出さない（間違った絵を出さないため）。

import { normalizeDosageForm } from './dosageForm';

export type IconKey = string;

const SYMPTOM_ICON_GROUPS: Record<IconKey, string[]> = {
  zutsu: ['頭痛', '偏頭痛', '片頭痛', '頭重'],
  hatsunetsu: ['発熱', '悪寒', '解熱'],
  seki: ['せき', 'たん', '気管支炎', '長引く咳', '夜間の咳', '息切れ'],
  i: ['胃痛', '胸やけ', '胃もたれ', '食べ過ぎ', '飲み過ぎ', '吐き気', '二日酔い', '食欲不振', '胃酸過多'],
  me: ['目の疲れ', '眼精疲労', '目のかゆみ', '充血', '乾き目', 'ものもらい', '結膜炎', '目やに', 'ドライアイ'],
  hanamizu: ['鼻水', '鼻づまり', 'くしゃみ', '花粉症', 'アレルギー性鼻炎', '副鼻腔炎'],
  ha: ['歯痛', '抜歯後の疼痛', '歯茎の腫れ'],
  kuchi: ['口内炎', '口腔殺菌', 'のど痛', 'のどの痛み', '咽喉痛', 'のどの炎症', '声がれ', 'のどのイガイガ', '口臭'],
  hone: ['関節痛', '骨折痛', '骨粗しょう症', '打撲痛', '打撲・ねんざ', 'ねんざ', '外傷痛', '膝の痛み'],
  koshi: ['腰痛', '肩こり', '首の痛み', '背中の痛み'],
  shinkei: ['神経痛', '筋肉痛', 'しびれ', '手足のしびれ', '手足の痛み', 'こむら返り'],
  cho: ['下痢', '便秘', '便通', '腹部膨満', '整腸', '腸内環境', '腹痛'],
  hifu: [
    '湿疹・かぶれ', '湿疹', 'かゆみ', '肌荒れ', '乾燥肌', 'あかぎれ', 'ひび', 'しもやけ', 'にきび',
    'シミ・そばかす', '肝斑', '虫刺され', 'たむし', 'じんましん', '日焼け',
  ],
  ashi: ['水虫', '爪白癬'],
  kami: ['薄毛・脱毛', '白髪'],
  hiro: ['肉体疲労', '倦怠感', '滋養強壮', '疲労回復', '栄養補給'],
  hie: ['冷え', '末梢血行障害'],
  fumin: ['不眠', '睡眠障害'],
  shinzo: ['動悸', '血圧'],
  no: ['認知機能', '精神的ストレス', 'ストレス', '不安感', 'イライラ', '神経の興奮'],
  memai: ['めまい・立ちくらみ', '乗物酔い'],
  gekkei: ['更年期障害', '月経不順', '月経痛', '生理痛', '月経前症候群'],
  taiju: ['中性脂肪', '体脂肪'],
  shizuku: ['血糖値', '貧血'],
  kinen: ['禁煙'],
  ji: ['痔'],
  kensa: ['排卵確認', '妊娠確認'],
  shodoku: ['消毒'],
};

const SYMPTOM_ICON = new Map<string, IconKey>();
for (const [key, names] of Object.entries(SYMPTOM_ICON_GROUPS)) {
  for (const n of names) if (!SYMPTOM_ICON.has(n)) SYMPTOM_ICON.set(n, key);
}

/** 症状名 → アイコン。表に無ければ null（アイコンなし） */
export function symptomIconKey(name: string): IconKey | null {
  return SYMPTOM_ICON.get(name) ?? null;
}

/**
 * 薬 → 剤形アイコン。
 * 剤形の大分類は lib/dosageForm.ts の判定を使い、飲み薬と外用薬だけ製品名で細かく分ける。
 * 名前から形がわからない薬は null（アイコンなし）。
 */
export function formIconKey(med: {
  name: string;
  cat?: string | null;
  form?: string | null;
}): IconKey | null {
  const name = med.name || '';
  const form = normalizeDosageForm(name, med.cat ?? null, med.form ?? null);

  switch (form) {
    case 'eye':
      return 'megusuri';
    case 'nasal':
      return 'tenbi';
    case 'ear':
      return 'mimi';
    case 'inhalation':
      return 'kyunyu';
    case 'rectal':
      return /坐剤|坐薬|座剤|座薬/.test(name) ? 'zazai' : null;
    case 'vaginal':
      return /錠/.test(name) ? 'jozai' : null;
    case 'oralCavity':
      if (/トローチ|ドロップ|錠/.test(name)) return 'jozai';
      if (/スプレー/.test(name)) return 'shodoku';
      return /うがい|含嗽|ガーグル/.test(name) ? 'ugai' : null;
    case 'topical':
      if (/テープ|パップ|ハップ|シップ|湿布|貼|プラスター|パッチ/.test(name)) return 'harigusuri';
      if (/スプレー|エアゾール|ミスト/.test(name)) return 'shodoku';
      if (/軟膏|クリーム|ゲル|ジェル|ローション|乳剤|液|チック|ぬり|塗/.test(name)) return 'nurigusuri';
      return null;
    case 'oral':
    case 'other':
      // 「〇〇散エキス錠」のように漢方の処方名に「散」が入る錠剤があるので、錠・カプセルを先に見る
      if (/カプセル/.test(name)) return 'capsule';
      if (/錠|チュアブル|タブレット/.test(name)) return 'jozai';
      if (/顆粒|細粒|微粒|粉末|散剤|散$|末$/.test(name)) return 'kona';
      if (/内服液|シロップ|ドリンク|液/.test(name)) return form === 'oral' ? 'ekizai' : null;
      return null;
    default:
      return null;
  }
}
