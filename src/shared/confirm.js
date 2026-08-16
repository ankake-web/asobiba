/* ============================================================
   あそびば共通・確認シート＆トースト（confirm.js）
   各ページの <!-- @shared:confirm --> の位置に <script> として自動展開される。
   モジュールではなく素のスクリプト。window に2つだけ生やす:

   1) asobibaConfirm(opts) → Promise<boolean>
      取り消せない操作の前に1枚挟む確認シート。
      opts = {
        title:       "呪宝 15 を引き取る",     // 必須。何をするのか
        lines:       [["呪宝", "−15点"], ...], // 任意。[ラベル, 値] の内訳表
        note:        "この操作は取り消せません", // 任意。小さな補足
        okLabel:     "引き取る",               // 既定 "実行する"
        cancelLabel: "やめる",                 // 既定 "やめる"
        danger:      true,                     // true で実行ボタンが赤系
        accent:      "#e7c66b",                // 実行ボタンの色（danger時は無視）
      }
      背景タップ・Escは「やめる」(false) 扱い。誤タップで実行されない。

   2) asobibaToast(text, {ms=1600, kind="info"|"warn"})
      画面下部に短いトースト。無効操作の通知などに。
   ============================================================ */
(function () {
  if (window.asobibaConfirm) return;

  var CSS =
    ".abcOv{position:fixed;inset:0;z-index:9990;display:flex;align-items:flex-end;justify-content:center;" +
    "background:rgba(5,5,9,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);" +
    "opacity:0;transition:opacity .16s ease}" +
    ".abcOv.show{opacity:1}" +
    "@media(min-width:600px){.abcOv{align-items:center}}" +
    ".abcSheet{width:100%;max-width:440px;box-sizing:border-box;" +
    "background:linear-gradient(180deg,#2a2633,#1d1a26);color:#f4eee6;" +
    "border:1px solid rgba(255,255,255,.16);border-bottom:none;" +
    "border-radius:22px 22px 0 0;padding:20px 18px calc(16px + env(safe-area-inset-bottom,0px));" +
    "box-shadow:0 -18px 50px rgba(0,0,0,.5);transform:translateY(24px);transition:transform .18s ease}" +
    ".abcOv.show .abcSheet{transform:translateY(0)}" +
    "@media(min-width:600px){.abcSheet{border-radius:22px;border-bottom:1px solid rgba(255,255,255,.16);padding-bottom:18px}}" +
    ".abcTitle{margin:0;font-size:18px;font-weight:900;line-height:1.45;letter-spacing:.01em}" +
    ".abcLines{margin:14px 0 0;display:grid;gap:6px}" +
    ".abcRow{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:700;" +
    "padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.055)}" +
    ".abcRow b{font-weight:900}" +
    ".abcNote{margin:12px 2px 0;font-size:12.5px;line-height:1.5;color:#b9b0c9;font-weight:600}" +
    ".abcBtns{margin-top:16px;display:grid;grid-template-columns:1fr 1.4fr;gap:10px}" +
    ".abcBtn{border:none;border-radius:15px;min-height:52px;font-size:16px;font-weight:900;" +
    "font-family:inherit;cursor:pointer;letter-spacing:.02em}" +
    ".abcBtn:active{transform:translateY(1px)}" +
    ".abcCancel{background:rgba(255,255,255,.09);color:#f4eee6;border:1px solid rgba(255,255,255,.2)}" +
    ".abcOk{color:#1c1626;box-shadow:0 5px 0 rgba(0,0,0,.35)}" +
    ".abcOk.danger{color:#fff;background:linear-gradient(180deg,#e5574f,#c23a33);box-shadow:0 5px 0 #7e2420}" +
    ".abcToast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:9991;" +
    "transform:translate(-50%,14px);max-width:88vw;box-sizing:border-box;" +
    "background:rgba(28,24,38,.95);color:#f4eee6;border:1px solid rgba(255,255,255,.2);" +
    "border-radius:999px;padding:11px 20px;font-size:14px;font-weight:800;text-align:center;" +
    "box-shadow:0 10px 28px rgba(0,0,0,.45);opacity:0;transition:opacity .16s,transform .16s;pointer-events:none}" +
    ".abcToast.show{opacity:1;transform:translate(-50%,0)}" +
    ".abcToast.warn{border-color:rgba(229,110,100,.65);background:rgba(58,22,24,.95)}";

  function ensureCss() {
    if (document.getElementById("abcCss")) return;
    var s = document.createElement("style");
    s.id = "abcCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  window.asobibaConfirm = function (opts) {
    opts = opts || {};
    ensureCss();
    if (document.querySelector(".abcOv")) return Promise.resolve(false); // 二重表示は拒否

    return new Promise(function (resolve) {
      var ov = document.createElement("div");
      ov.className = "abcOv";
      var sheet = document.createElement("div");
      sheet.className = "abcSheet";
      sheet.setAttribute("role", "alertdialog");

      var h = document.createElement("p");
      h.className = "abcTitle";
      h.textContent = opts.title || "この操作を実行しますか？";
      sheet.appendChild(h);

      if (opts.lines && opts.lines.length) {
        var box = document.createElement("div");
        box.className = "abcLines";
        opts.lines.forEach(function (ln) {
          var row = document.createElement("div");
          row.className = "abcRow";
          var a = document.createElement("span");
          a.textContent = ln[0];
          var b = document.createElement("b");
          b.textContent = ln[1];
          row.appendChild(a);
          row.appendChild(b);
          box.appendChild(row);
        });
        sheet.appendChild(box);
      }

      if (opts.note) {
        var p = document.createElement("p");
        p.className = "abcNote";
        p.textContent = opts.note;
        sheet.appendChild(p);
      }

      var btns = document.createElement("div");
      btns.className = "abcBtns";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "abcBtn abcCancel";
      cancel.textContent = opts.cancelLabel || "やめる";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "abcBtn abcOk" + (opts.danger ? " danger" : "");
      if (!opts.danger) {
        var acc = opts.accent || "#e7c66b";
        ok.style.background = "linear-gradient(180deg,#fff, " + acc + ")";
      }
      ok.textContent = opts.okLabel || "実行する";
      btns.appendChild(cancel);
      btns.appendChild(ok);
      sheet.appendChild(btns);
      ov.appendChild(sheet);
      document.body.appendChild(ov);

      requestAnimationFrame(function () { ov.classList.add("show"); });

      function close(val) {
        ov.classList.remove("show");
        document.removeEventListener("keydown", onKey);
        setTimeout(function () { ov.remove(); }, 180);
        resolve(val);
      }
      function onKey(e) { if (e.key === "Escape") close(false); }

      cancel.addEventListener("click", function () { close(false); });
      ok.addEventListener("click", function () { close(true); });
      ov.addEventListener("click", function (e) { if (e.target === ov) close(false); });
      document.addEventListener("keydown", onKey);
      cancel.focus({ preventScroll: true });
    });
  };

  window.asobibaToast = function (text, o) {
    o = o || {};
    ensureCss();
    var old = document.querySelector(".abcToast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "abcToast" + (o.kind === "warn" ? " warn" : "");
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 200);
    }, o.ms || 1600);
  };
})();
