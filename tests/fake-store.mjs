// online.js の Firestore アダプタ（get/set/tx/sub）と同じ形のインメモリ版。
// 本番の Firestore には一切つながない。複数クライアント（別uid）で同じ store を共有して使う。
//   - tx は「読んだ時点の rev」と「書く直前の rev」が違えば code:"aborted" を投げる（Firestore の競合と同じ扱い）
//   - store.beforeCommit = async (id) => {...} を仕込むと、次の tx の書き込み直前に1回だけ呼ばれる（競合の再現用）
//   - sub は書き込みのたびに非同期で cb(room) を呼ぶ
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

export function makeFakeStore() {
  const docs = new Map(); // id → { data, rev }
  const subs = new Map(); // id → Set<cb>
  let writes = 0;

  function write(id, data) {
    const rev = (docs.get(id)?.rev ?? 0) + 1;
    docs.set(id, { data: clone(data), rev });
    writes++;
    const set = subs.get(id);
    if (set) for (const cb of [...set]) queueMicrotask(() => { if (set.has(cb)) cb(clone(data)); });
  }

  const store = {
    docs,
    beforeCommit: null,
    get writes() { return writes; },
    read(id) { return docs.has(id) ? clone(docs.get(id).data) : null; },
    async get(id) { return store.read(id); },
    async set(id, data) { write(id, data); },
    async tx(id, fn) {
      const rev0 = docs.get(id)?.rev ?? 0;
      const cur = store.read(id);
      const next = fn(cur);
      await Promise.resolve(); // 本物と同じく非同期の隙間を作る
      if (store.beforeCommit) { const h = store.beforeCommit; store.beforeCommit = null; await h(id); }
      if ((docs.get(id)?.rev ?? 0) !== rev0) { const e = new Error("transaction contention"); e.code = "aborted"; throw e; }
      if (next) write(id, next);
      return next ? clone(next) : cur;
    },
    sub(id, cb) {
      if (!subs.has(id)) subs.set(id, new Set());
      const set = subs.get(id);
      set.add(cb);
      queueMicrotask(() => { if (set.has(cb)) cb(store.read(id)); });
      return () => set.delete(cb);
    },
  };
  return store;
}
