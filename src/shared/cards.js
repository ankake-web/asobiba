/* ============================================================
   あそびば共通・トランプ描画（cards.js）
   各ページの <!-- @shared:cards --> の位置に <script> として自動展開される。
   モジュールではなく素のスクリプト。window.AsobibaCards を1つだけ生やす。
   設計書: docs/03-定番ゲーム追加-設計.md §1-2

   card = { r:1..13, s:"S"|"H"|"D"|"C" } | { joker:true, (s:"R"|"B") }

   AsobibaCards.svg(card, { w=64, faceDown=false, selected=false, accent="#2f8f5b" })
       → インラインSVG文字列（幅 w、比率 2.5:3.5）。スート記号はパス描画（文字・絵文字は使わない）。
         数字は --font-num（各ゲームが :root で上書き）。
   AsobibaCards.deck({ jokers:0|1|2 })      → 52(+joker) 枚の配列
   AsobibaCards.shuffle(arr, rng)           → 新しい配列（rng は 0..1 を返す関数。省略時 Math.random）
   AsobibaCards.rng(seed)                   → mulberry32（seed付き乱数。オンラインは room.seed から）
   AsobibaCards.rank(card) / suit(card) / label(card)   → 1 / "S" / "A" "J" "Q" "K" "10" など（表示用ラベル）
   AsobibaCards.backPattern(color)          → 裏面SVGの中身（<defs>+<rect>）。色は各ゲームの accent
   AsobibaCards.suitPath(s)                 → スートのSVGパス（24×24 viewBox）
   AsobibaCards.isRed(card)
   ============================================================ */
(function () {
  if (window.AsobibaCards) return;

  var SUITS = ["S", "H", "D", "C"];
  var RANKS = { 1: "A", 11: "J", 12: "Q", 13: "K" };
  // 24×24 viewBox のスート形。塗りは currentColor 相当（呼び出し側で fill 指定）
  var PATH = {
    S: "M12 2.2C9.6 6.4 4.2 9.4 4.2 13.6a3.9 3.9 0 0 0 6.9 2.5c-.2 2-.9 3.7-2.6 5.7h7c-1.7-2-2.4-3.7-2.6-5.7a3.9 3.9 0 0 0 6.9-2.5c0-4.2-5.4-7.2-7.8-11.4z",
    H: "M12 21.2S3.4 15.9 3.4 9.6C3.4 6.6 5.6 4.4 8.3 4.4c1.6 0 2.9.8 3.7 2 .8-1.2 2.1-2 3.7-2 2.7 0 4.9 2.2 4.9 5.2 0 6.3-8.6 11.6-8.6 11.6z",
    D: "M12 2.4 19.4 12 12 21.6 4.6 12z",
    C: "M12 2.6a3.5 3.5 0 0 0-3 5.3 3.5 3.5 0 1 0 1.9 6 13 13 0 0 1-2.4 7.9h7a13 13 0 0 1-2.4-7.9 3.5 3.5 0 1 0 1.9-6 3.5 3.5 0 0 0-3-5.3z",
    // ジョーカー用の星（文字を使わない印）
    STAR: "M12 2.6l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.6l-5.8 3.3 1.5-6.4-4.9-4.3 6.5-.6z",
  };
  var RED = "#c8323a", BLACK = "#1e1e24";

  function isRed(c) { return !!c && (c.s === "H" || c.s === "D" || (c.joker && c.s === "R")); }
  function rank(c) { return c && c.joker ? 0 : c.r; }
  function suit(c) { return c ? c.s : ""; }
  function label(c) { if (!c) return ""; if (c.joker) return "JOKER"; return RANKS[c.r] || String(c.r); }

  function deck(o) {
    o = o || {};
    var d = [];
    for (var si = 0; si < 4; si++) for (var r = 1; r <= 13; r++) d.push({ r: r, s: SUITS[si] });
    var j = Math.max(0, Math.min(2, o.jokers | 0));
    if (j >= 1) d.push({ joker: true, s: "R" });
    if (j >= 2) d.push({ joker: true, s: "B" });
    return d;
  }
  // mulberry32: 32bit seed → [0,1) の決定的乱数。オンライン対戦では room.seed を渡して全員同じ山札にする
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    r = r || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function suitPath(s) { return PATH[s] || ""; }

  // 裏面: accent 色の幾何柄（斜め格子＋菱形）。<defs> と塗り矩形を返す。id は色ごとに固定（同色なら共有してよい）
  function backPattern(color) {
    color = color || "#2f8f5b";
    var id = "abk" + color.replace(/[^0-9a-zA-Z]/g, "");
    return (
      '<defs><pattern id="' + id + '" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="10" height="10" fill="' + color + '"/>' +
      '<path d="M0 5h10M5 0v10" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>' +
      '<rect x="3.4" y="3.4" width="3.2" height="3.2" fill="rgba(255,255,255,.22)"/>' +
      "</pattern></defs>" +
      '<rect x="4" y="4" width="92" height="132" rx="7" fill="url(#' + id + ')"/>' +
      '<rect x="7.5" y="7.5" width="85" height="125" rx="5" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/>'
    );
  }

  // 1枚のSVG。座標系は 100×140（2.5:3.5）
  function svg(card, o) {
    o = o || {};
    var w = o.w || 64, h = Math.round(w * 1.4);
    var sel = o.selected ? ' data-selected="1"' : "";
    var head = '<svg class="abCard' + (o.selected ? " selected" : "") + (o.faceDown ? " back" : "") + '" viewBox="0 0 100 140" width="' + w + '" height="' + h + '" role="img"' + sel + ' aria-label="' + (o.faceDown ? "伏せ札" : label(card) + (card && card.s ? " " + card.s : "")) + '">';
    var frame = '<rect x="1" y="1" width="98" height="138" rx="9" fill="#fffdf8" stroke="' + (o.selected ? "#f2c14e" : "rgba(0,0,0,.35)") + '" stroke-width="' + (o.selected ? 4 : 1.5) + '"/>';
    if (o.faceDown) return head + frame + backPattern(o.accent) + "</svg>";
    if (!card) return head + frame + "</svg>";
    if (card.joker) {
      var jc = card.s === "R" ? RED : BLACK;
      return head + frame +
        '<rect x="12" y="14" width="76" height="112" rx="6" fill="none" stroke="' + jc + '" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<g transform="translate(50 62) scale(2.4) translate(-12 -12)"><path d="' + PATH.STAR + '" fill="' + jc + '"/></g>' +
        '<g transform="translate(50 62) scale(1.15) translate(-12 -12)"><path d="' + PATH.STAR + '" fill="#fffdf8"/></g>' +
        '<text x="50" y="118" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="2" fill="' + jc + '" style="font-family:var(--font-num),sans-serif">JOKER</text>' +
        "</svg>";
    }
    var col = isRed(card) ? RED : BLACK;
    var lb = label(card);
    var fs = lb.length > 1 ? 17 : 20;
    var path = PATH[card.s] || "";
    var corner = function (x, y, rot) {
      return '<g transform="translate(' + x + " " + y + ") rotate(" + rot + ')">' +
        '<text x="0" y="0" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="' + col + '" style="font-family:var(--font-num),sans-serif">' + lb + "</text>" +
        '<g transform="translate(-8.4 3) scale(.7)"><path d="' + path + '" fill="' + col + '"/></g></g>';
    };
    var center;
    if (card.r >= 11) {
      // 絵札: 二重枠＋大きなスート＋ランク文字
      center = '<rect x="18" y="26" width="64" height="88" rx="5" fill="none" stroke="' + col + '" stroke-width="1.6"/>' +
        '<rect x="22" y="30" width="56" height="80" rx="3" fill="none" stroke="' + col + '" stroke-width=".8" opacity=".6"/>' +
        '<g transform="translate(50 60) scale(2.1) translate(-12 -12)"><path d="' + path + '" fill="' + col + '" opacity=".92"/></g>' +
        '<text x="50" y="102" text-anchor="middle" font-size="22" font-weight="700" fill="' + col + '" style="font-family:var(--font-num),sans-serif">' + lb + "</text>";
    } else if (card.r === 1) {
      center = '<g transform="translate(50 70) scale(3.2) translate(-12 -12)"><path d="' + path + '" fill="' + col + '"/></g>';
    } else {
      center = '<g transform="translate(50 70) scale(2.7) translate(-12 -12)"><path d="' + path + '" fill="' + col + '"/></g>';
    }
    return head + frame + corner(14, 22, 0) + corner(86, 118, 180) + center + "</svg>";
  }

  window.AsobibaCards = {
    SUITS: SUITS, svg: svg, deck: deck, shuffle: shuffle, rng: rng,
    rank: rank, suit: suit, label: label, isRed: isRed, backPattern: backPattern, suitPath: suitPath,
  };
})();
