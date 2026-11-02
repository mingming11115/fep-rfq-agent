# -*- coding: utf-8 -*-
"""Rebuild single-page RFQ progress PPT with zoned layout + status pills."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ---------- colors ----------
C_HEADER   = RGBColor(0x1F, 0x3A, 0x5F)   # deep blue
C_BG       = RGBColor(0xF7, 0xF9, 0xFB)   # near-white bg
C_CARD     = RGBColor(0xFF, 0xFF, 0xFF)
C_TEXT     = RGBColor(0x2B, 0x2B, 0x2B)
C_MUTED    = RGBColor(0x6B, 0x77, 0x85)
C_GREEN    = RGBColor(0x2E, 0x8B, 0x57)
C_GREEN_BG = RGBColor(0xE3, 0xF2, 0xE9)
C_AMBER    = RGBColor(0xC7, 0x78, 0x00)
C_AMBER_BG = RGBColor(0xFD, 0xF3, 0xE0)
C_BAR_DONE = RGBColor(0x2E, 0x8B, 0x57)
C_BAR_REST = RGBColor(0xE2, 0xE8, 0xEE)
C_ACCENT   = RGBColor(0x2F, 0x6F, 0xDE)
C_LINE     = RGBColor(0xE4, 0xE9, 0xEE)

FONT = "微软雅黑"

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank

# background
bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
bg.fill.solid(); bg.fill.fore_color.rgb = C_BG
bg.line.fill.background()
bg.shadow.inherit = False


def set_font(run, size, color, bold=False):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    r = run._r
    rPr = r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = rPr.makeelement(qn('a:ea'), {})
        rPr.append(ea)
    ea.set('typeface', FONT)


def add_text(x, y, w, h, text, size, color, bold=False, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.MIDDLE, spacing=None):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.space_after = Pt(spacing)
        run = p.add_run()
        run.text = line
        set_font(run, size, color, bold)
    return tb


def add_rect(x, y, w, h, fill, line=None, round_=False, radius=0.12):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if round_:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if line:
        shp.line.color.rgb = line; shp.line.width = Pt(0.75)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def add_progress_bar(x, y, w, h, pct, done_color=C_BAR_DONE, rest_color=C_BAR_REST):
    add_rect(x, y, w, h, rest_color, round_=True, radius=0.5)
    if pct > 0:
        add_rect(x, y, Emu(int(w * pct)), h, done_color, round_=True, radius=0.5)


IN = Inches

# ---------- 1. header bar ----------
add_rect(0, 0, prs.slide_width, IN(1.0), C_HEADER)
add_text(IN(0.55), IN(0.14), IN(9.0), IN(0.45),
         "RFQ 提效 Agent · 功能总览与进度", 22, RGBColor(0xFF, 0xFF, 0xFF), bold=True)
add_text(IN(0.55), IN(0.58), IN(9.0), IN(0.32),
         "核心业务交互已完成，Word / PDF 批阅已接入", 12.5, RGBColor(0xBF, 0xD4, 0xEE))
add_text(IN(11.0), IN(0.3), IN(1.8), IN(0.4),
         "2026.11.02", 14, RGBColor(0xBF, 0xD4, 0xEE), align=PP_ALIGN.RIGHT)

# ---------- 2. overall progress strip ----------
add_rect(IN(0.55), IN(1.35), IN(12.23), IN(0.85), C_CARD, round_=True, radius=0.18)
add_text(IN(0.85), IN(1.52), IN(2.0), IN(0.5), "整体完成度", 13, C_TEXT, bold=True)
add_progress_bar(IN(2.2), IN(1.62), IN(8.2), IN(0.32), 0.75)
add_text(IN(10.55), IN(1.52), IN(1.9), IN(0.5), "75%", 20, C_ACCENT, bold=True, align=PP_ALIGN.RIGHT)

# ---------- 3. left module table ----------
add_text(IN(0.55), IN(2.5), IN(4.0), IN(0.4), "功能模块进度", 15, C_TEXT, bold=True)

modules = [
    ("项目与资料管理", "管理交互已完成",              1.0, "完成"),
    ("原文批阅与联动", "原文定位 / 批注联动已通，Word 批阅接入", 0.8, "进行中"),
    ("智能解析与应答", "交互完成，AI 解析待接入",      0.7, "进行中"),
    ("协作评审与审批", "流程交互已完成",              1.0, "完成"),
    ("知识与机型能力", "管理交互已完成",              1.0, "完成"),
    ("定稿与导出",    "CSV 导出可用，Word 定稿待接入", 0.6, "进行中"),
]

row_h  = IN(0.72)
row_gap= IN(0.08)
top0   = IN(2.95)
left   = IN(0.55)
width  = IN(8.1)

for i, (name, desc, pct, status) in enumerate(modules):
    y = top0 + i * (row_h + row_gap)
    add_rect(left, y, width, row_h, C_CARD, round_=True, radius=0.14)
    # module name
    add_text(IN(0.85), y, IN(1.85), row_h, name, 13, C_TEXT, bold=True)
    # progress bar
    add_progress_bar(IN(2.85), y + IN(0.30), IN(2.3), IN(0.14), pct)
    add_text(IN(2.85), y + IN(0.02), IN(2.3), IN(0.24),
             f"{int(pct*100)}%", 9, C_MUTED, align=PP_ALIGN.RIGHT)
    # status desc
    add_text(IN(5.35), y, IN(1.95), row_h, desc, 9.5, C_MUTED)
    # status pill
    done = (status == "完成")
    pill_fill = C_GREEN_BG if done else C_AMBER_BG
    pill_text = C_GREEN   if done else C_AMBER
    add_rect(IN(7.35), y + IN(0.18), IN(1.05), IN(0.36), pill_fill, round_=True, radius=0.5)
    add_text(IN(7.35), y + IN(0.18), IN(1.05), IN(0.36), status, 10.5, pill_text,
             bold=True, align=PP_ALIGN.CENTER)

# ---------- 4. right panel: next steps ----------
rx, rw = IN(8.85), IN(3.93)
add_rect(rx, IN(2.5), rw, IN(4.45), C_CARD, round_=True, radius=0.06)
add_rect(rx, IN(2.5), rw, IN(0.5), C_ACCENT, round_=True, radius=0.06)
add_text(rx + IN(0.25), IN(2.5), rw - IN(0.5), IN(0.5), "下一步计划", 14,
         RGBColor(0xFF, 0xFF, 0xFF), bold=True)

steps = [
    ("01", "接入 AI 解析与知识检索", "打通智能解析与机型知识库，让应答从「人工」走向「AI 辅助」"),
    ("02", "对接企业账号与业务存储", "接入统一登录与业务数据存储，满足企业内部署要求"),
    ("03", "完善 Word 定稿导出", "补齐 Word 定稿能力，形成 CSV + Word 完整导出链路"),
]
sy = IN(3.25)
for idx, (num, title, desc) in enumerate(steps):
    y = sy + idx * IN(1.22)
    add_rect(rx + IN(0.25), y, IN(0.42), IN(0.42), C_ACCENT, round_=True, radius=0.5)
    add_text(rx + IN(0.25), y, IN(0.42), IN(0.42), num, 12, RGBColor(0xFF, 0xFF, 0xFF),
             bold=True, align=PP_ALIGN.CENTER)
    add_text(rx + IN(0.82), y - IN(0.04), rw - IN(1.1), IN(0.35), title, 12.5, C_TEXT, bold=True)
    add_text(rx + IN(0.82), y + IN(0.32), rw - IN(1.1), IN(0.75), desc, 9.5, C_MUTED)

# footer note
add_text(IN(0.55), IN(7.05), IN(8.0), IN(0.3),
         "数据截至 2026-11-02 · 核心业务交互全部完成，AI 能力接入为当前主线", 9.5, C_MUTED)

out = r"C:\Users\ming\Desktop\新建文件夹\fep-rfq-agent\outputs\rfq-progress-2026-11-02\RFQ提效Agent_功能总览与进度_2026-11-02_v2.pptx"
prs.save(out)
print("saved:", out)
