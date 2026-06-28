// あそびば — 各ゲームのルール（アイコン中心のビジュアル説明）
// ハブのルール閲覧と、各ゲーム内の「遊び方」で共有できる単一ソース。
export const RULES = {
  "uma-race": {
    title: "うまうまレース", emblem: "🏇", accent: "#2f8d48",
    hero: "./games/uma-race/assets/title-hero.jpg",
    lead: "出目で馬を進め、配当を予想。3レース勝負の競馬ゲーム。",
    steps: [
      { icon: "🎟️", title: "馬を予想（BET）", text: "勝つと思う馬カードにチップを置く（2→1→1枚）。人気が薄い馬ほど当たれば高配当。" },
      { icon: "🎲", title: "サイコロで進む", text: "出目は 🐎×3 / 🧢ジョッキー / 🥕人参 / ☀️天候。出た記号の能力ぶん、その馬が前進する。" },
      { icon: "🏁", title: "ゴール＆配当", text: "コースを1周してゴール。予想が当たれば配当ゲット。3レース後に所持金が一番多い人の勝ち。" },
    ],
    tips: ["18マスを先頭通過した馬は「ペースホース」になり後半が有利。", "堅い本命を取るか、配当妙味の穴馬を狙うか。"],
  },
  "dice-climb": {
    title: "霧稜のクライム", emblem: "🏔️", accent: "#2e5a86",
    lead: "4つのダイスを組み分けて山を登る、攻めと確保の押し引き。",
    steps: [
      { icon: "🎲", title: "4ダイスを2組に", text: "振った4個を2ペアに分け、その合計（2〜12）の山を選んで1歩登る。" },
      { icon: "🧗", title: "攻める or 確保", text: "続けて振れば伸びるが、進める山が出ないと滑落＝そのターンの仮進捗は消滅。「確保」で進捗を固定。" },
      { icon: "🏁", title: "3つ制覇で勝ち", text: "同時に登れるのは3本まで。先に山を3つ登り切った方が勝ち。" },
    ],
    tips: ["7など出やすい合計の山ほど道は長い。", "欲張ると滑落。引き際が肝心。"],
  },
  "treasure": {
    title: "呪宝の蔵", emblem: "🪙", accent: "#b88a2e",
    lead: "呪われた財宝を押しつけ合う、チップの心理戦。",
    steps: [
      { icon: "💀", title: "財宝はマイナス点", text: "めくれた財宝カードは数字ぶんの減点。チップは1枚＝プラス1点。" },
      { icon: "🪙", title: "パス or 引き取る", text: "チップ1枚を置いてパスするか、財宝＋たまったチップをまとめて引き取る。" },
      { icon: "🔢", title: "連番はお得", text: "手元の連続する番号は一番小さい数だけが減点。最終スコアが高い方の勝ち。" },
    ],
    tips: ["チップが尽きると引き取るしかない。", "連番を狙って損を圧縮しよう。"],
  },
  "back10": {
    title: "BACK10", emblem: "🌊", accent: "#2bb6ac",
    lead: "数字の流れをみんなで捌く協力カードゲーム。",
    steps: [
      { icon: "🔢", title: "4つの流れ", text: "上り2列・下り2列の場に、手札の数字を置いていく。上りは大きく、下りは小さく。" },
      { icon: "⤵️", title: "BACK10", text: "上りはちょうど−10、下りはちょうど+10の数字を“逆向き”に置ける妙手。流れを引き戻せる。" },
      { icon: "🎯", title: "6000点でクリア", text: "1ターンに連続で出すほど高得点。みんなで山札を捌き切ろう。" },
    ],
    tips: ["山札がある間は最低2枚。無理は禁物。", "BACK10とコンボで一気に加点。"],
  },
  "spy": {
    title: "密書カードバトル", emblem: "✉️", accent: "#c9a14a",
    lead: "ウソと読み合いの諜報戦。送り、申告し、見抜く。",
    steps: [
      { icon: "✉️", title: "密書を申告", text: "送り手は密書（真の値1〜6）を見て相手に申告する。ウソをついてもよい。" },
      { icon: "🕵️", title: "通す or 押収", text: "受け手が通せば送り手に真の値が入る。押収すれば自分に入る（工作員🕵️を1人消費）。嘘なら暴いて相手−2。" },
      { icon: "🏆", title: "諜報で勝負", text: "工作員は各6人だけ。山札を撃ち合い、諜報ポイントの多い方が勝ち。" },
    ],
    tips: ["大物は低く申告して通したい。でも嘘がバレると−2。", "弱い密書を高く申告して、相手の工作員を空振りさせる手も。"],
  },
};

// 共有レンダラ：与えた要素に RULES[slug] をビジュアル表示する。
export function renderRulesInto(el, slug) {
  const r = RULES[slug];
  if (!el || !r) return;
  const hero = r.hero
    ? `<div class="ruleHero" style="background-image:linear-gradient(180deg,transparent,rgba(0,0,0,.55)),url('${r.hero}')">
         <span class="ruleHeroTitle">${r.emblem} ${r.title}</span></div>`
    : `<div class="ruleHero ruleHeroFlat" style="background:linear-gradient(135deg,${r.accent},#0e0c14)">
         <span class="ruleHeroEmblem">${r.emblem}</span><span class="ruleHeroTitle">${r.title}</span></div>`;
  const steps = r.steps.map((s, i) => `
    <div class="ruleStep">
      <div class="ruleStepNo" style="background:${r.accent}">${i + 1}</div>
      <div class="ruleStepIcon">${s.icon}</div>
      <div class="ruleStepBody"><b>${s.title}</b><span>${s.text}</span></div>
    </div>`).join("");
  const tips = (r.tips || []).length
    ? `<div class="ruleTips"><b>💡 コツ</b>${r.tips.map(t => `<div>・${t}</div>`).join("")}</div>` : "";
  el.innerHTML = `${hero}<p class="ruleLead">${r.lead}</p><div class="ruleSteps">${steps}</div>${tips}`;
}

// 共有CSS（ハブ・各ゲームで使い回す）。<style> 文字列を返す。
export const RULES_CSS = `
.ruleHero{height:120px;border-radius:16px;background-size:cover;background-position:center;
  display:flex;align-items:flex-end;padding:12px 14px;margin-bottom:12px;box-shadow:inset 0 -1px 0 rgba(255,255,255,.1)}
.ruleHeroFlat{align-items:center;gap:10px}
.ruleHeroEmblem{font-size:40px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4))}
.ruleHeroTitle{font-size:24px;font-weight:900;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.ruleLead{margin:0 0 14px;font-size:14px;line-height:1.6;font-weight:700;opacity:.92}
.ruleSteps{display:grid;gap:10px}
.ruleStep{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:11px;
  border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 12px;background:rgba(255,255,255,.04)}
.ruleStepNo{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:900;font-size:13px}
.ruleStepIcon{font-size:30px;width:38px;text-align:center}
.ruleStepBody{display:flex;flex-direction:column;gap:2px;min-width:0}
.ruleStepBody b{font-size:15px;font-weight:900}
.ruleStepBody span{font-size:12.5px;line-height:1.55;opacity:.86}
.ruleTips{margin-top:12px;border-radius:14px;padding:11px 13px;background:rgba(231,198,107,.1);border:1px solid rgba(231,198,107,.28)}
.ruleTips b{display:block;margin-bottom:5px;font-size:13px}
.ruleTips div{font-size:12.5px;line-height:1.6;opacity:.9}
`;
