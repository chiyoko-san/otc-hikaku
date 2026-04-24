# クスリノコンパス (kusuri-compass.com)

市販薬7,500品を成分・効能・リスク区分から比較できる中立情報サイト。

**Next.js 14 (App Router) + Tailwind CSS + Supabase + Vercel** で構築。

---

## 主な機能

- **薬品詳細ページ (SSG)** - 詳細情報を持つ622件を事前静的生成。SEO主力。
- **症状ページ** - `/symptoms/[slug]/` 症状から市販薬を絞り込み
- **成分ページ** - `/ingredients/[slug]/` 成分から含有薬品を一覧
- **カテゴリページ** - `/categories/[cat]/` 31種類のカテゴリ別一覧
- **症状アキネーター** - 質問形式で症状に合う成分を提案
- **被害報告** - 副作用・トラブルの投稿・閲覧(Supabase連携)
- **コラム** - 薬と健康の記事(ISR + Markdown)
- **試験公開 `/lab/*`** - 既存HTMLをそのまま配信(Next.js対象外)

---

## SEO 強化ポイント

- 全ページに独自 `<title>` / `<meta description>` / OGP
- 薬品に `Drug` JSON-LD
- コラムに `Article` JSON-LD
- 症状に `MedicalCondition`、成分に `ChemicalSubstance`
- 全ページに `BreadcrumbList` JSON-LD
- `sitemap.xml` 自動生成(医薬品・症状・成分・コラム全URL)
- `robots.txt` 自動生成(`/lab/` を Disallow)
- 旧URL(`?med=2`, `?pg=column&col=xxx` 等) → 新URLへの **301リダイレクト全網羅**
- ISR で毎日コラム更新反映 + 被害報告数の動的反映

---

## ローカル開発

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` を `.env.local` にコピーして、以下を設定:

```bash
cp .env.local.example .env.local
```

編集する項目:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase プロジェクトURL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_KEY` - Supabase service role key (サーバー用)

### 3. 開発サーバー起動

```bash
npm run dev
```

→ http://localhost:3000 で確認

### 4. 本番ビルド(動作検証)

```bash
npm run build
npm start
```

---

## デプロイ (Vercel)

### 前提

Vercel のプロジェクトが kusuri-compass GitHub リポジトリと連携済みであること。

### 初回デプロイ手順

1. **新ブランチで作業**
   ```bash
   git checkout -b feature/nextjs-migration
   ```

2. **既存の旧ファイルの退避 or 削除**
   以下のファイルは Next.js 版では不要になるので削除:
   - `index.html`(ルート直下)
   - `style.css`
   - `admin.html`, `admin.css`(後日移行)
   - `build_vercel.sh`(旧デプロイ設定)

3. **Vercel 環境変数に以下を追加**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

4. **プレビューデプロイで全機能確認**
   - トップページ表示
   - 薬品詳細ページ (例: `/medicines/rokisonin-s/`)
   - 症状ページ (例: `/symptoms/頭痛/` など)
   - コラム表示
   - 被害報告フォーム送信
   - 試験公開ページ `/lab/adv-research-xxxxx/`

5. **旧 URL リダイレクト動作確認**
   - `/?med=2` → `/medicines/xxx/` へ 301
   - `/?pg=column&col=xxx` → `/columns/xxx/` へ 301

6. **main へマージ → 本番反映**

7. **Google Search Console 作業**
   - 新 sitemap を登録: `https://kusuri-compass.com/sitemap.xml`
   - URL検査で主要ページのインデックス登録リクエスト

---

## ディレクトリ構成

```
.
├── app/                          # Next.js App Router
│   ├── layout.tsx               # ルートレイアウト(Header/Footer/GA)
│   ├── page.tsx                 # トップページ
│   ├── medicines/[slug]/        # 薬品詳細 (SSG 622件)
│   ├── ingredients/[slug]/      # 成分詳細 (SSG)
│   ├── symptoms/[slug]/         # 症状詳細 (SSG)
│   ├── categories/[cat]/        # カテゴリ詳細 (SSG)
│   ├── columns/[slug]/          # コラム詳細 (ISR)
│   ├── damage-reports/          # 被害報告 (ISR + CSR form)
│   ├── search/                  # 検索結果 (SSR)
│   ├── akinator/                # 症状アキネーター (CSR)
│   ├── sitemap.ts               # /sitemap.xml 自動生成
│   ├── robots.ts                # /robots.txt 自動生成
│   └── not-found.tsx            # 404
│
├── components/                   # UIコンポーネント
│   ├── layout/                  # Header, Footer, Breadcrumb, JsonLd
│   ├── medicine/                # MedicineCard, SearchResults
│   ├── symptom/
│   ├── ingredient/
│   ├── column/                  # ColumnRenderer (Markdown + callout)
│   ├── akinator/
│   ├── damage-report/           # DamageReportForm
│   ├── common/                  # ContactForm
│   └── home/                    # HomeSearchBox
│
├── lib/
│   ├── medicines.ts             # medicines.json 読込 + SEO対象絞り込み + 集約
│   ├── slug.ts                  # ローマ字変換・スラッグ生成
│   ├── categories.ts            # 31カテゴリ定義
│   ├── symptom-groups.ts        # 17症状グループ定義
│   ├── akinator-tree.ts         # アキネーター決定木
│   ├── seo.ts                   # メタ・JSON-LD生成ヘルパー
│   └── supabase/
│       ├── client.ts            # ブラウザ用 anon
│       ├── server.ts            # サーバー用 service_role
│       ├── columns.ts           # コラム取得
│       └── damage-reports.ts    # 被害報告取得
│
├── data/
│   └── medicines.json           # 7554件の医薬品データ(ビルド時ロード)
│
├── types/
│   └── index.ts                 # 型定義
│
├── public/
│   ├── ogp.png                  # OGP 画像
│   └── lab/                     # 試験公開ページ(既存のままNext.js対象外)
│
├── scripts/                     # 既存Pythonスクリプト(そのまま運用継続)
│   ├── gen_column.py
│   ├── gen_images.py
│   └── ad_product_extractor.py
│
├── .github/workflows/           # 既存ワークフロー(そのまま)
│
├── next.config.js               # 301リダイレクト完全網羅
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vercel.json
```

---

## 主要なデータフロー

### 薬品詳細ページの生成

```
data/medicines.json (7554件)
 ↓ getEnrichedMedicines()
effect付きで絞り込み (622件)
 ↓ generateStaticParams()
ビルド時に全622ページを静的生成
 ↓ revalidate: 86400
1日に1回バックグラウンド再生成
```

### 被害報告の表示

```
Supabase damage_reports テーブル
 ↓ is_public=true フィルタ
 ↓ ISR 10分間隔
/damage-reports/ ページ
```

### コラムの表示

```
Supabase columns テーブル (status=published)
 ↓ generateStaticParams()
全コラム slug を事前取得
 ↓ ISR 1日間隔
/columns/[slug]/ ページ
```

---

## 移行チェックリスト

- [x] Next.js プロジェクト初期化
- [x] Tailwind セットアップ
- [x] 型定義・データ型
- [x] 全ページ作成
- [x] 301 リダイレクト設定
- [x] sitemap.xml 自動生成
- [x] JSON-LD 構造化データ
- [x] GA4 タグ埋め込み
- [ ] `.env.local` 設定 (デプロイ先で)
- [ ] `npm install` 実行
- [ ] ローカル `npm run dev` で動作確認
- [ ] Vercel 環境変数設定
- [ ] プレビューデプロイで全ページ動作確認
- [ ] 旧 index.html, style.css, admin.html, admin.css 削除
- [ ] main マージ
- [ ] Google Search Console で新 sitemap 登録
- [ ] 旧 URL のリダイレクト動作確認

---

## 期待される SEO 効果

### 3ヶ月後
- インデックス: 100未満 → **700-1000ページ**
- 月間表示回数: 100未満 → **3,000-10,000**
- 日次PV: 数人 → **30-80**

### 6ヶ月後
- 月間表示回数: **30,000-100,000**
- 日次PV: **150-400**

### 1年後 (毎週5-10件の詳細整備継続の前提)
- 月間表示回数: **150,000-400,000**
- 日次PV: **800-2,500**
- 収益化検討可能水準

---

## ライセンス

(未定)

## コンタクト

サイト: https://kusuri-compass.com
