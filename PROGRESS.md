# あそびば PROGRESS

## 決定事項

- **2026-08-15 ゲームごとに別URL公開を目指す**（オーナー意向）。ただしサーバー実体は無い
  （Pages＋Firebase のみ）ので急がない。各ゲームの「1ファイル自己完結」を維持し、
  共通部品はビルド時インライン展開（CLAUDE.md 参照）にして、分離コストを最小に保つ。
- 2026-08-15 全ゲームUI監査を実施（レポート3本: `docs/` ※2026-08-23整理で `../_audit-2026-08-15/` から移設・スクショ34MBは削除済み）。
  優先度: ハブ → uma-race → dice-climb → back10 →（他プロジェクト）。

## 2026-09-05 オセロ→リバーシ改名（済・未push）

- 「オセロ／Othello」はメガハウスの登録商標で営利利用にライセンスが要るため、収益化の前に改名（オーナー承認）。
- `git mv games/othello → games/reversi`、slug `reversi`、Firestore 部屋名 `rooms/reversi-XXXX`。旧 slug の部屋には `LEGACY_SLUG` で join フォールバック（片方向・部屋TTL 3日）→ 数日後に `LEGACY_SLUG`/`SOUND_KEY_OLD` を削除してよい。
- 旧URL `/games/othello/` は転送ページ1枚（location.replace＋meta refresh・#部屋コード引き継ぎ・noindex）として残す。
- ハブ index.html（description/og/タイル/CSS `.t-reversi`・og:image ?v=3）、rules.js、online.js コメント、tests/reversi.test.mjs、icons.svg コメント、public/og.png のラベル「オセロ」→「リバーシ」も差し替え。
- 検証: `node --test tests/*.test.mjs` 122件緑、`npm run build` 成功、dist から可視の「オセロ」消滅（残りは babanuki の CSS コメント1か所のみ）。
- ★同日: 定番8本＋キーアート等の未コミット33件を4コミットに整理して push 済み（Actions success・本番で8本のリンク確認）。

## 2026-08-15 UI改修 第1弾（済）

- **共通部品を新設**: `src/shared/base-mobile.css`（44px/safe-area/dvh基盤）・
  `icons.svg`（SVGスプライト約30個）・`confirm.js`（確認シート＆トースト）＋
  `vite.config.js` に inject-shared プラグイン。
- **ハブ全面改修**: タイル静的HTML化（SEO/OGP対応）・巨大絵文字→SVGエンブレム＆CG馬・
  タイル色調を暗色系に統一・ルールボタンをリンク外へ（誤タップ解消）・人数/形態バッジ・
  ルールモーダル修正（CTA常時表示/スクロールリセット/dvh）・OGP/favicon/apple-touch-icon 追加。
- **5ゲーム一括修正**（各ゲームの詳細は git diff 参照）:
  - uma-race: やめる/BETに確認シート・開始直後の団子解消・極小文字12px化・ヘッダーCG馬化
  - dice-climb: 盤面ジャンプ解消・ペア重複除去・駒位置修正・CPU演出可視化・仮進捗チップ・ヘッダー1行化
  - treasure: 蔵の重なり修正・引き取る確認シート（実質点計算）・連番ヒント・絵文字0化
  - back10: 出せる札ハイライト・誤タップ減点廃止・ギブアップをメニュー内へ・山札バー
  - spy: 遊び方が開けないz-index修正・ヒント常時表示・結果の自動送り廃止・申告2段化・押収確認
- ドミニオン（別リポ）: 全560枚80MB先読み→対局使用分のみ・loading=lazy・副題を15拡張表記に。
- 検証: `npm run build` 緑・iPhone13相当で全ページスクショ確認（改修後スクショは2026-08-23整理で削除済み・git履歴で再現可）。

## 2026-08-16 うまうまレースの1枚絵4枚を差し替え（済）

井上さんが画像生成AIで作った絵を受け取り、ゲーム用に整えて差し替えた。
**これで uma-race から写実CGが完全に消え、全画面がデフォルメ画風で揃った。**

- `title-hero.jpg` / `turf-bg.jpg` / `winner.jpg` / `cutin-charge.jpg` を差し替え（1600px幅・JPEG）。
  winner と cutin は生成物が3:1と横長すぎたので、カットイン枠(16:10)に合わせて右寄りでトリミング。
- **ホームのヒーローに左からのスクリムを追加**（`.homeHero`）。絵が明るく左寄せの白文字が読めなかったため。
- **ロビーのヒーロー（`.hero`）にも同じ絵を敷いた**。緑のベタ塗りでトップと世界観が断絶していた問題を解消。
- **ロビーの「参加者を追加/減らす・CPUを追加/減らす」4ボタンを「− 数 ＋」のステッパー2行に集約**。
- サイコロ記号（馬・ジョッキー・人参・天候）を自作SVG（`FACE`）に。3Dダイスの面だけは
  彫り込みシルエット素材として絵文字の字形を使い続ける（色は出ないので見た目に絵文字感はない）。
- **vite.config.js**: `assets/` を dist へコピーする際、`_` で始まる作業用フォルダを除外するようにした。
  これを入れる前は `_art-brief` の元データ等が公開物に入り dist が 8.66MB あった → **1.32MB**。

## 未完了タスク（次にやること）

1. **実機（本物のiPhone/Android）での通し確認** → 問題なければ git push で公開。
   ※ ドミニオン以外の全ゲームが未コミット状態（catan / 100man-goku / hellapagos-web / monster-eater も同様）。
2. **うまうまレース と BACK10 の2本だけを単独サーバー（別URL）に分離する**（2026-08-15 決定）。
   残る3本（霧稜/呪宝/真贋）とハブは asobiba に据え置き＝何もしない。
   旧リポ `ankake-web/umarace` `ankake-web/thegameonline` の再利用も検討。
   `dist/` のコピーは不可（`../../assets/` 参照でパスがズレる）＝単体rootで再ビルドすること。
   手順とFirebaseの注意は `docs/02-あそびばのサーバー構成.md` の「移行時の地雷」参照。
3. uma-race の**ロビー以降のリデザイン**（トップとの世界観断絶。監査2位の残り半分）。
4. uma-race に残る**1枚絵4枚をデフォルメ画風に描き直す**（下記「馬アート」の残り）。
   `title-hero.jpg`（ホームのヒーロー）/ `winner.jpg`（優勝）/ `cutin-charge.jpg`（カットイン）/
   `turf-bg.jpg`（盤面背景）。SVGでは描けないので**画像生成AIで作る必要がある**。
   → **指示文とAI添付用の参照画像は作成済み**: `games/uma-race/assets/_art-brief/`
     井上さんが画像を生成して同フォルダに入れたら、サイズ調整・差し替え・確認をこちらでやる。
     受け取るファイル名は `A-title-hero.png` / `B-turf-bg.png` / `C-winner.png` / `D-cutin.png`。
   ※ rules.js の hero も title-hero.jpg を参照しているので、差し替えれば同時に直る。
5. uma-race のサイコロ面 🐎🧢🥕☀️ と dice-climb の駒 🧗🐐 の画像/SVG化（TODO(icon)コメント付き）。
   ※ デフォルメ馬に画風を揃えること。

## 2026-08-16 うまうまレースの馬アートをデフォルメ化（済）

写実CG（AI生成の実写級サラブレッド）が「スマホでわいわい遊ぶ」トーンと合っていなかったため、
**全頭をインラインSVGのデフォルメ馬に描き直した**（井上さん選択の「案B＝茶色の馬＋勝負服」路線）。

- **識別性の工夫**: 案Bは小サイズだと全頭茶色で見分けがつかないため、実在の毛色7種
  （栗毛・青毛・栃栗毛・尾花栗毛・黒鹿毛・芦毛・鹿毛）で馬体を差別化し、
  **ゼッケンを胴の側面いっぱいに拡大**して勝負服と同色にし、馬番を白抜きで入れた。
  → 26px（実機の最小表示）でも7頭を判別できる。監査の「開始直後に団子」問題にも効く。
- **実装**: `horseSpriteSvg(id,faceLeft,withNo)` が1頭ぶんのSVGを生成し、
  `preloadSprites()` が data URL にして `.pony.sp-*` / `.pony.spf-*` に一括注入する。
  以前の「JPGを読んで緑背景をクロマキー透過」処理は**丸ごと不要になり削除**（読み込み待ちもゼロに）。
  小さい丸チップ用に `horseFaceUrl()`（viewBoxで顔だけ切り出し）も用意。
- **差し替えた箇所**: 盤面の駒／伏せ馬（専用の紫シルエット＋「?」。以前は1頭だけ写真で浮いていた）／
  出走カードのポートレート（芝の上に全身＋馬番）／出走馬一覧の丸チップ（顔アップ）／
  ヘッダーのメダリオン／ロビーのヒーロー装飾／**ハブのタイル**／**OGP画像 public/og.png**。
- **退避したファイル**: 使わなくなった写実CG14枚（horse-*.jpg 7枚・horse-side-*.jpg 7枚 計673KB）を
  `games/uma-race/assets/_retired-realistic/` に移動（削除はしていない）。
- 検証: `npm run build` 緑／iPhone 13相当でレース進行まで通し確認（駒7頭すべてスプライト・写真0）。

## 2026-08-22 BACK10：UI監査で削ったゲーム性を元に戻した（済）

井上さんから「BACK10のゲーム性いじったでしょ。ゲームとして親切に作りすぎ」の指摘。
`e93da99`（UI監査の反映）で入れた次の3点は **UI改善ではなくゲーム性の改変**だったので撤回した。
元の設計（`thegameonline/index.html`）と JS 差分ゼロになるまで戻してある。

- 選択中の札が出せる場のハイライト（`.pile.playable` / `.pile.back10able` の CSS と描画側の判定）を削除
- どこにも出せない手札の減光（`.card.dead`）を削除
- 誤タップの **MISS -50点** を復活（`scoreBase -50` / `stats.penalty++` / トースト「MISS -50」/ `saveGame`）
- 結果画面の `MISS：n` 表示を復活、ルール文も「出せない場を選ぶとMISSで-50点です。」に戻した

**残したもの**（ゲーム性に触れないUI改善）: ☰メニューへの集約、ギブアップの確認シート、
山札の残量ミニバー、44px/12px下限、safe-area 変数、端末ローカルのランキング保存。

**教訓**: 「出せる札が分からない／誤タップで無言の−50点」は**バグではなく仕様**だった。
判定情報の可視化・ペナルティの増減・ヒント追加は、UI改修の範囲外。触る前に必ず確認する。

呪宝（treasure）の**連番ヒント**（`renderRunHints` — 引いたカードが自分の蔵の数字±1ならチップで教える）も
同じ性質の追加だが、2026-08-22に井上さんの判断で**そのまま残す**ことにした（元の設計が不明なため）。

## 既知の注意

- localhost では uma-race の App Check 警告が出る（正常。本番では出ない）。
- OGP画像は `public/og.png`（1200×630）。URL直書きなのでリポ名を変えたら head の og:url/og:image を直す。

## 2026-08-25 キーアート8枚（バッチ7完了）
- 既存 `uma-race/assets/title-hero.jpg` のフラットな塗りを基準に、ハブ＋7ゲームの横長キーアートを生成・実装。
- 配置先：`public/hero-hub.jpg`、`games/{dice-climb,treasure,spy,back10,othello,shogi,daifugo}/assets/hero.jpg`。
- 全8枚を不透明JPG・1600×900・品質80へ統一（合計約391KB）。左を文字用に暗く空け、主題は中央右へ配置。
- ハブ `.hero` に背景画像＋左側の可読性暗幕を追加。`src/shared/rules.js` の7ゲームへ `hero` を接続。
- `npm run build` 合格、テスト122/122合格、distへの8枚コピーを確認。
- 390×844で7本の実ルールモーダルを全件目視、1440×900でも全件442×120を確認。画像欠損・横はみ出し・ブラウザエラーなし。

### 追加5ゲームも完成（同日）
- 見送り候補だったババ抜き／神経衰弱／ブラックジャック／ポーカー／チェスにも同仕様のキーアートを追加。
- 5枚とも不透明JPG・1600×900・品質80で `games/<slug>/assets/hero.jpg` へ配置し、`rules.js` に接続。
- これで既存うまうまレースを含む**全13ゲームが実画像キーアート**になり、ベタ塗り代替は0本。
- 再ビルド・テスト122/122合格。390×844で追加5本を全件目視、1440×900で全13本が442×120・画像読込済み・ブラウザエラー0を確認。

## 2026-08-23 定番ゲーム8本の追加を決定（作業中）

井上さんの指示「トランプやオセロなど一般的な定番ゲームも遊べるようにしたい」→ AskUserQuestion で確定:
**大富豪・ババ抜き・神経衰弱・ブラックジャック・ポーカー（5カードドロー）／オセロ・将棋・チェス**。
**最初からオンライン対戦あり**（CPU対戦・同じ端末で交代も全部）。

- 設計書（契約）= `docs/03-定番ゲーム追加-設計.md`。共通部品 `src/shared/online.js`（Firebase umauma-737d6・`rooms/{slug}-{code}`・runTransaction合意・ホスト不要）と `src/shared/cards.js`（トランプSVG描画）をマーカー展開で各ゲームに入れる。
- Phase 1: online.js＋cards.js＋オセロ（参照実装）＋ハブのカテゴリ化（オリジナル／定番トランプ／定番ボードゲーム）＋rules.js 8本。Phase 2: 残り7本を並列。Phase 3: OGP・チャッピー素材・実機確認・push。
- 隠し情報（手札）は Firestore の state に入る＝devtools で見れば見える割り切り（uma-race/back10 と同じ構造）。
- オンラインの実通信テストはこのセッションでは行わず、online.js はフェイクストアで単体テスト。**本人が実機2タブで確認**（手順は設計書末尾）。権限エラーが出たら `docs/firestore.rules` をコンソールに貼る。
- 本日のデザイン改修（書体・ウェイト階層ほか）と合わせて**未コミット**。本人確認後にコミット。

### 2026-08-23 定番ゲーム8本 実装完了（未コミット・本人確認待ち）
- 新規: `src/shared/online.js` `src/shared/cards.js`（vite.config.js にマーカー `@shared:online` `@shared:cards` 追加）、`games/{othello,shogi,chess,daifugo,babanuki,memory,blackjack,poker}/index.html`、`tests/*.test.mjs`（122件）、`tests/fake-store.mjs`、`docs/firestore.rules`、`docs/03-定番ゲーム追加-設計.md`（§7 実装メモ・§8 実機確認手順）。
- ハブ: 3カテゴリ化（オリジナル／定番トランプ／定番ボードゲーム）・8タイル・`rules.js` 13本・`icons.svg` に ic-cards/ic-board/ic-disc/ic-king 追加・tileDesc の既存幅バグ修正。
- 検証: `npm run build` 緑（13ページ）／`node --test tests/*.test.mjs` 122/122／絵文字0／dist を Playwright で通し（ハブ→8ページ 200・pageerror 0・横スクロール0・ルールモーダル13本）。各ゲームは CPU同士の自動対局を終局まで回して例外0。
- **未確認＝本番 Firestore でのオンライン実通信**（セッションの安全機構で自動テスト不可）。本人が設計書 §8 の手順でタブ2つ確認。permission-denied なら `docs/firestore.rules` をコンソールへ。
- 各ゲームの「本人に確認してほしい点」は `C:\Users\b1242\claude\DESIGN-UPGRADE.md` の着手ログ（定番ゲームの行）に集約。
- 次: OGP `public/og.png` を13本版に再生成／チャッピー素材（チェス駒12・各エンブレム）／実機確認→コミット→push。

## 2026-08-25 キーアート13点をハブのタイルにも敷いた＋切れの2件を修正（済）

**指摘**「いちばん投資した素材（キーアート13枚）が、いちばん見られない場所（ルールモーダル）にしか出ていない」。
`index.html` の `hero.jpg` 参照は0件だった。ハブのゲームタイル13枚すべての地にキーアートを敷いた。

### 1. ハブのゲームタイルにキーアートを敷いた（`index.html`）
- 各 `.tile` の先頭に `<span class="tileArt"><img src="./games/<slug>/assets/hero.jpg" loading="lazy" decoding="async" width="1600" height="900"></span>` を追加（13枚）。
  うまうまレースだけ `hero.jpg` が無いので `assets/title-hero.jpg` を使う。
- **CSS背景ではなく `<img>` にしたのは `loading="lazy"` を効かせるため**（CSS背景だと13枚が一斉に読まれる）。
  実測: 13枚合計 687KB（うち title-hero が 133KB）。lazy 属性は13枚とも効いている（Playwright で確認）。
- 重ね順は `.tile{isolation:isolate}` の中で **絵(z-index:-2) → エンブレム(-1) → 文字**。
  **既存の手描きインラインSVGエンブレムはそのまま残してある**（絵の上に乗る）。
- `.tileArt::before` = タイル色（`--w1`/`--w2`）を opacity .38 で被せる色被せ層 →
  **`--acc`/`--w1`/`--w2` の色分け体系は維持**（大富豪＝金、ババ抜き＝桃、神経衰弱＝紫…がそのまま出る）。
- `.tileArt::after` = 暗幕（左 rgba(9,7,13,.88) → 右 .52 ＋ 下方向 .52）。文字は既存の白＋text-shadow のままで読める。
- 検証: 390px / 1440px の前後スクショを目視比較。全13タイルで画像読込 13/13・ブラウザエラー0・横スクロール0。

### 2. チェスのルールモーダルで王冠が切れていた（`src/shared/rules.js`）
- `.ruleHero` は 442×120 の帯で `background-position:center` 固定 → 可視帯が原画 y=233〜667 になり、
  キングの十字冠（y≒110〜232）が帯の外に出ていた。
- **カードごとに位置を指定できる `heroPos` フィールドを新設**（無指定なら従来どおり center）。
  レンダラ側は `r.heroPos` があるときだけ inline の `background-position` を足す。
- チェスだけ `heroPos: "center 20%"`。**他12枚は前後スクショがピクセル単位で完全一致**（cmp で検証済み）。

### 3. ハブ最上部ヒーローで木馬の頭がPC表示で切れていた（`index.html`）
- `.hero` は PC幅で 1048×277。`url(./hero-hub.jpg) right center` だと可視帯が原画 y=239〜661 で、木馬の耳・頭頂が外。
- 20/25/30/33/35/38% を実際にレンダリングして見比べ、**`right 32%`** を採用
  （木馬が耳まで丸ごと入り、下のサイコロ・コイン・カードも残る。35%以上は耳が切れる）。
- スマホ幅（390px）は横方向のトリミングになるので見え方はほぼ変わらない（前後スクショで確認）。

### 検証
- `npm run build` 緑（13ページ）。`node --test tests/*.test.mjs` → **122/122 pass・0 fail**。
- `dist` を `vite preview` で配信して Playwright 通し: 390px/1440px とも **タイル画像 13/13 読込・4xx/リクエスト失敗 0**、
  チェスのルールヒーローの `background-position` が `50% 20%` になっていることを確認。
- **dist が 2.94MB → 3.53MB に増えた**。原因は、タイルの `<img>` を Vite が静的解析して
  `dist/assets/hero-<hash>.jpg` にハッシュ付きで出す一方、`copy-game-assets` プラグインが
  `dist/games/<slug>/assets/hero.jpg` にも同じ絵を置くため（12枚ぶん約554KB の重複）。
  ルールモーダル側（`rules.js`）は後者の生パスを使うので、タイルとルールで同じ絵を2回落とす。
  配信量としては許容範囲と判断してそのままにした（直すなら rules.js 側もビルド解決させる必要があり、範囲外）。
