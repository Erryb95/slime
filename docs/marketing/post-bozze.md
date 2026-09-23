> **Da rivedere prima di pubblicare** (controllo 2026-09-23): bozze scritte con DeepSeek e corrette a mano. Tolte le frasi inventate sull'autore insegnista e la promessa Mac non ancora provata. I file DXF si possono ricevere ma oggi si convertono in Illustrator prima del nesting. Inserire link alla lista beta e al video.

Ecco le bozze richieste.

---

### 1. Post Signs101 (Inglese)

**Title: We built a true-shape nesting plugin for Illustrator (Corvo) – benchmark data inside, looking for real-world test files**

Hi everyone,

I'm a software engineer who works with CAD/CAM, and I kept hearing from sign makers about vinyl waste. I've been developing a true-shape nesting plugin for Adobe Illustrator called **Corvo**.

It’s not ready for sale yet (the panel UI is still in development), but the engine is solid. I want to share the benchmark we ran, because I think it matters more than marketing talk.

We tested Corvo against Arrange Master (the $39–$159 plugin) on 14 different sets: channel letters with holes, arrows, apparel, industrial parts. Roll width 600mm, 2mm spacing.

**The results:**
- **Corvo:** 10.5m of roll used.
- **Arrange Master:** 12.8m used.
- That’s **17.9% less material**. The median saving per job was 14.2%, and it never dropped below 9.5%.
- Average fill rate: 78.7% vs 63.8%.

On a real sign job with 48 shapes, Corvo nested it in 1.62m vs 2.13m for the other guy. It runs inside Illustrator, takes 30-60 seconds on a normal PC (tested on Windows; Mac support is planned for the release). The engine is based on Sparrow, an open-source academic algorithm from KU Leuven (2025).

**I need your help.**
I want to stress-test the engine with real-world files before the beta.
If you have a messy SVG, DXF, or AI file you’d normally nest, send it to me. I’ll run it through Corvo and send you back the comparison data (material length used).

No hype, just data. If you want to see the beta when it’s live (with live nesting, rotations, and roll width control), join the list here: [Link]

---

### 2. Post Reddit r/vinylcutters or r/signs (Inglese)

**Title: I'm building a true-shape nesting plugin for Illustrator. Benchmarks show 17% less vinyl waste vs Arrange Master. Looking for messy files to test.**

Engineer here, not a sign maker, so I'll keep this short and just show data.

I kept seeing threads about vinyl waste and bounding-box nesting, so I've been working on a plugin called Corvo for Illustrator. It uses a new open-source nesting algorithm (Sparrow) that's actually state-of-the-art, not just a bounding-box hack.

We benchmarked it against Arrange Master. On 14 sets (letters, industrial, apparel), Corvo used 10.5m of roll vs 12.8m. That's 17.9% less material. Fill rate was 78.7% vs 63.8%.

It runs inside Illustrator, takes 30-60 seconds, no external programs.

**The catch:** It's not out yet. The engine works, but the panel is in development. Before I finalize the beta (which will have live nesting, rotations, and roll width), I need to break the engine.

If you have a complex cut file (SVG, DXF, AI) that usually gives you nesting nightmares, send it my way. I'll run it and share the numbers with you.

If you want in on the beta (one-time price, no subscription), drop your email here: [Link]

---

### 3. Post per gruppi Facebook sign makers / DTF (Inglese)

**Subject: True-shape nesting for Illustrator – Looking for test files (and beta testers)**

Hey everyone,

I’m developing a new nesting plugin for Illustrator called **Corvo**. It uses the Sparrow algorithm (KU Leuven, 2025) to pack shapes tighter than the standard tools.

We ran a benchmark against Arrange Master on 14 sets (600mm roll, 2mm gap).
**Result:** Corvo used 10.5m of roll vs 12.8m. That’s **17.9% less material waste**. Fill rate was 78.7% vs 63.8%.

It runs inside Illustrator, takes 30-60 seconds. Windows tested, Mac planned for the release.

I’m looking for two things:
1. **Real files:** Send me your messy SVG/DXF/AI files. I’ll nest them and send you the data.
2. **Beta testers:** The beta will have live nesting, rotation control, and roll width settings. It’s a one-time price, no subscription.

Drop a comment or DM me if you want to test the engine.

---

### 4. Post per gruppi Facebook italiani (Italiano)

**Oggetto: Nesting true-shape per Illustrator – Cerco file reali per test (e beta tester)**

Ciao a tutti,

sto sviluppando un plugin di nesting per Illustrator chiamato **Corvo**. Non è il solito algoritmo a bounding box, usa un motore accademico (Sparrow, KU Leuven 2025) che lavora sulla forma reale.

Abbiamo fatto un benchmark su 14 set (insegne, abbigliamento, industriale) con rotolo da 600mm e 2mm di spazio.
**Risultato:** Corvo ha usato 10,5m di rotolo contro 12,8m di Arrange Master. Il **17,9% in meno**. Riempimento medio 78,7% contro 63,8%.

Gira dentro Illustrator, 30-60 secondi. Provato su Windows, Mac previsto per l'uscita.

Sto cercando due cose:
1. **File reali:** Mandatemi i vostri file più rognosi (SVG, DXF, AI). Li nesto e vi mando i dati.
2. **Beta tester:** Nella beta ci sarà nesting live, rotazioni e larghezza rotolo. Prezzo una tantum, niente abbonamento.

Scrivetemi in DM se volete provarlo.

---

### 5. Testo per la landing page (Inglese)

**Headline:**
Stop paying for empty space.

**Subheadline:**
Corvo is a true-shape nesting plugin for Adobe Illustrator. It uses the Sparrow algorithm to pack your shapes tighter, saving you material on every roll.

**Benefit Bullets:**
- **Save 17.9% on material:** In our benchmark against Arrange Master, Corvo used 10.5m of roll instead of 12.8m. Fill rate was 78.7% vs 63.8%.
- **Runs inside Illustrator:** No external software. 30-60 seconds on a standard PC. Windows and Mac planned.
- **One-time price:** No subscriptions. Own the tool.

**Call to Action:**
We are currently testing the beta (live nesting, rotations, spacing, roll width).
**Join the beta list for early access and a tester discount.**

[Button: Join the Beta List]

---

### 6. Script video 30 secondi (Inglese)

**Scene 1:**
*Split screen. Left side: Arrange Master result. Right side: Corvo result. Both nesting the same 48-shape sign file.*
**Voiceover:** "Same file. Same roll. Same 2mm spacing."

**Scene 2:**
*Camera zooms in on the roll length numbers at the bottom of the screen.*
**Voiceover:** "Arrange Master used 2.13 meters."

**Scene 3:**
*Camera pans to the Corvo side.*
**Voiceover:** "Corvo used 1.62 meters."

**Scene 4:**
*Text overlay appears: 17.9% Less Material. Fill Rate: 78.7% vs 63.8%.*
**Voiceover:** "That's 17.9% less waste. And it runs inside Illustrator in under a minute."

**Scene 5:**
*Logo Corvo appears. Text below: Beta Sign-up.*
**Voiceover:** "Corvo. True-shape nesting. No hype, just tighter nests. Link in bio for the beta."