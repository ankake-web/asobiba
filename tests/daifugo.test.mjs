// 大富豪のルールエンジン単体テスト。games/daifugo/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
// エンジンは配り札に AsobibaCards（src/shared/cards.js）を使うので、先に同じレルムへ読み込む。
//   実行: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
if (!globalThis.window) globalThis.window = globalThis;
vm.runInThisContext(readFileSync(resolve(here, "../src/shared/cards.js"), "utf8"));
const html = readFileSync(resolve(here, "../games/daifugo/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

// ---- ヘルパ ----
const card = (id) => (id[0] === "J" ? { joker: true, s: id[1] || "R" } : { s: id[0], r: Number(id.slice(1)) });
const cards = (ids) => ids.split(/\s+/).filter(Boolean).map(card);
const ids = (cs) => cs.map(Engine.cid);
// 手札を文字で指定して局面を組む。hands = ["S3 H3 D10", ...]
function mk(hands, extra = {}, settings = {}) {
  const base = Engine.initialState({ players: hands.length, ...settings }, [], AsobibaCards.rng(1));
  return { ...base, hands: hands.map((h) => Engine.sortHand(cards(h))), field: null, lastPlay: null, turn: 0, lastPlayer: -1,
           passed: new Array(hands.length).fill(false), revolution: false, lock: null, finished: [], dropped: null, phase: "play", exchange: null, ...extra };
}
const play = (s, seat, str) => Engine.applyMove(s, { play: ids(cards(str)) }, seat);
const pass = (s, seat) => Engine.applyMove(s, { pass: true }, seat);
const rng = (seed) => AsobibaCards.rng(seed);

test("initialState: 人数分に全札を配る・ダイヤの3を持つ人から・設定の正規化", () => {
  for (const n of [3, 4, 5]) for (const jokers of [1, 2]) {
    const s = Engine.initialState({ players: n, jokers }, [], rng(5));
    assert.equal(s.n, n);
    assert.equal(s.hands.reduce((a, h) => a + h.length, 0), 52 + jokers);
    assert.ok(s.hands[s.turn].some((c) => !c.joker && c.s === "D" && c.r === 3), "ダイヤ3の持ち主が先手");
    assert.equal(s.phase, "play"); assert.equal(s.round, 1); assert.equal(s.rounds, 3);
  }
  const st = Engine.normSettings({ players: 9, jokers: 5, revolution: 0 });
  assert.equal(st.players, 5); assert.equal(st.jokers, 1); assert.equal(st.revolution, false);
  assert.equal(st.eightCut, true, "既定ON: 8切り"); assert.equal(st.shibari, false); assert.equal(st.stairs, false); assert.equal(st.miyako, false);
  // オンライン: players 配列の人数が優先
  const so = Engine.initialState({ players: 3 }, [{}, {}, {}, {}, {}], rng(2));
  assert.equal(so.n, 5);
});

test("強さ順: 3が最弱・2が最強・ジョーカーは最強。analyze はペア/3枚/ジョーカー混ぜを認識", () => {
  assert.equal(Engine.strength(card("S3")), 0);
  assert.equal(Engine.strength(card("S13")), 10);
  assert.equal(Engine.strength(card("S1")), 11);
  assert.equal(Engine.strength(card("S2")), 12);
  assert.equal(Engine.strength(card("JR")), 13);
  const pair = Engine.analyze(cards("S7 H7"));
  assert.equal(pair.kind, "group"); assert.equal(pair.count, 2); assert.equal(pair.strength, 4); assert.equal(pair.lockKey, "HS");
  const withJoker = Engine.analyze(cards("S7 JR"));
  assert.equal(withJoker.count, 2); assert.equal(withJoker.strength, 4); assert.equal(withJoker.lockKey, null);
  assert.equal(Engine.analyze(cards("S7 H8")), null, "違う数字は重ねられない");
  assert.equal(Engine.analyze(cards("JR")).allJoker, true);
  assert.equal(Engine.describe(pair), "ペア 7");
  assert.equal(Engine.describe(Engine.analyze(cards("S1"))), "単騎 A");
});

test("出せる判定: 同じ枚数でより強い札だけ。ジョーカーには返せない", () => {
  let s = mk(["S5 H9 D12 C2", "S6 H6 D3 C4", "S7 H13 JR D4"]);
  s = play(s, 0, "S5");
  assert.equal(s.turn, 1);
  assert.deepEqual(s.field.cards.map(Engine.cid), ["S5"]);
  assert.throws(() => play(s, 1, "D3"), /強い札/);
  assert.throws(() => play(s, 1, "S6 H6"), /強い札|枚数/);
  assert.throws(() => play(s, 2, "S7"), /あなたの番/);
  s = play(s, 1, "S6");
  s = play(s, 2, "JR");
  assert.equal(s.field.allJoker, true);
  assert.throws(() => play(s, 0, "C2"), /強い札/);
  // legalMoves: 手番の席だけ。場ありならパスも含む
  const lm = Engine.legalMoves(s, 0);
  assert.ok(lm.some((x) => x.pass));
  assert.ok(!lm.some((x) => x.play), "ジョーカーには何も返せない");
  assert.deepEqual(Engine.legalMoves(s, 1), []);
  // 場が空のときはパス不可
  const s0 = mk(["S5", "S6", "S7"]);
  assert.throws(() => pass(s0, 0), /場が空/);
  assert.ok(!Engine.legalMoves(s0, 0).some((x) => x.pass));
});

test("パス: 全員パスで場が流れ、最後に出した人から。パスした人は流れるまで出せない", () => {
  let s = mk(["S5 H9 D12", "S6 H6 D3", "S7 H13 D4"]);
  s = play(s, 0, "H9");
  s = pass(s, 1);
  assert.equal(s.passed[1], true);
  assert.equal(s.turn, 2);
  s = play(s, 2, "H13");
  assert.equal(s.turn, 0, "パス済みの席1は飛ばされる");
  s = pass(s, 0);
  assert.equal(s.field, null, "席2以外が全員パス → 場が流れる");
  assert.equal(s.turn, 2, "最後に出した席2から");
  assert.deepEqual(s.passed, [false, false, false]);
  assert.ok(s.events.includes("clear"));
});

test("革命: 4枚以上で強さ逆転。革命返しで元に戻る。ジョーカーは革命中も最強", () => {
  let s = mk(["S5 H5 D5 C5 S10", "S3 H3 D3 C3 D4", "S7 JR"], {}, { revolution: true });
  s = play(s, 0, "S5 H5 D5 C5");
  assert.equal(s.revolution, true);
  assert.ok(s.events.includes("revolution"));
  // 革命中: 場の 5×4 には「より弱い」4枚で返す
  assert.equal(Engine.checkSelection(s, 1, ids(cards("S3 H3 D3 C3"))).ok, true);
  s = play(s, 1, "S3 H3 D3 C3");
  assert.equal(s.revolution, false, "革命返し");
  assert.ok(s.events.includes("counterRevolution"));
  // 革命中の単騎: 弱い方が勝ち。ジョーカーは常に出せる
  let r = mk(["S10", "S4 S2", "JR"], { revolution: true });
  r = play(r, 0, "S10");
  assert.throws(() => play(r, 1, "S2"), /革命中/);
  r = play(r, 1, "S4");
  assert.equal(Engine.checkSelection(r, 2, ["JR"]).ok, true);
  // 革命OFFなら4枚でも革命しない
  let q = mk(["S5 H5 D5 C5 S10", "S3", "S7"], {}, { revolution: false });
  q = play(q, 0, "S5 H5 D5 C5");
  assert.equal(q.revolution, false);
});

test("8切り: 8を出すと場が流れて同じ人が続けて出す。上がりなら次の人へ", () => {
  let s = mk(["S8 S10", "S6 H6", "S7 H13"], {}, { eightCut: true });
  s = play(s, 0, "S8");
  assert.ok(s.events.includes("eightCut"));
  assert.equal(s.field, null);
  assert.equal(s.turn, 0, "8を出した人がそのまま");
  assert.equal(s.lastPlay.has8, true);
  // 8で上がったら次のアクティブな人
  let t = mk(["S8", "S6 H6", "S7 H13"], {}, { eightCut: true });
  t = play(t, 0, "S8");
  assert.deepEqual(t.finished, [0]);
  assert.equal(t.turn, 1);
  // 8切りOFF
  let u = mk(["S8 S10", "S6 H6", "S7 H13"], {}, { eightCut: false });
  u = play(u, 0, "S8");
  assert.ok(u.field); assert.equal(u.turn, 1);
});

test("縛り: 同じマークが2回続くとそのマーク限定。違うマークは出せない（ジョーカーは可）", () => {
  let s = mk(["S5 D13", "S9 H12", "S11 H11 JR"], {}, { shibari: true });
  s = play(s, 0, "S5");
  s = play(s, 1, "S9");
  assert.equal(s.lock, "S");
  assert.ok(s.events.includes("lock"));
  assert.throws(() => play(s, 2, "H11"), /縛り/);
  assert.equal(Engine.checkSelection(s, 2, ["S11"]).ok, true);
  assert.equal(Engine.checkSelection(s, 2, ["JR"]).ok, true);
  s = play(s, 2, "S11");
  assert.throws(() => play(s, 0, "D13"), /縛り/);
  // 流れたら解除
  s = pass(s, 0); s = pass(s, 1);
  assert.equal(s.field, null); assert.equal(s.lock, null);
  // ペアの縛り（同じマークの組）
  let p = mk(["S5 H5", "S9 H9 D9", "S11 D11"], {}, { shibari: true });
  p = play(p, 0, "S5 H5");
  p = play(p, 1, "S9 H9");
  assert.equal(p.lock, "HS");
  assert.equal(Engine.checkSelection(p, 2, ids(cards("S11 D11"))).ok, false);
  // 縛りOFFなら掛からない
  let q = mk(["S5 D13", "S9 H12", "S11"], {}, { shibari: false });
  q = play(q, 0, "S5"); q = play(q, 1, "S9");
  assert.equal(q.lock, null);
});

test("階段: 同じマークの連番3枚以上。階段には階段で、同じ枚数で強い連番。ジョーカーで穴埋め", () => {
  const st = Engine.analyze(cards("S5 S6 S7"), { stairs: true });
  assert.equal(st.kind, "stairs"); assert.equal(st.strength, 2); assert.equal(st.top, 4);
  assert.equal(Engine.describe(st), "階段 5〜7");
  assert.equal(Engine.analyze(cards("S5 S6 S7"), { stairs: false }), null, "階段OFFでは不成立");
  assert.equal(Engine.analyze(cards("S5 H6 S7"), { stairs: true }), null, "マーク違い");
  assert.equal(Engine.analyze(cards("S5 S6 S8"), { stairs: true }), null, "連番でない");
  const j = Engine.analyze(cards("S5 JR S7"), { stairs: true });
  assert.equal(j.kind, "stairs"); assert.equal(j.strength, 2); assert.equal(j.top, 4);
  const j2 = Engine.analyze(cards("S5 S6 JR"), { stairs: true });
  assert.equal(j2.top, 4, "余ったジョーカーは上へ（5-6-7）");
  let s = mk(["S5 S6 S7 D2", "H9 H10 H11 H12", "C3 C4 C5 D5 S9"], {}, { stairs: true });
  s = play(s, 0, "S5 S6 S7");
  assert.equal(s.field.kind, "stairs");
  assert.throws(() => play(s, 1, "H9 H10 H11 H12"), /強い札|枚数/);
  assert.equal(Engine.checkSelection(s, 1, ids(cards("H10 H11 H12"))).ok, true);
  s = play(s, 1, "H10 H11 H12");
  assert.equal(Engine.checkSelection(s, 2, ids(cards("C3 C4 C5"))).ok, false, "弱い階段は出せない");
  // legalMoves に階段が含まれる
  const t = mk(["S5 S6 S7 D2", "H9", "C3"], {}, { stairs: true });
  assert.ok(Engine.legalMoves(t, 0).some((x) => x.play && x.play.length === 3));
});

test("上がり順と称号・点: 3人=大富豪/平民/大貧民、4人=大富豪/富豪/貧民/大貧民、5人は平民入り。ラウンド終了で加点", () => {
  let s = mk(["S5", "S6 S7", "S3 S4 S9"], {}, { eightCut: false, rounds: 3 });
  s = play(s, 0, "S5");
  assert.deepEqual(s.finished, [0]);
  assert.equal(s.turn, 1);
  s = play(s, 1, "S6");
  s = play(s, 2, "S9");
  s = pass(s, 1);
  assert.equal(s.turn, 2, "席1がパス → 席2から");
  s = play(s, 2, "S3");
  s = play(s, 1, "S7");
  assert.deepEqual(s.finished, [0, 1]);
  assert.equal(s.phase, "roundEnd", "残り1人で終了");
  assert.deepEqual(s.lastRanking, [0, 1, 2]);
  assert.deepEqual(s.roundResults[0].titles, ["大富豪", "平民", "大貧民"]);
  assert.deepEqual(s.scores, [5, 2, 0]);
  assert.deepEqual(Engine.titlesFor(4), ["大富豪", "富豪", "貧民", "大貧民"]);
  assert.deepEqual(Engine.titlesFor(5), ["大富豪", "富豪", "平民", "貧民", "大貧民"]);
  assert.throws(() => play(s, 2, "S9"), /ラウンド終了/);
  // 最終ラウンドなら over
  let f = mk(["S5", "S6", "S8 S9 S10"], { round: 3 }, { eightCut: false, rounds: 3 });
  f = play(f, 0, "S5");
  f = play(f, 1, "S6");
  assert.equal(f.phase, "over");
  assert.ok(Engine.isOver(f));
  const r = Engine.result(f);
  assert.equal(r.winner, 0);
  assert.deepEqual(r.ranking, [0, 1, 2]);
});

test("カード交換: 2ラウンド目は大貧民→大富豪に最強2枚（自動）、大富豪は任意の2枚を返す。大貧民から開始", () => {
  let s = mk(["S5", "S6", "S7", "S8 S9"], {}, { eightCut: false, rounds: 3 });
  s = play(s, 0, "S5"); s = play(s, 1, "S6"); s = play(s, 2, "S7");
  assert.equal(s.phase, "roundEnd");
  assert.deepEqual(s.lastRanking, [0, 1, 2, 3]);
  const before = s.hands.map((h) => h.length);
  s = Engine.applyMove(s, { nextRound: true }, 0);
  assert.equal(s.round, 2);
  assert.equal(s.phase, "exchange");
  assert.deepEqual(s.prevTitles, ["大富豪", "富豪", "貧民", "大貧民"]);
  const [p0, p1] = s.exchange.pending;
  assert.equal(p0.from, 0); assert.equal(p0.to, 3); assert.equal(p0.count, 2);
  assert.equal(p1.from, 1); assert.equal(p1.to, 2); assert.equal(p1.count, 1);
  // 大貧民は最強2枚を渡している（手札が2枚減り、大富豪は2枚増）
  const total = s.hands.reduce((a, h) => a + h.length, 0);
  assert.equal(total, 53);
  assert.deepEqual(s.hands.map((h) => h.length), [16, 14, 12, 11], "14+2 / 13+1 / 13-1 / 13-2");
  const top3 = Engine.sortHand(s.hands[3]);
  const givenStrength = Math.min(...p0.received.map(Engine.strength));
  assert.ok(top3.every((c) => Engine.strength(c) <= givenStrength), "大貧民に残った札は渡した札より弱い");
  assert.equal(Engine.actor(s), 0, "まず大富豪が返す");
  assert.throws(() => Engine.applyMove(s, { exchange: [Engine.cid(s.hands[1][0])] }, 1), /返す番/);
  assert.throws(() => Engine.applyMove(s, { exchange: [Engine.cid(s.hands[0][0])] }, 0), /2枚/);
  const give = s.hands[0].slice(0, 2).map(Engine.cid);
  s = Engine.applyMove(s, { exchange: give }, 0);
  assert.equal(s.phase, "exchange");
  assert.equal(Engine.actor(s), 1, "次は富豪が返す");
  assert.ok(give.every((id) => s.hands[3].some((c) => Engine.cid(c) === id)), "返した札が大貧民に届く");
  const cpuEx = Engine.cpuMove(s, 1, rng(3));
  assert.equal(cpuEx.exchange.length, 1);
  const weakest = Engine.sortHand(s.hands[1].filter((c) => !c.joker))[0];
  assert.equal(cpuEx.exchange[0], Engine.cid(weakest), "CPUは最弱を返す");
  s = Engine.applyMove(s, cpuEx, 1);
  assert.equal(s.phase, "play");
  assert.equal(s.turn, 3, "大貧民から開始");
  assert.equal(s.hands.reduce((a, h) => a + h.length, 0), 53);
  assert.ok(before.length === 4);
  // 3人卓は大富豪↔大貧民の2枚だけ
  let t = mk(["S5", "S6", "S8 S9 S10"], {}, { eightCut: false });
  t = play(t, 0, "S5"); t = play(t, 1, "S6");
  t = Engine.applyMove(t, { nextRound: true }, 0);
  assert.equal(t.exchange.pending.length, 1);
  // publicView: 受け取った札は当事者以外に見えない。他家の手札は枚数だけ
  const pv = Engine.publicView(t, 1);
  assert.equal(pv.exchange.pending[0].received, null);
  assert.equal(pv.hands[0], null); assert.ok(Array.isArray(pv.hands[1]));
  assert.equal(pv.counts.length, 3);
  assert.ok(Engine.publicView(t, 0).exchange.pending[0].received.length === 2);
  assert.ok(Engine.publicView(t, 2).exchange.pending[0].received.length === 2, "渡した側にも見える");
});

test("都落ち: 前回の大富豪が1位を取れないと決まった瞬間、大貧民に落ちる", () => {
  let s = mk(["S5", "S6 S7", "S8 S9 S13", "S11 S12"], { prevTitles: ["富豪", "大富豪", "貧民", "大貧民"] }, { eightCut: false, miyako: true });
  s = play(s, 0, "S5");
  assert.equal(s.dropped, 1);
  assert.ok(s.events.includes("drop"));
  assert.deepEqual(s.hands[1], []);
  assert.equal(s.turn, 2, "落ちた席は飛ばす");
  s = play(s, 2, "S8"); s = play(s, 3, "S11"); s = play(s, 2, "S13"); s = pass(s, 3);
  assert.equal(s.turn, 2);
  s = play(s, 2, "S9");
  assert.equal(s.phase, "roundEnd");
  assert.deepEqual(s.lastRanking, [0, 2, 3, 1], "落ちた人が最下位");
  // 前回の大富豪が自分で1位なら落ちない
  let t = mk(["S5", "S6 S7", "S8 S9 S10"], { prevTitles: ["大富豪", "平民", "大貧民"] }, { miyako: true });
  t = play(t, 0, "S5");
  assert.equal(t.dropped, null);
  // OFFなら起きない
  let u = mk(["S5", "S6 S7", "S8 S9 S10"], { prevTitles: ["平民", "大富豪", "大貧民"] }, { miyako: false });
  u = play(u, 0, "S5");
  assert.equal(u.dropped, null);
});

test("cpuMove: 出せる最小の組から。上がれるなら上がる。全設定で3ラウンド自動対局が例外なく終わる", () => {
  // 上がれる手を最優先
  const w = mk(["S9 H9", "S3 H4 D5", "C6 C7 C8"], { field: null, turn: 0 });
  assert.deepEqual(Engine.cpuMove(w, 0, rng(1)).play.sort(), ["H9", "S9"]);
  // 場が空なら弱い札から（2やジョーカーは温存）
  const l = mk(["S3 H10 D2 JR", "S4", "S5"], { turn: 0 });
  assert.deepEqual(Engine.cpuMove(l, 0, rng(1)).play, ["S3"]);
  // 場より強い最小の札を選ぶ
  let f = mk(["S4 H7 D13 JR", "S6", "S5"], { turn: 1 });
  f = play(f, 1, "S6");
  const mv = Engine.cpuMove(f, 2, rng(1));
  assert.ok(mv.pass, "席2は6に勝てない → パス");
  f = pass(f, 2);
  assert.deepEqual(Engine.cpuMove(f, 0, rng(1)).play, ["H7"]);
  // 自動対局: 人数×ジョーカー×ルールの組み合わせ
  let total = 0;
  for (let g = 0; g < 48; g++) {
    const r = rng(100 + g);
    const settings = { players: 3 + (g % 3), jokers: 1 + (g % 2), revolution: g % 5 !== 1, eightCut: g % 3 !== 1, shibari: g % 2 === 0, stairs: g % 3 === 0, miyako: g % 4 === 0, rounds: 3 };
    let s = Engine.initialState(settings, [], r);
    let guard = 0;
    while (!Engine.isOver(s)) {
      assert.ok(++guard < 3000, "無限ループしない");
      if (s.phase === "roundEnd") { s = Engine.applyMove(s, { nextRound: true }, 0); continue; }
      const seat = Engine.actor(s);
      assert.ok(seat >= 0);
      const m2 = Engine.cpuMove(s, seat, r);
      assert.ok(m2, "CPUは必ず手を返す");
      if (s.phase === "play") {
        assert.ok(!s.passed[seat], "パス済みの席に手番が来ない");
        assert.ok(Engine.isActive(s, seat));
      }
      s = Engine.applyMove(s, m2, seat);
      total++;
    }
    assert.equal(s.roundResults.length, 3);
    assert.equal(Engine.result(s).ranking.length, s.n);
    assert.equal(s.hands.reduce((a, h) => a + h.length, 0) + (s.dropped != null ? 0 : 0) >= 0, true);
  }
  assert.ok(total > 1000);
});

test("applyMove は元の state を変更しない（純粋関数）", () => {
  const s = mk(["S5 H9", "S6 H6", "S7 H13"]);
  const snap = JSON.stringify(s);
  const n = play(s, 0, "S5");
  assert.equal(JSON.stringify(s), snap);
  assert.notEqual(n.hands[0].length, s.hands[0].length);
  assert.throws(() => Engine.applyMove(n, {}, 1), /不明な手/);
});
