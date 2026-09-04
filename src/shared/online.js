/* ============================================================
   あそびば共通・オンライン部屋（online.js）
   各ページの <!-- @shared:online --> の位置に <script type="module"> として
   自動展開される（vite.config.js の inject-shared プラグイン）。
   window.AsobibaOnline を1つだけ生やす。設計書: docs/03-定番ゲーム追加-設計.md §1-1

   ■ 使い方（ゲーム本体も <script type="module"> にしてマーカーの後ろに置く）
     await AsobibaOnline.init({ slug:"othello" });   // Firebase読込＋匿名ログイン。失敗時 throw（日本語message）
     const code = await AsobibaOnline.createRoom({ name, maxPlayers, minPlayers, initialState, settings });
     const room = await AsobibaOnline.joinRoom(code, { name });
     const unsub = AsobibaOnline.subscribe(code, (room, err) => { ... });   // heartbeat も自動開始
     await AsobibaOnline.update(code, (room) => { ...純粋に書き換え...; return room; });  // 変更なしなら null を返す
     await AsobibaOnline.addCpu(code, { name }) / removeCpu(code, uid) / start(code, (room)=>state) / leave(code)
     AsobibaOnline.uid() / isHost(room) / isAway(player) / shareUrl(code) / codeFromHash() / savedName() / saveName(n)

   ■ 仕組み
     - Firestore `rooms/{slug}-{4桁コード}` の1ドキュメントに Room 丸ごと。
     - ホスト不要の「トランザクション合意」: 各クライアントが runTransaction で
       読む → 純粋関数で次の Room → version+1 で書く。競合は自動再試行。全員 onSnapshot で追従。
     - heartbeat: subscribe 中は 20 秒ごとに自分の lastSeen を更新。60 秒無反応 = isAway()。
       ホストが離脱中なら、生存している最小 seat の人が update/heartbeat の中で自動的にホストを継ぐ。
     - leave(): 対局中(playing)なら自分の席を cpu:true に差し替えて残す（ゲームが止まらない）。
       ロビー/終了後なら席から外す。
     - Firebase SDK は init() 時に動的 import する（静的 import しない）。
       → ネットが無くても window.AsobibaOnline 自体は必ず生え、ローカルモードは動く。
     - Firestore 依存は makeFirestoreStore() の4関数（get/set/tx/sub）だけ。
       テストでは AsobibaOnline._useStore(fakeStore, { uid }) または
       AsobibaOnline._create({ store, uid, now }) でインメモリのフェイクに差し替える（tests/online.test.mjs）。
   ============================================================ */
(() => {
  const G = typeof window !== "undefined" ? window : globalThis;
  if (G.AsobibaOnline) return;

  // うまうまレースと同じ Firebase プロジェクト・同じ rooms コレクション（docId の接頭辞で棲み分け）
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCxHux7rE19LCvV-2sNwhEMtGABf3tZgDs",
    authDomain: "umauma-737d6.firebaseapp.com",
    projectId: "umauma-737d6",
    storageBucket: "umauma-737d6.firebasestorage.app",
    messagingSenderId: "704545420057",
    appId: "1:704545420057:web:9fa4081aa62dc5900d4b88",
    measurementId: "G-0E7DM5B4VB",
  };
  const SDK = "https://www.gstatic.com/firebasejs/10.12.5/";
  const COLLECTION = "rooms";
  const HEARTBEAT_MS = 20000;
  const AWAY_MS = 60000;
  const ROOM_TTL_MS = 1000 * 60 * 60 * 24 * 3; // expiresAt（Firestore の TTL ポリシー用。うまうまと同じ3日）
  const NAME_KEY = "asobiba.name";

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));
  const err = (message, code) => Object.assign(new Error(message), { code, ja: true });

  // Firebase / ネットワーク系の例外を日本語メッセージの Error に包む（自前の業務エラーはそのまま）
  function toJa(e) {
    if (e && e.ja) return e;
    const code = String((e && e.code) || "");
    const text = code + " " + String((e && e.message) || "");
    let m;
    if (/permission-denied/i.test(text)) m = "オンライン対戦の準備ができていません（管理者へ: Firestore のルール設定が必要です）";
    else if (/unavailable|network|failed to fetch|deadline|offline|Load failed|import/i.test(text)) m = "ネットワークに接続できません。通信状態を確認してください";
    else if (/auth\//.test(code)) m = "ログインに失敗しました（" + code + "）";
    else m = "オンライン処理に失敗しました" + (code ? "（" + code + "）" : "");
    const x = new Error(m);
    x.code = code || "unknown";
    x.cause = e;
    x.ja = true;
    return x;
  }

  /* ---------- Firestore アダプタ（依存はここだけ） ----------
     store = { uid, get(id), set(id,data), tx(id, fn), sub(id, cb) }
       tx: fn(current|null) → next|null。null なら書かない。戻り値は next（書かない時は current）。
       sub: cb(room|null, err?)。戻り値は解除関数。 */
  async function makeFirestoreStore() {
    const [appMod, authMod, fs] = await Promise.all([
      import(/* @vite-ignore */ SDK + "firebase-app.js"),
      import(/* @vite-ignore */ SDK + "firebase-auth.js"),
      import(/* @vite-ignore */ SDK + "firebase-firestore.js"),
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const cred = await authMod.signInAnonymously(auth);
    const db = fs.getFirestore(app);
    const ref = (id) => fs.doc(db, COLLECTION, id);
    return {
      uid: cred.user.uid,
      async get(id) { const s = await fs.getDoc(ref(id)); return s.exists() ? s.data() : null; },
      async set(id, data) { await fs.setDoc(ref(id), data); },
      tx(id, fn) {
        return fs.runTransaction(db, async (t) => {
          const s = await t.get(ref(id));
          const cur = s.exists() ? s.data() : null;
          const next = fn(cur);
          if (next) t.set(ref(id), next);
          return next || cur;
        });
      },
      sub(id, cb) {
        return fs.onSnapshot(ref(id), (s) => cb(s.exists() ? s.data() : null), (e) => cb(null, e));
      },
    };
  }

  /* ---------- クライアント本体（store 差し替え可能） ---------- */
  function createClient(opts = {}) {
    let store = opts.store || null;
    let myUid = opts.uid || null;
    const now = opts.now || (() => Date.now());
    let slugDefault = opts.slug || "";
    let initPromise = null;
    const hb = new Map(); // code → { timer, refs }

    const docId = (code, slug) => (slug || slugDefault) + "-" + String(code).trim();
    const ready = () => { if (!store) throw err("オンラインが初期化されていません（init() を先に呼ぶ）", "not-ready"); };
    const freeSeat = (r) => { let s = 0; while (r.players.some((p) => p.seat === s)) s++; return s; };
    const humansAlive = (r, t) => r.players.filter((p) => !p.cpu && t - (p.lastSeen || 0) <= AWAY_MS).sort((a, b) => a.seat - b.seat);

    // ホストが離脱(60秒超)なら生存している最小seatへ引き継ぐ。変えたら true
    function reassignHost(r, t) {
      const host = r.players.find((p) => p.uid === r.hostUid);
      if (host && !host.cpu && t - (host.lastSeen || 0) <= AWAY_MS) return false;
      const alive = humansAlive(r, t);
      if (!alive.length || alive[0].uid === r.hostUid) return false;
      r.hostUid = alive[0].uid;
      return true;
    }
    // 自分が参加者なら lastSeen を今に（update も heartbeat を兼ねる）
    function touchMe(r, t) {
      const me = r.players.find((p) => p.uid === myUid);
      if (me && !me.cpu) me.lastSeen = t;
      return me;
    }

    // runTransaction ＋ 競合時の再試行。fn は純粋関数（複数回呼ばれうる）
    async function tx(id, fn, { retries = 6 } = {}) {
      ready();
      for (let attempt = 0; ; attempt++) {
        try {
          return await store.tx(id, fn);
        } catch (e) {
          if (e && e.ja) throw e; // 満席・不在などの業務エラーは再試行しない
          const code = String((e && e.code) || "");
          const retryable = /aborted|failed-precondition|conflict|unavailable|deadline|contention/i.test(code);
          if (!retryable || attempt >= retries) throw toJa(e);
          await sleep(40 + attempt * 60 + Math.random() * 80);
        }
      }
    }
    // 共通のルーム更新: 不在チェック → 自分の lastSeen → ホスト引き継ぎ → fn → version+1
    function updateDoc(id, fn, { bumpVersion = true } = {}) {
      return tx(id, (cur) => {
        if (!cur) throw err("部屋が見つかりません。コードを確認してください", "not-found");
        const r = clone(cur);
        const t = now();
        touchMe(r, t);
        const hostChanged = reassignHost(r, t);
        const out = fn(r, t);
        if (out == null && !hostChanged) return null;
        const next = out || r;
        if (bumpVersion) next.version = (cur.version || 0) + 1;
        next.updatedAt = t;
        next.expiresAt = t + ROOM_TTL_MS;
        return next;
      });
    }

    function startHeartbeat(code, slug) {
      const key = docId(code, slug);
      const h = hb.get(key);
      if (h) { h.refs++; return; }
      const beat = () => api.heartbeat(code, { slug }).catch(() => {});
      const timer = setInterval(beat, HEARTBEAT_MS);
      const onVis = () => { if (typeof document !== "undefined" && document.visibilityState === "visible") beat(); };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
      hb.set(key, { timer, refs: 1, onVis });
      beat();
    }
    function stopHeartbeat(code, slug) {
      const key = docId(code, slug);
      const h = hb.get(key);
      if (!h) return;
      if (--h.refs > 0) return;
      clearInterval(h.timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", h.onVis);
      hb.delete(key);
    }

    const api = {
      // ---- 初期化 ----
      async init({ slug } = {}) {
        if (slug) slugDefault = slug;
        if (store) return api; // フェイク差し替え済み or 初期化済み
        if (!initPromise) {
          initPromise = makeFirestoreStore()
            .then((s) => { store = s; myUid = s.uid; })
            .catch((e) => { initPromise = null; throw toJa(e); });
        }
        await initPromise;
        return api;
      },
      uid() { return myUid; },
      isReady() { return !!store; },

      // ---- 部屋を作る（4桁コードを返す。自分が seat0 / host） ----
      async createRoom({ slug, name, maxPlayers = 2, minPlayers = 2, initialState = null, settings = {} } = {}) {
        ready();
        const s = slug || slugDefault;
        for (let i = 0; i < 12; i++) {
          const code = randomCode();
          let created = false;
          await tx(docId(code, s), (cur) => {
            created = false;
            if (cur) return null; // 使用中のコード → 取り直し
            created = true;
            const t = now();
            return {
              slug: s, code, hostUid: myUid, status: "lobby",
              players: [{ uid: myUid, name: name || "名無し", seat: 0, cpu: false, lastSeen: t }],
              maxPlayers, minPlayers, settings: settings || {}, state: initialState,
              version: 0, createdAt: t, updatedAt: t, expiresAt: t + ROOM_TTL_MS,
              seed: Math.floor(Math.random() * 0x7fffffff),
            };
          });
          if (created) return code;
        }
        throw err("部屋コードを確保できませんでした。もう一度お試しください", "code-exhausted");
      },

      // ---- コードで参加（満席/不在/開始済みは Error）。再入室（同じuid）は通す ----
      async joinRoom(code, { slug, name } = {}) {
        ready();
        const s = slug || slugDefault;
        code = String(code || "").trim();
        if (!/^\d{4}$/.test(code)) throw err("部屋コードは4桁の数字です", "bad-code");
        return tx(docId(code, s), (cur) => {
          if (!cur) throw err("部屋が見つかりません。コードを確認してください", "not-found");
          if (cur.slug !== s) throw err("このコードは別のゲームの部屋です", "wrong-game");
          const r = clone(cur);
          const t = now();
          const me = r.players.find((p) => p.uid === myUid);
          if (me) { // 再入室（リロード・一度抜けた席に戻る）
            me.cpu = false;
            me.lastSeen = t;
            if (name) me.name = name;
          } else {
            if (r.status !== "lobby") throw err("この部屋はすでに始まっています", "started");
            if (r.players.length >= (r.maxPlayers || 2)) throw err("満席です", "full");
            r.players.push({ uid: myUid, name: name || "名無し", seat: freeSeat(r), cpu: false, lastSeen: t });
          }
          reassignHost(r, t);
          r.version = (cur.version || 0) + 1;
          r.updatedAt = t;
          r.expiresAt = t + ROOM_TTL_MS;
          return r;
        });
      },

      // ---- 追従（heartbeat も自動）。cb(room|null, err?)。戻り値で解除 ----
      subscribe(code, cb, { slug } = {}) {
        ready();
        const unsub = store.sub(docId(code, slug), (room, e) => {
          if (e) { cb(null, toJa(e)); return; }
          cb(room);
        });
        startHeartbeat(code, slug);
        let done = false;
        return () => { if (done) return; done = true; unsub(); stopHeartbeat(code, slug); };
      },

      // ---- 任意の純粋更新（競合は自動再試行。fn が null を返せば書かない） ----
      update(code, fn, { slug } = {}) {
        return updateDoc(docId(code, slug), fn);
      },

      // ---- ホスト限定操作 ----
      addCpu(code, { name, slug } = {}) {
        return updateDoc(docId(code, slug), (r, t) => {
          if (r.hostUid !== myUid) throw err("CPUを追加できるのはホストだけです", "not-host");
          if (r.status !== "lobby") throw err("開始後はCPUを追加できません", "started");
          if (r.players.length >= (r.maxPlayers || 2)) throw err("満席です", "full");
          const n = r.players.filter((p) => p.cpu).length + 1;
          r.players.push({ uid: "cpu-" + Math.random().toString(36).slice(2, 8), name: name || ("CPU " + n), seat: freeSeat(r), cpu: true, lastSeen: t });
          return r;
        });
      },
      removeCpu(code, uid, { slug } = {}) {
        return updateDoc(docId(code, slug), (r) => {
          if (r.hostUid !== myUid) throw err("CPUを外せるのはホストだけです", "not-host");
          if (r.status !== "lobby") throw err("開始後は席を変えられません", "started");
          const n = r.players.length;
          r.players = r.players.filter((p) => !(p.cpu && p.uid === uid));
          return r.players.length === n ? null : r;
        });
      },
      start(code, makeState, { slug } = {}) {
        return updateDoc(docId(code, slug), (r, t) => {
          if (r.hostUid !== myUid) throw err("開始できるのはホストだけです", "not-host");
          if (r.status === "playing") throw err("すでに始まっています", "started");
          if (r.players.length < (r.minPlayers || 2)) throw err("人数が足りません（あと" + ((r.minPlayers || 2) - r.players.length) + "人）", "not-enough");
          r.status = "playing";
          r.state = makeState(r);
          r.startedAt = t;
          return r;
        });
      },

      // ---- 退出（playing 中は cpu:true に差し替えて残す） ----
      async leave(code, { slug } = {}) {
        ready();
        const id = docId(code, slug);
        try {
          await tx(id, (cur) => {
            if (!cur) return null;
            const r = clone(cur);
            const t = now();
            const me = r.players.find((p) => p.uid === myUid);
            if (!me) return null;
            if (r.status === "playing") me.cpu = true;
            else r.players = r.players.filter((p) => p.uid !== myUid);
            if (r.hostUid === myUid) {
              const alive = humansAlive(r, t);
              const humans = r.players.filter((p) => !p.cpu).sort((a, b) => a.seat - b.seat);
              r.hostUid = (alive[0] || humans[0] || r.players[0] || { uid: myUid }).uid;
            }
            r.version = (cur.version || 0) + 1;
            r.updatedAt = t;
            r.expiresAt = t + ROOM_TTL_MS;
            return r;
          });
        } finally {
          const h = hb.get(id);
          if (h) { h.refs = 1; stopHeartbeat(code, slug); }
        }
      },

      // ---- 生存管理 ----
      heartbeat(code, { slug } = {}) {
        return updateDoc(docId(code, slug), (r) => {
          const me = r.players.find((p) => p.uid === myUid);
          return me && !me.cpu ? r : null; // touchMe 済み。参加者でなければ書かない
        }, { bumpVersion: false });
      },
      isAway(player) { return !!player && !player.cpu && now() - (player.lastSeen || 0) > AWAY_MS; },
      isHost(room) { return !!room && room.hostUid === myUid; },
      me(room) { return room ? room.players.find((p) => p.uid === myUid) || null : null; },

      // ---- 招待URL・名前 ----
      shareUrl(code) {
        if (typeof location === "undefined") return "#" + code;
        return location.origin + location.pathname + "#" + code;
      },
      codeFromHash() {
        if (typeof location === "undefined") return "";
        const m = /(\d{4})/.exec(location.hash || "");
        return m ? m[1] : "";
      },
      savedName() { try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; } },
      saveName(n) { try { localStorage.setItem(NAME_KEY, String(n || "").slice(0, 12)); } catch (e) { /* private mode */ } },

      // ---- テスト用フック ----
      _useStore(s, o = {}) { store = s; myUid = o.uid || s.uid || myUid || "test-" + Math.random().toString(36).slice(2, 8); if (o.slug) slugDefault = o.slug; return api; },
      _create: createClient,
      _const: { HEARTBEAT_MS, AWAY_MS, COLLECTION },
    };
    return api;
  }

  G.AsobibaOnline = createClient();
})();
