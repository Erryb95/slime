"""Disegna una soluzione Sparrow (JSON esportato) in PNG."""
import json, math, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
sol = d["solution"]
items = {it["id"]: it for it in d["items"]}
W, H = sol["strip_width"], d["strip_height"]
fig, ax = plt.subplots(figsize=(14, 14*H/W+0.6))
ax.add_patch(Rectangle((0,0), W, H, fc="#f7e9c4", ec="k", lw=1.5))
for p in sol["layout"]["placed_items"]:
    it = items[p["item_id"]]; tr = p["transformation"]
    a = math.radians(tr["rotation"]); tx, ty = tr["translation"]  # rotation esportata in gradi
    ca, sa = math.cos(a), math.sin(a)
    pts = [(x*ca - y*sa + tx, x*sa + y*ca + ty) for x, y in it["shape"]["data"]]
    ax.add_patch(Polygon(pts, closed=True, fc="#2b2f36", ec="#f2b418", lw=0.8))
ax.set_xlim(-10, W+10); ax.set_ylim(-10, H+10); ax.set_aspect("equal"); ax.axis("off")
ax.set_title(f"{d['name']}: rotolo {H:.0f} mm, lunghezza {W:.0f} mm, riempimento {sol['density']*100:.1f}%", fontsize=13)
fig.savefig(out, dpi=110, bbox_inches="tight", facecolor="white")
print("saved", out, "width", round(W,1), "density", round(sol["density"]*100,2), "placed", len(sol["layout"]["placed_items"]))
