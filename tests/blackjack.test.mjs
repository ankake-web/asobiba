// ブラックジャックのルールエンジン単体テスト。games/blackjack/index.html の
// /* @engine-begin */ 〜 /* @engine-end */ を切り出して node の vm で評価する（1ファイル自己完結を崩さない）。
//   実行: node --test tests/blackjack.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../games/blackjack/index.html"), "utf8");
const m = /\/\* @engine-begin \*\/([\s\S]*?)\/\* @engine-end \*\//.exec(html);
assert.ok(m, "engine block marker not found");
const Engine = vm.runInThisContext("(() => {" + m[1] + "\n;return Engine; })()");

// 札の省略記法: "AS" "10H" "KD" "7C"
const C = (s) => { const suit = s.slice(-1); const r = s.slice(0, -1); const map = { A: 1, J: 11, Q: 12, K: 13 }; return { r: map[r] || Number(r), s: suit }; };
const cards = (...xs) => xs.map(C);
// 1人テーブル。shoe を好きな並びにして配る（先頭から draw される）。配り順: P1 → D1 → P2 → D2(伏せ)
function table(players = 1, chips = 1000) {
  return Engine.initialState({ seed: 7 }, Array.from({ length: players }, (_, i) => ({ seat: i, name: "p" + i, chips })));
}
function dealWith(shoeCards, { bet = 100, players = 1, chips = 1000, bets = null } = {}) {
  let s = table(players, chips);
  s.shoe = [...cards(...shoeCards), ...s.shoe]; // 先頭に仕込む
  for (let i = 0; i < players; i++) s = Engine.applyMove(s, { type: "bet", amount: bets ? bets[i] : bet }, i);
  return s;
}
const hand = (s, seat = 0, i = 0) => Engine.playerAt(s, seat).hands[i];

test("handValue: ハード/ソフトの合計。A は 11 か 1 の都合のいい方", () => {
  assert.deepEqual(Engine.handValue(cards("AS", "6H")), { total: 17, soft: true });
  assert.deepEqual(Engine.handValue(cards("AS", "6H", "10C")), { total: 17, soft: false });
  assert.deepEqual(Engine.handValue(cards("AS", "AD")), { total: 12, soft: true });
  assert.deepEqual(Engine.handValue(cards("AS", "AD", "9C")), { total: 21, soft: true });
  assert.deepEqual(Engine.handValue(cards("KS", "QD")), { total: 20, soft: false });
  assert.deepEqual(Engine.handValue(cards("KS", "QD", "5C")), { total: 25, soft: false });
  assert.deepEqual(Engine.handValue([]), { total: 0, soft: false });
});

test("isBlackjack: 最初の2枚で21 だけ。スプリット後の A+10 は BJ ではない", () => {
  assert.equal(Engine.isBlackjack({ cards: cards("AS", "KD"), fromSplit: false }), true);
  assert.equal(Engine.isBlackjack({ cards: cards("AS", "KD"), fromSplit: true }), false);
  assert.equal(Engine.isBlackjack({ cards: cards("7S", "7D", "7C"), fromSplit: false }), false);
  assert.equal(Engine.isBlackjack({ cards: cards("10S", "9D"), fromSplit: false }), false);
});

test("initialState: 6デッキ312枚・phase=bet・席順・チップ。seed で同じ山札", () => {
  const s = table(2, 500);
  assert.equal(s.shoe.length, Engine.SHOE_SIZE);
  assert.equal(s.shoe.length, 312);
  assert.equal(s.phase, "bet");
  assert.deepEqual(s.players.map((p) => [p.seat, p.chips, p.ready]), [[0, 500, false], [1, 500, false]]);
  assert.deepEqual(table(1).shoe.slice(0, 5), table(1).shoe.slice(0, 5), "同じ seed → 同じ並び");
  assert.notDeepEqual(Engine.initialState({ seed: 8 }, [{ seat: 0 }]).shoe.slice(0, 10), table(1).shoe.slice(0, 10));
  // 312枚の内訳: 各ランク 24 枚
  const cnt = {}; for (const c of s.shoe) cnt[c.r] = (cnt[c.r] || 0) + 1;
  for (let r = 1; r <= 13; r++) assert.equal(cnt[r], 24);
});

test("bet: チップ減算・全員そろうと配る（2枚ずつ）・不正ベットは例外・0は見送り", () => {
  let s = table(1);
  assert.throws(() => Engine.applyMove(s, { type: "bet", amount: 5 }, 0), /最低ベット/);
  assert.throws(() => Engine.applyMove(s, { type: "bet", amount: 5000 }, 0), /足りません/);
  assert.throws(() => Engine.applyMove(s, { type: "hit" }, 0), /操作できません/);
  s = Engine.applyMove(s, { type: "bet", amount: 100 }, 0);
  assert.equal(s.phase, "play");
  assert.equal(Engine.playerAt(s, 0).chips, 900);
  assert.equal(hand(s).cards.length, 2);
  assert.equal(s.dealer.cards.length, 2);
  assert.equal(s.shoe.length, 312 - 4);
  assert.equal(s.turn, 0);
  // 元の state は不変
  const s0 = table(1);
  Engine.applyMove(s0, { type: "bet", amount: 100 }, 0);
  assert.equal(s0.phase, "bet"); assert.equal(s0.shoe.length, 312);
  // 見送り（全員）→ ベットからやり直し
  let t = table(1);
  t = Engine.applyMove(t, { type: "bet", amount: 0 }, 0);
  assert.equal(t.phase, "bet"); assert.equal(Engine.playerAt(t, 0).ready, false);
  // チップ未設定（オンラインの初回）は move.chips から
  let u = Engine.initialState({ seed: 1 }, [{ seat: 0, name: "x" }]);
  assert.equal(Engine.playerAt(u, 0).chips, null);
  assert.throws(() => Engine.applyMove(u, { type: "bet", amount: 50 }, 0), /未設定/);
  u = Engine.applyMove(u, { type: "bet", amount: 50, chips: 300 }, 0);
  assert.equal(Engine.playerAt(u, 0).chips, 250);
});

test("publicView: プレイ中はディーラーの2枚目を伏せ、山札は枚数だけ。精算後は見える", () => {
  let s = dealWith(["5S", "9H", "6D", "KC"]); // P:5,6 / D:9,K
  const v = Engine.publicView(s, 0);
  assert.equal(v.holeHidden, true);
  assert.deepEqual(v.dealer.cards[0], C("9H"));
  assert.deepEqual(v.dealer.cards[1], { hidden: true });
  assert.equal(v.shoe.length, 0);
  assert.equal(v.shoeLeft, s.shoe.length);
  assert.deepEqual(s.dealer.cards[1], C("KC"), "元の state は伏せていない");
  s = Engine.applyMove(s, { type: "stand" }, 0);
  assert.equal(s.phase, "settle");
  assert.deepEqual(Engine.publicView(s, 0).dealer.cards[1], C("KC"));
});

test("hit/stand/bust: 21 を超えるとバースト（即 done）。21 ちょうどは自動スタンド", () => {
  let s = dealWith(["5S", "9H", "6D", "7C", "KS", "2D"]); // P:5,6(=11) D:9,7(=16) 次 K → 21 → 自動 done → ディーラー
  assert.equal(s.turn, 0);
  s = Engine.applyMove(s, { type: "hit" }, 0);
  assert.equal(hand(s).done, true, "21 で自動スタンド");
  assert.equal(s.phase, "settle", "1人だけなので即ディーラーへ");
  // バースト
  let b = dealWith(["10S", "9H", "6D", "7C", "KS"]); // P:10,6 D:9,7 → hit K → 26
  b = Engine.applyMove(b, { type: "hit" }, 0);
  assert.equal(hand(b).bust, true); assert.equal(hand(b).done, true);
  assert.equal(hand(b).result, "bust"); assert.equal(hand(b).payout, 0);
  assert.equal(Engine.playerAt(b, 0).chips, 900);
  assert.equal(b.dealer.cards.length, 2, "全員バーストならディーラーは引かない");
  assert.throws(() => Engine.applyMove(b, { type: "hit" }, 0), /操作できません/);
  // 手番違い
  let t = dealWith(["5S", "2H", "9H", "3H", "6D", "4H", "7C"], { players: 2 });
  assert.equal(t.turn, 0);
  assert.throws(() => Engine.applyMove(t, { type: "hit" }, 1), /あなたの番/);
});

test("double: 最初の2枚だけ・賭け金2倍・1枚引いて終了。ヒット後は不可・チップ不足は不可", () => {
  let s = dealWith(["5S", "9H", "6D", "7C", "9S", "KD", "8D"]); // P:5,6 D:9,7 → double 9 → 20 / D: 16 → K → 26 bust
  assert.ok(Engine.legalMoves(s, 0).some((m) => m.type === "double"));
  s = Engine.applyMove(s, { type: "double" }, 0);
  assert.equal(hand(s).bet, 200); assert.equal(hand(s).doubled, true);
  assert.equal(hand(s).cards.length, 3); assert.equal(hand(s).done, true);
  assert.equal(s.phase, "settle");
  assert.equal(hand(s).result, "win"); assert.equal(hand(s).payout, 400);
  assert.equal(Engine.playerAt(s, 0).chips, 1000 - 200 + 400);
  assert.equal(Engine.playerAt(s, 0).net, 200);
  // ヒット後はダブル不可
  let h = dealWith(["2S", "9H", "3D", "7C", "2C", "KD"]);
  h = Engine.applyMove(h, { type: "hit" }, 0);
  assert.ok(!Engine.legalMoves(h, 0).some((m) => m.type === "double"));
  assert.throws(() => Engine.applyMove(h, { type: "double" }, 0), /最初の2枚/);
  // チップ不足（全額ベット）
  let p = dealWith(["5S", "9H", "6D", "7C"], { bet: 100, chips: 100 });
  assert.ok(!Engine.legalMoves(p, 0).some((m) => m.type === "double"));
  assert.throws(() => Engine.applyMove(p, { type: "double" }, 0), /足りません/);
});

test("split: 同ランクの2枚→2つの手（各2枚・同額追加）。1回まで。スプリットAは1枚で終了。別ランクは不可", () => {
  // P:8,8 D:9,7 → split → 手1: 8+3=11 / 手2: 8+10=18
  let s = dealWith(["8S", "9H", "8D", "7C", "3S", "10D", "9C", "KD"]);
  assert.ok(Engine.legalMoves(s, 0).some((m) => m.type === "split"));
  s = Engine.applyMove(s, { type: "split" }, 0);
  const p = Engine.playerAt(s, 0);
  assert.equal(p.hands.length, 2);
  assert.equal(p.chips, 800);
  assert.deepEqual(p.hands[0].cards, cards("8S", "3S"));
  assert.deepEqual(p.hands[1].cards, cards("8D", "10D"));
  assert.equal(p.hands[0].fromSplit, true);
  assert.equal(s.turn, 0); assert.equal(p.active, 0);
  assert.ok(!Engine.legalMoves(s, 0).some((m) => m.type === "split"), "再スプリット不可");
  assert.throws(() => Engine.applyMove(s, { type: "split" }, 0), /1回まで/);
  // 手1: hit 9 → 20 → stand。手2へ
  s = Engine.applyMove(s, { type: "hit" }, 0);
  assert.equal(Engine.handValue(hand(s, 0, 0).cards).total, 20);
  s = Engine.applyMove(s, { type: "stand" }, 0);
  assert.equal(Engine.playerAt(s, 0).active, 1, "2つ目の手へ");
  assert.equal(s.phase, "play");
  s = Engine.applyMove(s, { type: "stand" }, 0);
  assert.equal(s.phase, "settle");
  // D: 9,7=16 → K → 26 bust → 両手とも勝ち
  assert.equal(s.dealer.bust, true);
  assert.equal(hand(s, 0, 0).result, "win"); assert.equal(hand(s, 0, 1).result, "win");
  assert.equal(Engine.playerAt(s, 0).chips, 800 + 400);
  assert.equal(Engine.playerAt(s, 0).net, 200);
  // スプリットA: 各1枚で done。A+10 は BJ ではなく 21（配当 1:1）
  let a = dealWith(["AS", "9H", "AD", "7C", "KS", "5D", "2H", "KD"]); // split → A+K=21(非BJ), A+5=16。D 16 → 2 → 18
  a = Engine.applyMove(a, { type: "split" }, 0);
  assert.equal(hand(a, 0, 0).done, true); assert.equal(hand(a, 0, 1).done, true);
  assert.equal(a.phase, "settle", "両手とも即終了 → ディーラー");
  assert.equal(Engine.isBlackjack(hand(a, 0, 0)), false);
  assert.equal(hand(a, 0, 0).result, "win"); assert.equal(hand(a, 0, 0).payout, 200, "21 だが BJ 配当ではない");
  assert.equal(hand(a, 0, 1).result, "lose");
  // 別ランク（K と Q）は不可
  const k = dealWith(["KS", "9H", "QD", "7C"]);
  assert.ok(!Engine.legalMoves(k, 0).some((m) => m.type === "split"));
  assert.throws(() => Engine.applyMove(k, { type: "split" }, 0), /同じ数字/);
});

test("ディーラー規則: 16 以下は引く・17 で止まる・ソフト17 も止まる（S17）", () => {
  // D: 9,7=16 → 引く。2 → 18 stop
  let s = dealWith(["10S", "9H", "8D", "7C", "2S", "5D"]);
  s = Engine.applyMove(s, { type: "stand" }, 0);
  assert.deepEqual(s.dealer.cards, cards("9H", "7C", "2S"));
  assert.equal(s.dealer.total, 18);
  // D: A,6 = ソフト17 → 止まる
  let t = dealWith(["10S", "AH", "8D", "6C", "5D"]);
  t = Engine.applyMove(t, { type: "stand" }, 0);
  assert.equal(t.dealer.cards.length, 2); assert.equal(t.dealer.total, 17);
  assert.equal(hand(t).result, "win", "18 vs 17");
  // D: A,5 = ソフト16 → 引く。10 → ハード16 → 引く。5 → 21
  let u = dealWith(["10S", "AH", "8D", "5C", "10D", "5S", "9H"]);
  u = Engine.applyMove(u, { type: "stand" }, 0);
  assert.deepEqual(u.dealer.cards, cards("AH", "5C", "10D", "5S"));
  assert.equal(u.dealer.total, 21);
  assert.equal(hand(u).result, "lose");
});

test("配当: BJ は 3:2、勝ち 1:1、プッシュは返金、負け/バーストは没収", () => {
  // BJ（A,K）vs D 20 → +150
  let s = dealWith(["AS", "10H", "KD", "QC"], { bet: 100 });
  assert.equal(s.phase, "settle", "BJ は自動で終了 → 即ディーラー");
  assert.equal(hand(s).result, "bj"); assert.equal(hand(s).payout, 250);
  assert.equal(Engine.playerAt(s, 0).chips, 1150); assert.equal(Engine.playerAt(s, 0).net, 150);
  assert.equal(s.dealer.cards.length, 2, "全員 BJ ならディーラーは引かない");
  // BJ 10 ベット → +15（整数）
  let b = dealWith(["AS", "10H", "KD", "QC"], { bet: 10 });
  assert.equal(Engine.playerAt(b, 0).net, 15);
  // プッシュ 20 vs 20
  let p = dealWith(["10S", "10H", "KD", "QC"]);
  p = Engine.applyMove(p, { type: "stand" }, 0);
  assert.equal(hand(p).result, "push"); assert.equal(Engine.playerAt(p, 0).chips, 1000);
  // 負け 18 vs 20
  let l = dealWith(["8S", "10H", "KD", "QC"]);
  l = Engine.applyMove(l, { type: "stand" }, 0);
  assert.equal(hand(l).result, "lose"); assert.equal(Engine.playerAt(l, 0).chips, 900);
  // result() のサマリ
  const r = Engine.result(l);
  assert.equal(r.round, 1); assert.equal(r.dealer.total, 20); assert.equal(r.players[0].net, -100);
  assert.match(r.summary, /ディーラー 20/);
});

test("ディーラーBJ: 配った直後に精算（ピーク）。プレイヤーBJはプッシュ、それ以外は負け。インシュランス無し", () => {
  // P0: 10,9 / P1: A,K(BJ) / D: A,K(BJ)
  let s = dealWith(["10S", "AS", "AH", "9D", "KS", "KH"], { players: 2 });
  assert.equal(s.phase, "settle");
  assert.equal(s.dealer.bj, true);
  assert.equal(hand(s, 0).result, "lose"); assert.equal(Engine.playerAt(s, 0).chips, 900);
  assert.equal(hand(s, 1).result, "push"); assert.equal(Engine.playerAt(s, 1).chips, 1000);
  assert.equal(Engine.publicView(s, 0).dealer.cards[1].hidden, undefined, "精算後は見える");
});

test("複数人の手番順: 見送りの席は飛ばす・全員終わるとディーラー。next で次ラウンド", () => {
  // 3人。seat1 は見送り（bet 0）
  let s = dealWith(["5S", "6S", "9H", "7D", "8D", "7C", "10S", "10D", "KC"], { players: 3, bets: [100, 0, 50] });
  assert.equal(Engine.playerAt(s, 1).hands.length, 0);
  assert.equal(s.turn, 0);
  assert.deepEqual(Engine.legalMoves(s, 2), [], "手番でない席は空");
  s = Engine.applyMove(s, { type: "stand" }, 0);
  assert.equal(s.turn, 2, "seat1 は飛ばして seat2");
  s = Engine.applyMove(s, { type: "stand" }, 2);
  assert.equal(s.phase, "settle");
  assert.equal(Engine.playerAt(s, 1).net, 0);
  const r = Engine.result(s);
  assert.equal(r.played.length, 2);
  // next → ベットへ。手札クリア・round+1・ready 解除
  assert.deepEqual(Engine.legalMoves(s, 0), [{ type: "next" }]);
  const n = Engine.applyMove(s, { type: "next" }, 1);
  assert.equal(n.phase, "bet"); assert.equal(n.round, 2);
  assert.ok(n.players.every((p) => !p.ready && p.hands.length === 0 && p.bet === 0));
  assert.equal(n.dealer.cards.length, 0);
  assert.throws(() => Engine.applyMove(n, { type: "next" }, 0), /終わっていません/);
});

test("シュー: 残り 1/4（78枚）未満なら next で切り直し。途中で尽きても止まらない", () => {
  let s = dealWith(["10S", "9H", "8D", "7C"]);
  s = Engine.applyMove(s, { type: "stand" }, 0);
  s.shoe = s.shoe.slice(0, 77);
  const n = Engine.applyMove(s, { type: "next" }, 0);
  assert.equal(n.reshuffled, true);
  assert.equal(n.shoe.length, 312);
  assert.notEqual(n.rngState, s.rngState);
  // 78 枚ちょうどなら切り直さない
  s.shoe = s.shoe.concat(s.shoe.slice(0, 1));
  assert.equal(Engine.applyMove(s, { type: "next" }, 0).reshuffled, false);
  // 山札 0 でも draw できる（途中補充）
  let e = table(1); e.shoe = [];
  e = Engine.applyMove(e, { type: "bet", amount: 10 }, 0);
  assert.equal(e.phase, "play"); assert.equal(e.reshuffled, true);
});

test("refill: チップ不足のときだけ 1000 に補充。legalMoves にも出る", () => {
  let s = table(1, 5);
  assert.ok(Engine.legalMoves(s, 0).some((m) => m.type === "refill"));
  s = Engine.applyMove(s, { type: "refill" }, 0);
  assert.equal(Engine.playerAt(s, 0).chips, 1000); assert.equal(Engine.playerAt(s, 0).refills, 1);
  assert.throws(() => Engine.applyMove(s, { type: "refill" }, 0), /残っています/);
  assert.ok(!Engine.legalMoves(s, 0).some((m) => m.type === "refill"));
});

test("cpuMove: ベットは見送り、プレイは簡易戦略（16 vs 10 ヒット・13 vs 6 スタンド・ソフト18 vs 9 ヒット）", () => {
  assert.deepEqual(Engine.cpuMove(table(1), 0), { type: "bet", amount: 0 });
  let s = dealWith(["10S", "10H", "6D", "7C"]); // P 16 vs D 10
  assert.deepEqual(Engine.cpuMove(s, 0), { type: "hit" });
  let t = dealWith(["10S", "6H", "3D", "7C"]); // P 13 vs D 6
  assert.deepEqual(Engine.cpuMove(t, 0), { type: "stand" });
  let u = dealWith(["AS", "9H", "7D", "7C"]); // ソフト18 vs 9
  assert.deepEqual(Engine.cpuMove(u, 0), { type: "hit" });
  let v = dealWith(["AS", "5H", "7D", "7C"]); // ソフト18 vs 5
  assert.deepEqual(Engine.cpuMove(v, 0), { type: "stand" });
  assert.equal(Engine.cpuMove(s, 1), null, "席が無ければ null");
  assert.equal(Engine.isOver(s), false);
});

test("自動対局: 1〜4人で 60 ラウンド回しても例外なし・チップ収支が整合", () => {
  for (const n of [1, 2, 4]) {
    let s = Engine.initialState({ seed: 123 + n }, Array.from({ length: n }, (_, i) => ({ seat: i, chips: 1000 })));
    let rounds = 0, guard = 0;
    while (rounds < 60 && guard++ < 20000) {
      if (s.phase === "bet") {
        for (const p of s.players) if (!p.ready) s = Engine.applyMove(s, { type: "bet", amount: p.chips >= 50 ? 50 : p.chips >= 10 ? 10 : 0 }, p.seat);
        if (s.phase === "bet" && s.players.every((p) => p.chips < 10)) s = Engine.applyMove(s, { type: "refill" }, s.players[0].seat);
        continue;
      }
      if (s.phase === "play") {
        const mv = Engine.cpuMove(s, s.turn);
        const legal = Engine.legalMoves(s, s.turn);
        // たまにダブル/スプリットも混ぜる
        const pick = legal.find((x) => x.type === "split") || legal.find((x) => x.type === "double" && rounds % 3 === 0) || mv;
        s = Engine.applyMove(s, pick, s.turn);
        continue;
      }
      // settle: 収支チェック
      for (const p of s.players) {
        const wagered = p.hands.reduce((a, h) => a + h.bet, 0), paid = p.hands.reduce((a, h) => a + h.payout, 0);
        assert.equal(p.net, paid - wagered);
        for (const h of p.hands) assert.ok(["bj", "win", "push", "lose", "bust"].includes(h.result));
      }
      assert.ok(s.dealer.total >= 17 || s.players.every((p) => p.hands.every((h) => h.bust || Engine.isBlackjack(h))) || s.dealer.bj, "ディーラーは 17 以上で止まる");
      rounds++;
      s = Engine.applyMove(s, { type: "next" }, s.players[0].seat);
    }
    assert.equal(rounds, 60, `${n}人: 60 ラウンド完走`);
    assert.ok(s.shoe.length >= Engine.RESHUFFLE_AT, "切り直しが効いている");
  }
});

// ---- オンライン部屋との結合（online.js ＋ フェイクストア。本番 Firestore にはつながない） ----
import "../src/shared/online.js";
import { makeFakeStore } from "./fake-store.mjs";
const O = globalThis.AsobibaOnline;
const SLUG = "blackjack";

test("オンライン: 部屋作成→参加→開始→各自ベット→配り→席順に操作→精算→退出席はCPU(見送り)で進む", async () => {
  const store = makeFakeStore();
  let t = 1_700_000_000_000; const now = () => t;
  const A = O._create({ store, uid: "uid-A", now, slug: SLUG });
  const B = O._create({ store, uid: "uid-B", now, slug: SLUG });
  const code = await A.createRoom({ name: "A", maxPlayers: 4, minPlayers: 1, settings: {}, initialState: null });
  await B.joinRoom(code, { name: "B" });
  await A.start(code, (rr) => Engine.initialState({ seed: rr.seed }, rr.players.map((p) => ({ seat: p.seat, name: p.name }))));
  let room = store.read(`${SLUG}-${code}`);
  assert.equal(room.status, "playing");
  assert.equal(room.state.phase, "bet");
  assert.deepEqual(room.state.players.map((p) => [p.seat, p.chips]), [[0, null], [1, null]], "チップは各自の端末から");
  // 各自が自分の席でベット（chips を添える）。UIの Online.move と同じ純粋更新
  const move = (client, mv) => client.update(code, (r) => { const me = client.me(r); try { r.state = Engine.applyMove(r.state, mv, me.seat); } catch (e) { e.ja = true; throw e; } return r; });
  await move(A, { type: "bet", amount: 100, chips: 1000 });
  room = store.read(`${SLUG}-${code}`);
  assert.equal(room.state.phase, "bet", "B のベット待ち");
  assert.equal(room.state.players[0].chips, 900);
  await move(B, { type: "bet", amount: 50, chips: 500 });
  room = store.read(`${SLUG}-${code}`);
  assert.equal(room.state.phase === "play" || room.state.phase === "settle", true, "全員そろって配られた");
  // 席順: A(0) → B(1)。B が先に打とうとすると例外（update は書かれない）
  if (room.state.phase === "play" && room.state.turn === 0) {
    await assert.rejects(move(B, { type: "stand" }), /あなたの番/);
    await move(A, { type: "stand" });
    room = store.read(`${SLUG}-${code}`);
    if (room.state.phase === "play") {
      assert.equal(room.state.turn, 1);
      // B が退出 → cpu:true。ホスト(A)が cpuMove で代行
      await B.leave(code);
      room = store.read(`${SLUG}-${code}`);
      assert.equal(room.players.find((p) => p.uid === "uid-B").cpu, true);
      let guard = 0;
      while (room.state.phase === "play" && guard++ < 10) {
        await A.update(code, (r) => { const mv = Engine.cpuMove(r.state, r.state.turn); r.state = Engine.applyMove(r.state, mv, r.state.turn); return r; });
        room = store.read(`${SLUG}-${code}`);
      }
    }
  }
  assert.equal(room.state.phase, "settle");
  assert.ok(room.state.players.every((p) => p.hands.every((h) => h.result)));
  assert.equal(Engine.publicView(room.state, 0).holeHidden, undefined, "精算後は伏せ札なし");
  // 次ラウンド: 誰でも next。CPU席（退出者）はホストが見送りで進める
  await move(A, { type: "next" });
  room = store.read(`${SLUG}-${code}`);
  assert.equal(room.state.phase, "bet"); assert.equal(room.state.round, 2);
  await A.update(code, (r) => { r.state = Engine.applyMove(r.state, Engine.cpuMove(r.state, 1), 1); return r; });
  await move(A, { type: "bet", amount: 100 });
  room = store.read(`${SLUG}-${code}`);
  assert.notEqual(room.state.phase, "bet", "A のベットで配られる（B は見送り）");
  assert.equal(room.state.players[1].hands.length, 0);
  // Firestore 互換: 配列の直下に配列が無い（players[].hands[].cards[] は map 経由なので OK）
  const noNestedArrays = (v) => Array.isArray(v) ? v.every((x) => !Array.isArray(x) && noNestedArrays(x)) : (v && typeof v === "object" ? Object.values(v).every(noNestedArrays) : true);
  assert.ok(noNestedArrays(room.state), "state に配列の直下の配列が無い");
  assert.ok(!JSON.stringify(room.state).includes("undefined"));
});
