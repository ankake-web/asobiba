// オセロのルールエンジン単体テスト。games/othello/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/othello/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
// 同じレルムで評価する（別コンテキストだと配列の deepEqual がプロトタイプ違いで落ちる）
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");
const { EMPTY, BLACK, WHITE } = Engine;

// 盤面を文字で組む（. 空 / X 黒 / O 白）
function boardFrom(rows) {
  const s = rows.join("").replace(/\s+/g, "");
  assert.equal(s.length, 64);
  return [...s].map((ch) => (ch === "X" ? BLACK : ch === "O" ? WHITE : EMPTY));
}
function stateWith(board, turn = 0, extra = {}) {
  return { ...Engine.initialState({}, []), board, turn, ...extra };
}
const idx = (r, c) => r * 8 + c;

test("initialState: 中央4石・黒番・未終局・cpuLevel は settings から", () => {
  const s = Engine.initialState({ cpuLevel: 3 }, []);
  assert.equal(s.board.filter((v) => v !== EMPTY).length, 4);
  assert.equal(s.board[27], WHITE); assert.equal(s.board[28], BLACK);
  assert.equal(s.board[35], BLACK); assert.equal(s.board[36], WHITE);
  assert.equal(s.turn, 0);
  assert.equal(s.over, false);
  assert.equal(s.cpuLevel, 3);
  assert.equal(Engine.initialState({}, []).cpuLevel, 2);
});

test("legalMoves: 初期局面の黒は4手、手番でない席は空配列", () => {
  const s = Engine.initialState({}, []);
  const mv = Engine.legalMoves(s, 0).map((m) => m.idx).sort((a, b) => a - b);
  assert.deepEqual(mv, [19, 26, 37, 44]);
  assert.deepEqual(Engine.legalMoves(s, 1), []);
});

test("applyMove: 挟んだ石が全部返る（複数方向）・手番交代・lastMove/history", () => {
  const s = Engine.initialState({}, []);
  const n = Engine.applyMove(s, { idx: 19 }, 0); // d3
  assert.equal(n.board[19], BLACK);
  assert.equal(n.board[27], BLACK, "d4 が返る");
  assert.equal(n.turn, 1);
  assert.equal(n.moves, 1);
  assert.deepEqual(n.lastMove, { idx: 19, flips: [27], seat: 0 });
  assert.deepEqual(n.history, [19]);
  assert.equal(s.board[27], WHITE, "元の state は不変");
  // 複数方向同時に返る局面
  const b = boardFrom([
    "........",
    "........",
    "..OOO...",
    "..OXO...",
    "..OOO...",
    "..X.X...",
    "........",
    "........",
  ]);
  const st = stateWith(b, 0);
  const flips = Engine.flipsAt(b, idx(5, 3), BLACK);
  assert.deepEqual(flips.sort((a, b2) => a - b2), [idx(4, 3)]); // 真上の1枚だけ（斜めは挟めていない）
  const st2 = Engine.applyMove(st, { idx: idx(1, 3) }, 0); // 上から: 真下の O(2,3) を挟む
  assert.equal(st2.board[idx(2, 3)], BLACK);
});

test("applyMove: 非合法手・手番違い・終局後は例外", () => {
  const s = Engine.initialState({}, []);
  assert.throws(() => Engine.applyMove(s, { idx: 0 }, 0), /置けません/);
  assert.throws(() => Engine.applyMove(s, { idx: 19 }, 1), /手番/);
  const over = { ...s, over: true };
  assert.throws(() => Engine.applyMove(over, { idx: 19 }, 0), /終局/);
});

test("パス処理: 白が全滅する手は両者置けない＝即終局", () => {
  const b = boardFrom([
    "........",
    "........",
    "........",
    "...XO...",
    "........",
    "........",
    "........",
    "........",
  ]);
  const s = stateWith(b, 0);
  const n = Engine.applyMove(s, { idx: idx(3, 5) }, 0);
  assert.equal(n.board[idx(3, 4)], BLACK);
  assert.equal(n.over, true, "白の石がゼロ → 両者とも置けない → 終局");
  assert.equal(Engine.result(n).winner, 0);
});

test("パス処理（決定的な局面）: 白に合法手なし→黒続行(passed=1)、次の手で両者なし→終局", () => {
  // 左右の辺に黒の列。黒が (6,0) に置くと左辺の白2枚が返り、残る白は (4,7) と角 (7,7)。
  // 白はどこにも挟めない（辺の黒は外側が盤外）→ パス。黒は (5,7) で (4,7) を挟める → 続行。
  const b = boardFrom([
    "X......X",
    "X......X",
    "X......X",
    "X......X",
    "O......O",
    "O.......",
    "........",
    ".......O",
  ]);
  const s = stateWith(b, 0);
  const n = Engine.applyMove(s, { idx: idx(6, 0) }, 0);
  assert.equal(n.board[idx(5, 0)], BLACK);
  assert.equal(n.board[idx(4, 0)], BLACK);
  assert.equal(n.passed, 1, "白はパス");
  assert.equal(n.turn, 0, "黒が続けて打つ");
  assert.equal(n.over, false);
  assert.deepEqual(Engine.legalMoves(n, 1), [], "白は手番でないので空");
  assert.deepEqual(Engine.legalMoves(n, 0).map((m) => m.idx), [idx(5, 7)]);
  // 黒が (5,7) → 残る白は角 (7,7) の1枚。白も黒も挟めない → 終局（passed は付かない）
  const n2 = Engine.applyMove(n, { idx: idx(5, 7) }, 0);
  assert.equal(n2.over, true);
  assert.equal(n2.passed, null);
  assert.equal(Engine.result(n2).winner, 0);
  assert.deepEqual(Engine.result(n2).scores, [13, 1]);
});

test("終局: 盤が埋まる／両者打てない で over。result は石数・勝者・summary", () => {
  const full = new Array(64).fill(BLACK); full[0] = WHITE;
  // 最後の1マスを黒が埋める局面
  const b = full.slice(); b[63] = EMPTY; b[62] = WHITE; // (7,6)=O を (7,5)X と (7,7) で挟める
  const s = stateWith(b, 0);
  const n = Engine.applyMove(s, { idx: 63 }, 0);
  assert.equal(n.over, true);
  assert.ok(Engine.isOver(n));
  const r = Engine.result(n);
  assert.equal(r.winner, 0);
  assert.deepEqual(r.scores, [63, 1]);
  assert.match(r.summary, /黒の勝ち 63 – 1/);
  // 引き分け
  const draw = stateWith(boardFrom([
    "XXXXXXXX", "XXXXXXXX", "XXXXXXXX", "XXXXXXXX",
    "OOOOOOOO", "OOOOOOOO", "OOOOOOOO", "OOOOOOOO",
  ]), 0, { over: true });
  assert.equal(Engine.result(draw).winner, null);
  assert.match(Engine.result(draw).summary, /引き分け/);
});

test("投了: resign で over、相手の勝ち", () => {
  const s = Engine.initialState({}, []);
  const n = Engine.applyMove(s, { resign: true }, 0);
  assert.equal(n.over, true);
  assert.equal(n.resigned, 0);
  const r = Engine.result(n);
  assert.equal(r.winner, 1);
  assert.match(r.summary, /黒の投了/);
});

test("cpuMove: 3段階とも合法手を返す。強さ3は角を取れるなら取る", () => {
  const rng = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; }; })();
  for (const level of [1, 2, 3]) {
    let s = Engine.initialState({ cpuLevel: level }, []);
    let guard = 0;
    while (!s.over && guard++ < 70) {
      const mv = Engine.cpuMove(s, s.turn, rng);
      assert.ok(mv && Engine.flipsAt(s.board, mv.idx, Engine.colorOf(s.turn)).length > 0, `level ${level}: 合法手`);
      s = Engine.applyMove(s, mv, s.turn);
    }
    assert.ok(s.over, `level ${level}: 自動対局が終局まで進む`);
    const [b, w] = Engine.result(s).scores;
    assert.ok(b + w <= 64 && b + w >= 4);
  }
  // 角が取れる局面: (0,0) に黒が置ける
  const b = boardFrom([
    ".OX.....",
    "OO......",
    "X.......",
    "........",
    "........",
    "...XO...",
    "...OX...",
    "........",
  ]);
  const s3 = stateWith(b, 0, { cpuLevel: 3 });
  const mv = Engine.cpuMove(s3, 0, rng);
  assert.equal(mv.idx, 0, "強さ3は角を選ぶ");
  // 手番でない／終局では null
  assert.equal(Engine.cpuMove(s3, 1, rng), null);
});

test("cpuMove(強さ3): 終盤9マス以下は完全読み切り（時間内に返る）", () => {
  // 残り 8 マスのランダム局面を作る（合法になるまで試行）
  const rng = (() => { let a = 99; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; }; })();
  let s = Engine.initialState({ cpuLevel: 3 }, []);
  while (!s.over && s.board.filter((v) => v === EMPTY).length > 8) {
    const mv = Engine.cpuMove({ ...s, cpuLevel: 1 }, s.turn, rng);
    s = Engine.applyMove(s, mv, s.turn);
  }
  if (!s.over) {
    const t0 = Date.now();
    const mv = Engine.cpuMove(s, s.turn, rng);
    const dt = Date.now() - t0;
    assert.ok(mv, "手を返す");
    assert.ok(dt < 3000, `読み切りが3秒以内 (${dt}ms)`);
  }
});

test("publicView: 隠し情報が無いので state をそのまま返す", () => {
  const s = Engine.initialState({}, []);
  assert.equal(Engine.publicView(s, 0), s);
});
