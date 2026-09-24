#!/usr/bin/env python3
"""從實際的 PDF 裁出「使用教學」頁面用的截圖，輸出到 assets/images/guide/。

    python3 scripts/make-guide-shots.py [--src ~/Downloads/0_護理國考分章/07_pdf]

需要 PyMuPDF（pip install pymupdf）。

裁切範圍不寫死座標，而是用「上緣文字」到「下緣文字」定位，
PDF 重新產生、排版稍微位移之後重跑一次就好。某一張找不到文字時會列出來並略過，
不影響其他張。

一張截圖可以由好幾段裁切上下拼起來（例如新舊兩題並排對照）；
highlight=True 會把該段裡可以點的內部連結用虛線框起來，讓讀者知道哪裡能點。
"""
import argparse
import os
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images", "guide")
DEFAULT_SRC = os.path.expanduser("~/Downloads/0_護理國考分章/07_pdf")

SCALE = 2          # 2 倍解析度，Retina 螢幕上才不會糊
PAD = 6            # 裁切範圍上緣與左右留白（pt）
PAD_BOTTOM = 3     # 下緣少留一點，才不會切到下一題詳解底色的邊
GAP = 14           # 多段拼接時中間的間距（pt）
LINK_COLOR = (0.17, 0.35, 0.59)  # 站上的 --color-deep

EXP = "02_分章詳解"
WB = "01_分章題本"
PE = "03_考古題本"


def seg(path, page, top, bottom, highlight=False, pad_top=PAD):
    """一段裁切：path 的第 page 頁（從 0 起算），從 top 文字的上緣到 bottom 文字的下緣。

    top / bottom 可以是字串，或 (字串, 第幾個符合) 的 tuple。
    緊貼在頁首下方的段落把 pad_top 調小，才不會切到頁首文字。
    """
    return dict(path=path, page=page, top=top, bottom=bottom, highlight=highlight, pad_top=pad_top)


SHOTS = {
    # ---------- 分章詳解 ----------
    "exp-toc": [seg(f"{EXP}/00_各科合訂本/01_生解_詳解_合訂本.pdf", 4,
                    "詳解目錄", "生解-Ch14", highlight=True)],
    "exp-chapter-map": [seg(f"{EXP}/01_生解/01_生解_詳解_Ch02_皮膚系統.pdf", 4,
                            "Chapter 02", "毛髮", highlight=True)],
    "exp-headings": [seg(f"{EXP}/01_生解/01_生解_詳解_Ch02_皮膚系統.pdf", 4,
                         ("皮膚之構造", 1), ("皮膚構造概論", 1), highlight=True)],
    "exp-question": [seg(f"{EXP}/01_生解/01_生解_詳解_Ch02_皮膚系統.pdf", 4,
                         "有關皮膚結構之敘述", "115-2-內外-27")],
    "exp-explanation": [seg(f"{EXP}/01_生解/01_生解_詳解_Ch01_緒論、細胞組織與生化.pdf", 5,
                            "詳解（AI", "生理學基礎架構")],
    "exp-cross": [seg(f"{EXP}/01_生解/01_生解_詳解_Ch01_緒論、細胞組織與生化.pdf", 10,
                      "下列結構中，何者直徑最大", "114-2-基醫-2")],
    "exp-old": [
        seg(f"{EXP}/05_基護/05_基護_詳解_Ch01_緒論.pdf", 6, "王先生，闌尾炎", "112-1-基護行政-1"),
        seg(f"{EXP}/05_基護/05_基護_詳解_Ch01_緒論.pdf", 6, "針對護理學者", "107-2-基護行政-3"),
    ],
    "exp-disputed": [seg(f"{EXP}/05_基護/05_基護_詳解_Ch05_感染控制.pdf", 54,
                         "有關輪狀病毒", "106-2-產兒-76")],
    "exp-table": [seg(f"{EXP}/05_基護/05_基護_詳解_Ch11_冷熱療法.pdf", 5,
                      "表11-1", "106-2-內外-18", highlight=True)],
    "exp-table-ref": [seg(f"{EXP}/10_精神/10_精神_詳解_Ch08_雙相情緒障礙症病人的護理.pdf", 25,
                          "躁期病人常因注意力", "■ 參考", highlight=True)],
    "exp-continuation": [seg(f"{EXP}/10_精神/10_精神_詳解_Ch08_雙相情緒障礙症病人的護理.pdf", 25,
                             "承上題（", "114-3-精社-12", highlight=True)],
    # ---------- 分章題本 ----------
    "wb-jump": [seg(f"{WB}/11_社區/11_社區_題本_Ch02_流行病學.pdf", 5,
                    "為降低感染", "跳至答案區", highlight=True)],
    "wb-answers": [seg(f"{WB}/11_社區/11_社區_題本_Ch02_流行病學.pdf", 19,
                       "參考答案", "86. A", highlight=True)],
    "wb-origin": [seg(f"{WB}/11_社區/11_社區_題本_Ch02_流行病學.pdf", 16,
                      "跨章考題", "114-3-精社-30", pad_top=2)],
    # ---------- 歷年考題 ----------
    "pe-page": [seg(f"{PE}/115-1/115-1_產科與兒科護理學.pdf", 2,
                    "產科與兒科護理學", "安撫奶嘴會改變")],
}


class NotFound(Exception):
    pass


def find(page, spec, edge):
    text, nth = (spec, 0) if isinstance(spec, str) else spec
    hits = page.search_for(text)
    if len(hits) <= nth:
        raise NotFound(f"第 {page.number + 1} 頁找不到「{text}」（第 {nth + 1} 個）")
    return hits[nth].y0 if edge == "top" else hits[nth].y1


def content_x(page, y0, y1):
    """y0~y1 之間實際有內容（文字或色塊）的左右範圍；左右頁邊界不同，所以用量的。"""
    xs0, xs1 = [], []
    for b in page.get_text("blocks"):
        r = fitz.Rect(b[:4])
        if r.y1 > y0 and r.y0 < y1 and r.width > 1:
            xs0.append(r.x0)
            xs1.append(r.x1)
    for d in page.get_drawings():
        r = d["rect"]
        if r.y1 > y0 and r.y0 < y1 and r.width > 20:
            xs0.append(r.x0)
            xs1.append(r.x1)
    return min(xs0), max(xs1)


def resolve(docs, src, s):
    path = os.path.join(src, s["path"])
    if path not in docs:
        if not os.path.exists(path):
            raise NotFound(f"找不到檔案 {s['path']}")
        docs[path] = fitz.open(path)
    doc = docs[path]
    page = doc[s["page"]]
    y0 = find(page, s["top"], "top") - s["pad_top"]
    y1 = find(page, s["bottom"], "bottom") + PAD_BOTTOM
    if y1 <= y0:
        raise NotFound(f"「{s['bottom']}」在「{s['top']}」上面")
    x0, x1 = content_x(page, y0, y1)
    clip = fitz.Rect(x0 - PAD, y0, x1 + PAD, y1)
    links = []
    if s["highlight"]:
        for link in page.get_links():
            if link["kind"] in (fitz.LINK_GOTO, fitz.LINK_NAMED) and clip.intersects(link["from"]):
                links.append(link["from"] & clip)
    return doc, clip, links


def make(name, segs, src, docs):
    parts = [resolve(docs, src, s) for s in segs]
    width = max(clip.width for _, clip, _ in parts)
    height = sum(clip.height for _, clip, _ in parts) + GAP * (len(parts) - 1)

    out = fitz.open()
    page = out.new_page(width=width, height=height)
    y = 0
    for i, (doc, clip, links) in enumerate(parts):
        s = segs[i]
        target = fitz.Rect(0, y, clip.width, y + clip.height)
        page.show_pdf_page(target, doc, s["page"], clip=clip)
        for r in links:
            box = fitz.Rect(r.x0 - clip.x0, r.y0 - clip.y0 + y, r.x1 - clip.x0, r.y1 - clip.y0 + y)
            page.draw_rect(box + (-1.5, -1, 1.5, 1), color=LINK_COLOR, width=0.9, dashes="[2 1.5] 0")
        y += clip.height
        if i < len(parts) - 1:
            # 分隔線：表示中間省略了一段
            page.draw_line((width * 0.3, y + GAP / 2), (width * 0.7, y + GAP / 2),
                           color=(0.75, 0.75, 0.75), width=0.6, dashes="[3 3] 0")
            y += GAP

    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
    dest = os.path.join(OUT, f"{name}.png")
    pix.save(dest)
    return pix.width, pix.height, os.path.getsize(dest)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", default=DEFAULT_SRC, help="07_pdf 資料夾（預設 %(default)s）")
    ap.add_argument("names", nargs="*", help="只重做這幾張（預設全部）")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        sys.exit(f"✗ 找不到來源資料夾 {args.src}")
    os.makedirs(OUT, exist_ok=True)

    docs, failed = {}, []
    for name, segs in SHOTS.items():
        if args.names and name not in args.names:
            continue
        try:
            w, h, size = make(name, segs, args.src, docs)
            print(f"✓ {name}.png  {w}×{h}  {size // 1024} KB")
        except NotFound as e:
            failed.append(name)
            print(f"✗ {name}：{e}", file=sys.stderr)

    if failed:
        sys.exit(f"\n{len(failed)} 張沒產生，請調整 SHOTS 裡的定位文字：{', '.join(failed)}")


if __name__ == "__main__":
    main()
