"""Genera un set di 48 sagome da insegna (mm) in SVG (per Illustrator / Arrange Master)
e in JSON ExtSPInstance (per Sparrow). Stesse geometrie, stesso ordine."""
import json, math, random
random.seed(7)
ROLL = 610.0  # larghezza rotolo mm (strip_height per jagua-rs)

def poly_regular(n, r, rot=0):
    return [(r*math.cos(rot+2*math.pi*i/n), r*math.sin(rot+2*math.pi*i/n)) for i in range(n)]
def star(n, r1, r2):
    pts=[]
    for i in range(2*n):
        r = r1 if i%2==0 else r2
        a = math.pi/2 + math.pi*i/n
        pts.append((r*math.cos(a), r*math.sin(a)))
    return pts
def arrow(L, W, head):
    s=W*0.4
    return [(0,-s/2),(L-head,-s/2),(L-head,-W/2),(L,0),(L-head,W/2),(L-head,s/2),(0,s/2)]
def leaf(L, W, n=24):
    pts=[]
    for i in range(n+1):
        t=i/n; x=L*t; y=W/2*math.sin(math.pi*t)**0.8
        pts.append((x,y))
    for i in range(n-1,0,-1):
        t=i/n; x=L*t; y=-W/2*math.sin(math.pi*t)**1.3
        pts.append((x,y))
    return pts
def rect(w,h,x=0,y=0): return [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
# lettere a blocchi (altezza H, spessore t)
def letter_L(H,t): w=H*0.7; return [(0,0),(t,0),(t,H-t),(w,H-t),(w,H),(0,H)]
def letter_T(H,t): w=H*0.8; return [(0,0),(w,0),(w,t),((w+t)/2,t),((w+t)/2,H),((w-t)/2,H),((w-t)/2,t),(0,t)]
def letter_E(H,t):
    w=H*0.65; m=(H-t)/2
    return [(0,0),(w,0),(w,t),(t,t),(t,m),(w*0.85,m),(w*0.85,m+t),(t,m+t),(t,H-t),(w,H-t),(w,H),(0,H)]
def letter_H(H,t):
    w=H*0.75; m=(H-t)/2
    return [(0,0),(t,0),(t,m),(w-t,m),(w-t,0),(w,0),(w,H),(w-t,H),(w-t,m+t),(t,m+t),(t,H),(0,H)]
def letter_I(H,t): return rect(t,H)
def letter_U(H,t):
    w=H*0.75
    return [(0,t),(t,t),(t,H),(w-t,H),(w-t,t),(w,t),(w,0),(0,0)][::-1] if False else [(0,0),(w,0),(w,H),(w-t,H),(w-t,t),(t,t),(t,H),(0,H)]
def letter_C(H,t):
    w=H*0.7
    return [(0,0),(w,0),(w,t),(t,t),(t,H-t),(w,H-t),(w,H),(0,H)]
def letter_V(H,t):
    w=H*0.8
    return [(0,H),(t*1.2,H),(w/2,t*1.1),(w-t*1.2,H),(w,H),(w/2+t*0.7,0),(w/2-t*0.7,0)]

items=[]
def add(name, pts, demand=1, rots=(0,90,180,270)):
    items.append({"name":name,"pts":[(round(x,3),round(y,3)) for x,y in pts],"demand":demand,"rots":list(rots)})

# insegna "CAFFE LEVANTE"-like: lettere grandi e medie
for ch,fn in [("C",letter_C),("A",letter_V),("F",letter_E),("E",letter_E),("L",letter_L),("V",letter_V),("N",letter_H),("T",letter_T),("H",letter_H),("I",letter_I),("U",letter_U)]:
    add(f"lettera_{ch}_grande", fn(260, 48))
for ch,fn in [("C",letter_C),("E",letter_E),("L",letter_L),("T",letter_T),("I",letter_I),("U",letter_U),("V",letter_V),("H",letter_H)]:
    add(f"lettera_{ch}_media", fn(150, 30))
for i,(L,W,h) in enumerate([(320,110,80),(240,90,60),(180,70,50),(400,120,90)]):
    add(f"freccia_{i}", arrow(L,W,h))
for i,(n,r1,r2) in enumerate([(5,110,45),(5,70,30),(6,90,55),(8,60,45)]):
    add(f"stella_{i}", star(n,r1,r2))
for i,r in enumerate([95,60,40]):
    add(f"cerchio_{i}", poly_regular(40,r))
for i,(L,W) in enumerate([(260,110),(200,80),(150,70),(330,120)]):
    add(f"foglia_{i}", leaf(L,W))
for i,(w,h) in enumerate([(300,60),(180,120),(90,90),(420,40)]):
    add(f"targa_{i}", rect(w,h))
for i,(n,r) in enumerate([(3,120),(6,80),(8,70),(3,75)]):
    add(f"poligono_{n}_{i}", poly_regular(n,r,math.pi/2))
for i,(L,W) in enumerate([(220,140),(160,100),(120,80),(300,160)]):
    add(f"rombo_{i}", [(0,0),(L/2,-W/2),(L,0),(L/2,W/2)])
for i,(L,W,h) in enumerate([(140,60,40),(100,50,35)]):
    add(f"freccia_piccola_{i}", arrow(L,W,h))
assert len(items)==48, len(items)

# --- JSON ExtSPInstance (jagua-rs) ---
inst={"name":"insegna48","strip_height":ROLL,"items":[
    {"id":i,"demand":it["demand"],"allowed_orientations":[float(r) for r in it["rots"]],
     "shape":{"type":"simple_polygon","data":[[x,y] for x,y in it["pts"]]}} for i,it in enumerate(items)]}
json.dump(inst,open("insegna48.json","w"),indent=1)

# --- SVG in mm, oggetti disposti a caso (come una selezione da nestare) ---
W_SVG, H_SVG = 1600, 1400
def bbox(p): xs=[x for x,_ in p]; ys=[y for _,y in p]; return min(xs),min(ys),max(xs),max(ys)
paths=[]; cx=20; cy=20; rowh=0
for it in items:
    x0,y0,x1,y1=bbox(it["pts"]); w=x1-x0; h=y1-y0
    if cx+w>W_SVG-20: cx=20; cy+=rowh+15; rowh=0
    d="M "+" L ".join(f"{x-x0+cx:.2f},{y-y0+cy:.2f}" for x,y in it["pts"])+" Z"
    paths.append(f'  <path id="{it["name"]}" d="{d}" fill="#2b2f36" stroke="none"/>')
    cx+=w+15; rowh=max(rowh,h)
svg=f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W_SVG}mm" height="{H_SVG}mm" viewBox="0 0 {W_SVG} {H_SVG}">
  <!-- Benchmark Corvo vs Arrange Master: 48 sagome da insegna, unita' mm, rotolo {ROLL:.0f} mm -->
{chr(10).join(paths)}
</svg>
'''
open("insegna48.svg","w",encoding="utf-8").write(svg)
tot=sum(abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))/2 for p in [it["pts"] for it in items])
print(f"items={len(items)} area_totale={tot/1e6:.3f} m2 -> lunghezza minima teorica su rotolo {ROLL:.0f} mm = {tot/ROLL:.0f} mm")
