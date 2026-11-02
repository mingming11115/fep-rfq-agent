# -*- coding: utf-8 -*-
"""v3: keep v2 progress page, append a video demo slide, add fade transitions."""
import re, shutil, zipfile, pathlib
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

DIR = pathlib.Path(r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02")
SRC = DIR / "RFQ提效Agent_功能总览与进度_2026-11-02_v2.pptx"
OUT = DIR / "RFQ提效Agent_功能总览与进度_2026-11-02_v4.pptx"
MP4 = DIR / "rfq-demo-2026-11-02.mp4"
POSTER = DIR / "v3chk_22s.png"

C_HEADER = RGBColor(0x1F, 0x3A, 0x5F)
C_CARD   = RGBColor(0xFF, 0xFF, 0xFF)
C_TEXT   = RGBColor(0x2B, 0x2B, 0x2B)
C_MUTED  = RGBColor(0x6B, 0x77, 0x85)
C_ACCENT = RGBColor(0x2F, 0x6F, 0xDE)
C_BG     = RGBColor(0xF7, 0xF9, 0xFB)
FONT = "微软雅黑"
IN = Inches

prs = Presentation(str(SRC))
slide = prs.slides.add_slide(prs.slide_layouts[6])

bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
bg.fill.solid(); bg.fill.fore_color.rgb = C_BG
bg.line.fill.background(); bg.shadow.inherit = False

def set_font(run, size, color, bold=False):
    run.font.name = FONT; run.font.size = Pt(size)
    run.font.color.rgb = color; run.font.bold = bold
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = rPr.makeelement(qn('a:ea'), {}); rPr.append(ea)
    ea.set('typeface', FONT)

def add_text(x, y, w, h, text, size, color, bold=False, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.MIDDLE):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(text.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run(); run.text = line; set_font(run, size, color, bold)
    return tb

def add_rect(x, y, w, h, fill, round_=False, radius=0.12):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if round_:
        try: shp.adjustments[0] = radius
        except Exception: pass
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    shp.line.fill.background(); shp.shadow.inherit = False
    return shp

# header
add_rect(0, 0, prs.slide_width, IN(1.0), C_HEADER)
add_text(IN(0.55), IN(0.14), IN(9.5), IN(0.45),
         "系统交互演示 · 点击视频播放", 22, RGBColor(0xFF, 0xFF, 0xFF), bold=True)
add_text(IN(0.55), IN(0.58), IN(9.5), IN(0.32),
         "工作台 → 我的 RFQ → 原文批阅与应答联动 → 知识库", 12.5, RGBColor(0xBF, 0xD4, 0xEE))
add_text(IN(11.0), IN(0.3), IN(1.8), IN(0.4), "约 30 秒", 14, RGBColor(0xBF, 0xD4, 0xEE),
         align=PP_ALIGN.RIGHT)

# video (left, 16:9)
vh, vw = IN(5.35), IN(9.51)
vx, vy = IN(0.55), IN(1.55)
movie = slide.shapes.add_movie(str(MP4), vx, vy, vw, vh,
                               poster_frame_image=str(POSTER), mime_type="video/mp4")

# right scene timeline
rx, rw = IN(10.35), IN(2.43)
add_rect(rx, IN(1.55), rw, IN(5.35), C_CARD, round_=True, radius=0.08)
add_text(rx + IN(0.2), IN(1.75), rw - IN(0.4), IN(0.4), "演示场景", 13, C_TEXT, bold=True)
scenes = [
    ("00:00", "工作台总览"),
    ("00:03", "我的 RFQ · 项目列表"),
    ("00:06", "原文批阅 · 条款定位与批注"),
    ("00:14", "应答卡片 · 逐条确认"),
    ("00:21", "知识库 · 版本与审核记录"),
]
for i, (t, s) in enumerate(scenes):
    y = IN(2.3) + i * IN(0.85)
    add_text(rx + IN(0.2), y, IN(0.7), IN(0.3), t, 10.5, C_ACCENT, bold=True)
    add_text(rx + IN(0.2), y + IN(0.3), rw - IN(0.4), IN(0.45), s, 10, C_MUTED)

add_text(IN(0.55), IN(7.08), IN(8.0), IN(0.3),
         "录制于 2026-11-02 · 演示环境（本地原型 5173）", 9.5, C_MUTED)

prs.save(str(OUT))
print("pptx saved")

# ---- inject fade transitions into both slides ----
tmp = DIR / "_v3_tmp"
if tmp.exists():
    shutil.rmtree(tmp)
tmp.mkdir()
with zipfile.ZipFile(OUT) as z:
    z.extractall(tmp)

for name in ["slide1.xml", "slide2.xml"]:
    f = tmp / "ppt" / "slides" / name
    xml = f.read_text(encoding="utf-8")
    trans = '<p:transition spd="slow"><p:fade/></p:transition>'
    if "<p:transition" in xml:
        continue
    if "</p:clrMapOvr>" in xml:
        xml = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + trans, 1)
    else:
        xml = xml.replace("</p:cSld>", "</p:cSld>" + trans, 1)
    f.write_text(xml, encoding="utf-8")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for p_ in sorted(tmp.rglob("*")):
        if p_.is_file():
            z.write(p_, p_.relative_to(tmp).as_posix())
shutil.rmtree(tmp)
print("transitions added ->", OUT)
