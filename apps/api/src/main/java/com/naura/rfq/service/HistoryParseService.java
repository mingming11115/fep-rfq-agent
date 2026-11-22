package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.common.log.StageLog;
import com.naura.rfq.config.properties.ParseProperties;
import com.naura.rfq.integration.history.HistoryExtractor;
import com.naura.rfq.integration.parse.DocumentBlockReader;
import com.naura.rfq.integration.parse.DocumentReadException;
import com.naura.rfq.integration.parse.DocxBlockReader;
import com.naura.rfq.integration.parse.WordMarkdownReader;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.vo.HistoryParseView;
import com.naura.rfq.model.vo.HistorySource;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.storage.DocumentStorage;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class HistoryParseService {
    @Autowired
    private AccessGuard access;
    @Autowired
    private DocumentStorage storage;
    @Autowired
    private List<DocumentBlockReader> readers;
    @Autowired
    private HistoryExtractor extractor;
    @Autowired
    private WordMarkdownReader wordMarkdownReader;
    @Autowired
    private ParseProperties properties;

    public HistoryParseView parse(CurrentUser user, MultipartFile file,
            MultipartFile responseFile, String buId) throws IOException {
        access.requireBu(user, buId);
        requireEnabled();
        String runId = Ids.next("RUN");
        List<HistorySource> sources = new ArrayList<>();
        sources.add(read(file, "main:", previewPayload(runId, "main")));
        if (responseFile != null && !responseFile.isEmpty()) {
            sources.add(read(responseFile, "answer:", previewPayload(runId, "answer")));
        }
        return extract(sources);
    }

    void requireEnabled() {
        extractor.requireEnabled();
    }

    HistoryParseView extract(List<HistorySource> sources) {
        HistorySource main = sources.get(0);
        HistorySource companion = sources.size() > 1 ? sources.get(1) : null;
        StageLog.begin(log, "历史RFQ解析 fileName=" + main.name()
                + (companion == null ? "" : " 配套答复=" + companion.name()));
        log.info("history.parse.start 历史RFQ文档开始解析 fileName={} 配套答复={} 主文件内容块={}",
                main.name(), companion == null ? "-" : companion.name(), main.blocks().size());
        var result = extractor.extract(main.blocks(), companion == null ? List.of() : companion.blocks(), main.name());
        log.info("history.parse.result 历史RFQ文档解析完成 fileName={} 条款={} 提示={}",
                main.name(), result.clauses().size(), result.issues().size());
        StageLog.end(log, "历史RFQ解析 fileName=" + main.name() + " 条款=" + result.clauses().size()
                + " 提示=" + result.issues().size());
        return new HistoryParseView(result.metadata(), result.clauses(), sources, result.issues());
    }

    private HistorySource read(MultipartFile file, String prefix, Path payloadTarget) throws IOException {
        String name = fileName(file);
        var saved = storage.save("history-" + UUID.randomUUID(), file, extension(name));
        try {
            return readStored(saved, name, prefix, payloadTarget);
        } finally {
            storage.delete(saved.storageRef());
        }
    }

    static String fileName(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace('\\', '/');
        String name = original.substring(original.lastIndexOf('/') + 1);
        if (name.length() > 255 || name.chars().anyMatch(Character::isISOControl)) {
            throw new BusinessException(400, "历史 RFQ 文件名无效");
        }
        return name;
    }

    static String extension(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        String extension = lower.endsWith(".docx") ? ".docx" : lower.endsWith(".pdf") ? ".pdf" : "";
        if (extension.isBlank()) {
            throw new BusinessException(400, "历史 RFQ 当前支持 DOCX 和 PDF，请先转换其他格式");
        }
        return extension;
    }

    /**
     * 读取历史 RFQ 原件并产出原始块；DOCX 额外旁路保存 markitdown 转换后的 md，
     * 与项目 RFQ 解析保持一致。payloadTarget 显式指定落盘路径（预览解析传 parse-payloads），
     * 传 null 时默认与原件放一起（原件旁的 source.md）；原件为临时文件（MinIO/演示）时不保存。
     */
    HistorySource readStored(DocumentStorage.StoredFile saved, String name, String prefix, Path payloadTarget)
            throws IOException {
        try (var lease = storage.open(saved.storageRef(), saved.size(), saved.sha256())) {
            var reader = readers.stream().filter(candidate -> candidate.supports(name, null)).findFirst()
                .orElseThrow(() -> new BusinessException(400, "没有可用的文件读取器"));
            var path = lease.path();
            if (reader instanceof DocxBlockReader) {
                saveMarkdownQuietly(path, payloadTarget != null ? payloadTarget
                        : lease.temporary() ? null : path.resolveSibling("source.md"));
            }
            List<RawBlock> blocks = reader.read(path);
            if (blocks.stream().mapToLong(block -> block.text() == null ? 0 : block.text().length()).sum() > 2_000_000) {
                throw new BusinessException(413, "文档内容过多，请拆分后上传");
            }
            log.info("history.parse.read 历史RFQ文档读取完成 fileName={} 前缀={} 内容块={} 字符数={}",
                    name, prefix, blocks.size(),
                    blocks.stream().mapToLong(block -> block.text() == null ? 0 : block.text().length()).sum());
            return new HistorySource(name, prefix, blocks);
        } catch (DocumentReadException exception) {
            log.error("读取历史 RFQ 原件失败 errorType={}", exception.getClass().getSimpleName());
            throw new BusinessException(400, exception.getMessage());
        }
    }

    /** 预览解析的原件是临时文件，读后即删，md 改存 parse-payloads 以便核对。 */
    private Path previewPayload(String runId, String part) {
        return storage.resolve("parse-payloads/" + runId + "-" + part + ".md");
    }

    private void saveMarkdownQuietly(Path original, Path payloadTarget) {
        if (payloadTarget == null) {
            return;
        }
        try {
            wordMarkdownReader.saveMarkdown(original, properties.maxBlocks(), payloadTarget);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            log.warn("document.parse.word.markdown.save_failed Word Markdown 载荷保存失败 path={} errorType=Interrupted", payloadTarget);
        } catch (IOException | DocumentReadException exception) {
            log.warn("document.parse.word.markdown.save_failed Word Markdown 载荷保存失败 path={} errorType={}",
                    payloadTarget, exception.getClass().getSimpleName());
        }
    }
}
