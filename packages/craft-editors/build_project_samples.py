"""Build explicitly labelled Word review fixtures from exported RFQ demo rows."""
import json
from pathlib import Path
import sys
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml.ns import qn

data = json.loads(Path(sys.argv[1]).read_text())
out = Path(__file__).resolve().parents[2] / 'apps/web/public/craft-demo'
out.mkdir(parents=True, exist_ok=True)
names = {'RFQ-001-DEMO-FILE-BIZ-2': 'business-clauses',
         'RFQ-001-DEMO-FILE-TECH-3': 'technical-requirements',
         'RFQ-001-DEMO-FILE-RESPONSE-MATRIX': 'response-matrix'}
for file in data['files']:
    if file['id'] not in names:
        continue
    doc = Document()
    for border in list(doc.styles.element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = section.bottom_margin = Cm(2)
    section.left_margin = section.right_margin = Cm(2.2)
    for name in ['Normal', 'Title', 'Heading 1']:
        style = doc.styles[name]
        style.font.name = 'Noto Sans CJK SC'
        style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), 'Noto Sans CJK SC')
        style.font.color.rgb = RGBColor(0, 0, 0)
    doc.styles['Normal'].font.size = Pt(10.5)
    doc.styles['Normal'].paragraph_format.space_after = Pt(7)
    doc.styles['Title'].font.size = Pt(19)
    doc.styles['Heading 1'].font.size = Pt(12)
    doc.add_paragraph(Path(file['name']).stem + ' 批阅演示', 'Title')
    doc.add_paragraph('RFQ-001  ' + file['version'])
    doc.add_paragraph('本文档由本项目的模拟条款生成，用于体验 Word 批注与协作记录联动。内容为演示摘录，实际客户文件请另行上传。')
    for row in data['rows']:
        if row.get('sourceFileId') != file['id']:
            continue
        heading = doc.add_paragraph((row.get('clause', '') + '  ' + row.get('title', '')).strip(), 'Heading 1')
        heading.paragraph_format.keep_with_next = True
        doc.add_paragraph(row.get('sourceOriginal', row.get('original', '')))
    footer = section.footer.paragraphs[0]
    footer.text = 'RFQ 项目批阅演示  原条款与应答结论保持独立'
    footer.style = doc.styles['Normal']
    path = out / (names[file['id']] + '.docx')
    doc.save(path)
    print(path)
