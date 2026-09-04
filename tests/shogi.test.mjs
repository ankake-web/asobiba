// 将棋のルールエンジン単体テスト。games/shogi/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/
// 局面は SFEN で組む（大文字=先手、小文字=後手、+ は成駒、数字は空き。段は上(一)から、筋は左(９)から）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "../src/shared/online.js";
import { makeFakeStore } from "./fake-store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/shogi/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");
const E = Engine;
const sq = (file, rank) => (rank - 1) * 9 + (9 - file); // ７六 → sq(7,6)
const has = (moves, pred) => moves.some(pred);
const rngOf = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; }; };

test("initialState: 平手・先手番・合法手30・持ち駒なし・SFEN往復", () => {
  const s = E.initialState({ cpuLevel: 1 }, []);
  assert.equal(s.turn, 0);
  assert.equal(s.over, false);
  assert.equal(s.cpuLevel, 1);
  assert.equal(E.initialState({}, []).cpuLevel, 2);
  assert.equal(s.board[sq(5, 9)], E.OU, "先手玉は５九");
  assert.equal(s.board[sq(5, 1)], -E.OU, "後手玉は５一");
  assert.equal(s.board[sq(2, 8)], E.HI); assert.equal(s.board[sq(8, 8)], E.KA);
  assert.equal(s.board[sq(8, 2)], -E.HI); assert.equal(s.board[sq(2, 2)], -E.KA);
  assert.equal(s.hands.length, 16);
  assert.ok(s.hands.every((n) => n === 0));
  assert.equal(E.legalMoves(s, 0).length, 30);
  assert.deepEqual(E.legalMoves(s, 1), []);
  assert.equal(E.toSfen(s.board, s.hands, 0), E.START_SFEN);
  assert.equal(E.publicView(s, 1), s);
});

test("state は Firestore に入る形（配列の入れ子なし・undefined なし）", () => {
  let s = E.initialState({}, []);
  s = E.applyMove(s, { from: sq(7, 7), to: sq(7, 6), promote: false }, 0);
  s = E.applyMove(s, { from: sq(3, 3), to: sq(3, 4), promote: false }, 1);
  s = E.applyMove(s, { from: sq(8, 8), to: sq(2, 2), promote: true }, 0); // 角交換
  const walk = (v, path, inArray) => {
    assert.notEqual(v, undefined, `undefined at ${path}`);
    if (Array.isArray(v)) { assert.ok(!inArray, `nested array at ${path}`); v.forEach((x, i) => walk(x, `${path}[${i}]`, true)); }
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`, false));
  };
  walk(s, "state", false);
});

test("駒の動き: 歩・桂・銀・角・飛・玉、味方のマスには進めない", () => {
  const s = E.initialState({}, []);
  const mv = E.legalMoves(s, 0);
  assert.ok(has(mv, (x) => x.from === sq(7, 7) && x.to === sq(7, 6)), "▲７六歩");
  assert.ok(!has(mv, (x) => x.from === sq(7, 7) && x.to === sq(7, 5)), "歩は1マスだけ");
  assert.ok(!has(mv, (x) => x.from === sq(8, 9)), "桂は味方の歩が邪魔で跳べない（８九→７七/９七は歩）");
  assert.ok(has(mv, (x) => x.from === sq(3, 9) && x.to === sq(3, 8)), "▲３八銀");
  assert.ok(has(mv, (x) => x.from === sq(3, 9) && x.to === sq(4, 8)), "▲４八銀");
  assert.ok(!has(mv, (x) => x.from === sq(8, 8)), "角は歩に囲まれて動けない");
  assert.equal(mv.filter((x) => x.from === sq(2, 8)).length, 6, "飛は横に６マス（１八・３八〜７八）");
  assert.equal(mv.filter((x) => x.from === sq(5, 9)).length, 3, "玉は４八・５八・６八");
  // 角道を開けると角が走れる
  const s2 = E.applyMove(s, { from: sq(7, 7), to: sq(7, 6), promote: false }, 0);
  const s3 = E.applyMove(s2, { from: sq(3, 3), to: sq(3, 4), promote: false }, 1);
  const bishop = E.legalMoves(s3, 0).filter((x) => x.from === sq(8, 8));
  assert.ok(has(bishop, (x) => x.to === sq(2, 2) && x.promote === true), "▲２二角成");
  assert.ok(has(bishop, (x) => x.to === sq(2, 2) && x.promote === false), "▲２二角不成");
  assert.ok(has(bishop, (x) => x.to === sq(3, 3) && x.promote === true), "３三（敵陣）に入るので成れる");
  assert.ok(!has(bishop, (x) => x.to === sq(1, 1)), "２二の角を飛び越えられない");
});

test("取る・持ち駒・成駒は元の駒として手に入る・打つ", () => {
  let s = E.initialState({}, []);
  s = E.applyMove(s, { from: sq(7, 7), to: sq(7, 6), promote: false }, 0);
  s = E.applyMove(s, { from: sq(3, 3), to: sq(3, 4), promote: false }, 1);
  s = E.applyMove(s, { from: sq(8, 8), to: sq(2, 2), promote: true }, 0);
  assert.equal(s.board[sq(2, 2)], E.UM, "成って馬になっている");
  assert.equal(s.hands[E.H(0, E.KA)], 1, "先手の持ち駒に角");
  assert.equal(s.lastMove.captured, E.KA);
  s = E.applyMove(s, { from: sq(3, 1), to: sq(2, 2), promote: false }, 1); // △同銀（馬を取る）
  assert.equal(s.hands[E.H(1, E.KA)], 1, "馬を取ると後手の持ち駒は角（成駒は戻る）");
  assert.equal(s.board[sq(2, 2)], -E.GI);
  // 角を打つ
  const drops = E.legalMoves(s, 0).filter((x) => x.drop === E.KA);
  assert.ok(drops.length > 0, "角が打てる");
  assert.ok(has(drops, (x) => x.to === sq(5, 5)));
  assert.ok(!has(drops, (x) => x.to === sq(7, 6)), "駒のあるマスには打てない");
  s = E.applyMove(s, { drop: E.KA, to: sq(5, 5) }, 0);
  assert.equal(s.board[sq(5, 5)], E.KA);
  assert.equal(s.hands[E.H(0, E.KA)], 0);
  assert.equal(s.lastMove.drop, E.KA);
  assert.deepEqual(s.kifu, ["▲７六歩", "△３四歩", "▲２二角成", "△同　銀", "▲５五角打"]);
});

test("二歩: 自分の歩がある筋には歩を打てない（と金の筋はOK）", () => {
  // 先手: 歩が７筋にある。持ち駒に歩。９筋には先手のと金だけ。
  const s = E.stateFromSfen("4k4/9/9/9/9/+P8/2P6/9/4K4 b P");
  const drops = E.legalMoves(s, 0).filter((x) => x.drop === E.FU);
  assert.ok(!has(drops, (x) => E.colOf(x.to) === E.colOf(sq(7, 7))), "７筋には打てない（二歩）");
  assert.ok(has(drops, (x) => x.to === sq(9, 5)), "９筋はと金しかないので打てる");
  assert.ok(has(drops, (x) => x.to === sq(5, 5)));
  assert.ok(!has(drops, (x) => E.rowOf(x.to) === 0), "一段目（行き所なし）には打てない");
  assert.throws(() => E.applyMove(s, { drop: E.FU, to: sq(7, 5) }, 0), /指せません/);
});

test("行き所のない駒: 歩・香は一段目、桂は一二段目に打てない／動くなら必ず成る", () => {
  const s = E.stateFromSfen("4k4/9/9/9/9/9/9/9/4K4 b LN");
  const mv = E.legalMoves(s, 0);
  assert.ok(!has(mv, (x) => x.drop === E.KY && E.rowOf(x.to) === 0));
  assert.ok(has(mv, (x) => x.drop === E.KY && E.rowOf(x.to) === 1));
  assert.ok(!has(mv, (x) => x.drop === E.KE && E.rowOf(x.to) <= 1));
  assert.ok(has(mv, (x) => x.drop === E.KE && E.rowOf(x.to) === 2));
  // 歩が二段目→一段目: 成りだけ。桂が四段目→二段目: 成りだけ。歩が四段目→三段目: 成/不成の両方
  const s2 = E.stateFromSfen("9/P8/9/1N6P/9/9/9/9/4K3k b -");
  const mv2 = E.legalMoves(s2, 0);
  const pawnTop = mv2.filter((x) => x.from === sq(9, 2));
  assert.deepEqual(pawnTop.map((x) => x.promote), [true], "一段目へ行く歩は強制成り");
  const knight = mv2.filter((x) => x.from === sq(8, 4));
  assert.ok(knight.length === 1 && knight[0].to === sq(7, 2) && knight[0].promote, "二段目へ跳ぶ桂は強制成り（９二は味方の歩）");
  const pawn3 = mv2.filter((x) => x.from === sq(1, 4));
  assert.deepEqual(pawn3.map((x) => x.promote).sort(), [false, true], "三段目へ進む歩は成/不成");
  const n = E.applyMove(s2, pawnTop[0], 0);
  assert.equal(n.board[sq(9, 1)], E.TO);
  assert.match(n.kifu[0], /^▲９一歩成$/);
});

test("王手: 王手放置は不可、玉は利きのあるマスへ動けない、合駒・玉の逃げだけが合法", () => {
  // 後手飛車が５筋から先手玉に王手。先手は金で合駒か、玉が横に逃げる
  const s = E.stateFromSfen("4k4/9/9/9/4r4/9/9/3G5/4K4 b -");
  assert.equal(s.check, true);
  const mv = E.legalMoves(s, 0);
  assert.ok(mv.every((x) => {
    const n = E.applyMove(s, x, 0);
    return !E.inCheck(n.board, 0);
  }), "全ての合法手で王手が解消されている");
  assert.ok(has(mv, (x) => x.from === sq(6, 8) && x.to === sq(5, 8)), "▲５八金（合駒）");
  assert.ok(!has(mv, (x) => x.from === sq(6, 8) && x.to === sq(6, 7)), "金が横へ動くのは王手放置");
  assert.ok(has(mv, (x) => x.from === sq(5, 9) && x.to === sq(4, 9)), "玉は横へ逃げられる");
  assert.ok(!has(mv, (x) => x.from === sq(5, 9) && x.to === sq(5, 8)), "飛の利きの上には逃げられない");
  const n = E.applyMove(s, { from: sq(6, 8), to: sq(5, 8), promote: false }, 0);
  assert.equal(n.check, false);
});

test("詰み: 詰ませた側の勝ち（reason=mate）。頭金", () => {
  // 後手玉５一、先手の金が５三、持ち駒に金 → ▲５二金打で詰み
  const s = E.stateFromSfen("4k4/9/4G4/9/9/9/9/9/4K4 b G");
  const n = E.applyMove(s, { drop: E.KI, to: sq(5, 2) }, 0);
  assert.equal(n.check, true);
  assert.equal(n.over, true);
  assert.equal(n.winner, 0);
  assert.equal(n.reason, "mate");
  assert.ok(E.isOver(n));
  assert.match(E.result(n).summary, /詰みで先手の勝ち/);
  assert.deepEqual(E.legalMoves(n, 1), []);
  assert.throws(() => E.applyMove(n, { from: sq(5, 1), to: sq(4, 1), promote: false }, 1), /終局/);
});

test("打ち歩詰めは反則、動かす歩での詰み・他の駒を打つ詰みは合法", () => {
  // 後手玉１一。先手: 金３二（２一・２二を押さえる）、銀２三（１二を守る）。持ち駒 歩 → ▲１二歩打 は打ち歩詰め
  const s = E.stateFromSfen("8k/6G2/7S1/9/9/9/9/9/4K4 b P");
  assert.equal(s.check, false, "前提: まだ王手はかかっていない");
  const mv = E.legalMoves(s, 0);
  assert.ok(!has(mv, (x) => x.drop === E.FU && x.to === sq(1, 2)), "▲１二歩打（打ち歩詰め）は指せない");
  assert.ok(has(mv, (x) => x.drop === E.FU && x.to === sq(1, 4)), "他のマスには歩を打てる");
  assert.throws(() => E.applyMove(s, { drop: E.FU, to: sq(1, 2) }, 0), /指せません/);
  // 同じ形で持ち駒が金なら ▲１二金打 で詰み（合法）
  const s2 = E.stateFromSfen("8k/6G2/7S1/9/9/9/9/9/4K4 b G");
  const n2 = E.applyMove(s2, { drop: E.KI, to: sq(1, 2) }, 0);
  assert.equal(n2.over, true); assert.equal(n2.reason, "mate"); assert.equal(n2.winner, 0);
  // 歩を「動かして」詰ますのは合法（突き歩詰め）: 歩が１三、銀２三が１二を守る
  const s3 = E.stateFromSfen("8k/6G2/7SP/9/9/9/9/9/4K4 b -");
  const push = E.legalMoves(s3, 0).filter((x) => x.from === sq(1, 3) && x.to === sq(1, 2));
  assert.ok(push.length >= 1, "▲１二歩（突き歩）は合法");
  const n3 = E.applyMove(s3, push.find((x) => !x.promote) || push[0], 0);
  assert.equal(n3.over, true); assert.equal(n3.reason, "mate");
  // 逃げ道がある（金がない）なら歩を打って王手しても合法
  const s4 = E.stateFromSfen("8k/9/7S1/9/9/9/9/9/4K4 b P");
  assert.ok(has(E.legalMoves(s4, 0), (x) => x.drop === E.FU && x.to === sq(1, 2)));
});

test("手詰まり（王手でないが合法手なし）も負け", () => {
  // 後手玉１一、先手銀３二・金２四。▲２三金で後手は動けなくなる（王手はかかっていない）
  const s = E.stateFromSfen("8k/6S2/9/7G1/9/9/9/9/K8 b -");
  const n = E.applyMove(s, { from: sq(2, 4), to: sq(2, 3), promote: false }, 0);
  assert.equal(n.check, false);
  assert.equal(n.over, true);
  assert.equal(n.winner, 0);
  assert.equal(n.reason, "stalemate");
});

test("千日手: 同一局面4回で引き分け（飛車の往復）", () => {
  let s = E.initialState({}, []);
  const cycle = [
    [0, { from: sq(2, 8), to: sq(3, 8), promote: false }], [1, { from: sq(8, 2), to: sq(7, 2), promote: false }],
    [0, { from: sq(3, 8), to: sq(2, 8), promote: false }], [1, { from: sq(7, 2), to: sq(8, 2), promote: false }],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [seat, mv] of cycle) {
      assert.equal(s.over, false, `round ${round} まだ終わらない`);
      s = E.applyMove(s, mv, seat);
    }
  }
  assert.equal(s.moves, 12);
  assert.equal(s.over, true, "初期局面が4回目 → 千日手");
  assert.equal(s.winner, null);
  assert.equal(s.reason, "sennichite");
  assert.match(E.result(s).summary, /千日手で引き分け/);
});

test("連続王手の千日手: 王手をかけ続けた側の負け", () => {
  // 後手玉５一。先手飛５五の王手 → 玉４二 → 飛４五（王手）→ 玉５一 → 飛５五（王手）… の繰り返し
  // 後手: 香６一・４一・３一、歩３二。先手: 金６三（６二/５二/５三を押さえる）、桂２五（３三を押さえる）、玉９九
  const start = "3lkll2/6p2/3G5/9/4R2N1/9/9/9/K8 w -";
  let s = E.stateFromSfen(start);
  assert.equal(s.check, true, "開始局面で後手玉に王手");
  const kingMoves = E.legalMoves(s, 1);
  assert.deepEqual(kingMoves.map((x) => [x.from, x.to]), [[sq(5, 1), sq(4, 2)]], "逃げ場は４二だけ");
  const cycle = [
    [1, { from: sq(5, 1), to: sq(4, 2), promote: false }], [0, { from: sq(5, 5), to: sq(4, 5), promote: false }],
    [1, { from: sq(4, 2), to: sq(5, 1), promote: false }], [0, { from: sq(4, 5), to: sq(5, 5), promote: false }],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [seat, mv] of cycle) {
      assert.equal(s.over, false);
      s = E.applyMove(s, mv, seat);
      if (seat === 0) assert.equal(s.check, true, "先手の手は毎回王手");
    }
  }
  assert.equal(s.over, true);
  assert.equal(s.reason, "perpetual");
  assert.equal(s.winner, 1, "王手をかけ続けた先手の負け");
  assert.match(E.result(s).summary, /連続王手で後手の勝ち/);
});

test("投了: resign で over、相手の勝ち", () => {
  const s = E.initialState({}, []);
  const n = E.applyMove(s, { resign: true }, 0);
  assert.equal(n.over, true); assert.equal(n.resigned, 0); assert.equal(n.winner, 1); assert.equal(n.reason, "resign");
  assert.match(E.result(n).summary, /先手の投了/);
  assert.throws(() => E.applyMove(s, { from: sq(7, 7), to: sq(7, 6), promote: false }, 1), /手番/);
});

test("棋譜: ▲７六歩 形式（同・成・不成・打）", () => {
  let s = E.initialState({}, []);
  s = E.applyMove(s, { from: sq(7, 7), to: sq(7, 6), promote: false }, 0);
  s = E.applyMove(s, { from: sq(3, 3), to: sq(3, 4), promote: false }, 1);
  s = E.applyMove(s, { from: sq(8, 8), to: sq(2, 2), promote: false }, 0); // 不成
  s = E.applyMove(s, { from: sq(3, 1), to: sq(2, 2), promote: false }, 1);
  assert.deepEqual(s.kifu, ["▲７六歩", "△３四歩", "▲２二角不成", "△同　銀"]);
  const k = E.stateFromSfen("4k4/9/9/9/9/9/9/9/4K4 b G");
  const n = E.applyMove(k, { drop: E.KI, to: sq(5, 2) }, 0);
  assert.deepEqual(n.kifu, ["▲５二金打"]);
});

test("cpuMove: 2段階とも合法手を返し、自動対局が進む／詰みがあれば詰ます／タダの駒は取る", () => {
  const rng = rngOf(12345);
  for (const level of [1, 2]) {
    let s = E.initialState({ cpuLevel: level }, []);
    let guard = 0;
    while (!s.over && guard++ < 120) {
      const mv = E.cpuMove(s, s.turn, rng);
      assert.ok(mv, `level ${level}: 手を返す`);
      const legal = E.legalMoves(s, s.turn);
      assert.ok(legal.some((x) => (x.drop || 0) === (mv.drop || 0) && x.to === mv.to && (x.from ?? -1) === (mv.from ?? -1) && !!x.promote === !!mv.promote), `level ${level}: 合法手`);
      s = E.applyMove(s, mv, s.turn);
    }
    assert.ok(s.moves >= 20);
  }
  // 頭金の詰み
  const mate = E.stateFromSfen("4k4/9/4G4/9/9/9/9/9/4K4 b G", { cpuLevel: 2 });
  const m1 = E.cpuMove(mate, 0, rng);
  assert.deepEqual([m1.drop, m1.to], [E.KI, sq(5, 2)], "ふつう: ▲５二金打の詰みを選ぶ");
  const m0 = E.cpuMove({ ...mate, cpuLevel: 1 }, 0, rng);
  assert.deepEqual([m0.drop, m0.to], [E.KI, sq(5, 2)], "やさしい: 1手詰めは見逃さない");
  // タダの金を飛車で取る（放っておくと逃げられる。後手玉は１一で金はピンされていない）
  const free = E.stateFromSfen("8k/9/9/9/9/9/4g4/9/4R3K b -", { cpuLevel: 2 });
  const m2 = E.cpuMove(free, 0, rng);
  assert.deepEqual([m2.from, m2.to], [sq(5, 9), sq(5, 7)], "ふつう: タダの金を取る");
  // 手番でない／終局では null
  assert.equal(E.cpuMove(free, 1, rng), null);
  assert.equal(E.cpuMove({ ...free, over: true }, 0, rng), null);
});

test("cpuMove(ふつう): 持ち駒が多い中盤でも1手1.5秒以内", () => {
  const rng = rngOf(99);
  const s = E.stateFromSfen("ln1g1g1nl/1r2k2b1/p1sppps1p/2p3p2/9/2P3P2/P1SPPPS1P/1B2K2R1/LN1G1G1NL b GSNLPgsnlp", { cpuLevel: 2 });
  const t0 = Date.now();
  const mv = E.cpuMove(s, 0, rng);
  const dt = Date.now() - t0;
  assert.ok(mv, "手を返す");
  assert.ok(dt < 1500, `1.5秒以内 (${dt}ms)`);
});

test("オンライン（フェイクストア）: 部屋→開始→手番どおりに update が通り、CPU席は cpuMove で進む", async () => {
  const store = makeFakeStore();
  const O = globalThis.AsobibaOnline;
  let t = 1_700_000_000_000; const now = () => t;
  const A = O._create({ store, uid: "uid-A", now, slug: "shogi" });
  const B = O._create({ store, uid: "uid-B", now, slug: "shogi" });
  const code = await A.createRoom({ name: "あ", maxPlayers: 2, minPlayers: 2, settings: { cpuLevel: 1 }, initialState: null });
  await B.joinRoom(code, { name: "い" });
  await A.start(code, (r) => E.initialState(r.settings, r.players));
  const room0 = store.read(`shogi-${code}`);
  assert.equal(room0.status, "playing");
  assert.equal(room0.state.turn, 0);
  // B(後手) が先に指そうとしても何も起きない（手番でない）
  const tryMove = (client, move) => client.update(code, (r) => {
    const seat = r.players.find((p) => p.uid === client.uid()).seat;
    if (r.status !== "playing" || r.state.turn !== seat) return null;
    r.state = E.applyMove(r.state, move, seat);
    if (r.state.over) r.status = "ended";
    return r;
  });
  await tryMove(B, { from: sq(3, 3), to: sq(3, 4), promote: false });
  assert.equal(store.read(`shogi-${code}`).state.moves, 0);
  await tryMove(A, { from: sq(7, 7), to: sq(7, 6), promote: false });
  await tryMove(B, { from: sq(3, 3), to: sq(3, 4), promote: false });
  const r2 = store.read(`shogi-${code}`);
  assert.equal(r2.state.moves, 2);
  assert.deepEqual(r2.state.kifu, ["▲７六歩", "△３四歩"]);
  // B が抜ける → B の席は CPU。ホスト A が cpuMove で進める
  await B.leave(code);
  const r3 = store.read(`shogi-${code}`);
  assert.equal(r3.players.find((p) => p.seat === 1).cpu, true);
  await tryMove(A, { from: sq(2, 7), to: sq(2, 6), promote: false });
  await A.update(code, (r) => {
    const cp = r.players.find((p) => p.seat === r.state.turn);
    if (!cp || !cp.cpu || !A.isHost(r)) return null;
    const mv = E.cpuMove(r.state, r.state.turn, rngOf(5));
    r.state = E.applyMove(r.state, mv, r.state.turn);
    return r;
  });
  const r4 = store.read(`shogi-${code}`);
  assert.equal(r4.state.moves, 4);
  assert.equal(r4.state.turn, 0);
  assert.equal(r4.state.kifu.length, 4);
  // 投了 → ended
  await tryMove(A, { resign: true });
  const r5 = store.read(`shogi-${code}`);
  assert.equal(r5.status, "ended");
  assert.equal(r5.state.winner, 1);
});
