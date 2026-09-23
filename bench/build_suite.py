"""Costruisce la batteria di benchmark: per ogni set un'istanza jagua-rs (mm, rotolo 600 mm)
e un SVG per Illustrator (pezzi in griglia + rettangolo contenitore). Uso: python build_suite.py"""
import json, math, os
import pymupdf
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties

ROLL = 600.0; GAP = 2.0
OUT = "suite"
SRC = "../data/input"

def area(p): return abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))/2
def signed(p): return sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))/2

def from_esicup(name, desc):
    d = json.load(open(f"{SRC}/{name}.json")); s = ROLL / d["strip_height"]
    items = []
    for it in d["items"]:
        sh = it["shape"]; assert sh["type"] == "simple_polygon"
        pts = [[x*s, y*s] for x, y in sh["data"]]
        items.append({"shape": {"type": "simple_polygon", "data": pts}, "demand": it["demand"],
                      "rots": [float(r) for r in it.get("allowed_orientations") or [0.0]]})
    return items

def from_generated(path):
    d = json.load(open(path)); s = ROLL / d["strip_height"]
    return [{"shape": {"type": "simple_polygon", "data": [[x*s, y*s] for x, y in it["shape"]["data"]]},
             "demand": it["demand"], "rots": it["allowed_orientations"]} for it in d["items"]]

def lettering():
    fp = FontProperties(fname=r"C:\Windows\Fonts\ariblk.ttf")
    lines = [("PIZZERIA", 330), ("DA MARIO", 200), ("TEL 0114567890", 110)]
    items = []
    for text, h in lines:
        for ch in text:
            if ch == " ": continue
            tp = TextPath((0, 0), ch, size=h, prop=fp)
            polys = [p for p in tp.to_polygons(closed_only=True) if len(p) >= 3]
            polys = [[[float(x), float(y)] for x, y in p[:-1]] if (p[0] == p[-1]).all() else [[float(x), float(y)] for x, y in p] for p in polys]
            polys.sort(key=area, reverse=True)
            outer, inner = polys[0], polys[1:]
            shape = {"type": "polygon", "data": {"outer": outer, "inner": inner}} if inner else {"type": "simple_polygon", "data": outer}
            items.append({"shape": shape, "demand": 1, "rots": [0.0, 90.0, 180.0, 270.0], "char": ch})
    return items

def am_arrows():
    d = pymupdf.open(r"C:\Users\erryb\Downloads\Arrange-Master-Demo\03-Test Objects and Examples\Examples.ai")
    dr = [x for x in d[0].get_drawings() if len(x["items"]) == 12][0]
    pts = [[it[1].x, -it[1].y] for it in dr["items"] if it[0] == "l"]
    w = max(p[0] for p in pts) - min(p[0] for p in pts); sc = 90 / w  # freccia ~90 mm (adesivo)
    pts = [[x*sc, y*sc] for x, y in pts]
    return [{"shape": {"type": "simple_polygon", "data": pts}, "demand": 50, "rots": [0.0, 90.0, 180.0, 270.0]}]

SETS = [
    ("insegna48", "Insegna: 48 sagome (lettere, frecce, stelle)", from_generated("insegna48.json")),
    ("lettering", "Insegna con font vero (Arial Black, lettere con buchi)", lettering()),
    ("frecce_am", "50 frecce dal file di esempio di Arrange Master", am_arrows()),
    ("swim", "Costumi da bagno (ESICUP swim, 48 pezzi curvi)", from_esicup("swim", "")),
    ("albano", "Abbigliamento (ESICUP albano)", from_esicup("albano", "")),
    ("dagli", "Abbigliamento (ESICUP dagli)", from_esicup("dagli", "")),
    ("mao", "Abbigliamento (ESICUP mao)", from_esicup("mao", "")),
    ("marques", "Abbigliamento (ESICUP marques)", from_esicup("marques", "")),
    ("shapes1", "Puzzle geometrico (ESICUP shapes1)", from_esicup("shapes1", "")),
    ("jakobs1", "Lamiera, pezzi rettilinei (ESICUP jakobs1)", from_esicup("jakobs1", "")),
    ("fu", "Poligoni convessi (ESICUP fu)", from_esicup("fu", "")),
    ("blaz1", "Pezzi meccanici (ESICUP blaz1)", from_esicup("blaz1", "")),
    ("gardeyn9", "Pezzi industriali curvi, tutti diversi (Gardeyn 9)", from_generated(f"{SRC}/gardeyn9.json")),
    ("gardeyn1", "Pezzi industriali curvi (Gardeyn 1)", from_generated(f"{SRC}/gardeyn1.json")),
]
DESC = {k: v for k, v, _ in SETS}

manifest = []
for key, desc, items in SETS:
    # normalizza: ogni forma con bbox a origine
    norm = []
    for it in items:
        sh = it["shape"]
        rings = [sh["data"]] if sh["type"] == "simple_polygon" else [sh["data"]["outer"]] + sh["data"]["inner"]
        x0 = min(p[0] for r in rings for p in r); y0 = min(p[1] for r in rings for p in r)
        rings = [[[round(x - x0, 3), round(y - y0, 3)] for x, y in r] for r in rings]
        norm.append({**it, "rings": rings})
    npieces = sum(it["demand"] for it in norm)
    A = sum((area(it["rings"][0]) - sum(area(h) for h in it["rings"][1:])) * it["demand"] for it in norm)
    inst = {"name": key, "strip_height": ROLL, "items": [
        {"id": i, "demand": it["demand"], "allowed_orientations": it["rots"],
         "shape": ({"type": "simple_polygon", "data": it["rings"][0]} if len(it["rings"]) == 1 else
                   {"type": "polygon", "data": {"outer": it["rings"][0], "inner": it["rings"][1:]}})}
        for i, it in enumerate(norm)]}
    json.dump(inst, open(f"{OUT}/{key}.json", "w"))
    # SVG: pezzi espansi per demand in griglia (y giu'), contenitore sotto
    Lmin = A / ROLL; Lc = min(max(3.5 * Lmin, 1500), 5000)
    paths = []; cx = cy = 10; rowh = 0; GW = 1800
    for i, it in enumerate(norm):
        w = max(p[0] for p in it["rings"][0]); h = max(p[1] for p in it["rings"][0])
        for k in range(it["demand"]):
            if cx + w > GW: cx = 10; cy += rowh + 10; rowh = 0
            d = " ".join("M " + " L ".join(f"{x+cx:.3f},{h-y+cy:.3f}" for x, y in r) + " Z" for r in it["rings"])
            paths.append(f'<path id="p{i}_{k}" d="{d}" fill="#2b2f36" fill-rule="evenodd"/>')
            cx += w + 10; rowh = max(rowh, h)
    ctop = cy + rowh + 100
    paths.append(f'<rect id="CONTAINER" x="0" y="{ctop:.1f}" width="{Lc:.1f}" height="{ROLL}" fill="none" stroke="#000" stroke-width="1"/>')
    H = ctop + ROLL + 20; W = max(GW, Lc) + 20
    open(f"{OUT}/{key}.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}mm" height="{H:.0f}mm" viewBox="0 0 {W:.0f} {H:.0f}">\n' + "\n".join(paths) + "\n</svg>\n")
    rots = sorted({tuple(it["rots"]) for it in norm})
    manifest.append({"key": key, "desc": desc, "pieces": npieces, "types": len(norm), "area_mm2": A, "Lmin_mm": Lmin,
                     "container_mm": Lc, "rots": [list(r) for r in rots], "holes": sum(1 for it in norm if len(it["rings"]) > 1)})
    print(f"{key:10} pezzi={npieces:3} tipi={len(norm):3} Lmin={Lmin:7.1f} mm contenitore={Lc:6.0f} rots={rots} buchi={manifest[-1]['holes']}")
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
