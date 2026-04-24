# Next.js 移行 - デプロイ作業手順

このドキュメントは、作成された Next.js プロジェクトを既存の GitHub リポジトリに統合して公開するまでの手順を記載しています。

---

## 作業の流れ

1. 現在の main ブランチは維持(本番稼働中のまま)
2. 新ブランチ `feature/nextjs-migration` を作成
3. Next.js 一式をそのブランチに push
4. Vercel プレビューで動作確認
5. 旧ファイル削除をコミット
6. main にマージ → 本番反映

---

## Step 1: ブランチ作成 & プロジェクト配置

### ローカルで作業する場合

```bash
# 現在のリポジトリディレクトリに移動
cd path/to/kusuri-compass

# 新ブランチ作成
git checkout -b feature/nextjs-migration

# この zip ファイル内の全ファイルを、現在のリポジトリのルートにコピー
# (上書きあり。ただし既存の scripts/ や lab/ は温存される)

# 確認
ls -la
```

### GitHub Web UI で作業する場合

1. GitHub で `kusuri-compass` リポジトリを開く
2. ブランチ切替ドロップダウンで `feature/nextjs-migration` を入力して作成
3. 「Add file > Upload files」で zip 内のファイルをドラッグ&ドロップ
4. コミットメッセージ: `Next.js 全面移行 - Phase 1-6 完了`

---

## Step 2: Vercel 環境変数の設定

Vercel のプロジェクト設定で以下の環境変数を追加:

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://glxhggfxxwpfmwqoulyy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (既存と同じ anon key) |
| `SUPABASE_SERVICE_KEY` | (既存と同じ service_role key) |

※ 既にこれらが設定済みの場合は不要。

---

## Step 3: プレビューデプロイで動作確認

ブランチを push すると Vercel が自動でプレビューURLを生成します。

### 確認項目

- [ ] トップページ `/` が表示される
- [ ] `/medicines/` から詳細ページへ遷移できる
- [ ] 薬品詳細ページに成分・症状タグのリンクがある
- [ ] `/symptoms/[slug]/` が表示される
- [ ] `/ingredients/[slug]/` が表示される
- [ ] `/categories/cold/` など各カテゴリが表示される
- [ ] `/columns/` が表示され、コラム詳細も開ける
- [ ] `/damage-reports/` が表示される(Supabase連携)
- [ ] 被害報告フォーム送信が動作する
- [ ] お問い合わせフォームが動作する
- [ ] アキネーターが動作する
- [ ] 検索ページで結果が出る
- [ ] `/lab/adv-research-xxxxx/` が従来通り表示される(試験公開)
- [ ] `/sitemap.xml` にアクセスして XML が返る
- [ ] `/robots.txt` にアクセスして正しい内容が返る

### 旧 URL リダイレクト確認

以下のURLをブラウザに入力して、正しい新URLへ 301 されるか確認:

- `/?med=2` → `/medicines/rokisonin-s/` (スラッグは実データに依存)
- `/?pg=column&col=c5` → `/columns/c5/`
- `/?pg=privacy` → `/privacy/`
- `/?pg=about` → `/about/`
- `/?pg=damage-list` → `/damage-reports/`
- `/?pg=damage-report` → `/damage-reports/submit/`

---

## Step 4: 旧ファイルの削除

プレビューで動作確認できたら、旧ファイルをブランチから削除します。

### 削除すべき旧ファイル

```
index.html         ← 旧SPAのルート
style.css          ← 旧CSS
admin.html         ← 旧管理画面(後日Next.js版で再実装)
admin.css          ← 旧管理画面CSS
build_vercel.sh    ← 旧デプロイスクリプト
robots.txt         ← 新しい app/robots.ts に置き換え(public/ に残っている backup は削除)
```

### 残すファイル

```
scripts/           ← Pythonスクリプトは継続運用
.github/           ← 既存GitHub Actions
lab/ → public/lab/ ← 試験公開は公開し続ける
ogp.png → public/  ← 移動済み
medicines.json → data/ ← 移動済み
```

### 削除コマンド

```bash
git rm index.html style.css admin.html admin.css build_vercel.sh robots.txt
git commit -m "旧 SPA ファイル削除"
git push
```

---

## Step 5: main へマージ → 本番反映

1. GitHub で Pull Request を作成(`feature/nextjs-migration` → `main`)
2. プレビューで最終確認
3. Merge
4. Vercel が自動で本番デプロイ

---

## Step 6: Google Search Console 作業

本番反映後、Search Console で以下を実施:

1. **サイトマップ登録**
   - 「サイトマップ」メニュー
   - `sitemap.xml` を追加して送信

2. **主要 URL の手動インデックス登録リクエスト**
   以下のページを URL検査 → インデックス登録リクエスト:
   - `/`
   - `/medicines/`
   - `/symptoms/`
   - `/ingredients/`
   - `/columns/`
   - 詳細ページの代表的なもの5-10件

3. **旧 URL の動作確認**
   - `/?med=2` などが 301 で新URLへ飛ぶことを URL検査で確認

---

## Step 7: モニタリング(移行後1ヶ月)

### 毎日確認

- Search Console の「カバレッジ」でインデックス状況
- エラー・警告が出ていないか

### 週次で確認

- 「ページ」で登録済みページ数の推移
- 「検索パフォーマンス」で表示回数・クリック数
- GA4 で日次PV

### 目安

- **1週間後**: インデックス数が旧より増えはじめる
- **2-4週間後**: 表示回数が増加傾向
- **1-2ヶ月後**: 検索クエリが具体化

---

## トラブルシューティング

### Q. ビルドで "Module not found: @/xxx" エラー

→ `tsconfig.json` の paths が `"@/*": ["./*"]` になっているか確認。

### Q. Supabase 接続エラー

→ 環境変数が Vercel に設定されているか確認。ローカルなら `.env.local` の値を確認。

### Q. medicines.json が読めない

→ `data/medicines.json` が存在し、`import medicinesRaw from '@/data/medicines.json'` が正しく動いているか確認。4.4MB あるためリポジトリに含めるには Git LFS 不要だが、初期 clone が少し重い。

### Q. `/lab/` が 404 になる

→ `public/lab/` にファイルがあるか確認。`lab/index.html` 等のファイルが正しく配置されていれば Vercel は自動配信する。

### Q. Vercel ビルドがタイムアウトする

→ `generateStaticParams` で返すページ数を減らす(薬品詳細を上位100件だけ事前生成にして、残りはオンデマンドISRに)。

---

## 移行後の運用メモ

### コラム自動生成は継続

`scripts/gen_column.py` と `.github/workflows/` の設定はそのまま動きます。Next.js 側は ISR で1時間ごとに新着コラムを取得するので、自動的に反映されます。

### 薬品データ追加の反映

`data/medicines.json` を更新した場合:

1. GitHub に push
2. Vercel が自動ビルド
3. 新しい薬品は次回アクセス時に ISR で生成される

### 詳細(effect/ings)整備のワークフロー

1. Supabase の medicines テーブルを更新
2. `scripts/` 配下に `export_to_json.py` のような同期スクリプトを追加(将来的に)
3. JSON を更新して push
4. Vercel 再ビルド

---

以上です。
