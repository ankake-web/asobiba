# あそびば（asobiba）— プロジェクトルール

スマホ向けミニゲーム集。ハブ（index.html）＋5ゲーム（games/*/index.html）。
公開: https://ankake-web.github.io/asobiba/ （main へ push → GitHub Actions が自動デプロイ）

## 一番大事な設計ルール: 各ゲームは「1ファイル自己完結」を守る

**将来ゲームごとに別リポ・別URLで公開する方針**（2026-08-15 決定）。そのため:

- 各ゲームは `games/<slug>/index.html` 1枚（＋あれば `assets/`）で完結させる。
- **ゲームから `src/shared/` を import しない**。共通部品が欲しいときは下記のマーカー方式を使う。
- ハブ（index.html）だけは `src/shared/sound.js` / `rules.js` を import してよい。

## 共通部品はビルド時インライン展開（マーカー方式）

`vite.config.js` の `inject-shared` プラグインが、HTML内のマーカーコメントを
`src/shared/` の実体に置換する（dev サーバでもビルドでも効く）。

| マーカー | 展開されるもの | 置く場所 |
|---|---|---|
| `<!-- @shared:base-css -->` | base-mobile.css（44pxタップ・safe-area変数・.ic） | head内・ページ自身の`<style>`より前 |
| `<!-- @shared:icons -->` | icons.svg（SVGスプライト約30個） | body開始直後 |
| `<!-- @shared:confirm -->` | confirm.js（asobibaConfirm / asobibaToast） | スプライトの次の行 |

共通部品を直したら `src/shared/` の1ファイルを直すだけで全ページに反映される。

## UIの掟（オーナーの好み。詳細はメモリ ui-taste）

- **絵文字禁止**。アイコンはスプライト `<svg class="ic"><use href="#ic-xxx"/></svg>` か、
  同流儀（24×24・stroke-width:2・currentColor）のインラインSVG。
- **取り消せない操作には `asobibaConfirm()` を1枚**（内訳 lines で「何を失うか」を実数で見せる）。
- 演出は派手に・情報豊かに。ただし**タップでスキップは付けない**。
- 数字だけの表示は避け、メーター・色付きチップで視覚化。
- ヘッダーにボタンを増やさない（メニューに集約）。
- タップ領域44px以上（例外は `class="minh0"`）・本文12px以上・`100vh`は`dvh`併記・safe-areaは `var(--sat)`/`var(--sab)`。

## 検証

- `npm run build` が通ること（マーカー展開・HTML構文はここで落ちる）。
- 見た目の確認は Playwright で iPhone 13 相当（375×812）のスクショを撮る
  （スクリプトはセッションのスクラッチパッドに置く。監査レポートは `docs/` 参照
  ※旧 `../_audit-2026-08-15/` は2026-08-23整理でレポート3本を docs/ へ移設し、スクショは削除済み）。
## 既知の問題: うまうまレースの App Check が本番で効いていない

2026-08-16、本番（https://ankake-web.github.io/asobiba/）で実測して判明。
**localhost だけの現象だと思っていたが誤りで、本番でも失敗している。**

- 症状: reCAPTCHA の `pat?k=6LeJi_os...` が **401**、App Check の
  `exchangeRecaptchaV3Token` が **403** を返す。
- 影響: `games/uma-race/index.html` の App Check 初期化が try/catch で握りつぶされるため、
  **ゲームは正常に動く**（匿名認証もFirestoreの読み書きも成功し、オンライン対戦できる）。
  ただし **App Check による不正アクセス防止が効いていない**状態。守りは Firestore ルールだけ。
- 原因: reCAPTCHA v3 のサイトキーの許可ドメインに `ankake-web.github.io` が未登録。
  （旧 umarace リポの独自ドメインしか登録されていないと思われる）
- 直し方（ブラウザ作業。コードの修正は不要）:
  1. https://www.google.com/recaptcha/admin でサイトキー `6LeJi_os...` を開き、
     ドメインに `ankake-web.github.io` を追加
  2. Firebase Console → プロジェクト `umauma-737d6` → App Check でリクエストが
     検証済みになるか確認
- BACK10（`thegameonline`）は App Check も匿名認証も使っていないので、この問題はない
  （代わりに守りが Firestore ルールだけなので、ルールの確認は別途しておくとよい）。
