#!/usr/bin/env python3
"""
Proa · TugLife Systems — Extrator do Atlas de Cartas Piloto (DHN)
---------------------------------------------------------------------------
@autor    Jossian Brito
@versao   1.17.0  (script novo nesta versão)
@data     2026-09-21 12:00 UTC  (ano 2026)

O QUE ISTO FAZ (P15, Etapa B — itens 15.1 e 15.7)
Lê o PDF vetorial do "Atlas de Cartas Piloto — de Trinidad ao Rio da Prata"
(DHN/Marinha do Brasil, 2ª ed., impressão 2021 com isogônicas de 2020) e
escreve `src/data/atlas-dhn.json` com, por mês:
  - ROSAS DOS VENTOS: posição, frequência por octante (%), força Beaufort
    por octante (penas), calmaria (%) quando impressa, e a marca de rosa
    pontilhada (menos de 200 observações);
  - CORRENTES: posição, direção para onde corre (graus verdadeiros) e
    velocidade média em nós, quando rotulada;
  - do VERSO: nevoeiro, vento forte e visibilidade < 2,5 mn (% por nó da
    grade).
E, uma vez só, as ÁREAS DE PREVISÃO da Marinha (polígonos A–H, N, S).

COMO, SEM OCR
O PDF é vetorial: cada número é texto com posição e cor, cada seta é um
caminho com pontos. A carta é Mercator; a grade de 5° dá a
georreferência (resíduo < 0,04°). Regras aprendidas na carta de janeiro e
conferidas contra o exemplo da própria legenda ("Leste 54 %, força 3;
NE 8 %"):
  - rosa = círculo azul de raio 9,6 pt; hastes radiais em 8 octantes;
  - octante COM rótulo: o número é a frequência (a haste é truncada);
  - octante SEM rótulo: frequência = comprimento da haste na "Escala
    percentual de ventos", que é linear por partes — 4,55 pt/% até 20 %,
    1,5 pt/% de 20 a 50 %;
  - força Beaufort = número de penas (segmentos de ~7 pt a 45°) na ponta
    externa da haste;
  - calmaria = número no centro do círculo, se houver.
Validação embutida: a soma dos octantes + calmaria tem de dar ~100 % em
cada rosa; o script imprime as que fogem.

USO
  python3 scripts/atlas-extract.py <caminho-do-pdf>
O PDF NÃO vai para o repositório (© Marinha do Brasil). Só o JSON derivado,
e esse com a nota de licença abaixo.

LICENÇA DO DADO DERIVADO
Finalidade educativa apenas, conforme decidido para este projeto. Não é
publicação náutica e não substitui as cartas e publicações oficiais da DHN.
---------------------------------------------------------------------------
"""
import collections
import json
import math
import re
import sys
from datetime import datetime, timezone

import pymupdf  # PyMuPDF

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
OCT = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]  # por ângulo matemático 0°, 45°, …
BLUE = (0.0, 0.4913557767868042, 0.773739218711853)


def is_rose_blue(c):
    """Os azuis das rosas variam de página para página (0,0.49,0.77 / 0,0.485,0.57 …).
    Aceita-se qualquer azul sem vermelho, com verde médio e azul dominante."""
    return c is not None and c[0] < 0.08 and 0.3 < c[1] < 0.65 and 0.45 < c[2] < 0.9 and c[2] > c[1]
GREEN = (0.0, 0.6499732732772827, 0.3154650330543518)
GRAY = (0.34427404403686523, 0.34726482629776, 0.35576409101486206)
ROSE_R = 9.6
# Escala percentual de ventos (pt por %), linear por partes.
SCALE_A = (306.34 - 283.17) / 5.0   # 0–20 %: ~4.63 pt/%  (tiques 0→5)
SCALE_B = (419.21 - 374.17) / 30.0  # 20–50 %: ~1.50 pt/%
SCALE_KNEE = 20.0


def near(a, b, t=0.01):
    return a is not None and b is not None and all(abs(x - y) < t for x, y in zip(a, b))


def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


class Georef:
    """Ajuste linear x→lon e y→mercator(lat) a partir dos rótulos da grade."""

    def __init__(self, lon_pts, lat_pts):
        self.a, self.b = self._fit([x for x, _ in lon_pts], [l for _, l in lon_pts])
        self.c, self.k = self._fit([y for y, _ in lat_pts], [merc(l) for _, l in lat_pts])
        self.res_lon = max(abs(self.lon(x) - l) for x, l in lon_pts)
        self.res_lat = max(abs(self.lat(y) - l) for y, l in lat_pts)

    @staticmethod
    def _fit(xs, ys):
        n = len(xs)
        mx, my = sum(xs) / n, sum(ys) / n
        b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        return my - b * mx, b

    def lon(self, x):
        return self.a + self.b * x

    def lat(self, y):
        return math.degrees(2 * math.atan(math.exp(self.c + self.k * y)) - math.pi / 2)


def georef_front(words):
    """Rótulos de longitude no topo (y < 110) e latitude à esquerda (x < 110)."""
    lon_pts, lat_pts = [], []
    for w in words:
        t = w[4]
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        m = re.fullmatch(r"(\d+)º", t)
        if not m:
            continue
        v = int(m.group(1))
        if cy < 110 and v in (60, 55, 50, 45, 40, 35, 30, 25, 20):
            lon_pts.append((cx, -v))
        elif cx < 110 and v in (10, 5, 0, 15, 20, 25, 30, 35):
            # latitudes: 10 N, 5 N, 0, 5 S, … — o sinal vem da ordem vertical
            lat_pts.append((cy, v))
    lat_pts.sort()
    signed = []
    seen_zero = False
    for y, v in lat_pts:
        if v == 0:
            seen_zero = True
            signed.append((y, 0))
        else:
            signed.append((y, -v if seen_zero else v))
    return Georef(sorted(lon_pts), signed)


def pct_from_len(length):
    """Comprimento de haste (pt, a partir do círculo) → frequência (%)."""
    if length <= 0:
        return 0.0
    knee_len = SCALE_KNEE * SCALE_A
    if length <= knee_len:
        return length / SCALE_A
    return SCALE_KNEE + (length - knee_len) / SCALE_B


def octant_of(ang_deg):
    return OCT[int(round(((ang_deg % 360) / 45))) % 8]


def bearing_from_math(ang_deg):
    """Ângulo matemático (y para cima, 0 = leste) → rumo verdadeiro (0 = norte, horário)."""
    return (90 - ang_deg) % 360


def parse_roses(page, geo, words, drawings, exclude_legend=True):
    roses = []
    for d in drawings:
        if not (is_rose_blue(d.get("color")) and abs((d.get("width") or 0) - 1.0) < 0.05):
            continue
        # De janeiro a agosto o círculo é um desenho só de curvas; de setembro em
        # diante círculo e hastes vêm no MESMO desenho. Olha-se só as curvas.
        arcs = [it for it in d["items"] if it[0] == "c"]
        lines = [it for it in d["items"] if it[0] == "l"]
        dotted = False
        if len(arcs) >= 3:
            xs = [q.x for it in arcs for q in (it[1], it[4])]
            ys = [q.y for it in arcs for q in (it[1], it[4])]
            dashes = d.get("dashes")
            dotted = bool(dashes and dashes != "[] 0")
        elif len(lines) >= 24 and 17 < max(d["rect"].width, d["rect"].height) < 21:
            # De setembro em diante o círculo é uma polilinha de dezenas de
            # segmentos curtos. Pontilhado = segmentos somando bem menos que
            # a circunferência (2π·9,6 ≈ 60 pt).
            xs = [q.x for it in lines for q in (it[1], it[2])]
            ys = [q.y for it in lines for q in (it[1], it[2])]
            total = sum(math.hypot(it[2].x - it[1].x, it[2].y - it[1].y) for it in lines)
            dotted = total < 0.75 * 2 * math.pi * ROSE_R
        else:
            continue
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        if abs((max(xs) - min(xs)) / 2 - ROSE_R) > 1.2:
            continue
        if True:
            if exclude_legend and cx < 500 and 700 < cy < 1000:
                continue  # a rosa de exemplo da legenda
            roses.append({"cx": cx, "cy": cy, "dotted": dotted,
                          "shaftTip": collections.defaultdict(float), "feathers": [],
                          "label": {}, "calm": None})
    # Rosas pontilhadas de setembro em diante: cada traço do círculo é um
    # desenho separado de ~2 pt. Agrupam-se os traços minúsculos e, quando
    # doze ou mais caem num anel de raio ~9,6 em volta do centróide, é rosa.
    tiny = []
    for d in drawings:
        if is_rose_blue(d.get("color")):
            for it in d["items"]:
                if it[0] == "l" and math.hypot(it[2].x - it[1].x, it[2].y - it[1].y) < 3.2:
                    tiny.append(((it[1].x + it[2].x) / 2, (it[1].y + it[2].y) / 2))
    taken = set()
    for i, (x, y) in enumerate(tiny):
        if i in taken:
            continue
        near_pts = [(j, tx, ty) for j, (tx, ty) in enumerate(tiny) if abs(tx - x) < 24 and abs(ty - y) < 24]
        if len(near_pts) < 12:
            continue
        cx = sum(t[1] for t in near_pts) / len(near_pts)
        cy = sum(t[2] for t in near_pts) / len(near_pts)
        radii = [math.hypot(t[1] - cx, t[2] - cy) for t in near_pts]
        mean = sum(radii) / len(radii)
        std = (sum((r - mean) ** 2 for r in radii) / len(radii)) ** 0.5
        if 8.4 < mean < 10.8 and std < 1.3:
            if any(math.hypot(rs["cx"] - cx, rs["cy"] - cy) < 6 for rs in roses):
                continue
            for j, _, _ in near_pts:
                taken.add(j)
            if exclude_legend and cx < 500 and 700 < cy < 1000:
                continue
            roses.append({"cx": cx, "cy": cy, "dotted": True,
                          "shaftTip": collections.defaultdict(float), "feathers": [],
                          "label": {}, "calm": None})
    if not roses:
        return []

    def nearest(x, y):
        return min(roses, key=lambda rs: (rs["cx"] - x) ** 2 + (rs["cy"] - y) ** 2)

    segs = []
    for d in drawings:
        if is_rose_blue(d.get("color")) and abs((d.get("width") or 0) - 1.0) < 0.05:
            for it in d["items"]:
                if it[0] == "l":
                    segs.append((it[1], it[2]))
    for A, B in segs:
        L = math.hypot(B.x - A.x, B.y - A.y)
        rs = nearest((A.x + B.x) / 2, (A.y + B.y) / 2)
        cx, cy = rs["cx"], rs["cy"]
        ra, rb = math.hypot(A.x - cx, A.y - cy), math.hypot(B.x - cx, B.y - cy)
        if max(ra, rb) > 260:
            continue  # não é desta rosa
        inner, outer = (A, B) if ra < rb else (B, A)
        seg_ang = math.degrees(math.atan2(-(outer.y - inner.y), outer.x - inner.x))
        pos_ang = math.degrees(math.atan2(-(outer.y - cy), outer.x - cx))
        radial = abs(((seg_ang - pos_ang + 180) % 360) - 180) < 4
        # Haste desta rosa começa no círculo (9,6) ou logo depois do rótulo (~36).
        # A seta de uma rosa VIZINHA apontando para cá é colinear com o raio e
        # passaria por radial — mas começa longe do centro. Daí o teto em 45.
        if radial and L > 3.5 and min(ra, rb) < 45:
            o = octant_of(pos_ang)
            rs["shaftTip"][o] = max(rs["shaftTip"][o], max(ra, rb))
        else:
            rs["feathers"].append(((inner.x + outer.x) / 2, (inner.y + outer.y) / 2, L))
    for w in words:
        if not re.fullmatch(r"\d+", w[4]):
            continue
        x, y = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        rs = nearest(x, y)
        r = math.hypot(x - rs["cx"], y - rs["cy"])
        if r < 6:
            rs["calm"] = int(w[4])
        elif 16 < r < 48:
            rs["label"][octant_of(math.degrees(math.atan2(-(y - rs["cy"]), x - rs["cx"])))] = int(w[4])

    out = []
    for rs in roses:
        # Penas: cada uma vai para a ponta de haste mais próxima (atribuição única).
        tips = {}
        for o, tr in rs["shaftTip"].items():
            ang = math.radians(OCT.index(o) * 45)
            tips[o] = (rs["cx"] + tr * math.cos(ang), rs["cy"] - tr * math.sin(ang))
        force = collections.Counter()
        for mx, my, L in rs["feathers"]:
            if not (5.5 < L < 8.5) or not tips:
                continue
            o, (tx, ty) = min(tips.items(), key=lambda kv: (kv[1][0] - mx) ** 2 + (kv[1][1] - my) ** 2)
            if math.hypot(tx - mx, ty - my) < 16:
                force[o] += 1
        octs = {}
        for o in OCT:
            tr = rs["shaftTip"].get(o, 0.0)
            if tr <= 0:
                continue
            pct = rs["label"].get(o)
            if pct is None:
                pct = round(pct_from_len(tr - ROSE_R), 1)
            bf = force.get(o)
            # Beaufort na carta vai até 7. Acima de 8 é pena de haste vizinha
            # contada a mais numa seta minúscula: melhor "sem força" que errado.
            octs[o] = {"pct": pct, "bf": bf if bf and bf <= 8 else None}
        if len(octs) < 3:
            continue  # círculo de raio parecido que não é rosa
        total = sum(v["pct"] for v in octs.values()) + (rs["calm"] or 0)
        out.append({
            "lat": round(geo.lat(rs["cy"]), 2), "lon": round(geo.lon(rs["cx"]), 2),
            "poucosDados": rs["dotted"], "calma": rs["calm"], "oct": octs,
            "_soma": round(total, 1),
        })
    return out


def parse_currents(page, geo, words, drawings):
    """Curvas verdes (setas de corrente) + ponta preenchida + rótulo verde de velocidade."""
    curves, heads = [], []
    for d in drawings:
        if near(d.get("color"), GREEN) and abs((d.get("width") or 0) - 1.5) < 0.05:
            pts = []
            for it in d["items"]:
                if it[0] == "c":
                    pts += [it[1], it[4]]
                elif it[0] == "l":
                    pts += [it[1], it[2]]
            if len(pts) >= 2:
                curves.append(pts)
        elif near(d.get("fill"), GREEN) and d.get("color") is None:
            r = d["rect"]
            heads.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
    labels = []
    for w in words:
        if re.fullmatch(r"\d,\d", w[4]):
            labels.append(((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, float(w[4].replace(",", "."))))
    out = []
    used = set()
    for pts in curves:
        p0, p1 = pts[0], pts[-1]
        # A ponta preenchida marca a cabeça da seta.
        def dist_head(p):
            return min((math.hypot(h[0] - p.x, h[1] - p.y) for h in heads), default=1e9)
        if dist_head(p1) <= dist_head(p0):
            head, back = p1, pts[max(0, len(pts) - 3)]
        else:
            head, back = p0, pts[min(len(pts) - 1, 2)]
        if dist_head(head) > 14:
            continue  # linha verde sem ponta: não é seta
        ang = math.degrees(math.atan2(-(head.y - back.y), head.x - back.x))
        mid = pts[len(pts) // 2]
        kn = None
        best = None
        for i, (lx, ly, v) in enumerate(labels):
            dmin = min(math.hypot(lx - q.x, ly - q.y) for q in pts)
            if dmin < 45 and i not in used and (best is None or dmin < best[0]):
                best = (dmin, i, v)
        if best:
            used.add(best[1])
            kn = best[2]
        out.append({"lat": round(geo.lat(mid.y), 2), "lon": round(geo.lon(mid.x), 2),
                    "dir": int(round(bearing_from_math(ang))), "kn": kn})
    return out


def parse_areas(page, geo, words, drawings):
    """Arestas cinza (largura 2) das áreas de previsão, em lat/lon, e as letras."""
    edges = []
    for d in drawings:
        if near(d.get("color"), GRAY) and abs((d.get("width") or 0) - 2.0) < 0.05:
            pts = []
            for it in d["items"]:
                if it[0] == "l":
                    pts += [it[1], it[2]]
            if len(pts) >= 2:
                edges.append([[round(geo.lat(q.y), 2), round(geo.lon(q.x), 2)] for q in pts])
    letters = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["size"] > 25 and re.fullmatch(r"[A-Z]", s["text"].strip()):
                    x, y = (s["bbox"][0] + s["bbox"][2]) / 2, (s["bbox"][1] + s["bbox"][3]) / 2
                    letters.append({"nome": s["text"].strip(), "lat": round(geo.lat(y), 2), "lon": round(geo.lon(x), 2)})
    return {"arestas": edges, "letras": letters}


def georef_panel(words, x_lo, x_hi, y_top):
    """Um painel do verso: rótulos de lon (60…20) numa linha em y ≈ y_top, e de
    lat (10 N, 0, 10 S, 20 S, 30 S) na margem esquerda, x ≈ x_lo − 40."""
    lon_pts, lat_pts = [], []
    for w in words:
        m = re.fullmatch(r"(\d+)º", w[4])
        if not m:
            continue
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        v = int(m.group(1))
        if abs(cy - y_top) < 14 and x_lo - 10 < cx < x_hi + 10 and v in (60, 50, 40, 30, 20):
            lon_pts.append((cx, -v))
        elif x_lo - 55 < cx < x_lo - 20 and y_top + 20 < cy < y_top + 420 and v in (30, 20, 10, 0):
            lat_pts.append((cy, v))
    lat_pts.sort()
    signed, seen_zero = [], False
    for y, v in lat_pts:
        if v == 0:
            seen_zero = True
            signed.append((y, 0))
        else:
            signed.append((y, -v if seen_zero else v))
    if len(lon_pts) < 3 or len(signed) < 3:
        return None
    return Georef(sorted(lon_pts), signed)


# Painéis do verso (x_lo, x_hi, y_top dos rótulos de lon). Escala 8,5 pt/°.
PANEL_FOG_GALE = (199, 539, 112)   # superior esquerdo: nevoeiro (em cima) e vento forte (embaixo), vermelho
PANEL_VIS = (1068, 1408, 112)      # superior direito: visibilidade < 2,5 mn, azul, só rótulos das isolinhas


def parse_verso(page):
    """Painel superior esquerdo: em cada nó da grade, dois decimais vermelhos —
    nevoeiro em cima, vento forte 32 pt abaixo. Painel superior direito: a
    visibilidade é traçada em isolinhas; guardam-se só os rótulos impressos."""
    words = page.get_text("words")
    red_rects, blue_rects = [], []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for sp in l["spans"]:
                if sp["color"] == 15539236:
                    red_rects.append(pymupdf.Rect(sp["bbox"]))
                elif sp["color"] == 32197:
                    blue_rects.append(pymupdf.Rect(sp["bbox"]))

    def colour_of(w):
        pt = pymupdf.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
        if any(r.contains(pt) for r in red_rects):
            return "red"
        if any(r.contains(pt) for r in blue_rects):
            return "blue"
        return None

    def in_panel(w, panel):
        x_lo, x_hi, y_top = panel
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        return x_lo - 5 < cx < x_hi + 5 and y_top + 20 < cy < y_top + 470

    fog, gale, vis = [], [], []
    g1 = georef_panel(words, *PANEL_FOG_GALE)
    if g1 is not None:
        reds = sorted(((round((w[0] + w[2]) / 2, 1), round((w[1] + w[3]) / 2, 1), float(w[4].replace(",", ".")))
                       for w in words if re.fullmatch(r"\d+,\d", w[4]) and in_panel(w, PANEL_FOG_GALE) and colour_of(w) == "red"),
                      key=lambda t: (t[0], t[1]))
        used = set()
        for i, (x, y, v) in enumerate(reds):
            if i in used:
                continue
            below = [j for j, (x2, y2, _) in enumerate(reds) if j != i and j not in used and abs(x2 - x) < 6 and 22 < y2 - y < 40]
            used.add(i)
            if below:
                j = below[0]
                used.add(j)
                ym = (y + reds[j][1]) / 2
                node = {"lat": round(g1.lat(ym), 1), "lon": round(g1.lon(x), 1)}
                fog.append({**node, "pct": v})
                gale.append({**node, "pct": reds[j][2]})
            else:
                fog.append({"lat": round(g1.lat(y), 1), "lon": round(g1.lon(x), 1), "pct": v})
    g3 = georef_panel(words, *PANEL_VIS)
    if g3 is not None:
        for w in words:
            if re.fullmatch(r"\d+", w[4]) and in_panel(w, PANEL_VIS) and colour_of(w) == "blue":
                cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
                vis.append({"lat": round(g3.lat(cy), 1), "lon": round(g3.lon(cx), 1), "pct": int(w[4])})
    return {"nevoeiro": fog, "ventoForte": gale, "visibilidade": vis,
            "_georef": {"nevoeiro": round(g1.res_lat, 3) if g1 else None, "visibilidade": round(g3.res_lat, 3) if g3 else None}}


def main(path):
    doc = pymupdf.open(path)
    meses = []
    areas = None
    for m in range(12):
        page = doc[4 + 2 * m]
        words = page.get_text("words")
        drawings = page.get_drawings()
        geo = georef_front(words)
        blues = collections.Counter(tuple(round(c, 3) for c in d["color"]) for d in drawings
                                    if d.get("color") and is_rose_blue(d["color"]) and any(it[0] == "l" for it in d["items"]))
        roses = parse_roses(page, geo, words, drawings)
        currents = parse_currents(page, geo, words, drawings)
        if areas is None:
            areas = parse_areas(page, geo, words, drawings)
        verso = parse_verso(doc[5 + 2 * m])
        bad = [r for r in roses if abs(r["_soma"] - 100) > 6]
        print(f"{MESES[m]:10s} rosas={len(roses):2d} (fora de 94–106%: {len(bad)}) correntes={len(currents):3d} "
              f"rotuladas={sum(1 for c in currents if c['kn'] is not None):3d} "
              f"nevoeiro={len(verso['nevoeiro'])} vf={len(verso['ventoForte'])} vis={len(verso['visibilidade'])} "
              f"georef±{geo.res_lat:.3f}° azuis={dict(blues)}")
        for r in bad:
            print(f"    ! rosa {r['lat']},{r['lon']} soma {r['_soma']}")
        for r in roses:
            r["soma"] = r.pop("_soma")
        meses.append({"mes": m + 1, "nome": MESES[m], "rosas": roses, "correntes": currents,
                      "nevoeiro": verso["nevoeiro"], "ventoForte": verso["ventoForte"],
                      "visibilidade": verso["visibilidade"]})
    out = {
        "fonte": "Atlas de Cartas Piloto — de Trinidad ao Rio da Prata. DHN / Marinha do Brasil, "
                 "2ª ed. (1993), impressão 2021 (isogônicas 2020). Observações 1985–2013.",
        "licenca": "Dado derivado para FINALIDADE EDUCATIVA apenas. © Marinha do Brasil / DHN sobre a obra "
                   "original. Não é publicação náutica; não substitui as cartas e publicações oficiais.",
        "gerado": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "extrator": "scripts/atlas-extract.py",
        "convencoes": {
            "rosas.oct": "frequência (%) por octante DE ONDE sopra; bf = força Beaufort (penas); "
                         "sem rótulo impresso, a frequência vem do comprimento da haste na escala da carta",
            "rosas.calma": "% impressa no centro; null = não impressa",
            "rosas.poucosDados": "rosa pontilhada na carta: menos de 200 observações",
            "correntes.dir": "graus verdadeiros PARA ONDE a corrente corre; kn = velocidade média, null = sem rótulo",
            "verso": "nevoeiro e ventoForte: percentual aproximado por nó da grade oceânica (5°); "
                     "visibilidade < 2,5 mn: a carta traça isolinhas — guardam-se só os pontos rotulados, "
                     "entre eles o valor não está disponível",
            "areas": "arestas cinza das áreas de previsão da Marinha, em [lat, lon]; letras com posição",
        },
        "meses": meses,
        "areas": areas,
    }
    with open("src/data/atlas-dhn.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("escrito src/data/atlas-dhn.json")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: atlas-extract.py <pdf>")
    main(sys.argv[1])
