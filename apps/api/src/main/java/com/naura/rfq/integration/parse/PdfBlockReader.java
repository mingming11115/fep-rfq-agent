package com.naura.rfq.integration.parse;

import com.naura.rfq.model.parse.RawBlock;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Reads the text layer of a PDF page by page. Scanned pages yield no text and are
 * reported as image placeholders so the caller can route them to OCR instead of
 * silently dropping content.
 */
@Component
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class PdfBlockReader implements DocumentBlockReader {

    @Autowired
    private OcrClient ocr;
    @Autowired
    private MineruPdfReader mineru;

    private static final int MAX_PARAGRAPH_CHARS = 1200;

    @Override
    public boolean supports(String filename, String contentType) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return name.endsWith(".pdf") || (contentType != null && contentType.contains("pdf"));
    }

    @Override
    public List<RawBlock> read(Path file) throws DocumentReadException {
        return readWithMineru(file, false);
    }

    /** Native fallback retains line boundaries for historical clauses and replies. */
    public List<RawBlock> readForHistory(Path file) throws DocumentReadException {
        return readWithMineru(file, true);
    }

    private List<RawBlock> readWithMineru(Path file, boolean historyLines) throws DocumentReadException {
        if (!mineru.enabled()) {
            return read(file, historyLines);
        }
        try {
            var blocks = mineru.read(file);
            if (historyLines && blocks.stream().noneMatch(block -> block.mineruTable() != null)) {
                throw new DocumentReadException("MinerU 未返回可读取的历史表格");
            }
            return recoverMineruImages(file, blocks);
        } catch (InterruptedException exception) {
            log.error("MinerU 解析 PDF 被中断", exception);
            Thread.currentThread().interrupt();
            throw new DocumentReadException("PDF 解析已中断", exception);
        } catch (Exception exception) {
            log.error("MinerU 解析 PDF 失败", exception);
            String reason = exception instanceof DocumentReadException ? exception.getMessage() : ParseHttpClient.reason(exception);
            log.warn("document.parse.mineru.fallback reason={}", reason);
            var blocks = read(file, historyLines);
            if (!historyLines && !blocks.isEmpty()) {
                var first = blocks.get(0);
                String issue = "MinerU 解析失败，已使用现有 PDF 解析：" + reason;
                if (first.issue() != null) {
                    issue += "；" + first.issue();
                }
                blocks.set(0, new RawBlock(first.index(), first.type(), first.text(), first.tableRows(), first.sectionPath(),
                    first.clauseNo(), first.anchor(), first.provenance(), issue));
            }
            return blocks;
        }
    }

    private List<RawBlock> recoverMineruImages(Path file, List<RawBlock> blocks) throws IOException {
        if (!ocr.enabled() || blocks.stream().noneMatch(block -> RawBlock.IMAGE.equals(block.type()))) {
            return blocks;
        }
        Map<String, List<RawBlock>> pages = new LinkedHashMap<>();
        for (RawBlock block : blocks) {
            String page = block.anchor().substring(0, block.anchor().indexOf('/'));
            pages.computeIfAbsent(page, ignored -> new ArrayList<>()).add(block);
        }
        try (PDDocument document = Loader.loadPDF(file.toFile())) {
            List<RawBlock> result = new ArrayList<>();
            int[] images = {0};
            for (var page : pages.entrySet()) {
                for (RawBlock block : page.getValue()) {
                    result.add(new RawBlock(result.size(), block.type(), block.text(), block.tableRows(), block.sectionPath(),
                        block.clauseNo(), block.anchor(), block.provenance(), block.issue(), block.paragraphLayout(),
                        block.mineruTable()));
                }
                if (page.getValue().stream().anyMatch(block -> RawBlock.IMAGE.equals(block.type()))) {
                    int pageIndex = Integer.parseInt(page.getKey().substring("page-".length())) - 1;
                    readImages(document.getPage(pageIndex), result, images, page.getKey());
                }
            }
            return result;
        }
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
                            if (!Double.isFinite(pixels) || pixels <= 0) {
                                throw new IllegalArgumentException("页面尺寸非法");
                            }
                            float scale = (float) Math.min(2.0, Math.sqrt(ocr.maxPixels() / pixels));
                            var renderer = new org.apache.pdfbox.rendering.PDFRenderer(document);
                            renderer.setSubsamplingAllowed(true);
                            var image = renderer.renderImage(page - 1, scale, org.apache.pdfbox.rendering.ImageType.RGB);
                            blocks.add(recogniseImage(image, blocks.size(), anchor));
                        } catch (Exception e) {
                            log.error("渲染 PDF 扫描页失败 errorType={}", e.getClass().getSimpleName());
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
            log.error("读取 PDF 文档失败 errorType={}", exception.getClass().getSimpleName());
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
            int[] count, String anchor) throws IOException {
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
                    catch (Exception e) {
                        log.error("读取 PDF 图片失败 errorType={}", e.getClass().getSimpleName());
                        blocks.add(ocr.pending(blocks.size(), "", location, "图片读取失败，待人工核对"));
                    }
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
