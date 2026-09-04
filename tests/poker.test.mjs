// ポーカー（5カードドロー）のルールエンジン単体テスト。games/poker/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/poker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/poker/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

// 手札を "AS KH 10D 3C 2S" の形で書く
const H = (str) => str.split(/\s+/).map((t) => {
  const s = t.slice(-1); const r0 = t.slice(0, -1);
  const r = r0 === "A" ? 1 : r0 === "K" ? 13 : r0 === "Q" ? 12 : r0 === "J" ? 11 : Number(r0);
  return { r, s };
});
const seeded = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; }; };
const players = (n) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, cpu: i > 0 }));
// 手札を差し替えた状態を作る（テスト用。deck は十分残す）
function withHands(state, hands) {
  const s = { ...state, seats: state.seats.map((p, i) => ({ ...p, hand: hands[i] ? H(hands[i]) : p.hand })) };
  return s;
}
const mv = (s, type, seat, extra = {}) => Engine.applyMove(s, { type, ...extra }, seat);

test("役判定: 全10種が正しいカテゴリ・名前になる", () => {
  const cases = [
    ["AS KS QS JS 10S", 9, "ロイヤルフラッシュ"],
    ["9H 8H 7H 6H 5H", 8, "ストレートフラッシュ"],
    ["7S 7H 7D 7C KD", 7, "フォーカード"],
    ["QS QH QC 9D 9S", 6, "フルハウス"],
    ["AD 10D 8D 5D 3D", 5, "フラッシュ"],
    ["9C 8D 7S 6H 5C", 4, "ストレート"],
    ["AS 2D 3C 4H 5S", 4, "ストレート"],
    ["JS JD JC 8H 3S", 3, "スリーカード"],
    ["AH AC 7S 7D 4H", 2, "ツーペア"],
    ["KH KC 9S 6D 2C", 1, "ワンペア"],
    ["AC JH 8S 5D 2H", 0, "ハイカード"],
  ];
  for (const [hand, cat, name] of cases) {
    const ev = Engine.evaluate(H(hand));
    assert.equal(ev.cat, cat, hand);
    assert.equal(ev.name, name, hand);
  }
  // ホイール（A-2-3-4-5）は 5ハイ、6ハイのストレートに負ける
  assert.ok(Engine.compare(Engine.evaluate(H("6C 5D 4S 3H 2C")), Engine.evaluate(H("AS 2D 3C 4H 5S"))) > 0);
  // A-K-Q-J-10 はストレート（Aハイ）。K-A-2-3-4 はストレートではない
  assert.equal(Engine.evaluate(H("AS KD QC JH 10S")).cat, 4);
  assert.equal(Engine.evaluate(H("KS AD 2C 3H 4S")).cat, 0);
  // desc
  assert.match(Engine.evaluate(H("KH KC 9S 6D 2C")).desc, /K/);
  assert.match(Engine.evaluate(H("QS QH QC 9D 9S")).desc, /Q.*9/);
});

test("役判定: 同役はキッカーで決着、完全同値は引き分け", () => {
  const cmp = (a, b) => Engine.compare(Engine.evaluate(H(a)), Engine.evaluate(H(b)));
  assert.ok(cmp("KH KC 9S 6D 2C", "KS KD 8S 6H 2D") > 0, "ワンペア同士はキッカー 9 > 8");
  assert.ok(cmp("AH AC 7S 7D 4H", "AS AD 7C 7H 3S") > 0, "ツーペアは3枚目で比較");
  assert.ok(cmp("AH AC 7S 7D 4H", "KS KD QC QH AS") > 0, "高いペアのツーペアが勝ち");
  assert.ok(cmp("AD 10D 8D 5D 3D", "AH 10H 8H 5H 2H") > 0, "フラッシュは5枚目まで比較");
  assert.ok(cmp("QS QH QC 9D 9S", "JS JH JC AD AS") > 0, "フルハウスは3枚組で比較");
  assert.ok(cmp("10C 9D 8S 7H 6C", "9C 8D 7S 6H 5C") > 0, "ストレートは上が高い方");
  assert.equal(cmp("KH KC 9S 6D 2C", "KS KD 9D 6H 2S"), 0, "同値はチョップ");
  assert.ok(cmp("2S 2H 3D 4C 5H", "AC KH QS JD 9H") > 0, "最弱ペアでもハイカードに勝つ");
});

test("initialState: 2〜5人・アンティ徴収・5枚配り・ディーラー左から・山札に重複なし", () => {
  for (const n of [2, 3, 5]) {
    const s = Engine.initialState({ seed: 7 }, players(n));
    assert.equal(s.n, n);
    assert.equal(s.handNo, 1);
    assert.equal(s.phase, "bet1");
    assert.equal(s.over, false);
    assert.equal(s.pot, n * 10);
    assert.equal(s.dealer, 0);
    assert.equal(s.turn, 1 % n, "ディーラーの左から");
    s.seats.forEach((p) => { assert.equal(p.chips, 990); assert.equal(p.hand.length, 5); assert.equal(p.out, false); });
    const all = s.seats.flatMap((p) => p.hand).concat(s.deck);
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map((c) => c.r + c.s)).size, 52, "重複なし");
  }
  // 同じ seed → 同じ配り（オンラインで全員同じ山札）
  const a = Engine.initialState({ seed: 123 }, players(3)), b = Engine.initialState({ seed: 123 }, players(3));
  assert.deepEqual(a.seats.map((p) => p.hand), b.seats.map((p) => p.hand));
  // chips 指定・1000未満でも開始。10未満の人は見学（out）
  const c = Engine.initialState({ seed: 1, chips: [5, 1000, 1000] }, players(3));
  assert.equal(c.seats[0].out, true);
  assert.equal(c.seats[0].hand.length, 0);
  assert.equal(c.pot, 20);
  assert.equal(c.dealer, 1, "見学者はディーラーにならない");
  // 2人とも足りない → idle
  const d = Engine.initialState({ seed: 1, chips: [5, 5] }, players(2));
  assert.equal(d.phase, "idle"); assert.equal(d.over, true); assert.equal(d.handNo, 0);
});

test("ベット進行: チェック→チェックで交換へ、ベット→コール/レイズ、レイズ上限3回、手番違いは例外", () => {
  let s = Engine.initialState({ seed: 3 }, players(3));
  assert.throws(() => mv(s, "check", 0), /番ではありません/);
  assert.deepEqual(Engine.legalMoves(s, 1).map((x) => x.type), ["check", "bet", "fold"]);
  assert.throws(() => mv(s, "call", 1), /コールするベット/);
  assert.throws(() => mv(s, "raise", 1, { amount: 10 }), /ベットがない/);
  s = mv(s, "check", 1); assert.equal(s.turn, 2);
  s = mv(s, "bet", 2, { amount: 20 });
  assert.equal(s.curBet, 20); assert.equal(s.pot, 50); assert.equal(s.seats[2].chips, 970); assert.equal(s.turn, 0);
  assert.throws(() => mv(s, "check", 0), /チェックできません/);
  assert.throws(() => mv(s, "bet", 0, { amount: 10 }), /すでにベット/);
  assert.deepEqual(Engine.legalMoves(s, 0).map((x) => x.type), ["call", "raise", "fold"]);
  s = mv(s, "raise", 0, { amount: 30 });         // 計 50 出して curBet=50
  assert.equal(s.curBet, 50); assert.equal(s.seats[0].bet, 50); assert.equal(s.raises, 1); assert.equal(s.pot, 100);
  assert.equal(s.turn, 1, "チェックした人にも番が戻る");
  s = mv(s, "raise", 1, { amount: 10 });         // raises=2
  s = mv(s, "raise", 2, { amount: 10 });         // raises=3 上限
  assert.equal(s.raises, 3);
  assert.throws(() => mv(s, "raise", 0, { amount: 10 }), /上限/);
  assert.ok(!Engine.legalMoves(s, 0).some((x) => x.type === "raise"));
  s = mv(s, "call", 0);
  assert.equal(s.phase, "bet1", "1がまだ未コール");
  s = mv(s, "call", 1);
  assert.equal(s.phase, "draw", "全員そろって交換フェーズ");
  assert.equal(s.turn, 1, "交換もディーラーの左から");
  assert.equal(s.curBet, 0); s.seats.forEach((p) => assert.equal(p.bet, 0));
  assert.equal(s.pot, 3 * 10 + 3 * 70);
  // 最低ベット・上限（最小スタック）
  const t = Engine.initialState({ seed: 3, chips: [1000, 40, 1000] }, players(3));
  assert.throws(() => mv(t, "bet", 1, { amount: 5 }), /範囲/);
  assert.equal(Engine.legalMoves(t, 1).find((x) => x.type === "bet").max, 30, "いちばん少ない人（アンティ後30）が払える額まで");
  assert.throws(() => mv(t, "bet", 1, { amount: 40 }), /範囲/);
  const t2 = mv(t, "bet", 1, { amount: 30 });
  assert.equal(t2.seats[1].chips, 0);
  assert.ok(!Engine.legalMoves(t2, 2).some((x) => x.type === "raise"), "もう上乗せできない");
});

test("フォールド: 1人以外が降りたら即終了・ポットは残った人へ・手札は非公開", () => {
  let s = Engine.initialState({ seed: 5 }, players(3));
  s = mv(s, "bet", 1, { amount: 20 });
  s = mv(s, "fold", 2);
  assert.equal(s.over, false);
  s = mv(s, "fold", 0);
  assert.equal(s.over, true);
  assert.equal(s.result.type, "fold");
  assert.deepEqual(s.result.winners, [1]);
  assert.equal(s.seats[1].chips, 1000 - 10 - 20 + 50);
  assert.deepEqual(s.result.gains, [-10, 20, -10]);
  assert.equal(Object.keys(s.result.hands).length, 0);
  const v = Engine.publicView(s, 0);
  assert.ok(v.seats[1].hand.every((c) => c.hidden), "勝者の手札は見せない");
  assert.throws(() => mv(s, "check", 1), /終わって/);
  assert.match(Engine.result(s).summary, /席2の勝ち/);
});

test("交換: 最大3枚、Aを残すなら4枚、5枚は不可、手番順、引いた後の枚数は5", () => {
  let s = Engine.initialState({ seed: 11 }, players(2));
  s = mv(s, "check", 1); s = mv(s, "check", 0);
  assert.equal(s.phase, "draw"); assert.equal(s.turn, 1);
  // 席1の手札を「A なし」に固定
  s = withHands(s, { 1: "KH 9S 6D 4C 2S", 0: "AS 7H 7D 3C 2H" });
  assert.equal(Engine.legalMoves(s, 1)[0].max, 3);
  assert.throws(() => mv(s, "draw", 1, { idx: [0, 1, 2, 3] }), /最大3枚/);
  assert.throws(() => mv(s, "draw", 1, { idx: [0, 1, 2, 3, 4] }), /5枚全部/);
  assert.throws(() => mv(s, "draw", 1, { idx: [0, 0, 1] }), /不正/);
  assert.throws(() => mv(s, "draw", 1, { idx: [7] }), /不正/);
  assert.throws(() => mv(s, "check", 1), /交換するカード/);
  const deckBefore = s.deck.length;
  const kept = [s.seats[1].hand[0], s.seats[1].hand[1]];
  s = mv(s, "draw", 1, { idx: [2, 3, 4] });
  assert.equal(s.seats[1].hand.length, 5);
  assert.deepEqual(s.seats[1].hand.slice(0, 2), kept, "残した札は順番どおり先頭");
  assert.equal(s.deck.length, deckBefore - 3);
  assert.equal(s.seats[1].drawn, 3);
  assert.equal(s.turn, 0);
  // 席0は A を持つ → 4枚OK（A を残す）。A を捨てる4枚はNG
  assert.equal(Engine.legalMoves(s, 0)[0].max, 4);
  assert.throws(() => mv(s, "draw", 0, { idx: [0, 1, 2, 3] }), /Aを1枚残す/);
  const s2 = mv(s, "draw", 0, { idx: [1, 2, 3, 4] });
  assert.equal(s2.seats[0].hand[0].r, 1);
  assert.equal(s2.seats[0].hand.length, 5);
  assert.equal(s2.phase, "bet2", "全員引いたら第2ベット");
  assert.equal(s2.turn, 1);
  // 交換なし（スタンドパット）
  const s3 = mv(s, "draw", 0, { idx: [] });
  assert.equal(s3.seats[0].drawn, 0, "交換なしは drawn=0（ラウンドが変わると last はリセットされる）");
  assert.equal(s3.seats[0].hand.length, 5);
  assert.equal(s3.lastAction.type, "draw"); assert.equal(s3.lastAction.amount, 0);
});

test("ショーダウン: 強い役がポット総取り、同値はチョップ（端数はディーラー左から）", () => {
  // 3人。第1ベット全員チェック → 交換なし → 第2ベット 席1が20ベット、全員コール → ショーダウン
  let s = Engine.initialState({ seed: 21 }, players(3));
  s = mv(s, "check", 1); s = mv(s, "check", 2); s = mv(s, "check", 0);
  s = mv(s, "draw", 1, { idx: [] }); s = mv(s, "draw", 2, { idx: [] }); s = mv(s, "draw", 0, { idx: [] });
  assert.equal(s.phase, "bet2");
  s = withHands(s, { 0: "KH KC 9S 6D 2C", 1: "QS QH QC 9D 9S", 2: "AC JH 8S 5D 2H" });
  s = mv(s, "bet", 1, { amount: 20 }); s = mv(s, "call", 2); s = mv(s, "call", 0);
  assert.equal(s.over, true); assert.equal(s.phase, "showdown");
  assert.equal(s.result.type, "showdown");
  assert.deepEqual(s.result.winners, [1]);
  assert.equal(s.result.pot, 90);
  assert.equal(s.seats[1].chips, 1000 - 30 + 90);
  assert.deepEqual(s.result.gains, [-30, 60, -30]);
  assert.equal(s.result.hands[1].name, "フルハウス");
  assert.equal(s.result.hands[0].name, "ワンペア");
  assert.equal(Engine.isOver(s), true);
  const v = Engine.publicView(s, 2);
  assert.ok(v.seats[0].hand.every((c) => !c.hidden), "ショーダウン後は公開");
  assert.match(Engine.result(s).summary, /席2の勝ち.*フルハウス/);
  // チョップ: 席0と席2が同値（ポット 95 → 席1（ディーラー左）が端数… ここでは席1は負けなので 席2→席0 の順）
  let c = Engine.initialState({ seed: 21 }, players(3));
  c = mv(c, "check", 1); c = mv(c, "check", 2); c = mv(c, "check", 0);
  c = mv(c, "draw", 1, { idx: [] }); c = mv(c, "draw", 2, { idx: [] }); c = mv(c, "draw", 0, { idx: [] });
  c = withHands(c, { 0: "KH KC 9S 6D 2C", 1: "3S 4H 8C 9D JS", 2: "KS KD 9D 6H 2S" });
  c = mv(c, "check", 1); c = mv(c, "bet", 2, { amount: 15 }); c = mv(c, "fold", 0); // 席0 降りたら席2の一人勝ち…にならないよう席0もコール
  // やり直し: 席0 もコールするパターン
  c = Engine.initialState({ seed: 21 }, players(3));
  c = mv(c, "check", 1); c = mv(c, "check", 2); c = mv(c, "check", 0);
  c = mv(c, "draw", 1, { idx: [] }); c = mv(c, "draw", 2, { idx: [] }); c = mv(c, "draw", 0, { idx: [] });
  c = withHands(c, { 0: "KH KC 9S 6D 2C", 1: "3S 4H 8C 9D JS", 2: "KS KD 9D 6H 2S" });
  c = mv(c, "check", 1); c = mv(c, "bet", 2, { amount: 15 }); c = mv(c, "call", 0); c = mv(c, "call", 1);
  assert.equal(c.over, true);
  assert.equal(c.result.pot, 75);
  assert.deepEqual(c.result.winners, [2, 0], "ディーラー(0)の左から順: 席2 → 席0");
  assert.equal(c.seats[2].won + c.seats[0].won, 75);
  assert.equal(c.seats[2].won, 38, "端数1はディーラー左に近い席2へ");
  assert.equal(c.seats[0].won, 37);
});

test("次のハンド: ディーラー移動・チップ不足は見学 or 自動補充・補充で再開", () => {
  let s = Engine.initialState({ seed: 9, chips: [1000, 15, 1000] }, players(3));
  assert.equal(s.dealer, 0);
  assert.throws(() => mv(s, "next", 0), /途中/);
  // 席1はアンティ後 5 → 上限が最低ベット未満なので誰もベットできない（チェックのみ）
  assert.ok(!Engine.legalMoves(s, 1).some((x) => x.type === "bet"), "最小スタック5では誰もベットできない");
  assert.throws(() => mv(s, "bet", 1, { amount: 5 }), /範囲/);
  s = mv(s, "check", 1); s = mv(s, "check", 2); s = mv(s, "check", 0);
  s = mv(s, "draw", 1, { idx: [] }); s = mv(s, "draw", 2, { idx: [] }); s = mv(s, "draw", 0, { idx: [] });
  s = mv(s, "check", 1); s = mv(s, "check", 2); s = mv(s, "check", 0);
  assert.equal(s.over, true);
  const loser = s.result.winners.includes(1) ? null : 1; // 席1が勝っていなければ 5 チップのまま
  // 次のハンド: 席1が 10 未満なら見学。autoRefill に入れれば +1000
  const n1 = mv(s, "next", 0);
  assert.equal(n1.handNo, 2);
  if (loser === 1) {
    assert.equal(n1.seats[1].out, true); assert.equal(n1.seats[1].hand.length, 0);
    assert.equal(n1.dealer, 2, "見学者を飛ばしてディーラーは次の参加席へ");
    const n2 = mv(s, "next", 0, { autoRefill: [1] });
    assert.equal(n2.seats[1].refills, 1); assert.equal(n2.seats[1].out, false); assert.equal(n2.seats[1].chips, 5 + 1000 - 10);
    assert.equal(n2.dealer, 1, "補充できればディーラーは次の席へ");
  } else {
    assert.equal(n1.dealer, 1, "ディーラーは次の席へ");
  }
  // 2人テーブルで片方が尽きる → idle → refill で再開
  let t = Engine.initialState({ seed: 2, chips: [1000, 12] }, players(2));
  t = mv(t, "check", 1); t = mv(t, "check", 0);
  t = mv(t, "draw", 1, { idx: [] }); t = mv(t, "draw", 0, { idx: [] });
  t = mv(t, "check", 1); t = mv(t, "check", 0);
  assert.equal(t.over, true);
  if (t.seats[1].chips < 10) {
    const idle = mv(t, "next", 0);
    assert.equal(idle.phase, "idle"); assert.equal(idle.over, true); assert.equal(idle.handNo, 1);
    assert.ok(Engine.legalMoves(idle, 1).some((x) => x.type === "refill"));
    assert.throws(() => mv(idle, "refill", 0), /まだチップ/);
    const back = mv(idle, "refill", 1);
    assert.equal(back.phase, "bet1"); assert.equal(back.handNo, 2); assert.equal(back.seats[1].refills, 1);
  }
  // 元の state は不変
  const base = Engine.initialState({ seed: 4 }, players(2));
  const json = JSON.stringify(base);
  mv(base, "check", 1);
  assert.equal(JSON.stringify(base), json);
});

test("publicView: 自分以外の手札は伏せる、山札は枚数だけ", () => {
  const s = Engine.initialState({ seed: 8 }, players(3));
  const v = Engine.publicView(s, 1);
  assert.equal(v.seats[1].hand[0].hidden, undefined);
  assert.ok(v.seats[0].hand.every((c) => c.hidden));
  assert.ok(v.seats[2].hand.every((c) => c.hidden));
  assert.equal(v.deck.length, 0);
  assert.equal(v.deckCount, 52 - 15);
});

test("CPU: 交換の定石（ペア残し・ツーペア1枚・4フラッシュ・Aなら4枚）", () => {
  const plan = (h) => Engine.drawPlan(H(h));
  assert.deepEqual(plan("KH KC 9S 6D 2C").discard, [2, 3, 4]);
  assert.deepEqual(plan("AH AC 7S 7D 4H").discard, [4]);
  assert.deepEqual(plan("JS JD JC 8H 3S").discard, [3, 4]);
  assert.deepEqual(plan("AD 10D 8D 5D 3C").discard, [4], "4フラッシュは1枚");
  assert.deepEqual(plan("9C 8D 7S 6H KC").discard, [4], "両面4ストレートは1枚");
  assert.deepEqual(plan("AC JH 8S 5D 2H").discard, [1, 2, 3, 4], "Aがあれば4枚");
  assert.deepEqual(plan("KC JH 8S 5D 2H").discard, [2, 3, 4], "役なしは上位2枚を残す");
  assert.deepEqual(plan("9H 8H 7H 6H 5H").discard, [], "できた役は動かさない");
  assert.deepEqual(plan("QS QH QC 9D 9S").discard, []);
  assert.deepEqual(plan("KS KD 9D 6D 2D").discard, [2, 3, 4], "高いペアは4フラッシュより優先");
});

test("CPU同士で30ハンド自動進行: 例外0・チップ総量保存・毎ハンド結果あり", () => {
  const rng = seeded(77);
  for (const n of [2, 3, 5]) {
    let s = Engine.initialState({ seed: 1000 + n }, players(n));
    const total = () => s.seats.reduce((a, p) => a + p.chips, 0) + s.pot;
    const startTotal = total();
    let hands = 0, guard = 0, moves = 0;
    while (hands < 30 && guard++ < 20000) {
      if (s.over) {
        hands++;
        assert.ok(s.result, "結果がある");
        assert.ok(s.result.winners.length >= 1);
        assert.equal(s.seats.reduce((a, p) => a + p.won, 0), s.result.pot, "ポットは全額配られる");
        s = Engine.applyMove(s, { type: "next", autoRefill: s.seats.map((_, i) => i) }, 0);
        if (s.phase === "idle") break;
        continue;
      }
      const m = Engine.cpuMove(s, s.turn, rng);
      assert.ok(m, `手番 ${s.turn} の手がある (phase ${s.phase})`);
      const legal = Engine.legalMoves(s, s.turn);
      assert.ok(legal.some((x) => x.type === m.type), `${m.type} は合法 (${legal.map((x) => x.type)})`);
      s = Engine.applyMove(s, m, s.turn);
      moves++;
      // 不変条件
      assert.ok(s.pot >= 0); s.seats.forEach((p) => { assert.ok(p.chips >= 0); assert.ok(p.out || p.hand.length === 5); });
    }
    assert.equal(hands, 30, `${n}人: 30ハンド回った (moves ${moves})`);
    const refilled = s.seats.reduce((a, p) => a + p.refills, 0) * 1000;
    assert.equal(total() - startTotal, refilled, "チップ総量は補充分以外で増減しない");
  }
});

test("CPU: ブラフ以外では役なしでレイズ合戦に付き合わず降りる／強い役ではフォールドしない", () => {
  // rng を常に 0.5（ブラフなし）に固定
  const noBluff = () => 0.5;
  let s = Engine.initialState({ seed: 21 }, players(3));
  s = mv(s, "check", 1); s = mv(s, "check", 2); s = mv(s, "check", 0);
  s = mv(s, "draw", 1, { idx: [] }); s = mv(s, "draw", 2, { idx: [] }); s = mv(s, "draw", 0, { idx: [] });
  s = withHands(s, { 0: "7C 5H 4S 3D 2H", 1: "QS QH QC 9D 9S", 2: "AC JH 8S 5D 2H" });
  s = mv(s, "bet", 1, { amount: 100 }); s = mv(s, "raise", 2, { amount: 100 });
  const weak = Engine.cpuMove(s, 0, noBluff);
  assert.equal(weak.type, "fold", "7ハイで200のコールは降りる");
  const t = mv(s, "fold", 0);
  const strong = Engine.cpuMove(t, 1, noBluff);
  assert.notEqual(strong.type, "fold", "フルハウスは降りない");
  assert.ok(["call", "raise"].includes(strong.type));
  // 手番でない／終了後は null
  assert.equal(Engine.cpuMove(s, 1, noBluff), null);
});

// ---- オンライン部屋との結合（フェイクストア。本番 Firestore にはつながない） ----
// ページ側 Online ラッパと同じ手順: createRoom → joinRoom → addCpu → start(席番号を詰めて initialState) → update で手を進める → next
import "../src/shared/online.js";
import { makeFakeStore } from "./fake-store.mjs";

test("オンライン: 部屋作成→参加→CPU追加→開始→ホストがCPUを動かし1ハンド完走→next で次ハンド", async () => {
  const O = globalThis.AsobibaOnline;
  const store = makeFakeStore();
  const now = () => 1_700_000_000_000;
  const A = O._create({ store, uid: "uid-A", now, slug: "poker" });
  const B = O._create({ store, uid: "uid-B", now, slug: "poker" });
  const code = await A.createRoom({ name: "A", maxPlayers: 5, minPlayers: 2, settings: {}, initialState: null });
  await B.joinRoom(code, { name: "B" });
  await A.addCpu(code, { name: "CPU ジャック" });
  await A.start(code, (rr) => {
    rr.players.sort((a, b) => a.seat - b.seat).forEach((p, i) => { p.seat = i; });
    return Engine.initialState({ seed: rr.seed }, rr.players);
  });
  let room = store.read(`poker-${code}`);
  assert.equal(room.status, "playing");
  assert.equal(room.state.n, 3);
  assert.equal(room.state.phase, "bet1");
  const client = { "uid-A": A, "uid-B": B };
  const rng = seeded(5);
  // 手番の席に応じて: CPU席はホスト(A)が update で cpuMove、人間席はその人が「チェック/コール or 交換なし」
  let guard = 0;
  while (!room.state.over && guard++ < 200) {
    const seat = room.state.turn;
    const p = room.players.find((x) => x.seat === seat);
    if (p.cpu) {
      await A.update(code, (r) => { const mv = Engine.cpuMove(r.state, r.state.turn, rng); r.state = Engine.applyMove(r.state, mv, r.state.turn); return r; });
    } else {
      const legal = Engine.legalMoves(room.state, seat).map((m) => m.type);
      const mv = legal.includes("draw") ? { type: "draw", idx: [] } : legal.includes("check") ? { type: "check" } : { type: "call" };
      await client[p.uid].update(code, (r) => { r.state = Engine.applyMove(r.state, mv, seat); return r; });
    }
    room = store.read(`poker-${code}`);
  }
  assert.ok(room.state.over, "1ハンド完走");
  assert.ok(room.state.result);
  const v1 = room.version;
  // 非ホストの next は拒否される想定（ページ側でチェック）。ホストが next → handNo 2
  await A.update(code, (r) => { r.state = Engine.applyMove(r.state, { type: "next", autoRefill: r.players.filter((x) => x.cpu).map((x) => x.seat) }, 0); return r; });
  room = store.read(`poker-${code}`);
  assert.equal(room.state.handNo, 2);
  assert.equal(room.state.over, false);
  assert.ok(room.version > v1);
  // B が抜けると席が CPU になり、ゲームは止まらない
  await B.leave(code);
  room = store.read(`poker-${code}`);
  assert.equal(room.players.find((x) => x.uid === "uid-B").cpu, true);
  assert.equal(room.status, "playing");
});
