package com.naura.rfq.parse;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

/**
 * Reads the text layer of a PDF page by page. Scanned pages yield no text and are
 * reported as image placeholders so the caller can route them to OCR instead of
 * silently dropping content.
 */
@Component
@lombok.RequiredArgsConstructor
public class PdfBlockReader implements DocumentBlockReader {

    private final OcrClient ocr;

    private static final int MAX_PARAGRAPH_CHARS = 1200;

    @Override
    public boolean supports(String filename, String contentType) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return name.endsWith(".pdf") || (contentType != null && contentType.contains("pdf"));
    }

    @Override
    public List<RawBlock> read(Path file) throws DocumentReadException {
        return read(file, false);
    }

    /** Historical response labels and clause boundaries must retain PDF line breaks. */
    public List<RawBlock> readForHistory(Path file) throws DocumentReadException {
        return read(file, true);
    }

    private List<RawBlock> read(Path file, boolean historyLines) throws DocumentReadException {
        try (PDDocument document = Loader.loadPDF(file.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            List<RawBlock> blocks = new ArrayList<>();
            int[] images = {0};
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String pageText = stripper.getText(document);
                String anchor = "page-" + page;
                List<String> paragraphs = historyLines
                    ? pageText.lines().map(String::trim).filter(line -> !line.isBlank()).toList()
                    : splitParagraphs(pageText);
                if (paragraphs.isEmpty()) {
                    if (++images[0] > ocr.maxImages() || !ocr.enabled()) {
                        blocks.add(ocr.pending(blocks.size(), "", anchor, "扫描页 OCR 未启用或超过数量上限，待人工核对"));
                    } else {
                        try {
                            var box = document.getPage(page - 1).getCropBox();
                            double pixels = (double) box.getWidth() * box.getHeight();
                            if (!Double.isFinite(pixels) || pixels <= 0) throw new IllegalArgumentException("页面尺寸非法");
                            float scale = (float) Math.min(2.0, Math.sqrt(ocr.maxPixels() / pixels));
                            var renderer = new org.apache.pdfbox.rendering.PDFRenderer(document);
                            renderer.setSubsamplingAllowed(true);
                            var image = renderer.renderImage(page - 1, scale, org.apache.pdfbox.rendering.ImageType.RGB);
                            blocks.add(recogniseImage(image, blocks.size(), anchor));
                        } catch (Exception e) {
                            blocks.add(ocr.pending(blocks.size(), "", anchor, "扫描页渲染失败，待人工核对"));
                        }
                    }
                } else {
                    for (int index = 0; index < paragraphs.size(); index++) blocks.add(RawBlock.paragraph(blocks.size(), paragraphs.get(index), "", null,
                        historyLines ? anchor + "/line-" + index : anchor));
                    readImages(document.getPage(page - 1), blocks, images, anchor);
                }
            }
            return blocks;
        } catch (Exception exception) {
            throw new DocumentReadException("PDF 读取失败，请确认文件完整且未加密", exception);
        }
    }

    private RawBlock recogniseImage(java.awt.image.BufferedImage image, int index, String anchor) throws Exception {
        var bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", bytes);
        image.flush();
        return ocr.recognise(index, bytes.toByteArray(), "image/png", "", anchor);
    }

    /** Graphics engine visits images actually painted, including inline BI/ID/EI and nested forms. */
    private void readImages(org.apache.pdfbox.pdmodel.PDPage page, List<RawBlock> blocks,
            int[] count, String anchor) throws Exception {
        new org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine(page) {
            private java.awt.geom.Point2D point = new java.awt.geom.Point2D.Float();
            @Override public void drawImage(org.apache.pdfbox.pdmodel.graphics.image.PDImage image) {
                String location = anchor + "/image-" + ++count[0];
                if (count[0] > ocr.maxImages() || !ocr.enabled()) {
                    blocks.add(ocr.pending(blocks.size(), "", location, "OCR 未启用或超过数量上限，待人工核对"));
                } else if ((long) image.getWidth() * image.getHeight() > ocr.maxPixels()) {
                    blocks.add(ocr.pending(blocks.size(), "", location, "图片像素超过 OCR 上限，待人工核对"));
                } else {
                    try { blocks.add(recogniseImage(image.getImage(), blocks.size(), location)); }
                    catch (Exception e) { blocks.add(ocr.pending(blocks.size(), "", location, "图片读取失败，待人工核对")); }
                }
            }
            @Override public void appendRectangle(java.awt.geom.Point2D a, java.awt.geom.Point2D b, java.awt.geom.Point2D c, java.awt.geom.Point2D d) { point = a; }
            @Override public void clip(int rule) { }
            @Override public void moveTo(float x, float y) { point = new java.awt.geom.Point2D.Float(x, y); }
            @Override public void lineTo(float x, float y) { moveTo(x, y); }
            @Override public void curveTo(float a, float b, float c, float d, float x, float y) { moveTo(x, y); }
            @Override public java.awt.geom.Point2D getCurrentPoint() { return point; }
            @Override public void closePath() { }
            @Override public void endPath() { }
            @Override public void strokePath() { }
            @Override public void fillPath(int rule) { }
            @Override public void fillAndStrokePath(int rule) { }
            @Override public void shadingFill(org.apache.pdfbox.cos.COSName name) { }
        }.processPage(page);
    }

    private List<String> splitParagraphs(String pageText) {
        List<String> paragraphs = new ArrayList<>();
        if (pageText == null || pageText.isBlank()) {
            return paragraphs;
        }
        for (String raw : pageText.split("\\n\\s*\\n")) {
            String merged = raw.replaceAll("\\s*\\n\\s*", " ").replaceAll(" {2,}", " ").trim();
            if (merged.isBlank()) {
                continue;
            }
            if (merged.length() <= MAX_PARAGRAPH_CHARS) {
                paragraphs.add(merged);
                continue;
            }
            for (String line : raw.split("\\n")) {
                String cleaned = line.replaceAll(" {2,}", " ").trim();
                if (!cleaned.isBlank()) {
                    paragraphs.add(cleaned);
                }
            }
        }
        return paragraphs;
    }
}
