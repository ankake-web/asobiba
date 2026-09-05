// あそびば — 各ゲームのルール（アイコン中心のビジュアル説明）
// ハブのルール閲覧と、各ゲーム内の「遊び方」で共有できる単一ソース。
// アイコンは共通SVGスプライト（icons.svg）のIDを参照する。絵文字は使わない。
export const RULES = {
  "uma-race": {
    title: "うまうまレース", icon: "ic-flag", accent: "#3fae63",
    hero: "./games/uma-race/assets/title-hero.jpg",
    lead: "出目で馬を進め、配当を予想。3レース勝負の競馬ゲーム。",
    steps: [
      { icon: "ic-coin", title: "馬を予想（BET）", text: "勝つと思う馬カードにチップを置く（2→1→1枚）。人気が薄い馬ほど当たれば高配当。" },
      { icon: "ic-dice", title: "サイコロで進む", text: "出目は「馬（×3種）・ジョッキー・人参・天候」の6面。出た記号の能力ぶん、その馬が前進する。" },
      { icon: "ic-flag", title: "ゴール＆配当", text: "コースを1周してゴール。予想が当たれば配当ゲット。3レース後に所持金が一番多い人の勝ち。" },
    ],
    tips: ["18マスを先頭通過した馬は「ペースホース」になり後半が有利。", "堅い本命を取るか、配当妙味の穴馬を狙うか。"],
  },
  "dice-climb": {
    title: "霧稜のクライム", icon: "ic-mountain", accent: "#5b8ec9",
    hero: "./games/dice-climb/assets/hero.jpg",
    lead: "4つのダイスを組み分けて山を登る、攻めと確保の押し引き。",
    steps: [
      { icon: "ic-dice", title: "4ダイスを2組に", text: "振った4個を2ペアに分け、その合計（2〜12）の山を選んで1歩登る。" },
      { icon: "ic-mountain", title: "攻める or 確保", text: "続けて振れば伸びるが、進める山が出ないと滑落＝そのターンの仮進捗は消滅。「確保」で進捗を固定。" },
      { icon: "ic-trophy", title: "3つ制覇で勝ち", text: "同時に登れるのは3本まで。先に山を3つ登り切った方が勝ち。" },
    ],
    tips: ["7など出やすい合計の山ほど道は長い。", "欲張ると滑落。引き際が肝心。"],
  },
  "treasure": {
    title: "呪宝の蔵", icon: "ic-coin", accent: "#d8a63f",
    hero: "./games/treasure/assets/hero.jpg",
    lead: "呪われた財宝を押しつけ合う、チップの心理戦。",
    steps: [
      { icon: "ic-skull", title: "財宝はマイナス点", text: "めくれた財宝カードは数字ぶんの減点。チップは1枚＝プラス1点。" },
      { icon: "ic-chip", title: "パス or 引き取る", text: "チップ1枚を置いてパスするか、財宝＋たまったチップをまとめて引き取る。" },
      { icon: "ic-check", title: "連番はお得", text: "手元の連続する番号は一番小さい数だけが減点。最終スコアが高い方の勝ち。" },
    ],
    tips: ["チップが尽きると引き取るしかない。", "連番を狙って損を圧縮しよう。"],
  },
  "back10": {
    title: "BACK10", icon: "ic-updown", accent: "#2bb6ac",
    hero: "./games/back10/assets/hero.jpg",
    lead: "数字の流れをみんなで捌く協力カードゲーム。",
    steps: [
      { icon: "ic-updown", title: "4つの流れ", text: "上り2列・下り2列の場に、手札の数字を置いていく。上りは大きく、下りは小さく。" },
      { icon: "ic-restart", title: "BACK10", text: "上りはちょうど−10、下りはちょうど+10の数字を“逆向き”に置ける妙手。流れを引き戻せる。" },
      { icon: "ic-trophy", title: "6000点でクリア", text: "1ターンに連続で出すほど高得点。みんなで山札を捌き切ろう。" },
    ],
    tips: ["山札がある間は最低2枚。無理は禁物。", "BACK10とコンボで一気に加点。"],
  },
  "spy": {
    title: "真贋の使者", icon: "ic-seal", accent: "#c9a14a",
    hero: "./games/spy/assets/hero.jpg",
    lead: "ウソと読み合いの諜報戦。送り、申告し、見抜く。",
    steps: [
      { icon: "ic-envelope", title: "密書を申告", text: "送り手は密書（真の値1〜6）を見て相手に申告する。ウソをついてもよい。" },
      { icon: "ic-eye", title: "通す or 押収", text: "受け手が通せば送り手に真の値が入る。押収すれば自分に入る（工作員を1人消費）。嘘なら暴いて相手−2。" },
      { icon: "ic-trophy", title: "諜報で勝負", text: "工作員は各6人だけ。山札を撃ち合い、諜報ポイントの多い方が勝ち。" },
    ],
    tips: ["大物は低く申告して通したい。でも嘘がバレると−2。", "弱い密書を高く申告して、相手の工作員を空振りさせる手も。"],
  },

  // ── 定番トランプ（2026-08-23 追加。docs/03-定番ゲーム追加-設計.md §3） ──
  "daifugo": {
    title: "大富豪", icon: "ic-crown", accent: "#d8a83e",
    hero: "./games/daifugo/assets/hero.jpg",
    lead: "場より強い札を出して、手札を早く出し切った人から大富豪。",
    steps: [
      { icon: "ic-cards", title: "強い札を重ねる", text: "場の札より強い札（3が最弱、2が最強、ジョーカーは万能）を同じ枚数で出す。出せない・出したくなければパス。全員がパスしたら場が流れ、最後に出した人から。" },
      { icon: "ic-updown", title: "革命・8切り・縛り", text: "同じ数字4枚で強さが逆転する「革命」、8を出すと場が流れる「8切り」、同じマークが続くとそのマーク限定になる「縛り」。階段・都落ち・ジョーカー2枚は設定でON/OFF。" },
      { icon: "ic-crown", title: "順位と称号", text: "上がった順に大富豪→富豪→貧民→大貧民。次のラウンドは称号に応じてカード交換あり。3ラウンドの合計で競う。" },
    ],
    tips: ["2やジョーカーを温存しすぎると出し切れない。流れを取りたい場面で使う。", "革命が起きると弱い札が最強に。3や4の価値が跳ね上がる。"],
  },
  "babanuki": {
    title: "ババ抜き", icon: "ic-cards", accent: "#e0707c",
    hero: "./games/babanuki/assets/hero.jpg",
    lead: "ペアを捨てて、隣から1枚引く。最後にジョーカーを持っていた人の負け。",
    steps: [
      { icon: "ic-cards", title: "ペアを捨てる", text: "配られた手札から同じ数字のペアをすべて捨てる。ジョーカーは1枚だけなので、絶対にペアにならない。" },
      { icon: "ic-eye", title: "隣から1枚引く", text: "順番に、隣の人の手札から裏向きの1枚を引く。ペアができたら捨てる。引かれる側は手札を並べ替えてかく乱できる。" },
      { icon: "ic-skull", title: "残った人が負け", text: "手札がなくなった人から抜けていき、最後までジョーカーを持っていた人の負け。" },
    ],
    tips: ["相手が引いた直後の反応で、ババの位置が読めるかも。", "ババを端に置くか真ん中に置くか、並べ替えで心理戦。"],
  },
  "memory": {
    title: "神経衰弱", icon: "ic-eye", accent: "#8f7bd9",
    hero: "./games/memory/assets/hero.jpg",
    lead: "裏向きの札を2枚めくって同じ数字ならゲット。記憶力で勝負。",
    steps: [
      { icon: "ic-cards", title: "2枚めくる", text: "裏向きに並んだ札から2枚選んで表にする。枚数は24・36・52枚から選べる。" },
      { icon: "ic-check", title: "そろえば取ってもう1回", text: "同じ数字ならその2枚をもらい、続けて自分の番。違えば裏に戻して次の人へ。" },
      { icon: "ic-trophy", title: "枚数で勝負", text: "札がなくなったら終了。取ったペアが多い人の勝ち。ひとりでも遊べる。" },
    ],
    tips: ["相手がめくって外した札の位置こそ覚えどころ。", "CPUは強さで「忘れる確率」が変わる。まずは弱いCPUから。"],
  },
  "blackjack": {
    title: "ブラックジャック", icon: "ic-coin", accent: "#1f7a4d",
    hero: "./games/blackjack/assets/hero.jpg",
    lead: "合計21を超えずにディーラーより大きく。チップを賭ける定番カジノゲーム。",
    steps: [
      { icon: "ic-coin", title: "ベットして2枚", text: "チップ（最初は1000）を賭けると、自分に2枚・ディーラーに2枚（1枚は伏せ）。絵札は10、Aは1か11として数える。" },
      { icon: "ic-cards", title: "ヒット or スタンド", text: "「ヒット」で1枚追加、「スタンド」で止める。21を超えたらバースト＝負け。賭け金を倍にする「ダブル」、同じ数字2枚を分ける「スプリット」も。" },
      { icon: "ic-trophy", title: "ディーラーと勝負", text: "ディーラーは17以上になるまで必ず引く。数が大きい方の勝ち（同点は引き分け）。最初の2枚で21なら「ブラックジャック」＝1.5倍。" },
    ],
    tips: ["ディーラーの見えている札が2〜6ならバーストしやすい。無理に引かない。", "所持チップはこの端末に保存される。"],
  },
  "poker": {
    title: "ポーカー", icon: "ic-chip", accent: "#b53a3a",
    hero: "./games/poker/assets/hero.jpg",
    lead: "5枚の手札を交換して役を作るドローポーカー。ベットで揺さぶれ。",
    steps: [
      { icon: "ic-cards", title: "配る → ベット", text: "アンティ（参加料）を出して5枚配られる。手札を見て「ベット／コール／レイズ／フォールド」。" },
      { icon: "ic-restart", title: "交換", text: "要らない札を最大3枚（Aを持っていれば4枚）捨てて引き直す。そのあともう一度ベット。" },
      { icon: "ic-trophy", title: "ショーダウン", text: "残った人で役を比べ、いちばん強い人が場のチップを総取り。役は弱い順に ワンペア＜ツーペア＜スリーカード＜ストレート＜フラッシュ＜フルハウス＜フォーカード＜ストレートフラッシュ。" },
    ],
    tips: ["全員が降りれば役がなくても勝ち。強気のベットはブラフになる。", "交換した枚数は見られている。1枚交換はツーペア狙いに見えやすい。"],
  },

  // ── 定番ボードゲーム ──
  "reversi": {
    title: "リバーシ", icon: "ic-disc", accent: "#2f8f5b",
    hero: "./games/reversi/assets/hero.jpg",
    lead: "白黒の石で挟んで返す。最後に多い色が勝つ、2人対戦の定番。",
    steps: [
      { icon: "ic-disc", title: "挟んで返す", text: "相手の石をタテ・ヨコ・ナナメに自分の石で挟める場所にだけ置ける。挟んだ石はすべてひっくり返る。置ける場所はドットで表示。" },
      { icon: "ic-board", title: "角と辺が強い", text: "角に置いた石は二度と返らない。置ける場所がないときは自動でパス。" },
      { icon: "ic-trophy", title: "多い方の勝ち", text: "盤が埋まるか、両者とも置けなくなったら終局。石の数が多い方の勝ち。" },
    ],
    tips: ["序盤は石を少なめに、相手の置ける場所を減らすのが定石。", "角の隣（X打ち・C打ち）は角を献上しやすいので注意。"],
  },
  "shogi": {
    title: "将棋", icon: "ic-board", accent: "#c99a5a",
    hero: "./games/shogi/assets/hero.jpg",
    lead: "取った駒は自分の戦力に。相手の王を詰ませたら勝ちの本将棋。",
    steps: [
      { icon: "ic-board", title: "駒を動かす・取る", text: "駒ごとに動ける方向が決まっている。相手の駒がいるマスへ動けばその駒を取れる。動けるマスはタップで表示。" },
      { icon: "ic-updown", title: "持ち駒と成り", text: "取った駒は「持ち駒」として空きマスに打てる。敵陣（奥3段）に入ると裏返して「成り」＝動きが強くなる。" },
      { icon: "ic-crown", title: "王を詰ませる", text: "相手の王がどこへ逃げても取られる「詰み」で勝ち。二歩・打ち歩詰めは反則。同じ局面が4回で引き分け（千日手）。" },
    ],
    tips: ["飛車・角は大駒。序盤は歩で道を開けてから活躍させる。", "王の周りに金銀を固める「囲い」で、詰まされにくくなる。"],
  },
  "chess": {
    title: "チェス", icon: "ic-king", accent: "#8c7b6b",
    hero: "./games/chess/assets/hero.jpg",
    // 442×120 の帯だと可視帯が原画 y=233〜667 になり、キングの十字冠（y≒110〜232）が外に出て切れる。
    // heroPos を指定したカードだけ background-position を上書きする（無指定は従来どおり center）。
    heroPos: "center 20%",
    lead: "世界でいちばん遊ばれている盤上ゲーム。キングを追い詰めたら勝ち。",
    steps: [
      { icon: "ic-board", title: "6種類の駒", text: "キング・クイーン・ルーク・ビショップ・ナイト・ポーン。取った駒は戻ってこない（将棋との違い）。" },
      { icon: "ic-star", title: "特殊ルールも全部", text: "キングとルークを入れ替える「キャスリング」、ポーンの「アンパッサン」、最奥に届いたポーンが昇格する「プロモーション」。" },
      { icon: "ic-trophy", title: "チェックメイト", text: "キングが逃げられなくなったら勝ち。動けないのにチェックでない「ステイルメイト」、50手・3回同形は引き分け。" },
    ],
    tips: ["序盤は中央のマスを取り、ナイトとビショップを早めに展開。", "キャスリングでキングを早めに安全な場所へ。"],
  },
};

// 共有レンダラ：与えた要素に RULES[slug] をビジュアル表示する。
// 呼び出し側のページに icons.svg スプライト（<!-- @shared:icons -->）があること。
const ic = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

export function renderRulesInto(el, slug) {
  const r = RULES[slug];
  if (!el || !r) return;
  const hero = r.hero
    ? `<div class="ruleHero" style="background-image:linear-gradient(180deg,transparent,rgba(0,0,0,.55)),url('${r.hero}')${r.heroPos ? `;background-position:${r.heroPos}` : ""}">
         <span class="ruleHeroTitle">${r.title}</span></div>`
    : `<div class="ruleHero ruleHeroFlat" style="background:linear-gradient(135deg,${r.accent},#0e0c14)">
         ${ic(r.icon, "ic ruleHeroIc")}<span class="ruleHeroTitle">${r.title}</span></div>`;
  const steps = r.steps.map((s, i) => `
    <div class="ruleStep">
      <div class="ruleStepNo" style="background:${r.accent}">${i + 1}</div>
      <div class="ruleStepIcon" style="color:${r.accent}">${ic(s.icon, "ic ruleStepIc")}</div>
      <div class="ruleStepBody"><b>${s.title}</b><span>${s.text}</span></div>
    </div>`).join("");
  const tips = (r.tips || []).length
    ? `<div class="ruleTips"><b>${ic("ic-info")} コツ</b>${r.tips.map(t => `<div>・${t}</div>`).join("")}</div>` : "";
  el.innerHTML = `${hero}<p class="ruleLead">${r.lead}</p><div class="ruleSteps">${steps}</div>${tips}`;
}

// 共有CSS（ハブ・各ゲームで使い回す）。<style> 文字列を返す。
export const RULES_CSS = `
.ruleHero{height:120px;border-radius:16px;background-size:cover;background-position:center;
  display:flex;align-items:flex-end;padding:12px 14px;margin-bottom:12px;box-shadow:inset 0 -1px 0 rgba(255,255,255,.1)}
.ruleHeroFlat{align-items:center;gap:12px}
.ruleHeroIc{width:38px;height:38px;color:#fff;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4))}
.ruleHeroTitle{font-size:24px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ruleLead{margin:0 0 14px;font-size:14px;line-height:1.6;font-weight:700;opacity:.92}
.ruleSteps{display:grid;gap:10px}
.ruleStep{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:11px;
  border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,.04)}
.ruleStepNo{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:900;font-size:13px}
.ruleStepIcon{width:38px;display:grid;place-items:center}
.ruleStepIc{width:27px;height:27px}
.ruleStepBody{display:flex;flex-direction:column;gap:2px;min-width:0}
.ruleStepBody b{font-size:15px;font-weight:900}
.ruleStepBody span{font-size:12.5px;line-height:1.55;opacity:.86}
.ruleTips{margin-top:12px;border-radius:14px;padding:11px 13px;background:rgba(231,198,107,.1);border:1px solid rgba(231,198,107,.28)}
.ruleTips b{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:13px}
.ruleTips div{font-size:12.5px;line-height:1.6;opacity:.9}
`;
