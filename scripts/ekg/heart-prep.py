#!/usr/bin/env python3
"""
真實心臟模型的前處理：CEMRG 四腔心網格 → 各結構表面、解剖標記點、傳導路徑、電極位置。

    python3 scripts/ekg/heart-prep.py

資料：Rodero et al., Sex- and Disease-Stratified Patient-Specific Four-Chamber Heart Models
      from Clinical CT（Zenodo 19351401，CC BY 4.0），健康對照 H2JQVUUF（FC9）。
      整包 zip 255 MB，這裡用 HTTP Range 只抽需要的檔（約 85 MB），快取在 ~/.cache/cemrg。

輸出（scripts/ekg/build/，不會部署）：
    ply/{結構}.ply      各結構朝外的表面（公尺，Y 朝上）
    heart-prep.json     標記點、傳導路徑、電極位置（毫米），給 heart-blender.py 與網頁用

座標：+x 病人左側、+y 頭側、+z 前方（與 assets/js/ekg/heart3d.js 相同），原點在心室中心。
原始網格是 CT 的 LPS（x 左、y 後、z 頭，單位 µm），所以新座標 = (x, z, −y)。

需要 numpy、scipy。
"""
import io
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from scipy.cluster.vq import kmeans2
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "scripts/ekg/build"
CASE = "H2JQVUUF"
URL = f"https://zenodo.org/records/19351401/files/{CASE}.zip?download=1"
CACHE = Path.home() / ".cache/cemrg" / CASE
FILES = [
    "tags_lvrv.json", "SAN.vtx", "fascicles_lv.vtx", "fascicles_rv.vtx",
    "electrophisiology/0.json", "electrophisiology/0.dat",
    "myocardium_AV_FEC_BB_lvrv.pts", "myocardium_AV_FEC_BB_lvrv.elem",
    "LV_endo.surf", "RV_endo.surf", "epicardium_for_sim.surf",
]
NODES_OUT = ROOT / "assets/data/ekg/heart-nodes.json"

# 顯示用的結構分組（數字是 tags_lvrv.json 的標籤）
GROUPS = {
    "LV": [1, 25],                # 左心室（含 FEC 心內膜快速層）
    "RV": [2, 28, 29],            # 右心室（29 = 右心室中膈面的 FEC）
    "LA": [3, 11, 12, 13, 14, 15, 18, 21, 22, 23, 24],   # 左心房＋肺靜脈＋左心耳
    "RA": [4, 16, 17, 19, 20],    # 右心房＋上下腔靜脈
    "Bachmann": [26],
    "Aorta": [5],
    "PulmArtery": [6],
    "MitralValve": [7],
    "TricuspidValve": [8],
    "AorticValve": [9],
    "PulmonaryValve": [10],
    "AVPlane": [27],              # 房室間的絕緣面（纖維環）
}


# ------------------------------ 下載 ------------------------------

class RangeFile(io.RawIOBase):
    """用 HTTP Range 讀遠端檔案，讓 zipfile 只抓需要的部分。"""

    def __init__(self, url):
        self.url, self.pos = url, 0
        head = urllib.request.urlopen(urllib.request.Request(url, method="HEAD"))
        self.size = int(head.headers["Content-Length"])

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos

    def readinto(self, buf):
        if self.pos >= self.size:
            return 0
        end = min(self.size, self.pos + len(buf)) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        data = urllib.request.urlopen(req).read()
        buf[:len(data)] = data
        self.pos += len(data)
        return len(data)


def fetch():
    missing = [f for f in FILES if not (CACHE / f).exists()]
    if not missing:
        return
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL), 1 << 24))
    for f in missing:
        dst = CACHE / f
        dst.parent.mkdir(parents=True, exist_ok=True)
        with z.open(f"{CASE}/{f}") as src, open(dst, "wb") as out:
            shutil.copyfileobj(src, out, 1 << 22)
        print("下載", f, dst.stat().st_size)


# ------------------------------ 網格 ------------------------------

def load_mesh():
    pts = np.loadtxt(CACHE / "myocardium_AV_FEC_BB_lvrv.pts", skiprows=1) / 1000.0  # µm → mm
    el = np.loadtxt(CACHE / "myocardium_AV_FEC_BB_lvrv.elem", skiprows=1,
                    usecols=(1, 2, 3, 4, 5), dtype=np.int64)
    P = np.stack([pts[:, 0], pts[:, 2], -pts[:, 1]], 1)        # LPS → (左, 頭, 前)
    return P, el[:, :4], el[:, 4]


def write_ply(path, V, T):
    with open(path, "wb") as f:
        f.write((
            "ply\nformat binary_little_endian 1.0\n"
            f"element vertex {len(V)}\nproperty float x\nproperty float y\nproperty float z\n"
            f"element face {len(T)}\nproperty list uchar int vertex_indices\nend_header\n"
        ).encode())
        f.write(V.astype("<f4").tobytes())
        rec = np.zeros(len(T), dtype=[("n", "u1"), ("i", "<i4", 3)])
        rec["n"], rec["i"] = 3, T
        f.write(rec.tobytes())


def surfaces(P, tet, tag):
    """每個分組的外表面：兩側屬於同一組的三角面是內部面，丟掉；法向量朝外。"""
    gid = np.full(tag.max() + 1, -1)
    for i, tags in enumerate(GROUPS.values()):
        gid[tags] = i
    F = np.concatenate([tet[:, [0, 1, 2]], tet[:, [0, 1, 3]], tet[:, [0, 2, 3]], tet[:, [1, 2, 3]]])
    opp = np.concatenate([tet[:, 3], tet[:, 2], tet[:, 1], tet[:, 0]])
    G = np.tile(gid[tag], 4)
    s = np.sort(F, 1)
    key = s[:, 0] * (1 << 42) + s[:, 1] * (1 << 21) + s[:, 2]
    order = np.lexsort((G, key))
    ks, gs = key[order], G[order]
    dup = (ks[1:] == ks[:-1]) & (gs[1:] == gs[:-1])
    inner = np.zeros(len(key), bool)
    inner[order[1:][dup]] = inner[order[:-1][dup]] = True

    # 所有結構共用頂點一起做 Taubin 平滑（不縮小），交界處兩邊移動一致，不會裂開
    S = P.copy()
    surf = F[~inner & (G >= 0)]
    e = np.concatenate([surf[:, [0, 1]], surf[:, [1, 2]], surf[:, [2, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    deg = np.bincount(e.ravel(), minlength=len(P)).astype(float)
    on = deg > 0
    for k in range(20):
        lam = 0.5 if k % 2 == 0 else -0.53
        acc = np.zeros_like(S)
        np.add.at(acc, e[:, 0], S[e[:, 1]])
        np.add.at(acc, e[:, 1], S[e[:, 0]])
        S[on] += lam * (acc[on] / deg[on, None] - S[on])

    (OUT / "ply").mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(GROUPS):
        m = ~inner & (G == i)
        tri, o = F[m].copy(), opp[m]
        a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
        flip = ((P[o] - a) * np.cross(b - a, c - a)).sum(1) > 0
        tri[flip] = tri[flip][:, [0, 2, 1]]
        used, inv = np.unique(tri, return_inverse=True)
        write_ply(OUT / "ply" / f"{name}.ply", S[used] / 1000.0, inv.reshape(-1, 3))  # 公尺
        print(f"表面 {name:15s} {len(tri):7d} 面")
    return S


# ------------------------------ 標記點與路徑 ------------------------------

class Graph:
    """四面體頂點圖：只允許走在指定標籤的組織裡，邊長 ÷ 速度權重。"""

    def __init__(self, P, tet, tag):
        self.P, self.tet, self.tag = P, tet, tag
        e = np.concatenate([tet[:, [i, j]] for i, j in [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]])
        et = np.tile(tag, 6)
        self.e, self.et = e, et

    def nodes(self, tags):
        return np.unique(self.tet[np.isin(self.tag, tags)])

    def via(self, pts, tags):
        """依序經過多個點的路徑（每段都在組織內），整條再平滑。"""
        segs = [self.path(a, b, tags, raw=True) for a, b in zip(pts[:-1], pts[1:])]
        return smooth(np.concatenate([segs[0]] + [s_[1:] for s_ in segs[1:]]))

    def path(self, a, b, tags, fast=None, raw=False):
        """a、b 是座標；回傳沿組織內最短（最快）路徑的點列。fast = {標籤: 速度倍率}。"""
        m = np.isin(self.et, tags)
        e = self.e[m]
        w = np.linalg.norm(self.P[e[:, 0]] - self.P[e[:, 1]], axis=1)
        if fast:
            mult = np.ones(len(e))
            for t, k in fast.items():
                mult[self.et[m] == t] = k
            w = w / mult
        n = len(self.P)
        G = coo_matrix((np.r_[w, w], (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), (n, n)).tocsr()
        ok = self.nodes(tags)
        ia = ok[np.linalg.norm(self.P[ok] - a, axis=1).argmin()]
        ib = ok[np.linalg.norm(self.P[ok] - b, axis=1).argmin()]
        _, pred = dijkstra(G, indices=ia, return_predecessors=True)
        seq = [ib]
        while seq[-1] != ia:
            seq.append(pred[seq[-1]])
            if seq[-1] < 0:
                raise RuntimeError("路徑不連通")
        return self.P[seq[::-1]] if raw else smooth(self.P[seq[::-1]])


def smooth(pts, step=2.0, it=30):
    """重新取樣成等距，再做幾次平滑（端點固定），讓路徑在 Blender 裡是順的曲線。"""
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    s = np.linspace(0, d[-1], max(3, int(d[-1] / step) + 1))
    q = np.stack([np.interp(s, d, pts[:, k]) for k in range(3)], 1)
    for _ in range(it):
        q[1:-1] = 0.5 * q[1:-1] + 0.25 * (q[:-2] + q[2:])
    return q


def landmarks(P, tet, tag):
    g = Graph(P, tet, tag)
    nodes = g.nodes
    vtx = lambda f: np.loadtxt(CACHE / f, skiprows=2, dtype=int)
    L = {}

    # 竇房結：資料集的 SAN.vtx 在右心房下方、靠近下腔靜脈，不符合解剖（P 波電軸會反）。
    # 改放在上腔靜脈—右心房交界的前外側（界嵴上端）。
    ring = P[nodes([19])].mean(0)
    ra = nodes([4])
    d = np.linalg.norm(P[ra] - ring, axis=1)
    cand = ra[(d > 6) & (d < 14)]
    L["SA"] = P[cand[np.argsort(-P[cand, 0] + P[cand, 2])[-20:]]].mean(0)
    L["SAN_dataset"] = P[vtx("SAN.vtx")].mean(0)

    # 希氏束穿入點：三尖瓣環上最靠近主動脈瓣的點（膜性中膈、中心纖維體）。
    tv = nodes([8])
    L["His"] = P[tv[np.linalg.norm(P[tv] - P[nodes([9])].mean(0), axis=1).argmin()]]
    # 分叉點：肌性中膈頂端 = 穿入點旁最近的左、右中膈心內膜（標籤 25、29）兩點的中間。
    near = lambda t: P[nodes([t])][np.linalg.norm(P[nodes([t])] - L["His"], axis=1).argmin()]
    L["Bifurcation"] = (near(25) + near(29)) / 2
    # 房室結：Koch 三角頂端，緊貼穿入點的右心房側（4–8 mm），
    # 選讓「房室結 → 穿入點 → 分叉點」最接近一直線的位置，希氏束才不會折返。
    tvra = np.intersect1d(tv, ra)
    dd = np.linalg.norm(P[tvra] - L["His"], axis=1)
    c = tvra[(dd > 4) & (dd < 8)]
    fwd = (L["Bifurcation"] - L["His"]) / np.linalg.norm(L["Bifurcation"] - L["His"])
    inc = (L["His"] - P[c]) / np.linalg.norm(L["His"] - P[c], axis=1)[:, None]
    L["AVN"] = P[c[(inc @ fwd).argmax()]]

    mv = P[nodes([7])].mean(0)
    lv = P[nodes([1])]
    L["Apex"] = lv[np.linalg.norm(lv - mv, axis=1).argmax()]

    # 束支終點：資料集的早期激動點（fascicles_*.vtx）分群，依位置判斷是哪一條。
    #   左側 5 群裡：中段心內膜、最前上方 = 左前分支 LAF；中段心內膜、最下後方 = 左後分支 LPF；
    #   靠近心底那群不是教科書的分支，不用。
    #   右側：在右心室心內膜（標籤 28）那群 = 右束支終點（調節束附近）；
    #   在右心室中膈面（標籤 29）那群 = 右束支早期激動的右側中膈面，只當起搏點、不畫成束支。
    #   另外加「左側中膈起搏點」：隔著中膈、離右側那群最近的左心室心內膜（標籤 25），
    #   中膈由左往右激動（V1 小 r、V6 小 q）就是從這裡開始，只當起搏點、不畫成束支。
    vt = np.zeros(len(P), int)
    vt[tet.ravel()] = np.repeat(tag, 4)
    axis = (mv - L["Apex"]) / np.linalg.norm(mv - L["Apex"]) ** 2
    groups = []
    for side, k in [("lv", 3), ("rv", 2)]:
        ids = vtx(f"fascicles_{side}.vtx")
        _, lab = kmeans2(P[ids], k, seed=1, minit="++")
        for i in range(k):
            m = ids[lab == i]
            c = P[m].mean(0)
            t = np.bincount(vt[m]).argmax()
            groups.append(dict(c=c, tag=t, level=float((c - L["Apex"]) @ axis)))
    lvmid = [g_ for g_ in groups if g_["tag"] == 25 and g_["level"] < 0.7]
    L["LAF_end"] = max(lvmid, key=lambda g_: g_["c"][1] + g_["c"][2])["c"]
    L["LPF_end"] = min(lvmid, key=lambda g_: g_["c"][1] + g_["c"][2])["c"]
    L["RBB_end"] = next(g_["c"] for g_ in groups if g_["tag"] == 28)
    rvs = next(g_["c"] for g_ in groups if g_["tag"] == 29)
    L["RV_septal_seed"] = rvs
    lvf = nodes([25])
    L["Septal_seed"] = P[lvf[np.linalg.norm(P[lvf] - rvs, axis=1).argmin()]]

    # 傳導路徑：都在組織內走，FEC（心內膜快速層）速度 ×6，讓束支貼著心內膜下走。
    V = [1, 2, 25, 28, 29]
    fecfast = {25: 6, 28: 6, 29: 6}
    paths = {}
    la_far = P[nodes([15])].mean(0)                          # 左心耳
    # 三條結間徑路（只顯示，不參與運算；心房的激動直接在心房肌上算）
    from scipy.spatial import cKDTree
    svc, ivc = P[nodes([19])].mean(0), P[nodes([20])].mean(0)
    dla, _ = cKDTree(P[nodes([3])]).query(P[ra])
    septum = ra[dla < 3.0]                                     # 房間中膈（右心房側）
    near_svc = ra[np.linalg.norm(P[ra] - svc, axis=1) < 16]
    near_ivc = ra[np.linalg.norm(P[ra] - ivc, axis=1) < 16]
    hi = septum[P[septum, 1] > np.median(P[septum, 1])]
    L["Septum_upper_ant"] = P[hi[np.argmax(P[hi, 2])]]
    L["Septum_mid_post"] = P[septum[np.argmin(np.abs(P[septum, 1] - (L["SA"][1] + L["AVN"][1]) / 2) + 0.3 * P[septum, 2])]]
    L["SVC_ant"] = P[near_svc[np.argmax(P[near_svc, 2])]]
    L["SVC_post"] = P[near_svc[np.argmin(P[near_svc, 2])]]
    L["Crista_mid"] = P[ra[np.argmin(np.abs(P[ra, 1] - (L["SA"][1] + ivc[1]) / 2) * 0.5 + P[ra, 0])]]
    L["IVC_medial"] = P[near_ivc[np.argmax(P[near_ivc, 0])]]
    paths["Internodal_ant"] = g.via([L["SA"], L["SVC_ant"], L["Septum_upper_ant"], L["AVN"]], [4])
    paths["Internodal_mid"] = g.via([L["SA"], L["SVC_post"], L["Septum_mid_post"], L["AVN"]], [4])
    paths["Internodal_post"] = g.via([L["SA"], L["Crista_mid"], L["IVC_medial"], L["AVN"]], [4])
    paths["Bachmann"] = g.path(L["SA"], la_far, [4, 26, 3], {26: 3})
    # 希氏束：從房室結穿過中心纖維體，沿肌性中膈頂端到分叉點，是一條連續的束
    paths["His_bundle"] = smooth(np.array([L["AVN"], L["His"], L["Bifurcation"]]), step=1.0, it=10)
    for k in ("LAF", "LPF"):
        paths[k] = g.path(L["Bifurcation"], L[f"{k}_end"], [1, 25], {25: 6})
    paths["RBB"] = g.path(L["Bifurcation"], L["RBB_end"], [2, 28, 29], {28: 6, 29: 6})

    return L, paths


# ------------------------------ 運算節點 ------------------------------

# 參與運算的心肌：心室（含 FEC 心內膜快速層）與心房（含左心耳、Bachmann 束）。
# 房室纖維環（27）、瓣膜、大血管、靜脈都不導電。
VENT_TAGS = {1: 0, 25: 0, 2: 1, 28: 1, 29: 1}           # → 0 LV、1 RV
ATRIAL_TAGS = {3: 2, 15: 2, 4: 3, 26: 3}                 # → 2 LA、3 RA（Bachmann 束先歸右房，另有旗標）


def compute_nodes(P, tet, tag, L, paths, h=3.2):
    """
    把心肌網格抽成網頁可以即時運算的節點圖：
      - 每 h mm 的格子一個節點（心房、心室分開抽，彼此只透過希氏束相通）
      - 相鄰關係取自原網格的邊，電流不會跨過空隙
      - 每個節點：位置、體積、分區、旗標（FEC 快速層、Bachmann 束）、
        transmural（0 心內膜 → 1 心外膜）、心壁厚度、apicobasal（0 心尖 → 1 心底）
    """
    from scipy.spatial import cKDTree
    region_of = np.full(tag.max() + 1, -1)
    for t, r in {**VENT_TAGS, **ATRIAL_TAGS}.items():
        region_of[t] = r
    treg = region_of[tag]
    keep = treg >= 0
    tk, rk, tgk = tet[keep], treg[keep], tag[keep]
    # 四面體體積平均分給四個頂點；頂點的分區、標籤取它所屬四面體的多數（用最後寫入近似即可）
    a, b, c, d = (P[tk[:, i]] for i in range(4))
    vol = np.abs(np.einsum("ij,ij->i", np.cross(b - a, c - a), d - a)) / 6
    n = len(P)
    vvol = np.zeros(n)
    for i in range(4):
        np.add.at(vvol, tk[:, i], vol / 4)
    vreg = np.full(n, -1)
    vtag = np.zeros(n, int)
    for i in range(4):
        vreg[tk[:, i]] = rk
        vtag[tk[:, i]] = tgk
    used = np.where(vreg >= 0)[0]
    # 心房、心室分開分格
    atrial = (vreg[used] >= 2).astype(np.int64)
    g = np.floor((P[used] - P[used].min(0)) / h).astype(np.int64)
    key = ((atrial * 4096 + g[:, 0]) * 4096 + g[:, 1]) * 4096 + g[:, 2]
    uk, cl = np.unique(key, return_inverse=True)
    m = len(uk)
    cluster = np.full(n, -1)
    cluster[used] = cl
    w = vvol[used]
    pos = np.zeros((m, 3))
    np.add.at(pos, cl, P[used] * w[:, None])
    cvol = np.bincount(cl, weights=w, minlength=m)
    pos /= cvol[:, None]
    # 分區與旗標：體積加權多數
    def majority(vals, k):
        acc = np.zeros((m, k))
        np.add.at(acc, (cl, vals), w)
        return acc.argmax(1), acc / acc.sum(1, keepdims=True)
    creg, _ = majority(vreg[used], 4)
    fec = np.zeros(m)
    np.add.at(fec, cl, w * np.isin(vtag[used], [25, 28, 29]))
    bb = np.zeros(m)
    np.add.at(bb, cl, w * (vtag[used] == 26))
    flags = (fec / cvol > 0.3) * 1 + (bb / cvol > 0.3) * 2
    # 邊：原網格的邊，兩端在不同節點、且同為心房或同為心室
    e = np.concatenate([tk[:, [i, j]] for i, j in [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]])
    ce = cluster[e]
    ok = (ce[:, 0] >= 0) & (ce[:, 1] >= 0) & (ce[:, 0] != ce[:, 1])
    ce = np.unique(np.sort(ce[ok], 1), axis=0)
    ce = ce[(creg[ce[:, 0]] >= 2) == (creg[ce[:, 1]] >= 2)]
    # 去掉孤立的小碎塊（只保留心房、心室各自最大的連通塊）
    from scipy.sparse.csgraph import connected_components
    A = coo_matrix((np.ones(len(ce)), (ce[:, 0], ce[:, 1])), (m, m))
    _, comp = connected_components(A, directed=False)
    good = np.zeros(m, bool)
    for at in (False, True):
        sel = (creg >= 2) == at
        good[sel & (comp == np.bincount(comp[sel]).argmax())] = True
    remap = np.cumsum(good) - 1
    ce = ce[good[ce[:, 0]] & good[ce[:, 1]]]
    ce = remap[ce]
    pos, cvol, creg, flags = pos[good], cvol[good], creg[good], flags[good]
    m = len(pos)
    # transmural：離心內膜、心外膜的距離比（心室才有意義）
    def surfverts(f):
        t = np.loadtxt(CACHE / f, skiprows=1, usecols=(1, 2, 3), dtype=int)
        return P[np.unique(t)]
    d_endo, _ = cKDTree(np.vstack([surfverts("LV_endo.surf"), surfverts("RV_endo.surf")])).query(pos)
    d_epi, _ = cKDTree(surfverts("epicardium_for_sim.surf")).query(pos)
    trans = d_endo / (d_endo + d_epi + 1e-9)
    mv = P[np.unique(tet[tag == 7])].mean(0)
    ax = mv - L["Apex"]
    ab = np.clip((pos - L["Apex"]) @ ax / (ax @ ax), 0, 1)
    vent = creg < 2
    # 資料集的 FEC 只到心尖→心底 70%，最上面 30% 沒有快速層，心底會由下往上慢慢推、產生過大的向上向量。
    # 真實心臟心底的浦金氏纖維較稀疏但仍存在，所以把快速層延伸到 90%（心內膜 2 mm 內），只留瓣環附近。
    ext = vent & (d_endo < 2.0) & (ab < 0.9)
    flags = flags | ext.astype(int)
    print(f"節點 {m}（心室 {vent.sum()}、心房 {(~vent).sum()}），邊 {len(ce)}，"
          f"FEC {(flags & 1).astype(bool).sum()}、Bachmann {((flags & 2) > 0).sum()}")

    def nearest(p, ventricular):
        idx = np.where(vent if ventricular else ~vent)[0]
        return int(idx[np.linalg.norm(pos[idx] - p, axis=1).argmin()])
    plen = lambda k: float(np.linalg.norm(np.diff(np.array(paths[k]), axis=0), axis=1).sum())
    seeds = {
        "SA": nearest(L["SA"], False), "AVN": nearest(L["AVN"], False),
        "Septal": nearest(L["Septal_seed"], True), "LAF": nearest(L["LAF_end"], True),
        "LPF": nearest(L["LPF_end"], True), "RBB": nearest(L["RBB_end"], True),
        "RVSeptal": nearest(L["RV_septal_seed"], True),
    }
    return dict(
        pos=np.round(pos, 1).ravel().tolist(), vol=np.round(cvol, 1).tolist(),
        region=creg.tolist(), flags=flags.astype(int).tolist(),
        trans=np.round(trans, 2).tolist(), apicobasal=np.round(ab, 2).tolist(),
        wall=np.round(np.where(vent, d_endo + d_epi, 3.0), 1).tolist(),       # 心壁厚度（mm）
        edges=ce.ravel().tolist(), seeds=seeds,
        bundle_mm={"His": round(plen("His_bundle"), 1), "LAF": round(plen("LAF"), 1),
                   "LPF": round(plen("LPF"), 1), "RBB": round(plen("RBB"), 1),
                   "RVSeptal": round(1.2 * float(np.linalg.norm(L["RV_septal_seed"] - L["Bifurcation"])), 1)},
    )


# ------------------------------ 冠狀動脈 ------------------------------

def coronaries(S, tet, tag, L):
    """
    冠狀動脈主幹（右優勢型），沿心外膜上的溝走：
      左主幹 LM：左冠狀竇開口 → 前室間溝頂端，分成
        LAD：沿前室間溝到心尖
        LCx：沿左房室溝往後，停在到房室交叉（crux）約 3/4 處
      RCA：右冠狀竇開口 → 右房室溝 → 房室交叉
        PDA：沿後室間溝往心尖，約 2/3 長
    S 是平滑後的頂點（與 GLB 表面一致）。路徑在心外膜表面上算，溝裡的邊權重較低，血管會順著溝走。
    """
    # 整個網格的外表面：只出現一次的三角面，取最大的連通塊（心外膜＋大血管外壁）
    F = np.concatenate([tet[:, [0, 1, 2]], tet[:, [0, 1, 3]], tet[:, [0, 2, 3]], tet[:, [1, 2, 3]]])
    opp = np.concatenate([tet[:, 3], tet[:, 2], tet[:, 1], tet[:, 0]])
    s = np.sort(F, 1)
    key = s[:, 0] * (1 << 42) + s[:, 1] * (1 << 21) + s[:, 2]
    _, idx, cnt = np.unique(key, return_index=True, return_counts=True)
    bnd = idx[cnt == 1]
    tri, o = F[bnd], opp[bnd]
    e = np.unique(np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), 1), axis=0)
    n = len(S)
    from scipy.sparse.csgraph import connected_components
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), (n, n))
    _, comp = connected_components(A, directed=False)
    used = np.unique(tri)
    big = np.bincount(comp[used]).argmax()
    keep = comp[tri[:, 0]] == big
    tri, o = tri[keep], o[keep]
    # 頂點法向量（朝外）
    a, b, c = S[tri[:, 0]], S[tri[:, 1]], S[tri[:, 2]]
    fn = np.cross(b - a, c - a)
    fn[((S[o] - a) * fn).sum(1) > 0] *= -1
    vn = np.zeros_like(S)
    for k in range(3):
        np.add.at(vn, tri[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    surf = np.unique(tri)
    e = np.unique(np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), 1), axis=0)

    # 每個表面頂點接觸到哪些分區
    def touch(tags):
        m = np.zeros(n, bool)
        m[np.unique(tet[np.isin(tag, tags)])] = True
        return m
    LVm, RVm = touch([1, 25]), touch([2, 28, 29])
    ATm = touch([3, 4, 27, 7, 8])                                # 心房、房室纖維環、房室瓣
    on = np.zeros(n, bool)
    on[surf] = True
    iv = on & LVm & RVm                                          # 室間溝
    iv_ant = iv & (vn[:, 1] > -0.3)                              # 前室間溝（朝前上）
    iv_post = iv & (vn[:, 1] <= -0.3)                            # 後室間溝（在橫膈面）
    av_l = on & LVm & ATm & ~RVm                                 # 左房室溝
    av_r = on & RVm & ATm & ~LVm                                 # 右房室溝
    crux_c = on & LVm & RVm & ATm & (vn[:, 1] < 0)               # 房室交叉（後下方）

    def graph(groove):
        w = np.linalg.norm(S[e[:, 0]] - S[e[:, 1]], axis=1)
        w = np.where(groove[e[:, 0]] & groove[e[:, 1]], w * 0.12, w)
        return coo_matrix((np.r_[w, w], (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), (n, n)).tocsr()

    def route(ia, ib, groove, frac=1.0):
        _, pred = dijkstra(graph(groove), indices=ia, return_predecessors=True)
        seq = [ib]
        while seq[-1] != ia:
            seq.append(pred[seq[-1]])
        seq = np.array(seq[::-1])
        if frac < 1:
            d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(S[seq], axis=0), axis=1))]
            seq = seq[d <= frac * d[-1]]
        return seq

    nearest = lambda mask, p: np.where(mask)[0][np.linalg.norm(S[mask] - p, axis=1).argmin()]
    # 開口：主動脈瓣上方 5–15 mm 的主動脈外壁；左冠狀竇朝左後、右冠狀竇朝右前
    aov = S[np.unique(tet[tag == 9])].mean(0)
    ao = on & touch([5])
    ids = np.where(ao)[0]
    dd = np.linalg.norm(S[ids] - aov, axis=1)
    root = ids[(dd > 5) & (dd < 15)]
    rc = S[root].mean(0)
    dl, dr = np.array([1, 0, -0.6]), np.array([-0.4, 0, 1])
    ost_l = root[((S[root] - rc) @ dl).argmax()]
    ost_r = root[((S[root] - rc) @ dr).argmax()]
    # 左主幹分叉：前室間溝與左房室溝交會處 ≈ 前室間溝上離左冠狀動脈開口最近的點
    ia_ant = np.where(iv_ant)[0]
    bif = ia_ant[np.linalg.norm(S[ia_ant] - S[ost_l], axis=1).argmin()]
    print("左主幹直線距離 %.0f mm" % np.linalg.norm(S[bif] - S[ost_l]))
    apex = nearest(on, L["Apex"])
    crux = np.where(crux_c)[0][S[crux_c, 1].argmin()] if crux_c.any() else nearest(iv_post, L["Apex"])

    # 開口到心臟表面這段走在心外膜脂肪裡（網格上是空隙），用直線接到最近的溝
    entry_r = nearest(av_r, S[ost_r])
    lift = lambda seq: S[seq] + vn[seq] * 1.5                    # 浮在表面上 1.5 mm
    seqs = {
        "LM": np.array([S[ost_l], (S[ost_l] + S[bif]) / 2 + vn[bif] * 1.5, lift([bif])[0]]),
        "LAD": lift(route(bif, apex, iv_ant)),
        "LCx": lift(route(bif, crux, av_l, 0.75)),
        "RCA": np.vstack([S[ost_r], lift(route(entry_r, crux, av_r))]),
        "PDA": lift(route(crux, apex, iv_post, 0.65)),
    }
    out = {}
    for k, pts in seqs.items():
        out[k] = smooth(pts, step=2.0, it=15)
        print(f"冠狀動脈 {k:4s} 長 {np.linalg.norm(np.diff(out[k], axis=0), axis=1).sum():5.0f} mm")
    L["LCA_ostium"], L["RCA_ostium"], L["Crux"], L["LM_bifurcation"] = S[ost_l], S[ost_r], S[crux], S[bif]
    return out


# ------------------------------ 胸廓與電極 ------------------------------

# 胸廓參數（mm）。CT 只裁到心臟，胸壁用典型成人比例推，之後可依文獻或教材再調。
CHEST = dict(
    half_width=145.0,     # 第 5 肋間高度的胸廓半寬
    half_depth=100.0,     # 前後半徑
    wall=40.0,            # 右心室前緣到皮膚（胸骨＋軟組織＋肺緣），太近時 V1 會被右心室近場主導
    right_border=45.0,    # 右心緣（右心房）在中線右側 4.5 cm
    ics=25.0,             # 胸骨旁相鄰肋間的高度差
    slope=0.2,            # 肋間往外側下斜（每往外 1 cm 下降 2 mm）
    mcl=85.0,             # 鎖骨中線離中線
    aal_deg=62.0,         # 前腋線：從正前方繞胸壁的角度
)


def chest_frame(P, tet, tag, apex):
    """
    以心臟定出胸廓：
      - 中線 = 右心緣往左 4.5 cm
      - 心尖搏動在第 5 肋間、鎖骨中線內側 → 第 5 肋間在鎖骨中線處的高度 = 心尖高度
      - 胸壁是橢圓柱，前緣在右心室前方 2.5 cm
    回傳胸廓參數（含各肋間在中線的高度）。
    """
    X = P[np.unique(tet[np.isin(tag, [1, 2, 3, 4, 25, 28, 29])])]
    c = dict(CHEST)
    c["midline_x"] = X[:, 0].min() + c["right_border"]
    c["front_z"] = X[:, 2].max() + c["wall"]
    c["center_z"] = c["front_z"] - c["half_depth"]
    y5 = apex[1] + c["slope"] * c["mcl"]                # 第 5 肋間在胸骨旁的高度
    c["ics_y"] = {n: y5 + (5 - n) * c["ics"] for n in range(2, 8)}
    return c


def on_chest(c, theta, y):
    """胸壁上的點：theta = 從正前方往病人左側繞的角度（度），y = 高度。"""
    t = np.radians(theta)
    return [c["midline_x"] + c["half_width"] * np.sin(t), y, c["center_z"] + c["half_depth"] * np.cos(t)]


def theta_at(c, u):
    """離中線 u mm（左正）在胸壁正面的角度。"""
    return float(np.degrees(np.arcsin(np.clip(u / c["half_width"], -1, 1))))


def ics_y(c, n, u):
    """第 n 肋間在離中線 u 處的高度（往外側下斜）。"""
    return c["ics_y"][n] - c["slope"] * abs(u)


def electrodes(c, heart_center):
    """
    胸前導程（Hampton《The ECG Made Easy》、《Making Sense of the ECG》Fig 3.2）：
      V1 第 4 肋間胸骨右緣、V2 第 4 肋間胸骨左緣、V4 第 5 肋間鎖骨中線、
      V3 在 V2 與 V4 中間、V5 前腋線與 V4 同高、V6 腋中線與 V4 同高。
    肢體導程用 Einthoven 理想三角形（I = 0°、II = 60°、III = 120°），離心臟 30 cm。
    """
    sb = 18.0                                          # 胸骨緣離中線
    E = {
        "V1": on_chest(c, theta_at(c, -sb), ics_y(c, 4, sb)),
        "V2": on_chest(c, theta_at(c, sb), ics_y(c, 4, sb)),
    }
    y4 = ics_y(c, 5, c["mcl"])
    E["V4"] = on_chest(c, theta_at(c, c["mcl"]), y4)
    E["V3"] = on_chest(c, (theta_at(c, sb) + theta_at(c, c["mcl"])) / 2, (E["V2"][1] + y4) / 2)
    E["V5"] = on_chest(c, c["aal_deg"], y4)
    E["V6"] = on_chest(c, 90.0, y4)
    o = np.array([c["midline_x"], heart_center[1], c["center_z"]])
    r = 300.0
    E["RA"] = list(o + r * np.array([-np.cos(np.pi / 6), np.sin(np.pi / 6), 0]))
    E["LA"] = list(o + r * np.array([np.cos(np.pi / 6), np.sin(np.pi / 6), 0]))
    E["LL"] = list(o + r * np.array([0, -1, 0]))
    return E


# ------------------------------ 主程式 ------------------------------

def main():
    fetch()
    P, tet, tag = load_mesh()
    vent = np.isin(tag, [1, 2, 25, 28, 29])
    center = P[np.unique(tet[vent])].mean(0)
    P = P - center
    OUT.mkdir(parents=True, exist_ok=True)
    S = surfaces(P, tet, tag)
    L, paths = landmarks(P, tet, tag)
    coro = coronaries(S, tet, tag, L)
    chest = chest_frame(P, tet, tag, L["Apex"])
    E = electrodes(chest, [0, 0, 0])
    r = lambda v: np.round(np.asarray(v, float), 2).tolist()
    data = {
        "source": {
            "dataset": "Sex- and Disease-Stratified Patient-Specific Four-Chamber Heart Models from Clinical CT",
            "url": "https://zenodo.org/records/19351401", "license": "CC BY 4.0", "case": CASE,
        },
        "units": "mm", "axes": "+x 病人左、+y 頭側、+z 前方；原點 = 心室中心",
        "center_offset_mm": r(center),
        "landmarks": {k: r(v) for k, v in L.items()},
        "paths": {k: r(v) for k, v in paths.items()},
        "coronaries": {k: r(v) for k, v in coro.items()},
        "electrodes": {k: r(v) for k, v in E.items()},
        "chest": {k: ({n: round(float(y), 2) for n, y in v.items()} if isinstance(v, dict) else round(float(v), 2))
                  for k, v in chest.items()},
        "ep_params": json.load(open(CACHE / "electrophisiology/0.json"))["EP"],
    }
    json.dump(data, open(OUT / "heart-prep.json", "w"), ensure_ascii=False, indent=1)
    # 網頁用的運算資料（部署）
    nodes = compute_nodes(P, tet, tag, L, paths)
    web = {
        "source": data["source"], "units": "mm", "axes": data["axes"],
        "regions": ["LV", "RV", "LA", "RA"],
        "flags": {"fec": 1, "bachmann": 2},
        **nodes,
        "electrodes": data["electrodes"],
        "landmarks": {k: data["landmarks"][k] for k in ("SA", "AVN", "His", "Bifurcation", "Apex")},
        "paths": data["paths"],
    }
    NODES_OUT.parent.mkdir(parents=True, exist_ok=True)
    json.dump(web, open(NODES_OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print("網頁資料", NODES_OUT, NODES_OUT.stat().st_size)
    for k, v in data["landmarks"].items():
        print(f"標記 {k:14s}", v)
    for k, v in data["electrodes"].items():
        print(f"電極 {k:3s}", v)
    print({k: len(v) for k, v in data["paths"].items()})


if __name__ == "__main__":
    main()
