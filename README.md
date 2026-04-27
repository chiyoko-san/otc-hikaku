# 機能性表示食品ラベル対応

## 修正内容

「分類不明」と表示されていた機能性表示食品(itype='functional')と医薬部外品(itype='quasi')に、
正しいラベル(緑系/紫系)を表示するようにしました。

## 修正ファイル(3つ)

1. `app/medicines/[slug]/page.tsx` - 詳細ページのラベル
2. `components/medicine/MedicineCard.tsx` - 一覧カードのラベル(短縮表示)
3. `app/globals.css` - 新CSSクラス risk-functional / risk-quasi

## ラベル変換ロジック

- `itype === 'functional'` → 機能性表示食品(緑系・emerald-100)
- `itype === 'quasi'`     → 医薬部外品(紫系・purple-100)
- それ以外               → risk値からラベル決定(従来通り)

## 影響範囲

- エラスチン、その他505件の機能性表示食品
- 2件の医薬部外品

## 配置先

それぞれ同じパスに上書きアップロード。
