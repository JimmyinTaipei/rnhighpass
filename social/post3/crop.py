#!/usr/bin/env python3
"""從題本 PDF 裁出第三篇用的兩張截圖（需要 PyMuPDF）：
    python3 social/post3/crop.py [--src ~/Projects/多保命護理分章/07_pdf]
其餘截圖直接用 assets/images/guide/ 現成的。
"""
import argparse, os
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--src", default=os.path.expanduser("~/Projects/多保命護理分章/07_pdf"))
src = ap.parse_args().src
doc = pymupdf.open(os.path.join(src, "01_分章題本/11_社區/11_社區_題本_Ch02_流行病學.pdf"))
page = doc[4]


def crop(name, top, bottom, pad=6):
    y0 = page.search_for(top)[0].y0 - pad
    y1 = page.search_for(bottom)[0].y1 + pad
    rect = pymupdf.Rect(page.rect.x0 + 40, y0, page.rect.x1 - 40, y1)
    page.get_pixmap(clip=rect, matrix=pymupdf.Matrix(3, 3)).save(os.path.join(HERE, "shots", name))
    print(name)


crop("wb-chapter-head.png", "社區-Ch02 流行病學", "捷徑 Ch02", pad=3)
crop("wb-q1.png", "不同廠牌", "115-2-精社-30")
