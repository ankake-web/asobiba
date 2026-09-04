// ババ抜きのルールエンジン単体テスト。games/babanuki/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/babanuki.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/babanuki/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

const rngOf = (seed) => Engine.mulberry32(seed);
const allCards = (st) => st.hands.flat().concat(st.pairs.flatMap((p) => p.cards));
const hasPair = (hand) => { const s = new Set(); for (const c of hand) { if (c.joker) continue; if (s.has(c.r)) return true; s.add(c.r); } return false; };
// 不変条件: 53枚が保存され、各手札にペアが無く、ジョーカーは手札のどこかに1枚だけ
function checkInvariants(st, label = "") {
  const all = allCards(st);
  assert.equal(all.length, 53, `${label} 53枚が保存される`);
  const keys = new Set(all.map(Engine.cardKey));
  assert.equal(keys.size, 53, `${label} 札が重複しない`);
  st.hands.forEach((h, s) => assert.ok(!hasPair(h), `${label} 席${s}の手札にペアが残らない`));
  const jokers = st.hands.flat().filter(Engine.isJoker).length;
  assert.equal(jokers, 1, `${label} ジョーカーは手札のどこかに1枚`);
  st.pairs.forEach((p) => assert.ok(Engine.sameRank(p.cards[0], p.cards[1]), `${label} 捨て札は同じ数字のペア`));
}

test("initialState: 2〜5人に53枚が配られ、初期ペアは捨てられ、手番は startSeat から", () => {
  for (let n = 2; n <= 5; n++) {
    const st = Engine.initialState({ players: n, seed: 100 + n }, []);
    assert.equal(st.n, n);
    assert.equal(st.hands.length, n);
    checkInvariants(st, `n=${n}`);
    // 配った直後は枚数差が1以内（53/n）。ペア捨て後なのでここは合計だけ確認
    const dealt = st.hands.reduce((a, h) => a + h.length, 0) + st.pairs.length * 2;
    assert.equal(dealt, 53);
    if (!st.over) { assert.ok(st.turn >= 0 && st.turn < n); assert.ok(st.hands[st.turn].length > 0, "手番の人は手札あり"); }
    assert.equal(st.moves, 0);
    assert.equal(st.traits.length, n);
  }
  // players 配列でも人数が決まる／範囲外は丸める
  assert.equal(Engine.initialState({}, [{}, {}, {}]).n, 3);
  assert.equal(Engine.initialState({ players: 9 }, []).n, 5);
  assert.equal(Engine.initialState({ players: 1 }, []).n, 2);
  // 同じ seed なら同じ配り
  const a = Engine.initialState({ players: 4, seed: 7 }, []), b = Engine.initialState({ players: 4, seed: 7 }, []);
  assert.deepEqual(a.hands, b.hands);
  // startSeat
  const c = Engine.initialState({ players: 4, seed: 7, startSeat: 2 }, []);
  assert.equal(c.turn, 2);
});

test("stripPairs: ペアを全部抜き、残りは元の順。3枚同数字は1枚残る", () => {
  const hand = [{ r: 5, s: "S" }, { joker: true, s: "R" }, { r: 9, s: "H" }, { r: 5, s: "D" }, { r: 9, s: "C" }, { r: 9, s: "S" }, { r: 2, s: "S" }];
  const { hand: rest, pairs } = Engine.stripPairs(hand);
  assert.equal(pairs.length, 2);
  assert.deepEqual(rest, [{ joker: true, s: "R" }, { r: 9, s: "S" }, { r: 2, s: "S" }]);
});

test("legalMoves: 手番の人だけ、相手の手札の枚数ぶん draw が返る", () => {
  const st = Engine.initialState({ players: 3, seed: 3 }, []);
  const t = Engine.targetOf(st);
  assert.equal(t, (st.turn + 1) % 3);
  assert.equal(Engine.legalMoves(st, st.turn).length, st.hands[t].length);
  assert.deepEqual(Engine.legalMoves(st, (st.turn + 1) % 3), []);
});

test("applyMove(draw): 引いた札が相手から消え、ペアなら捨て札へ、違えば自分の手札末尾へ。手番は時計回り", () => {
  // 手で組んだ局面: 3人。seat0 が seat1 から引く
  const base = Engine.initialState({ players: 3, seed: 1 }, []);
  const st = { ...base, hands: [
    [{ r: 3, s: "S" }, { r: 7, s: "H" }],
    [{ r: 3, s: "D" }, { r: 10, s: "C" }, { joker: true, s: "R" }],
    [{ r: 7, s: "C" }, { r: 10, s: "D" }],
  ], pairs: [], out: [], turn: 0, moves: 0, over: false, loser: null };
  // index 0 = 3D → seat0 の 3S とペア
  const n1 = Engine.applyMove(st, { draw: 0 }, 0);
  assert.deepEqual(n1.hands[0], [{ r: 7, s: "H" }]);
  assert.deepEqual(n1.hands[1], [{ r: 10, s: "C" }, { joker: true, s: "R" }]);
  assert.equal(n1.pairs.length, 1);
  assert.equal(n1.lastDraw.paired, true);
  assert.deepEqual(n1.lastDraw.card, { r: 3, s: "D" });
  assert.equal(n1.turn, 1, "次は seat1（時計回り）");
  assert.equal(n1.moves, 1);
  assert.equal(st.hands[0].length, 2, "元の state は不変");
  // seat1 が seat2 から index1 = 10D を引く → seat1 の 10C とペア
  const n2 = Engine.applyMove(n1, { draw: 1 }, 1);
  assert.deepEqual(n2.hands[1], [{ joker: true, s: "R" }]);
  assert.deepEqual(n2.hands[2], [{ r: 7, s: "C" }]);
  assert.equal(n2.turn, 2);
  // seat2 が seat0 から 7H を引く → ペア → seat2 も seat0 も手札ゼロ → 残りは seat1（ジョーカー）＝終局
  const n3 = Engine.applyMove(n2, { draw: 0 }, 2);
  assert.equal(n3.over, true);
  assert.equal(n3.loser, 1);
  assert.deepEqual(n3.out, [0, 2], "引かれて尽きた seat0 が先に抜け、次に引いた seat2");
  const r = Engine.result(n3);
  assert.deepEqual(r.ranking, [0, 2, 1]);
  assert.equal(r.winner, 0);
  assert.deepEqual(r.places, [1, 3, 2]);
  // ペアにならない引き → 自分の末尾に足される
  const st2 = { ...st, hands: [[{ r: 3, s: "S" }], [{ r: 8, s: "D" }, { joker: true, s: "R" }], [{ r: 8, s: "C" }, { r: 3, s: "D" }]] };
  const m1 = Engine.applyMove(st2, { draw: 1 }, 0); // ジョーカーを引く
  assert.deepEqual(m1.hands[0], [{ r: 3, s: "S" }, { joker: true, s: "R" }]);
  assert.equal(m1.lastDraw.joker, true);
  assert.equal(m1.lastDraw.paired, false);
  assert.equal(m1.turn, 1);
});

test("applyMove: 手番違い・範囲外・終局後・不正な手は例外", () => {
  const st = Engine.initialState({ players: 2, seed: 5 }, []);
  const other = 1 - st.turn;
  assert.throws(() => Engine.applyMove(st, { draw: 0 }, other), /手番/);
  assert.throws(() => Engine.applyMove(st, { draw: 99 }, st.turn), /引けません/);
  assert.throws(() => Engine.applyMove(st, { draw: -1 }, st.turn), /引けません/);
  assert.throws(() => Engine.applyMove(st, {}, st.turn), /不正/);
  assert.throws(() => Engine.applyMove({ ...st, over: true }, { draw: 0 }, st.turn), /終局/);
});

test("抜けた席は飛ばして次の人へ。引く相手も「次のまだ手札がある席」", () => {
  const base = Engine.initialState({ players: 4, seed: 2 }, []);
  const st = { ...base, hands: [
    [{ r: 2, s: "S" }, { r: 4, s: "S" }],
    [],                                   // seat1 は抜け済み
    [{ r: 2, s: "D" }, { joker: true, s: "R" }],
    [{ r: 4, s: "D" }, { r: 9, s: "C" }],
  ], pairs: [], out: [1], turn: 0, moves: 5, over: false, loser: null };
  assert.equal(Engine.targetOf(st), 2, "seat1 を飛ばして seat2 から引く");
  assert.equal(Engine.legalMoves(st, 0).length, 2);
  const n = Engine.applyMove(st, { draw: 0 }, 0); // 2D → ペア
  assert.equal(n.turn, 2, "次の手番も seat1 を飛ばす");
  assert.deepEqual(n.out, [1]);
  // seat2 が seat3 から、seat3 が seat0 から（seat1 は常に飛ばす）
  const n2 = Engine.applyMove(n, { draw: 1 }, 2); // 9C
  assert.equal(Engine.targetOf(n, 2), 3);
  assert.equal(n2.turn, 3);
  assert.equal(Engine.targetOf(n2), 0);
});

test("arrange: 自分の手札を並べ替え（手番に関係なく）。順列でなければ例外。turn/moves は動かない", () => {
  const st = Engine.initialState({ players: 3, seed: 11 }, []);
  const seat = (st.turn + 1) % 3; // 手番でない人
  const h = st.hands[seat];
  const order = h.map((_, i) => i).reverse();
  const n = Engine.applyMove(st, { arrange: order }, seat);
  assert.deepEqual(n.hands[seat], h.slice().reverse());
  assert.equal(n.turn, st.turn);
  assert.equal(n.moves, st.moves);
  assert.deepEqual(n.arranged, { seat, at: st.moves });
  assert.deepEqual(st.hands[seat], h, "元は不変");
  assert.throws(() => Engine.applyMove(st, { arrange: order.slice(1) }, seat), /並べ替え/);
  assert.throws(() => Engine.applyMove(st, { arrange: order.map(() => 0) }, seat), /並べ替え/);
  // 手札が無い席は並べ替えできない
  const empty = { ...st, hands: st.hands.map((x, i) => (i === seat ? [] : x)) };
  assert.throws(() => Engine.applyMove(empty, { arrange: [] }, seat), /手札/);
});

test("publicView: 他人の手札は null 埋め（枚数は見える）。引いた札は当事者かペア成立時だけ見える", () => {
  const st = Engine.initialState({ players: 3, seed: 21 }, []);
  const v = Engine.publicView(st, 0);
  assert.deepEqual(v.hands[0], st.hands[0]);
  assert.equal(v.hands[1].length, st.hands[1].length);
  assert.ok(v.hands[1].every((c) => c === null));
  assert.equal(v.traits, undefined);
  // seat0 が seat1 から引く（ペアにならない引きを探す）
  let n = null, idx = 0;
  for (idx = 0; idx < st.hands[1].length; idx++) { const t = Engine.applyMove(st, { draw: idx }, 0); if (!t.lastDraw.paired) { n = t; break; } }
  if (n) {
    assert.ok(Engine.publicView(n, 0).lastDraw.card, "引いた本人には見える");
    assert.ok(Engine.publicView(n, 1).lastDraw.card, "引かれた本人にも見える");
    assert.equal(Engine.publicView(n, 2).lastDraw.card, null, "第三者には伏せる");
  }
});

test("cpuMove / cpuArrange: 合法な手・順列を返す。クセ（pull）で偏るが範囲内", () => {
  const rng = rngOf(99);
  const st = Engine.initialState({ players: 4, seed: 42 }, []);
  for (let k = 0; k < 50; k++) {
    const mv = Engine.cpuMove(st, st.turn, rng);
    assert.ok(mv && mv.draw >= 0 && mv.draw < st.hands[Engine.targetOf(st)].length);
  }
  assert.equal(Engine.cpuMove(st, (st.turn + 1) % 4, rng), null, "手番でなければ null");
  let arranged = 0;
  for (let k = 0; k < 40; k++) {
    const ar = Engine.cpuArrange(st, 1, rng);
    if (!ar) continue;
    arranged++;
    const n = Engine.applyMove(st, ar, 1);
    assert.deepEqual(n.hands[1].map(Engine.cardKey).sort(), st.hands[1].map(Engine.cardKey).sort(), "札の中身は同じ");
  }
  assert.ok(arranged > 0, "たまには並べ替える");
  // place=edge のCPUはババを端に置きがち
  const edgeSt = { ...st, traits: st.traits.map(() => ({ place: "edge", pull: "any", fidget: 1 })) };
  const jseat = edgeSt.hands.findIndex((h) => h.some(Engine.isJoker));
  let edges = 0, tries = 0;
  for (let k = 0; k < 60; k++) {
    const ar = Engine.cpuArrange(edgeSt, jseat, rng);
    if (!ar) continue;
    tries++;
    const h = Engine.applyMove(edgeSt, ar, jseat).hands[jseat];
    const ji = h.findIndex(Engine.isJoker);
    if (ji === 0 || ji === h.length - 1) edges++;
  }
  assert.ok(tries > 0 && edges / tries > 0.5, `端に置く割合 ${edges}/${tries}`);
});

test("終局まで自動対局（CPU同士・2〜5人・複数seed）: 不変条件が常に成り立ち、最後はジョーカー持ちが負け", () => {
  for (let n = 2; n <= 5; n++) {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = rngOf(seed * 31 + n);
      let st = Engine.initialState({ players: n, seed }, []);
      let guard = 0;
      while (!st.over && guard++ < 600) {
        // たまに引かれる側が並べ替える
        const tgt = Engine.targetOf(st);
        const ar = Engine.cpuArrange(st, tgt, rng);
        if (ar) st = Engine.applyMove(st, ar, tgt);
        const mv = Engine.cpuMove(st, st.turn, rng);
        assert.ok(mv, `n=${n} seed=${seed}: 手番の CPU が手を返す`);
        st = Engine.applyMove(st, mv, st.turn);
        checkInvariants(st, `n=${n} seed=${seed} move=${st.moves}`);
      }
      assert.ok(st.over, `n=${n} seed=${seed}: 終局まで進む (${guard})`);
      assert.ok(Engine.isOver(st));
      const active = Engine.activeSeats(st);
      assert.equal(active.length, 1, "最後に残るのは1人");
      assert.equal(st.loser, active[0]);
      assert.ok(st.hands[st.loser].some(Engine.isJoker), "負けた人がジョーカーを持っている");
      assert.equal(st.hands[st.loser].length, 1, "最後はジョーカー1枚だけ");
      const r = Engine.result(st);
      assert.equal(r.ranking.length, n);
      assert.equal(new Set(r.ranking).size, n, "順位に全員が1回ずつ");
      assert.equal(r.ranking[n - 1], st.loser, "最下位＝負け");
      assert.deepEqual(r.ranking.slice(0, -1), st.out, "抜けた順がそのまま順位");
      assert.deepEqual(Engine.legalMoves(st, 0), []);
    }
  }
});
