#!/usr/bin/env python3
"""
從 PTB-XL（PhysioNet，CC BY 4.0）下載指定的 12 導程心電圖，自己畫成 SVG。

    python3 scripts/ekg/render-ptbxl.py            # 全部重做
    python3 scripts/ekg/render-ptbxl.py lbbb wpw   # 只重做幾張

輸出：
    assets/images/ekg/ptbxl/{slug}.svg   標準 3×4 排列 + 下方 Lead II 節律條，25 mm/s、10 mm/mV
    assets/data/ekg-sources.json          每張圖的紀錄編號、診斷、授權（頁面上的來源標示照這份寫）

原始訊號快取在 ~/.cache/ptbxl（第一次跑需要網路），只需要 numpy。
PTB-XL 的授權是 CC BY 4.0：可以商用，但必須標示來源（頁面上每張圖下方與頁尾都有）。
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets/images/ekg/ptbxl"
SOURCES = ROOT / "assets/data/ekg-sources.json"
CACHE = Path.home() / ".cache/ptbxl"
BASE = "https://physionet.org/files/ptb-xl/1.0.3/"

# slug → (ecg_id, PTB-XL 的 SCP 診斷, 圖說)
RECORDS = {
    "normal":   (7,     "NORM",            "正常 12 導程心電圖（正常竇性節律）"),
    "afib":     (4117,  "AFIB",            "心房顫動：看不到 P 波，RR 完全不規則"),
    "aflt":     (23,    "AFLT",            "心房撲動：下方導程（II、III、aVF）的鋸齒狀 F 波"),
    "rbbb":     (621,   "CRBBB",           "完全右束支傳導阻滯：V1 的 RSR′、I 與 V6 的寬 S 波"),
    "lbbb":     (286,   "CLBBB",           "完全左束支傳導阻滯：V1 寬而深的 S 波、I 與 V6 寬而有缺口的 R 波"),
    "wpw":      (5303,  "WPW",             "WPW 症候群：PR 短、QRS 起始處的 delta wave"),
    "lvh":      (138,   "LVH",             "左心室肥厚：胸前導程電壓很高（V1 的 S + V5/V6 的 R ≥ 35 小格）"),
    "lafb":     (41,    "LAFB",            "左前分支阻滯：電軸左偏，II、III、aVF 呈 rS"),
    "imi":      (12899, "IMI",             "急性下壁心肌梗塞：II、III、aVF ST 上升，I、aVL 對側性 ST 下降"),
    "ami":      (3177,  "ASMI, IMI",       "前壁心肌梗塞：V2–V5 ST 上升、V2–V3 呈 QS 波（下方導程另有陳舊性 Q 波）"),
}

LAYOUT = [["I", "aVR", "V1", "V4"], ["II", "aVL", "V2", "V5"], ["III", "aVF", "V3", "V6"]]

MM = 4            # 每 mm 幾個 SVG 單位
PAPER_MS = 25     # mm/s
GAIN = 10         # mm/mV
ROW_MM = 30
LEFT_MM = 12      # 左邊留給校正方波


def fetch(rel):
    CACHE.mkdir(parents=True, exist_ok=True)
    dst = CACHE / rel.replace("/", "_")
    if not dst.exists():
        print("  下載", rel)
        with urllib.request.urlopen(BASE + rel, timeout=120) as r:
            dst.write_bytes(r.read())
    return dst


def load(ecg_id):
    """讀 records500 的 WFDB（format 16）→ (fs, {lead: mV 陣列})"""
    folder = f"records500/{ecg_id // 1000 * 1000:05d}/{ecg_id:05d}_hr"
    hea = fetch(folder + ".hea").read_text().splitlines()
    n_sig, fs, n = [int(float(x)) for x in hea[0].split()[1:4]]
    raw = np.frombuffer(fetch(folder + ".dat").read_bytes(), dtype="<i2").reshape(n, n_sig)
    out = {}
    for i, line in enumerate(hea[1:1 + n_sig]):
        parts = line.split()
        # 格式：檔名 16 增益(基線)/mV 解析度 零點 初值 校驗 區塊 導程名
        g = parts[2].split("/")[0]
        gain = float(g.split("(")[0])
        base = int(g.split("(")[1].rstrip(")")) if "(" in g else 0
        name = {"AVR": "aVR", "AVL": "aVL", "AVF": "aVF"}.get(parts[-1], parts[-1])
        out[name] = (raw[:, i].astype(float) - base) / gain
    return fs, out


def baseline(sig, fs):
    """去掉基線飄移：減掉 1.2 秒視窗的滑動中位數（再平滑一下）。"""
    w = int(fs * 1.2) | 1
    pad = np.pad(sig, w // 2, mode="edge")
    step = max(1, fs // 50)
    idx = np.arange(0, len(sig), step)
    med = np.array([np.median(pad[i:i + w]) for i in idx])
    med = np.interp(np.arange(len(sig)), idx, med)
    k = int(fs * 0.2)
    med = np.convolve(np.pad(med, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="valid")
    return sig - med


def path(sig, fs, x0_mm, y0_mm, t0, t1):
    seg = sig[int(t0 * fs):int(t1 * fs)][::2]
    dt = 2 / fs
    xs = x0_mm + np.arange(len(seg)) * dt * PAPER_MS
    ys = y0_mm - seg * GAIN
    pts = " ".join(f"{x * MM:.1f},{y * MM:.1f}" for x, y in zip(xs, ys))
    return f'<polyline points="{pts}"/>'


def render(slug, ecg_id, caption):
    fs, sig = load(ecg_id)
    sig = {k: baseline(v, fs) for k, v in sig.items()}
    width_mm = LEFT_MM + 10 * PAPER_MS + 4
    height_mm = ROW_MM * 4 + 6
    W, H = width_mm * MM, height_mm * MM
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{caption}">',
        "<defs>",
        f'<pattern id="s" width="{MM}" height="{MM}" patternUnits="userSpaceOnUse"><path d="M{MM} 0H0V{MM}" fill="none" stroke="#f6d4d4" stroke-width="0.5"/></pattern>',
        f'<pattern id="b" width="{5 * MM}" height="{5 * MM}" patternUnits="userSpaceOnUse"><rect width="{5 * MM}" height="{5 * MM}" fill="url(#s)"/><path d="M{5 * MM} 0H0V{5 * MM}" fill="none" stroke="#eba8a8" stroke-width="0.9"/></pattern>',
        "</defs>",
        f'<rect width="{W}" height="{H}" fill="#fffaf7"/><rect width="{W}" height="{H}" fill="url(#b)"/>',
        '<g fill="none" stroke="#1b1e27" stroke-width="1.3" stroke-linejoin="round">',
    ]
    labels = []
    for r in range(4):
        y0 = 4 + ROW_MM * r + ROW_MM * 0.62
        # 校正方波：1 mV × 0.2 秒
        c = LEFT_MM - 9
        parts.append(f'<polyline points="{c * MM},{y0 * MM} {(c + 2) * MM},{y0 * MM} {(c + 2) * MM},{(y0 - 10) * MM} {(c + 7) * MM},{(y0 - 10) * MM} {(c + 7) * MM},{y0 * MM} {(c + 9) * MM},{y0 * MM}"/>')
        if r < 3:
            for col, lead in enumerate(LAYOUT[r]):
                x0 = LEFT_MM + col * 2.5 * PAPER_MS
                parts.append(path(sig[lead], fs, x0, y0, col * 2.5, col * 2.5 + 2.5))
                labels.append((x0 + 1.5, 4 + ROW_MM * r + 5, lead))
                if col:
                    parts.append(f'<path d="M{x0 * MM} {(y0 - 4) * MM}v{8 * MM}" stroke-width="1"/>')
        else:
            parts.append(path(sig["II"], fs, LEFT_MM, y0, 0, 10))
            labels.append((LEFT_MM + 1.5, 4 + ROW_MM * r + 5, "II"))
    parts.append("</g>")
    parts.append('<g font-family="system-ui,sans-serif" font-size="14" font-weight="bold" fill="#1b1e27">')
    for x, y, t in labels:
        parts.append(f'<text x="{x * MM:.0f}" y="{y * MM:.0f}">{t}</text>')
    parts.append("</g>")
    parts.append(f'<text x="{W - 8}" y="{H - 8}" font-family="system-ui,sans-serif" font-size="11" fill="#8a7070" text-anchor="end">25 mm/s · 10 mm/mV · PTB-XL #{ecg_id} (CC BY 4.0)</text>')
    parts.append("</svg>")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{slug}.svg").write_text("\n".join(parts))


def main():
    only = sys.argv[1:]
    for slug, (ecg_id, scp, caption) in RECORDS.items():
        if only and slug not in only:
            continue
        print(slug, ecg_id)
        render(slug, ecg_id, caption)
    data = {
        "dataset": "PTB-XL, a large publicly available electrocardiography dataset (version 1.0.3)",
        "url": "https://physionet.org/content/ptb-xl/1.0.3/",
        "license": "CC BY 4.0",
        "citation": "Wagner, P., Strodthoff, N., Bousseljot, R., Samek, W., & Schaeffter, T. (2022). PTB-XL, a large publicly available electrocardiography dataset (version 1.0.3). PhysioNet. https://doi.org/10.13026/kfzx-aw45",
        "images": {slug: {"ecg_id": e, "scp": s, "caption": c, "file": f"/assets/images/ekg/ptbxl/{slug}.svg"} for slug, (e, s, c) in RECORDS.items()},
    }
    SOURCES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
