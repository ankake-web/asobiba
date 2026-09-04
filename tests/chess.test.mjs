// チェスのルールエンジン単体テスト。games/chess/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
// 後半はフェイクストア（Firestore には一切つながない）で online.js と組み合わせた update / CPU駆動の確認。
//   実行: node --test tests/chess.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "../src/shared/online.js";
import { makeFakeStore } from "./fake-store.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/chess/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

const sq = Engine.sqIdx;
const st = (fen, extra = {}) => ({ ...Engine.initialState(fen ? { fen } : {}, []), ...extra });
const mv = (state, from, to, promo = "") => Engine.applyMove(state, { from: sq(from), to: sq(to), promo }, state.turn);
const legalTo = (state, from) => Engine.legalMoves(state, state.turn).filter((x) => x.from === sq(from)).map((x) => Engine.sqName(x.to)).sort();
const rngOf = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x80000000; }; };

test("initialState: 初期配置・白番・キャスリング権4つ・合法手20・cpuLevel", () => {
  const s = Engine.initialState({ cpuLevel: 1 }, []);
  assert.equal(s.board.filter(Boolean).length, 32);
  assert.equal(s.board[sq("e1")], "K"); assert.equal(s.board[sq("e8")], "k"); assert.equal(s.board[sq("a2")], "P");
  assert.equal(s.turn, 0);
  assert.deepEqual(s.castling, { K: true, Q: true, k: true, q: true });
  assert.equal(s.ep, -1);
  assert.equal(Engine.legalMoves(s, 0).length, 20);
  assert.deepEqual(Engine.legalMoves(s, 1), [], "手番でない席は空");
  assert.equal(s.cpuLevel, 1);
  assert.equal(Engine.initialState({}, []).cpuLevel, 2);
  assert.equal(Engine.fenOf(s), Engine.START_FEN);
});

test("applyMove: 手番違い・非合法・終局後は例外。元の state は不変", () => {
  const s = Engine.initialState({}, []);
  assert.throws(() => Engine.applyMove(s, { from: sq("e7"), to: sq("e5") }, 1), /手番/);
  assert.throws(() => Engine.applyMove(s, { from: sq("e2"), to: sq("e5") }, 0), /指せません/);
  const n = mv(s, "e2", "e4");
  assert.equal(s.board[sq("e2")], "P", "元は不変");
  assert.equal(n.board[sq("e4")], "P"); assert.equal(n.board[sq("e2")], "");
  assert.equal(n.turn, 1); assert.equal(n.moves, 1); assert.equal(n.ep, sq("e3"));
  assert.deepEqual(n.history, ["e4"]);
  assert.throws(() => Engine.applyMove({ ...n, over: true }, { from: sq("e7"), to: sq("e5") }, 1), /終局/);
});

test("キャスリング: 条件がそろえば両側可。適用でルークも動き、権利が消える", () => {
  const s = st("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.deepEqual(legalTo(s, "e1").filter((x) => x === "g1" || x === "c1"), ["c1", "g1"]);
  const n = mv(s, "e1", "g1");
  assert.equal(n.board[sq("g1")], "K"); assert.equal(n.board[sq("f1")], "R"); assert.equal(n.board[sq("h1")], ""); assert.equal(n.board[sq("e1")], "");
  assert.equal(n.castling.K, false); assert.equal(n.castling.Q, false);
  assert.equal(n.castling.k, true, "黒の権利は残る");
  assert.equal(n.history[0], "O-O");
  assert.equal(n.lastMove.castle, "K");
  const q = mv(s, "e1", "c1");
  assert.equal(q.board[sq("c1")], "K"); assert.equal(q.board[sq("d1")], "R"); assert.equal(q.board[sq("a1")], "");
  assert.equal(q.history[0], "O-O-O");
  // 黒も
  const b = mv(s, "a1", "a2");
  const bb = mv(b, "e8", "g8");
  assert.equal(bb.board[sq("g8")], "k"); assert.equal(bb.board[sq("f8")], "r");
});

test("キャスリング: 間に駒／チェック中／通過マスが攻撃／権利なし は不可。b1 の攻撃はクイーンサイドを妨げない", () => {
  // f1 にビショップ → キングサイド不可、クイーンサイド可
  const blocked = st("r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1");
  assert.ok(!legalTo(blocked, "e1").includes("g1")); assert.ok(legalTo(blocked, "e1").includes("c1"));
  // e4 の黒ルークでチェック中 → 両側不可
  const inCheck = st("r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1");
  assert.equal(inCheck.check, true);
  assert.ok(!legalTo(inCheck, "e1").includes("g1")); assert.ok(!legalTo(inCheck, "e1").includes("c1"));
  // f4 の黒ルークが f1 を攻撃 → キングサイド不可（通過マス）。クイーンサイドは可
  const pass = st("r3k2r/8/8/8/5r2/8/8/R3K2R w KQkq - 0 1");
  assert.ok(!legalTo(pass, "e1").includes("g1")); assert.ok(legalTo(pass, "e1").includes("c1"));
  // b4 の黒ルークが b1 を攻撃 → クイーンサイドは b1 を通らないので可
  const b1 = st("r3k2r/8/8/8/1r6/8/8/R3K2R w KQkq - 0 1");
  assert.ok(legalTo(b1, "e1").includes("c1")); assert.ok(legalTo(b1, "e1").includes("g1"));
  // 権利なし（FEN で -）
  const none = st("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1");
  assert.ok(!legalTo(none, "e1").includes("g1")); assert.ok(!legalTo(none, "e1").includes("c1"));
  // キングが動いて戻ると権利消失
  const s = st("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const s2 = mv(mv(mv(mv(s, "e1", "e2"), "a8", "b8"), "e2", "e1"), "b8", "a8");
  assert.equal(s2.castling.K, false); assert.equal(s2.castling.Q, false);
  assert.ok(!legalTo(s2, "e1").includes("g1"));
  // ルークが動くとその側だけ消失
  const r = mv(s, "h1", "h2");
  assert.equal(r.castling.K, false); assert.equal(r.castling.Q, true);
  // ルークが取られるとその側が消失（黒 h8 のルークを白ルークが取る。黒は a7 のポーンを動かして待つ）
  const sp = st("r3k2r/p7/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const cap = mv(mv(sp, "h1", "h7"), "a7", "a6");
  const cap2 = mv(cap, "h7", "h8");
  assert.equal(cap2.castling.k, false); assert.equal(cap2.castling.q, true);
});

test("アンパッサン: 直後だけ取れる。取ると相手ポーンが消える。1手挟むと消える", () => {
  let s = Engine.initialState({}, []);
  s = mv(s, "e2", "e4"); s = mv(s, "a7", "a6"); s = mv(s, "e4", "e5"); s = mv(s, "d7", "d5");
  assert.equal(s.ep, sq("d6"));
  assert.ok(legalTo(s, "e5").includes("d6"), "exd6 が合法");
  const n = mv(s, "e5", "d6");
  assert.equal(n.board[sq("d6")], "P"); assert.equal(n.board[sq("d5")], "", "取られたポーンが消える"); assert.equal(n.board[sq("e5")], "");
  assert.equal(n.lastMove.ep, true); assert.equal(n.lastMove.capture, "p");
  assert.equal(n.history.at(-1), "exd6");
  assert.deepEqual(n.captured.w, ["p"]);
  // 1手挟むと取れない
  const later = mv(mv(s, "a2", "a3"), "a6", "a5");
  assert.ok(!legalTo(later, "e5").includes("d6"));
  // 黒のアンパッサン
  let t = Engine.initialState({}, []);
  t = mv(t, "a2", "a3"); t = mv(t, "d7", "d5"); t = mv(t, "a3", "a4"); t = mv(t, "d5", "d4"); t = mv(t, "e2", "e4");
  assert.equal(t.ep, sq("e3"));
  const tn = mv(t, "d4", "e3");
  assert.equal(tn.board[sq("e3")], "p"); assert.equal(tn.board[sq("e4")], "");
});

test("プロモーション: 4種の手が出る。promo 無しは例外。適用で駒が変わる。取りながら昇格も", () => {
  const s = st("8/P7/8/8/8/8/8/k6K w - - 0 1");
  const ms = Engine.legalMoves(s, 0).filter((x) => x.from === sq("a7"));
  assert.deepEqual(ms.map((x) => x.promo).sort(), ["b", "n", "q", "r"]);
  assert.throws(() => Engine.applyMove(s, { from: sq("a7"), to: sq("a8") }, 0), /プロモーション/);
  const q = mv(s, "a7", "a8", "q");
  assert.equal(q.board[sq("a8")], "Q");
  assert.match(q.history[0], /^a8=Q\+$/, "a筋でチェックになる");
  assert.equal(q.check, true);
  const n = mv(s, "a7", "a8", "n");
  assert.equal(n.board[sq("a8")], "N"); assert.equal(n.history[0], "a8=N");
  // 取りながら昇格
  const c = st("1n6/P7/8/8/8/8/8/k6K w - - 0 1");
  const cn = mv(c, "a7", "b8", "r");
  assert.equal(cn.board[sq("b8")], "R"); assert.equal(cn.history[0], "axb8=R");
  assert.deepEqual(cn.captured.w, ["n"]);
  // 黒の昇格
  const bl = st("k6K/8/8/8/8/8/p7/8 b - - 0 1");
  const bq = mv(bl, "a2", "a1", "q");
  assert.equal(bq.board[sq("a1")], "q");
});

test("チェック回避: チェック中はキングを守る手だけ。自殺手（ピン駒の移動）は出ない", () => {
  // 黒ルーク a1 がキング e1 をチェック。h1 のルークは間に入れない → キングが動く3手だけ
  const s = st("4k3/8/8/8/8/8/8/r3K2R w K - 0 1");
  assert.equal(s.check, true);
  const ms = Engine.legalMoves(s, 0);
  assert.deepEqual(ms.map((x) => Engine.sqName(x.from) + Engine.sqName(x.to)).sort(), ["e1d2", "e1e2", "e1f2"]);
  // ピン: e2 のビショップは e8 のルークに対してピンされているので動けない
  const pin = st("4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1");
  assert.deepEqual(legalTo(pin, "e2"), []);
  // ブロックで防げる局面
  const block = st("4k3/8/8/8/8/8/1R6/r3K3 w - - 0 1");
  assert.ok(legalTo(block, "b2").includes("b1"), "Rb1 でブロック");
  assert.ok(!legalTo(block, "b2").includes("b3"), "チェックを放置する手は不可");
});

test("チェックメイト: フールズメイト → 黒の勝ち、SAN に #", () => {
  let s = Engine.initialState({}, []);
  s = mv(s, "f2", "f3"); s = mv(s, "e7", "e5"); s = mv(s, "g2", "g4");
  assert.equal(s.over, false);
  s = mv(s, "d8", "h4");
  assert.equal(s.over, true);
  assert.ok(Engine.isOver(s));
  assert.equal(s.check, true);
  assert.deepEqual(s.result, { winner: 1, reason: "checkmate" });
  assert.equal(s.history.at(-1), "Qh4#");
  const r = Engine.result(s);
  assert.equal(r.winner, 1);
  assert.match(r.summary, /黒の勝ち — チェックメイト/);
  assert.deepEqual(Engine.legalMoves(s, 0), []);
});

test("ステイルメイト: 動けないがチェックでない → 引き分け", () => {
  const s = st("7k/8/5QK1/8/8/8/8/8 w - - 0 1");
  const n = mv(s, "f6", "f7");
  assert.equal(n.over, true);
  assert.equal(n.check, false);
  assert.deepEqual(n.result, { winner: null, reason: "stalemate" });
  assert.match(Engine.result(n).summary, /引き分け — ステイルメイト/);
});

test("3回同形: ナイトの往復で同じ局面が3回 → 引き分け", () => {
  let s = Engine.initialState({}, []);
  const cyc = (x) => mv(mv(mv(mv(x, "g1", "f3"), "g8", "f6"), "f3", "g1"), "f6", "g8");
  s = cyc(s);
  assert.equal(s.over, false, "2回目はまだ");
  s = mv(mv(mv(s, "g1", "f3"), "g8", "f6"), "f3", "g1");
  assert.equal(s.over, false);
  s = mv(s, "f6", "g8");
  assert.equal(s.over, true, "3回目で終局");
  assert.deepEqual(s.result, { winner: null, reason: "threefold" });
  // キャスリング権が違えば別局面（キングが動いて戻った後は同形にならない）
  const a = st("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const b = mv(mv(mv(mv(a, "e1", "e2"), "e8", "e7"), "e2", "e1"), "e7", "e8");
  assert.notEqual(Engine.posKey(a), Engine.posKey(b));
});

test("50手ルール: ポーンも動かず駒も取らずに100手（半手）で引き分け。ポーン/取りでリセット", () => {
  const s = st("4k3/8/8/8/8/8/8/4K2R w - - 99 80");
  const n = mv(s, "h1", "h2");
  assert.equal(n.halfmove, 100);
  assert.equal(n.over, true);
  assert.deepEqual(n.result, { winner: null, reason: "fifty" });
  const p = st("4k3/8/8/8/8/8/P7/4K2R w - - 99 80");
  const pn = mv(p, "a2", "a3");
  assert.equal(pn.halfmove, 0); assert.equal(pn.over, false);
});

test("駒不足: K vs K / K+B vs K / K+N vs K / 同色ビショップ同士は引き分け。ルークが残れば続行", () => {
  const s = st("4k3/8/8/8/8/8/3p4/3K4 w - - 0 1");
  const n = mv(s, "d1", "d2");
  assert.equal(n.over, true); assert.deepEqual(n.result, { winner: null, reason: "material" });
  assert.equal(Engine.insufficient(Engine.parseFen("4k3/8/8/8/8/8/8/4KB2 w - - 0 1").board), true);
  assert.equal(Engine.insufficient(Engine.parseFen("4k3/8/8/8/8/8/8/4KN2 w - - 0 1").board), true);
  assert.equal(Engine.insufficient(Engine.parseFen("4kb2/8/8/8/8/8/8/4K1B1 w - - 0 1").board), true, "f8(黒マス) と g1(黒マス) は同色");
  assert.equal(Engine.insufficient(Engine.parseFen("4kb2/8/8/8/8/8/8/4KB2 w - - 0 1").board), false, "f8 と f1 は異色");
  assert.equal(Engine.insufficient(Engine.parseFen("4k3/8/8/8/8/8/8/4KR2 w - - 0 1").board), false);
  assert.equal(Engine.insufficient(Engine.parseFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1").board), false);
});

test("投了: resign で over、相手の勝ち", () => {
  const s = Engine.initialState({}, []);
  const n = Engine.applyMove(s, { resign: true }, 0);
  assert.equal(n.over, true); assert.equal(n.resigned, 0);
  const r = Engine.result(n);
  assert.equal(r.winner, 1); assert.equal(r.reason, "resign");
  assert.match(r.summary, /黒の勝ち — 投了/);
});

test("SAN: 駒文字・x・曖昧性解消（筋/段）・チェック記号", () => {
  const s = st("k7/8/8/8/8/8/4K3/R6R w - - 0 1");
  const n = mv(s, "a1", "d1");
  assert.equal(n.history[0], "Rad1");
  const blockedByKing = st("k7/8/8/8/8/8/8/R3K2R w - - 0 1"); // h1 のルークはキングに遮られて d1 に行けない → 曖昧性なし
  assert.equal(mv(blockedByKing, "a1", "d1").history[0], "Rd1");
  const t = st("7k/8/8/R7/8/8/8/R3K3 w - - 0 1"); // a1 と a5 の両方が a3 に行ける → 段で区別
  assert.equal(mv(t, "a1", "a3").history[0], "R1a3");
  const cap = st("k7/8/8/3p4/8/4N3/8/4K3 w - - 0 1");
  assert.equal(mv(cap, "e3", "d5").history[0], "Nxd5");
  const chk = st("k7/8/8/8/8/8/8/R3K3 w - - 0 1");
  assert.equal(mv(chk, "a1", "a7").history[0], "Ra7+");
  let o = Engine.initialState({}, []);
  o = mv(o, "e2", "e4"); o = mv(o, "d7", "d5"); o = mv(o, "e4", "d5");
  assert.deepEqual(o.history, ["e4", "d5", "exd5"]);
});

test("cpuMove: 2段階とも合法手を返し自動対局が進む。ふつうは1手詰めを逃さない。時間内", () => {
  for (const level of [1, 2]) {
    const rng = rngOf(42 + level);
    let s = Engine.initialState({ cpuLevel: level }, []);
    let guard = 0;
    const t0 = Date.now();
    while (!s.over && guard++ < 60) {
      const m2 = Engine.cpuMove(s, s.turn, rng);
      assert.ok(m2, "手を返す");
      const ok = Engine.legalMoves(s, s.turn).some((x) => x.from === m2.from && x.to === m2.to && x.promo === (m2.promo || ""));
      assert.ok(ok, `level ${level}: 合法手`);
      s = Engine.applyMove(s, m2, s.turn);
    }
    const dt = Date.now() - t0;
    assert.ok(dt < 20000, `level ${level}: 60手が20秒以内 (${dt}ms)`);
    assert.ok(s.over || s.moves === 60, "手数が進む");
  }
  // 1手詰め: Ra8#
  const mate = st("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", { cpuLevel: 2 });
  const pick = Engine.cpuMove(mate, 0, rngOf(7));
  assert.equal(Engine.sqName(pick.from) + Engine.sqName(pick.to), "a1a8");
  // タダ取り: ふつうは守られていないクイーンを取る
  const free = st("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1", { cpuLevel: 2 });
  const p2 = Engine.cpuMove(free, 0, rngOf(3));
  assert.equal(Engine.sqName(p2.to), "d5");
  // 昇格は promo 付きで返す
  const pr = st("8/P7/8/8/8/8/8/k6K w - - 0 1", { cpuLevel: 2 });
  const p3 = Engine.cpuMove(pr, 0, rngOf(5));
  assert.ok(p3.promo, "promo が付く");
  // 手番でない／終局では null
  assert.equal(Engine.cpuMove(mate, 1, rngOf(1)), null);
  assert.equal(Engine.cpuMove({ ...mate, over: true }, 0, rngOf(1)), null);
});

test("state は Firestore に入る形（undefined 無し・配列の中に配列が無い・JSON往復で同値）", () => {
  let s = Engine.initialState({}, []);
  s = mv(s, "e2", "e4"); s = mv(s, "e7", "e5"); s = mv(s, "g1", "f3");
  const walk = (v, path) => {
    assert.notEqual(v, undefined, `undefined at ${path}`);
    if (Array.isArray(v)) v.forEach((x, i) => { assert.ok(!Array.isArray(x), `nested array at ${path}[${i}]`); walk(x, `${path}[${i}]`); });
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
  };
  walk(s, "state");
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(Engine.publicView(s, 0), s);
});

/* ---------- online.js（フェイクストア）× Engine: 部屋作成→CPU追加→開始→update で手が進む ---------- */
const O = globalThis.AsobibaOnline;
const SLUG = "chess";
const clock = (start = 1_700_000_000_000) => { let t = start; const f = () => t; f.advance = (ms) => { t += ms; }; return f; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test("online: ホストが部屋を作り CPU を入れて開始 → ホストが cpuMove で update → 両者の手が進む", async () => {
  const store = makeFakeStore();
  const now = clock();
  const A = O._create({ store, uid: "uid-A", now, slug: SLUG });
  const code = await A.createRoom({ name: "あ", maxPlayers: 2, minPlayers: 2, settings: { cpuLevel: 1 }, initialState: null });
  await A.addCpu(code, { name: "CPU" });
  await A.start(code, (r) => Engine.initialState(r.settings || {}, r.players));
  let room = store.read(`${SLUG}-${code}`);
  assert.equal(room.status, "playing");
  assert.equal(room.state.turn, 0);
  assert.equal(room.state.cpuLevel, 1);
  // 白(seat0=ホスト人間)が e4
  await A.update(code, (r) => { r.state = Engine.applyMove(r.state, { from: sq("e2"), to: sq("e4"), promo: "" }, 0); return r; });
  room = store.read(`${SLUG}-${code}`);
  assert.equal(room.state.moves, 1);
  assert.equal(room.players.find((p) => p.seat === 1).cpu, true);
  // ホストが CPU 席（黒）の手を計算して update（index.html の Online.maybeDriveCpu と同じ手順）
  await A.update(code, (r) => {
    const cp = r.players.find((p) => p.seat === r.state.turn);
    assert.ok(cp.cpu);
    const m2 = Engine.cpuMove(r.state, r.state.turn, rngOf(9));
    r.state = Engine.applyMove(r.state, m2, r.state.turn);
    return r;
  });
  room = store.read(`${SLUG}-${code}`);
  assert.equal(room.state.moves, 2);
  assert.equal(room.state.turn, 0);
  assert.equal(room.version, 4);
});

test("online: 2人が参加して交互に指す。手番でない人の update は null（書かない）。投了で ended", async () => {
  const store = makeFakeStore();
  const now = clock();
  const A = O._create({ store, uid: "uid-A", now, slug: SLUG });
  const B = O._create({ store, uid: "uid-B", now, slug: SLUG });
  const code = await A.createRoom({ name: "A", settings: { cpuLevel: 2 } });
  await B.joinRoom(code, { name: "B" });
  await A.start(code, (r) => Engine.initialState(r.settings || {}, r.players));
  const seen = [];
  const unsub = B.subscribe(code, (r) => { if (r) seen.push(r.version); }); // heartbeat の setInterval が立つので finally で必ず解除
  try {
    const moveAs = (cli, uid, from, to) => cli.update(code, (r) => {
      const seat = r.players.find((p) => p.uid === uid).seat;
      if (r.state.turn !== seat) return null;
      r.state = Engine.applyMove(r.state, { from: sq(from), to: sq(to), promo: "" }, seat);
      if (r.state.over) r.status = "ended";
      return r;
    });
    const v0 = store.read(`${SLUG}-${code}`).version;
    await moveAs(B, "uid-B", "e7", "e5"); // 黒の手番ではない → 書かない
    assert.equal(store.read(`${SLUG}-${code}`).version, v0);
    await moveAs(A, "uid-A", "e2", "e4");
    await moveAs(B, "uid-B", "e7", "e5");
    await tick();
    const room = store.read(`${SLUG}-${code}`);
    assert.deepEqual(room.state.history, ["e4", "e5"]);
    assert.ok(seen.length >= 2, "購読者に更新が届く");
    // 投了は手番に関係なく（白番の最中に黒が投了）
    await B.update(code, (r) => { r.state = Engine.applyMove(r.state, { resign: true }, 1); if (r.state.over) r.status = "ended"; return r; });
    const end = store.read(`${SLUG}-${code}`);
    assert.equal(end.status, "ended");
    assert.equal(Engine.result(end.state).winner, 0);
    assert.equal(Engine.result(end.state).reason, "resign");
  } finally { unsub(); }
});
