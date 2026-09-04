# ハブ（index.html）のタイル背景用に、キーアートの小さい版を作る。
#
#   games/<slug>/assets/hero.jpg（うまうまレースだけ title-hero.jpg / 1600x900）
#     → games/<slug>/assets/hero-tile.webp （TILE_W x 450）
#
# 原画は消さない。ルールモーダルの 442x120 帯は今も hero.jpg を使っている。
# タイルの実表示は 390px幅で 356 CSS px（DPR2 = 712 device px）、
# 1440px幅で 515 CSS px・注目タイルのみ 1046 CSS px。TILE_W はその DPR2 ぶんを見て決めている。
#
# 実行: python tools/make-tile-art.py
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT / "games"

TILE_W = 1024   # 390px幅・DPR2 の通常タイル: cover 後の描画幅 1010px をカバー（box 712x568 に 16:9 を cover）
FEATURE_W = 1200  # 注目タイル（うまうまレース）: 390px幅・DPR2 の描画幅 1191px、1440px幅の 1046 CSS px もカバー
QUALITY = 80

# slug -> (原画のファイル名, 出力幅)
SOURCES = {
    "uma-race": ("title-hero.jpg", FEATURE_W),
}

def main():
    total_src = total_out = 0
    rows = []
    for d in sorted(p for p in GAMES.iterdir() if p.is_dir()):
        name, width = SOURCES.get(d.name, ("hero.jpg", TILE_W))
        src = d / "assets" / name
        if not src.exists():
            continue
        out = d / "assets" / "hero-tile.webp"
        im = Image.open(src).convert("RGB")
        small = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        small.save(out, "WEBP", quality=QUALITY, method=6)
        s, o = src.stat().st_size, out.stat().st_size
        total_src += s
        total_out += o
        rows.append((d.name, f"{im.width}x{im.height}", s, f"{small.width}x{small.height}", o))

    w = max(len(r[0]) for r in rows)
    for slug, sd, s, od, o in rows:
        print(f"{slug:<{w}}  {sd} {s/1024:7.1f}KB  ->  {od} {o/1024:6.1f}KB")
    print(f"{'TOTAL':<{w}}  {total_src/1024:.1f}KB -> {total_out/1024:.1f}KB "
          f"({100 - total_out / total_src * 100:.1f}% 減)  {len(rows)}枚")

if __name__ == "__main__":
    main()
