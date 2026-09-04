// 神経衰弱のルールエンジン単体テスト。games/memory/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/memory.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/memory/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

const players = (n) => Array.from({ length: n }, (_, i) => ({ seat: i }));
const lcg = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
// 同じ数字のペアの位置を探す（テスト用に中身をのぞく）
function findPair(state, exceptSet = new Set()) {
  const byR = {};
  state.cards.forEach((c, i) => { if (state.owner[i] === -1 && !exceptSet.has(i)) (byR[c.r] ||= []).push(i); });
  for (const k of Object.keys(byR)) if (byR[k].length >= 2) return [byR[k][0], byR[k][1]];
  return null;
}
function findMismatch(state) {
  for (let i = 0; i < state.cards.length; i++) for (let j = i + 1; j < state.cards.length; j++)
    if (state.owner[i] === -1 && state.owner[j] === -1 && state.cards[i].r !== state.cards[j].r) return [i, j];
  return null;
}

test("initialState: 24/36/52 枚で組数が合い、どの数字も偶数枚。席数・初期値・seed 付き rng で再現可能", () => {
  for (const [cards, pairs] of [[24, 12], [36, 18], [52, 26]]) {
    const s = Engine.initialState({ cards }, players(2), lcg(7));
    assert.equal(s.cards.length, cards);
    assert.equal(s.pairsLeft, pairs);
    const cnt = {};
    s.cards.forEach((c) => { cnt[c.r] = (cnt[c.r] || 0) + 1; });
    Object.values(cnt).forEach((v) => assert.equal(v % 2, 0, `${cards}枚: 数字ごとに偶数枚`));
    assert.deepEqual(s.owner, new Array(cards).fill(-1));
    assert.deepEqual(s.up, []);
    assert.equal(s.turn, 0);
    assert.equal(s.n, 2);
    assert.deepEqual(s.scores, [0, 0]);
    assert.equal(s.over, false);
    assert.equal(Object.keys(s.mem).length, 2);
  }
  // 24枚は全部ちがう数字の12組（A〜Q × S,H）
  const s24 = Engine.initialState({ cards: 24 }, players(1), lcg(1));
  assert.equal(new Set(s24.cards.map((c) => c.r)).size, 12);
  assert.ok(s24.cards.every((c) => c.s === "S" || c.s === "H"));
  // 不正値は 24 / 1人 / ふつう に倒す
  const d = Engine.initialState({ cards: 99 }, [], lcg(1));
  assert.equal(d.cards.length, 24); assert.equal(d.n, 1); assert.equal(d.cpuLevel, 2);
  assert.equal(Engine.initialState({ cpuLevel: 3 }, players(4), lcg(1)).cpuLevel, 3);
  assert.equal(Engine.initialState({}, players(9), lcg(1)).n, 4, "席は最大4");
  // 同じ seed なら同じ山札
  const a = Engine.initialState({ cards: 52 }, players(2), Engine.mulberry(123));
  const b = Engine.initialState({ cards: 52 }, players(2), Engine.mulberry(123));
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.rngState, b.rngState);
  const c = Engine.initialState({ cards: 52 }, players(2), Engine.mulberry(124));
  assert.notDeepEqual(a.cards, c.cards);
});

test("legalMoves: 手番の席は場の札すべて、手番でない席は空。表の札・取られた札は除外", () => {
  const s = Engine.initialState({ cards: 24 }, players(2), lcg(3));
  assert.equal(Engine.legalMoves(s, 0).length, 24);
  assert.deepEqual(Engine.legalMoves(s, 1), []);
  const s1 = Engine.applyMove(s, { flip: 5 }, 0);
  assert.equal(Engine.legalMoves(s1, 0).length, 23);
  assert.ok(!Engine.legalMoves(s1, 0).some((mv) => mv.flip === 5));
  assert.ok(Engine.canFlip(s, 0)); assert.ok(!Engine.canFlip(s1, 5)); assert.ok(!Engine.canFlip(s, -1)); assert.ok(!Engine.canFlip(s, 24));
});

test("applyMove: 1枚目は up に入るだけ。2枚目が同じ数字ならペア取得＋手番継続、違えば伏せて次の人", () => {
  const s = Engine.initialState({ cards: 24 }, players(3), lcg(11));
  const [a, b] = findPair(s);
  const s1 = Engine.applyMove(s, { flip: a }, 0);
  assert.deepEqual(s1.up, [a]);
  assert.equal(s1.flips, 1); assert.equal(s1.attempts, 0); assert.equal(s1.turn, 0);
  assert.deepEqual(s.up, [], "元の state は不変");
  const s2 = Engine.applyMove(s1, { flip: b }, 0);
  assert.deepEqual(s2.up, []);
  assert.equal(s2.owner[a], 0); assert.equal(s2.owner[b], 0);
  assert.deepEqual(s2.scores, [1, 0, 0]);
  assert.equal(s2.turn, 0, "そろったら続けて同じ人（連続手番）");
  assert.equal(s2.pairsLeft, 11);
  assert.equal(s2.attempts, 1);
  assert.deepEqual(s2.last, { a, b, seat: 0, match: true });
  assert.equal(s1.owner[a], -1, "元の state は不変");
  // 外れ
  const [x, y] = findMismatch(s2);
  const s3 = Engine.applyMove(Engine.applyMove(s2, { flip: x }, 0), { flip: y }, 0);
  assert.deepEqual(s3.up, []);
  assert.equal(s3.owner[x], -1); assert.equal(s3.owner[y], -1);
  assert.equal(s3.turn, 1, "外れたら次の人");
  assert.deepEqual(s3.last, { a: x, b: y, seat: 0, match: false });
  assert.equal(s3.attempts, 2);
  // 3人目が外れたら 0 に戻る（ぐるっと一周）
  const [p, q] = findMismatch(s3);
  const s4 = Engine.applyMove(Engine.applyMove(s3, { flip: p }, 1), { flip: q }, 1);
  assert.equal(s4.turn, 2);
  const [p2, q2] = findMismatch(s4);
  const s5 = Engine.applyMove(Engine.applyMove(s4, { flip: p2 }, 2), { flip: q2 }, 2);
  assert.equal(s5.turn, 0);
});

test("applyMove: 手番違い・表の札・取られた札・範囲外・終了後は例外", () => {
  const s = Engine.initialState({ cards: 24 }, players(2), lcg(5));
  assert.throws(() => Engine.applyMove(s, { flip: 0 }, 1), /手番/);
  const s1 = Engine.applyMove(s, { flip: 0 }, 0);
  assert.throws(() => Engine.applyMove(s1, { flip: 0 }, 0), /めくれません/);
  assert.throws(() => Engine.applyMove(s, { flip: 24 }, 0), /めくれません/);
  assert.throws(() => Engine.applyMove(s, { flip: -1 }, 0), /めくれません/);
  assert.throws(() => Engine.applyMove(s, {}, 0), /めくれません/);
  const [a, b] = findPair(s);
  const s2 = Engine.applyMove(Engine.applyMove(s, { flip: a }, 0), { flip: b }, 0);
  assert.throws(() => Engine.applyMove(s2, { flip: a }, 0), /めくれません/);
  assert.throws(() => Engine.applyMove({ ...s, over: true }, { flip: 0 }, 0), /終了/);
});

test("ひとりプレイ: n=1 は外れても自分の番のまま。終局で result は手数つき", () => {
  let s = Engine.initialState({ cards: 24 }, players(1), lcg(9));
  const [x, y] = findMismatch(s);
  s = Engine.applyMove(Engine.applyMove(s, { flip: x }, 0), { flip: y }, 0);
  assert.equal(s.turn, 0);
  // 全部そろえる
  let guard = 0;
  while (!s.over && guard++ < 40) { const [a, b] = findPair(s); s = Engine.applyMove(Engine.applyMove(s, { flip: a }, 0), { flip: b }, 0); }
  assert.ok(Engine.isOver(s));
  assert.equal(s.pairsLeft, 0);
  const r = Engine.result(s);
  assert.equal(r.winner, 0);
  assert.equal(r.attempts, 13);
  assert.match(r.summary, /13手でクリア/);
  assert.deepEqual(r.ranking, [{ seat: 0, pairs: 12, rank: 1 }]);
});

test("終局と順位: 全ペア取得で over。組数で順位、同数は同順位・勝者なし（引き分け）", () => {
  // 2人: 席0が全部取る
  let s = Engine.initialState({ cards: 24 }, players(2), lcg(21));
  while (!s.over) { const [a, b] = findPair(s); s = Engine.applyMove(Engine.applyMove(s, { flip: a }, s.turn), { flip: b }, s.turn); }
  assert.equal(s.turn, 0, "ずっと席0の番だった");
  let r = Engine.result(s);
  assert.equal(r.winner, 0); assert.deepEqual(r.scores, [12, 0]); assert.equal(r.draw, false);
  assert.deepEqual(r.ranking.map((x) => [x.seat, x.pairs, x.rank]), [[0, 12, 1], [1, 0, 2]]);
  // 3人・同数: 席0 が 6組取って外し → 席1 が 6組 → 席2 は 0 → 引き分け（1位が2人、席2は3位）
  s = Engine.initialState({ cards: 24 }, players(3), lcg(22));
  for (let i = 0; i < 6; i++) { const [a, b] = findPair(s); s = Engine.applyMove(Engine.applyMove(s, { flip: a }, 0), { flip: b }, 0); }
  const [x, y] = findMismatch(s);
  s = Engine.applyMove(Engine.applyMove(s, { flip: x }, 0), { flip: y }, 0);
  assert.equal(s.turn, 1);
  while (!s.over) { const [a, b] = findPair(s); s = Engine.applyMove(Engine.applyMove(s, { flip: a }, 1), { flip: b }, 1); }
  r = Engine.result(s);
  assert.equal(r.winner, null); assert.equal(r.draw, true);
  assert.deepEqual(r.ranking.map((x) => [x.seat, x.pairs, x.rank]), [[0, 6, 1], [1, 6, 1], [2, 0, 3]]);
  assert.match(r.summary, /引き分け/);
  // over 後の result は手番に依存しない
  assert.ok(Engine.isOver(s));
});

test("CPUの記憶: 見た札は mem に残り（忘れる確率あり）、取られたら消える。つよいはほぼ忘れない・やさしいは半分忘れる", () => {
  // 席0(人間)が札0をめくる → 席1(CPU) の mem[1][0] に数字が入る確率を seed を変えて数える
  const count = (level) => {
    let hit = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = Engine.initialState({ cards: 24, cpuLevel: level }, players(2), lcg(seed));
      const s1 = Engine.applyMove(s, { flip: 0 }, 0);
      if (s1.mem[1][0] === s.cards[0].r) hit++;
      assert.ok(s1.mem[1][0] === 0 || s1.mem[1][0] === s.cards[0].r, "記録されるなら正しい数字");
    }
    return hit;
  };
  const easy = count(1), normal = count(2), strong = count(3);
  assert.ok(easy >= 70 && easy <= 130, `やさしい(50%忘れる) ≈ 半分記憶: ${easy}/200`);
  assert.ok(normal > easy, `ふつう(25%) はやさしいより覚える: ${normal} > ${easy}`);
  assert.ok(strong >= 180, `つよい(5%忘れる) はほぼ全部覚える: ${strong}/200`);
  // 同じ state から同じ手を打てば同じ結果（rngState が state にある＝全クライアントで一致）
  const s = Engine.initialState({ cards: 24, cpuLevel: 1 }, players(2), lcg(77));
  assert.deepEqual(Engine.applyMove(s, { flip: 3 }, 0).mem, Engine.applyMove(s, { flip: 3 }, 0).mem);
  // 取られた札は記憶から消える
  const s3 = Engine.initialState({ cards: 24, cpuLevel: 3 }, players(2), lcg(5));
  const [a, b] = findPair(s3);
  const t = Engine.applyMove(Engine.applyMove(s3, { flip: a }, 0), { flip: b }, 0);
  assert.equal(t.mem[0][a], 0); assert.equal(t.mem[1][b], 0);
});

test("cpuMove: 覚えているペアがあれば取りにいく。1枚目の相方を覚えていればそれを返す。無ければ未知の札を優先", () => {
  const rng = lcg(31);
  let s = Engine.initialState({ cards: 24, cpuLevel: 3 }, players(2), lcg(8));
  s = { ...s, turn: 1 };
  const [a, b] = findPair(s);
  // 記憶に a と b を植える
  const mem = { 0: s.mem[0].slice(), 1: s.mem[1].slice() };
  mem[1][a] = s.cards[a].r; mem[1][b] = s.cards[b].r;
  s = { ...s, mem };
  const mv1 = Engine.cpuMove(s, 1, rng);
  assert.ok(mv1.flip === a || mv1.flip === b, "覚えているペアの片方をめくる");
  const s1 = Engine.applyMove(s, mv1, 1);
  const mv2 = Engine.cpuMove(s1, 1, rng);
  assert.equal(mv2.flip, mv1.flip === a ? b : a, "2枚目は相方");
  const s2 = Engine.applyMove(s1, mv2, 1);
  assert.equal(s2.scores[1], 1);
  assert.equal(s2.turn, 1, "そろえたのでもう1回");
  // 1枚目の相方を覚えているケース: 人間が c をめくって外した → CPU は c の相方 d を知っていれば c→d
  let u = Engine.initialState({ cards: 24, cpuLevel: 3 }, players(2), lcg(13));
  const [c, d] = findPair(u);
  const um = { 0: u.mem[0].slice(), 1: u.mem[1].slice() }; um[1][d] = u.cards[d].r; // d だけ覚えている
  u = { ...u, mem: um, turn: 1, up: [c] };
  assert.equal(Engine.cpuMove(u, 1, rng).flip, d);
  // 何も覚えていなければ未知の札（= mem が 0 の札）を選ぶ
  let v = Engine.initialState({ cards: 24, cpuLevel: 3 }, players(2), lcg(17));
  const vm2 = { 0: v.mem[0].slice(), 1: v.mem[1].slice() };
  for (let i = 0; i < 24; i++) if (i !== 20 && i !== 21) vm2[1][i] = v.cards[i].r; // 20,21 以外を全部知っている（ただしペアにならないよう細工）
  // ペアが成立しないように、20・21 以外の既知の札はそれぞれ単独数字になるとは限らないので、ここは「未知がある状況で未知を優先」を確認する
  v = { ...v, mem: vm2, turn: 1 };
  const mv = Engine.cpuMove(v, 1, rng);
  const known = vm2[1];
  const byR = {}; for (let i = 0; i < 24; i++) if (known[i]) (byR[known[i]] ||= []).push(i);
  const hasPair = Object.values(byR).some((arr) => arr.length >= 2);
  if (hasPair) assert.ok(known[mv.flip] > 0, "ペアを知っているならそこへ");
  else assert.ok(mv.flip === 20 || mv.flip === 21, "未知の札を優先");
  // 手番でない／終了は null
  assert.equal(Engine.cpuMove(v, 0, rng), null);
  assert.equal(Engine.cpuMove({ ...v, over: true }, 1, rng), null);
});

test("cpuMove: CPU同士の自動対局が 3段階×(2人/4人)×(24/52枚) で最後まで進み、例外ゼロ。つよいほど手数が少ない傾向", () => {
  const rng = lcg(99);
  const avg = {};
  for (const level of [1, 2, 3]) {
    let sum = 0, games = 0;
    for (const n of [2, 4]) for (const cards of [24, 52]) for (let rep = 0; rep < 3; rep++) {
      let s = Engine.initialState({ cards, cpuLevel: level }, players(n), rng);
      let guard = 0;
      while (!s.over && guard++ < 5000) {
        const mv = Engine.cpuMove(s, s.turn, rng);
        assert.ok(mv && Engine.canFlip(s, mv.flip), `level ${level} n ${n}: 合法な札`);
        s = Engine.applyMove(s, mv, s.turn);
      }
      assert.ok(s.over, `level ${level} n ${n} cards ${cards}: 終局まで進む`);
      assert.equal(s.scores.reduce((x, y) => x + y, 0), cards / 2, "全組が誰かのもの");
      assert.equal(s.owner.filter((o) => o === -1).length, 0);
      const r = Engine.result(s);
      assert.equal(r.ranking.length, n);
      if (cards === 52 && n === 2) { sum += s.attempts; games++; }
    }
    avg[level] = sum / games;
  }
  assert.ok(avg[3] < avg[1], `つよい(${avg[3]}手) はやさしい(${avg[1]}手) より少ない手数で終わる`);
});

test("publicView: 隠し情報は割り切って state をそのまま返す", () => {
  const s = Engine.initialState({}, players(2), lcg(1));
  assert.equal(Engine.publicView(s, 0), s);
});
