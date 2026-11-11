package com.naura.rfq.integration.parse;

import static com.naura.rfq.integration.parse.DocxBlockReader.applyHeading;
import static com.naura.rfq.integration.parse.DocxBlockReader.clean;
import static com.naura.rfq.integration.parse.DocxBlockReader.headingLevel;
import static com.naura.rfq.integration.parse.DocxBlockReader.nativeParagraphText;
import static com.naura.rfq.integration.parse.DocxBlockReader.sectionPath;

import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.RawBlock;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFAbstractFootnoteEndnote;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.springframework.stereotype.Component;

@Component
public class WordMarkdownReader {
    private final ParseIntegrationProperties.WordMarkdown settings;
    private final DocxBlockReader word;

    public WordMarkdownReader(ParseIntegrationProperties properties, DocxBlockReader word) {
        this.settings = properties.getWordMarkdown();
        this.word = word;
    }

    public record Content(String markdown, List<RawBlock> blocks, Set<Integer> availableSources,
            List<String> issues) { }

    public Content read(Path original, int maxBlocks) throws IOException, DocumentReadException, InterruptedException {
        Path marked = Files.createTempFile("rfq-marked-", ".docx");
        try {
            var sources = new ArrayList<RawBlock>();
            var sections = new ArrayList<String>();
            var images = new int[1];
            String prefix = "RFQSOURCE" + UUID.randomUUID().toString().replace("-", "") + "Z";
            try (var input = Files.newInputStream(original); var document = new XWPFDocument(input);
                    var output = Files.newOutputStream(marked)) {
                mark(WordSourceBody.elements(document), "body", prefix, sections, sources, images);
                markNotes(document.getFootnotes(), "footnote", prefix, sources, images);
                markNotes(document.getEndnotes(), "endnote", prefix, sources, images);
                document.write(output);
            }
            if (sources.size() > maxBlocks) {
                throw new DocumentReadException("Word 来源数量超过上限 " + maxBlocks + "，请拆分文档后重试");
            }
            return mapMarkdown(convert(marked), prefix, sources);
        } finally {
            Files.deleteIfExists(marked);
        }
    }

    private void mark(List<IBodyElement> elements, String parent, String prefix,
            List<String> sections, List<RawBlock> sources, int[] images) {
        for (int index = 0; index < elements.size(); index++) {
            String anchor = parent + "/" + index;
            if (elements.get(index) instanceof XWPFParagraph paragraph) {
                String text = paragraphText(paragraph);
                int level = WordParagraphLayout.read(paragraph, text, headingLevel(paragraph.getStyle())).headingLevel();
                if (level > 0 && !text.isBlank()) {
                    applyHeading(sections, level, text);
                }
                word.readPictures(paragraph, sources, sections, images, anchor);
                if (!text.isBlank()) {
                    addMarker(paragraph, prefix, sources.size());
                    sources.add(RawBlock.paragraph(sources.size(), text, sectionPath(sections), null, anchor));
                }
            } else if (elements.get(index) instanceof XWPFTable table) {
                markTable(table, anchor, prefix, sections, sources, images);
            }
        }
    }

    private void markTable(XWPFTable table, String anchor, String prefix, List<String> sections,
            List<RawBlock> sources, int[] images) {
        var rows = table.getRows();
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            String rowAnchor = anchor + "/r" + rowIndex;
            var cells = rows.get(rowIndex).getTableCells();
            var contents = cells.stream().map(WordSourceBody::elements).toList();
            var paragraphs = contents.stream().flatMap(List::stream).filter(XWPFParagraph.class::isInstance)
                    .map(XWPFParagraph.class::cast).filter(paragraph -> !paragraphText(paragraph).isBlank()).toList();
            var text = paragraphs.stream().map(WordMarkdownReader::paragraphText).toList();
            var first = paragraphs.stream().findFirst();
            if (first.isPresent()) {
                addMarker(first.get(), prefix, sources.size());
                sources.add(new RawBlock(sources.size(), RawBlock.TABLE, String.join(" ", text),
                        List.of(), sectionPath(sections), null, rowAnchor));
            }
            for (int cellIndex = 0; cellIndex < cells.size(); cellIndex++) {
                String cellAnchor = rowAnchor + "/c" + cellIndex;
                var elements = contents.get(cellIndex);
                for (int index = 0; index < elements.size(); index++) {
                    if (elements.get(index) instanceof XWPFParagraph paragraph) {
                        word.readPictures(paragraph, sources, sections, images, cellAnchor + "/" + index);
                    } else if (elements.get(index) instanceof XWPFTable nested) {
                        markTable(nested, cellAnchor + "/" + index, prefix, sections, sources, images);
                    }
                }
            }
        }
    }

    private void markNotes(List<? extends XWPFAbstractFootnoteEndnote> notes, String kind, String prefix,
            List<RawBlock> sources, int[] images) {
        int ordinal = 0;
        for (var note : notes) {
            var type = note.getCTFtnEdn().getType();
            if (type != null && !"normal".equals(type.toString())) {
                continue;
            }
            mark(WordSourceBody.elements(note), kind + "/" + ordinal++, prefix, new ArrayList<>(), sources, images);
        }
    }

    private static String paragraphText(XWPFParagraph paragraph) {
        return clean(nativeParagraphText(paragraph));
    }

    private static void addMarker(XWPFParagraph paragraph, String prefix, int index) {
        paragraph.createRun().setText(" " + prefix + index + "END ");
    }

    static Content mapMarkdown(String markdown, String prefix, List<RawBlock> blocks) {
        var issues = new ArrayList<String>();
        var available = new HashSet<Integer>();
        var duplicate = new HashSet<Integer>();
        var matcher = Pattern.compile(Pattern.quote(prefix) + "([0-9]{1,9})END").matcher(markdown);
        StringBuilder input = new StringBuilder();
        while (matcher.find()) {
            int index = Integer.parseInt(matcher.group(1));
            if (!available.add(index)) {
                duplicate.add(index);
            }
            matcher.appendReplacement(input, "[S" + index + "]");
        }
        matcher.appendTail(input);
        for (var block : blocks) {
            // Mammoth can render a shared note once for each reference in the main story.
            if (duplicate.contains(block.index()) && block.anchor().startsWith("body/")) {
                available.remove(block.index());
            }
            if (block.anchor().contains("/image-")) {
                if ("ocr".equals(block.provenance()) && block.hasText()) {
                    input.append("\n\n[S").append(block.index()).append("] 图片识别：").append(block.text());
                    available.add(block.index());
                }
            } else if (!available.contains(block.index())) {
                issues.add("Markdown 缺少唯一来源标记：" + block.anchor());
            }
        }
        return new Content(input.toString(), List.copyOf(blocks), Set.copyOf(available), List.copyOf(issues));
    }

    private String convert(Path input) throws IOException, DocumentReadException, InterruptedException {
        Path output = Files.createTempFile("rfq-markdown-", ".md");
        try {
            Process process;
            try {
                process = new ProcessBuilder(settings.getPython(), "-m", "markitdown",
                        input.toString(), "-o", output.toString())
                        .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start();
            } catch (IOException exception) {
                throw new DocumentReadException("无法启动 MarkItDown，请检查 Python 路径", exception);
            }
            try {
                if (!process.waitFor(settings.getTimeout().toMillis(), TimeUnit.MILLISECONDS)) {
                    throw new DocumentReadException("MarkItDown 转换超时");
                }
                if (process.exitValue() != 0 || Files.size(output) == 0) {
                    throw new DocumentReadException("MarkItDown 转换失败，请检查文件及 markitdown[docx] 安装");
                }
                if (Files.size(output) > settings.getMaxChars() * 4L) {
                    throw new DocumentReadException("Markdown 超过模型输入上限，请拆分文档后重试");
                }
                return Files.readString(output);
            } finally {
                if (process.isAlive()) {
                    process.destroyForcibly();
                    process.waitFor();
                }
            }
        } finally {
            Files.deleteIfExists(output);
        }
    }
}
