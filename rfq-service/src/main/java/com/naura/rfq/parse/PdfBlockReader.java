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
public class PdfBlockReader implements DocumentBlockReader {

    private static final int MAX_PARAGRAPH_CHARS = 1200;

    @Override
    public boolean supports(String filename, String contentType) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return name.endsWith(".pdf") || (contentType != null && contentType.contains("pdf"));
    }

    @Override
    public List<RawBlock> read(Path file) throws DocumentReadException {
        try (PDDocument document = Loader.loadPDF(file.toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            List<RawBlock> blocks = new ArrayList<>();
            int index = 0;
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String pageText = stripper.getText(document);
                String anchor = "page-" + page;
                List<String> paragraphs = splitParagraphs(pageText);
                if (paragraphs.isEmpty()) {
                    blocks.add(RawBlock.image(index, "（第 " + page + " 页无可读文本，可能为扫描页）", "", anchor));
                    index++;
                    continue;
                }
                for (String paragraph : paragraphs) {
                    blocks.add(RawBlock.paragraph(index, paragraph, "", null, anchor));
                    index++;
                }
            }
            return blocks;
        } catch (Exception exception) {
            throw new DocumentReadException("PDF 读取失败：" + exception.getMessage(), exception);
        }
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
