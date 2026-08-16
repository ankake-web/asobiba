# あそびば (Asobiba)

スマホでさっと遊べる、夫婦・友だち向けのミニゲーム集。
`umarace`（わいわいボードゲーム集）と `thegameonline`（BACK10）を**ひとつの統合ゲーム集**にまとめ、各ゲームの世界観・デザインを刷新したもの。

> コレクション名「あそびば」は仮称です。変更するなら `index.html` の `<h1>` / `<title>` と `package.json` の `name` の3か所だけ直せばOK。

## 構成

```
asobiba/
  index.html              ハブ（トップ画面。各ゲームへのランチャー）
  games/
    uma-race/index.html   うまうまレース（夕暮れのターフ／競馬・予想）※オンライン対戦
    dice-climb/index.html ダイス登山（高山アルパイン／Can't Stop系・押し引き）
    treasure/index.html   押しつけ財宝（薄暗い宝物庫／No Thanks!系・心理戦）
    back10/index.html     BACK10（数字の流れ FLOW／協力カード）※オンライン協力
    spy/index.html        真贋の使者（密書カードバトル／ブラフ・CPU戦）
  src/shared/sound.js     共通サウンドキット（ハブ用）
  src/shared/rules.js     全ゲームのルール定義＋モーダル描画（ハブ用）
  src/shared/base-mobile.css  共通モバイル基盤（マーカー展開・下記）
  src/shared/icons.svg        共通SVGアイコンスプライト（マーカー展開）
  src/shared/confirm.js       共通確認シート/トースト（マーカー展開）
  vite.config.js          マルチページ構成（games/*/index.html を自動検出）＋共通部品のインライン展開
  package.json
```

各ゲームは**自己完結した単一HTML**（インラインCSS/JS）。`games/` 配下にフォルダを足して `index.html` を置けば、Vite が自動でビルド対象に含めます。

共通部品（base-mobile.css / icons.svg / confirm.js）は、各HTML内のマーカーコメント
`<!-- @shared:base-css -->` `<!-- @shared:icons -->` `<!-- @shared:confirm -->` の位置に
**ビルド時（dev中も）自動でインライン展開**されます。ゲームから import はしない＝
配布物は1ファイル自己完結のままなので、将来ゲーム単位で別リポ/別URLに切り出せます
（方針の詳細は CLAUDE.md / PROGRESS.md）。

## 開発・ビルド

```bash
npm install
npm run dev       # ローカル開発サーバ
npm run build     # dist/ に本番ビルド
npm run preview   # ビルド結果をプレビュー
```

`base: "./"`（相対パス）なので、`https://<user>.github.io/<repo>/` でもカスタムドメインでも、ビルドし直さず同じ成果物が動きます。

## デプロイ（新サイトとして公開する場合の TODO）

1. このフォルダを新しい GitHub リポジトリ（例 `ankake-web/asobiba`）にして push。
2. GitHub Actions で `npm run build` → `dist/` を GitHub Pages に公開（Pages source = GitHub Actions）。
3. **Firebase の許可ドメイン更新が必須**（オンライン機能を新ドメインで動かすため）:
   - うまうまレース … Firebase プロジェクト `umauma-737d6`
     - Authentication → Settings → 承認済みドメインに新サイトのドメインを追加
     - App Check / reCAPTCHA v3 のサイトキーに新ドメインを登録（未登録だと App Check が落ちる）
   - BACK10 … Firebase プロジェクト `thegameonline`
     - Authentication 承認済みドメイン＋ Firestore セキュリティルールの確認
   - ※ Firebase 設定値（apiKey 等）は各ゲームHTML内にそのまま保持済み。値は変更不要、ドメイン許可だけ追加。

## 既存リポジトリの扱い

- 旧 `umarace` / `thegameonline` リポジトリ（公開中）は**残してあります**。新サイトの動作確認が取れたら引退/リダイレクトを検討。
- `catan` / `100man-goku` / `dominion` / `hellapagos-web` はこの統合の対象外（無関係・別運用）。

## 世界観メモ（ゲームごとに個別デザイン）

| ゲーム | 世界観 | 基調色 |
|---|---|---|
| うまうまレース | 夕暮れのターフ／品のある競馬場 | ターフ緑 × 夕焼け × 真鍮ゴールド |
| ダイス登山 | 高山アルパイン／霧の稜線 | スレートブルー × 氷河白 × 山頂のアルペングロー |
| 押しつけ財宝 | 薄暗い宝物庫／呪われた財宝 | ダークティール × ロウソクの金 × ルビー |
| BACK10 | 数字の流れを整える協力 (FLOW) | 藍/ネイビー × アクア × ライム |
| 密書カードバトル | 密書の読み合い（近日登場） | 紫 × 墨 |
