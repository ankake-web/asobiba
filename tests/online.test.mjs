// online.js の単体テスト（Firestore には一切つながない。インメモリのフェイクで検証）
//   実行: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/shared/online.js";
import { makeFakeStore } from "./fake-store.mjs";

const O = globalThis.AsobibaOnline;
const SLUG = "reversi";

// 仮想時計（ホスト引き継ぎの60秒判定に使う）
function clock(start = 1_700_000_000_000) { let t = start; const f = () => t; f.advance = (ms) => { t += ms; }; return f; }
function pair(store, now) {
  const A = O._create({ store, uid: "uid-A", now, slug: SLUG });
  const B = O._create({ store, uid: "uid-B", now, slug: SLUG });
  const C = O._create({ store, uid: "uid-C", now, slug: SLUG });
  return { A, B, C };
}
async function rejects(p, re) {
  let caught = null;
  try { await p; } catch (e) { caught = e; }
  assert.ok(caught, "should throw");
  assert.match(caught.message, re);
  return caught;
}

test("createRoom: 4桁コード・docId=slug-code・自分が seat0/host・Room の形", async () => {
  const store = makeFakeStore();
  const { A } = pair(store, clock());
  const code = await A.createRoom({ name: "あ", maxPlayers: 2, minPlayers: 2, settings: { level: 2 }, initialState: null });
  assert.match(code, /^\d{4}$/);
  const room = store.read(`${SLUG}-${code}`);
  assert.ok(room, "doc exists");
  assert.equal(room.slug, SLUG);
  assert.equal(room.code, code);
  assert.equal(room.hostUid, "uid-A");
  assert.equal(room.status, "lobby");
  assert.deepEqual(room.players.map((p) => [p.uid, p.seat, p.cpu]), [["uid-A", 0, false]]);
  assert.equal(room.version, 0);
  assert.equal(typeof room.seed, "number");
  assert.deepEqual(room.settings, { level: 2 });
  assert.ok(A.isHost(room));
});

test("createRoom: 使用中コードは取り直す", async () => {
  const store = makeFakeStore();
  const { A } = pair(store, clock());
  const realRandom = Math.random;
  // 最初の2回は同じコード(1234)になるよう乱数を固定 → 2部屋目は別コードになる
  let calls = 0;
  Math.random = () => { calls++; return calls <= 4 ? 0.026 : realRandom(); }; // 1000+0.026*9000=1234
  try {
    const c1 = await A.createRoom({ name: "a" });
    const c2 = await A.createRoom({ name: "a" });
    assert.equal(c1, "1234");
    assert.notEqual(c2, c1);
  } finally { Math.random = realRandom; }
});

test("joinRoom: 参加・満席・不在・開始済み・別ゲーム・再入室", async () => {
  const store = makeFakeStore();
  const { A, B, C } = pair(store, clock());
  const code = await A.createRoom({ name: "A", maxPlayers: 2 });
  const r1 = await B.joinRoom(code, { name: "B" });
  assert.deepEqual(r1.players.map((p) => [p.uid, p.seat]), [["uid-A", 0], ["uid-B", 1]]);
  assert.equal(r1.version, 1);
  await rejects(C.joinRoom(code, { name: "C" }), /満席/);
  await rejects(C.joinRoom("0000", { name: "C" }), /見つかりません/);
  await rejects(C.joinRoom("12", { name: "C" }), /4桁/);
  // docId は slug 接頭辞付きなので別ゲームの部屋は通常見えない。中身の slug が食い違う壊れたdocだけ弾く
  store.docs.set(`${SLUG}-5555`, { data: { ...store.read(`${SLUG}-${code}`), slug: "shogi", code: "5555" }, rev: 1 });
  await rejects(C.joinRoom("5555", { name: "C" }), /別のゲーム/);
  // 開始後は新規参加不可、既存メンバーの再入室は可
  await A.start(code, () => ({ n: 0 }));
  await rejects(C.joinRoom(code, { name: "C" }), /始まっています/);
  const again = await B.joinRoom(code, { name: "B2" });
  assert.equal(again.status, "playing");
  assert.equal(again.players.find((p) => p.uid === "uid-B").name, "B2");
});

test("start: ホスト限定・人数不足・state 生成", async () => {
  const store = makeFakeStore();
  const { A, B } = pair(store, clock());
  const code = await A.createRoom({ name: "A", maxPlayers: 2, minPlayers: 2 });
  await rejects(A.start(code, () => ({})), /人数が足りません/);
  await B.joinRoom(code, { name: "B" });
  await rejects(B.start(code, () => ({})), /ホストだけ/);
  const room = await A.start(code, (r) => ({ first: r.players[0].uid }));
  assert.equal(room.status, "playing");
  assert.deepEqual(room.state, { first: "uid-A" });
  await rejects(A.start(code, () => ({})), /すでに始まっています/);
});

test("addCpu / removeCpu: ホスト限定・ロビー限定・空き席へ", async () => {
  const store = makeFakeStore();
  const { A, B } = pair(store, clock());
  const code = await A.createRoom({ name: "A", maxPlayers: 3 });
  await B.joinRoom(code, { name: "B" });
  await rejects(B.addCpu(code, {}), /ホストだけ/);
  const r = await A.addCpu(code, { name: "機械" });
  const cpu = r.players.find((p) => p.cpu);
  assert.ok(cpu && /^cpu-/.test(cpu.uid) && cpu.seat === 2 && cpu.name === "機械");
  await rejects(A.addCpu(code, {}), /満席/);
  const r2 = await A.removeCpu(code, cpu.uid);
  assert.equal(r2.players.length, 2);
  // 抜けた seat は再利用される
  const r3 = await A.addCpu(code, {});
  assert.equal(r3.players.find((p) => p.cpu).seat, 2);
  await A.start(code, () => ({}));
  await rejects(A.addCpu(code, {}), /開始後/);
});

test("update: 純粋関数で version+1、null なら書かない、競合は再試行して両方の変更が残る", async () => {
  const store = makeFakeStore();
  const { A, B } = pair(store, clock());
  const code = await A.createRoom({ name: "A" });
  await B.joinRoom(code, { name: "B" });
  await A.start(code, () => ({ n: 0, m: 0 }));
  const id = `${SLUG}-${code}`;
  const v0 = store.read(id).version;
  const writes0 = store.writes;
  const same = await A.update(code, () => null);
  assert.equal(store.writes, writes0, "null なら書かない");
  assert.equal(same.version, v0);

  // A の update の書き込み直前に B が割り込んで m を増やす → A は再試行し、n も m も反映される
  store.beforeCommit = async () => { await B.update(code, (r) => { r.state.m += 1; return r; }); };
  const out = await A.update(code, (r) => { r.state.n += 1; return r; });
  assert.deepEqual(out.state, { n: 1, m: 1 });
  assert.equal(out.version, v0 + 2);
  assert.deepEqual(store.read(id).state, { n: 1, m: 1 });
});

test("update: 自分の lastSeen も更新される（update は heartbeat を兼ねる）", async () => {
  const store = makeFakeStore();
  const now = clock();
  const { A, B } = pair(store, now);
  const code = await A.createRoom({ name: "A" });
  await B.joinRoom(code, { name: "B" });
  now.advance(30_000);
  const r = await B.update(code, (x) => { x.settings.k = 1; return x; });
  assert.equal(r.players.find((p) => p.uid === "uid-B").lastSeen, now());
});

test("heartbeat: lastSeen だけ更新して version は進めない。参加者でなければ書かない", async () => {
  const store = makeFakeStore();
  const now = clock();
  const { A, C } = pair(store, now);
  const code = await A.createRoom({ name: "A" });
  const id = `${SLUG}-${code}`;
  now.advance(5000);
  const before = store.read(id);
  await A.heartbeat(code);
  const after = store.read(id);
  assert.equal(after.version, before.version);
  assert.equal(after.players[0].lastSeen, now());
  const w = store.writes;
  await C.heartbeat(code); // 参加していない
  assert.equal(store.writes, w);
});

test("ホスト引き継ぎ: ホストが60秒無反応なら、生存する最小seatが update/heartbeat の中で host を継ぐ", async () => {
  const store = makeFakeStore();
  const now = clock();
  const { A, B, C } = pair(store, now);
  const code = await A.createRoom({ name: "A", maxPlayers: 3 });
  await B.joinRoom(code, { name: "B" });
  await C.joinRoom(code, { name: "C" });
  now.advance(30_000);
  await B.heartbeat(code); // B は生存
  await C.heartbeat(code);
  now.advance(31_000);     // A は 61 秒無反応、B/C は 31 秒
  assert.ok(A.isAway(store.read(`${SLUG}-${code}`).players[0]));
  const r = await C.heartbeat(code);   // C の heartbeat でも判定される
  assert.equal(r.hostUid, "uid-B", "生存している最小seat(B)がホスト");
  assert.ok(B.isHost(r));
  // 旧ホスト A が戻ってきても host は B のまま（奪い返さない）
  const r2 = await A.update(code, (x) => { x.settings.z = 1; return x; });
  assert.equal(r2.hostUid, "uid-B");
});

test("leave: 対局中は cpu:true に差し替え＋ホスト移譲、ロビーでは席から外す", async () => {
  const store = makeFakeStore();
  const now = clock();
  const { A, B, C } = pair(store, now);
  const code = await A.createRoom({ name: "A", maxPlayers: 3 });
  await B.joinRoom(code, { name: "B" });
  await C.joinRoom(code, { name: "C" });
  // ロビーで C が抜ける → 席が消える
  await C.leave(code);
  let r = store.read(`${SLUG}-${code}`);
  assert.deepEqual(r.players.map((p) => p.uid), ["uid-A", "uid-B"]);
  // 対局中にホスト A が抜ける → A の席は cpu:true で残り、ホストは B
  await A.start(code, () => ({ turn: 0 }));
  await A.leave(code);
  r = store.read(`${SLUG}-${code}`);
  assert.equal(r.status, "playing");
  const a = r.players.find((p) => p.uid === "uid-A");
  assert.equal(a.cpu, true);
  assert.equal(a.seat, 0);
  assert.equal(r.hostUid, "uid-B");
  // 戻ってきたら人間に復帰
  const back = await A.joinRoom(code, { name: "A" });
  assert.equal(back.players.find((p) => p.uid === "uid-A").cpu, false);
});

test("subscribe: 最初に現在の room が届き、更新のたびに届く。unsub で止まる", async () => {
  const store = makeFakeStore();
  const { A, B } = pair(store, clock());
  const code = await A.createRoom({ name: "A" });
  const seen = [];
  const unsub = A.subscribe(code, (room) => seen.push(room && room.version));
  await new Promise((r) => setTimeout(r, 5));
  await B.joinRoom(code, { name: "B" });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(seen.length >= 2, "initial + join");
  assert.equal(seen[seen.length - 1], 1);
  unsub();
  await A.update(code, (r) => { r.settings.x = 1; return r; });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(!seen.includes(2), "unsub 後は届かない");
  unsub(); // 二重呼び出しも安全
});

test("エラーメッセージは日本語・code 付き（permission-denied / ネットワーク）", async () => {
  const store = makeFakeStore();
  const { A } = pair(store, clock());
  const code = await A.createRoom({ name: "A" });
  const bad = { ...store, tx() { const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; throw e; } };
  const X = O._create({ store: bad, uid: "uid-X", slug: SLUG });
  const e1 = await rejects(X.update(code, (r) => r), /オンライン対戦の準備ができていません/);
  assert.equal(e1.code, "permission-denied");
  const net = { ...store, tx() { throw new TypeError("Failed to fetch dynamically imported module"); } };
  const Y = O._create({ store: net, uid: "uid-Y", slug: SLUG });
  await rejects(Y.update(code, (r) => r), /ネットワークに接続できません/);
});

test("既定インスタンス: _useStore でフェイクに差し替えれば init() は Firebase を読まずに解決する", async () => {
  const store = makeFakeStore();
  O._useStore(store, { uid: "uid-D", slug: SLUG });
  await O.init({ slug: SLUG });
  assert.equal(O.uid(), "uid-D");
  const code = await O.createRoom({ name: "D" });
  assert.equal(store.read(`${SLUG}-${code}`).hostUid, "uid-D");
  assert.equal(O.shareUrl(code), "#" + code); // Node には location が無い
});
