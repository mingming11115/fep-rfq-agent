package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.integration.history.HistoryExtractor;
import com.naura.rfq.integration.parse.DocumentBlockReader;
import com.naura.rfq.integration.parse.DocumentReadException;
import com.naura.rfq.integration.parse.PdfBlockReader;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.vo.HistoryParseView;
import com.naura.rfq.model.vo.HistorySource;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.storage.DocumentStorage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Slf4j
public class HistoryParseService {
    private final AccessGuard access;
    private final DocumentStorage storage;
    private final List<DocumentBlockReader> readers;
    private final HistoryExtractor extractor;

    public HistoryParseView parse(CurrentUser user, MultipartFile file,
            MultipartFile responseFile, String buId) throws IOException {
        access.requireBu(user, buId);
        List<HistorySource> sources = new ArrayList<>();
        sources.add(read(file, "main:"));
        if (responseFile != null && !responseFile.isEmpty()) {
            sources.add(read(responseFile, "answer:"));
        }
        return extract(sources);
    }

    HistoryParseView extract(List<HistorySource> sources) {
        var result = extractor.extract(sources.get(0).blocks(), sources.size() > 1 ? sources.get(1).blocks() : List.of());
        return new HistoryParseView(result.metadata(), result.clauses(), sources, result.issues());
    }

    private HistorySource read(MultipartFile file, String prefix) throws IOException {
        String name = fileName(file);
        var saved = storage.save("history-" + UUID.randomUUID(), file, extension(name));
        try {
            return readStored(saved, name, prefix);
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

    HistorySource readStored(DocumentStorage.StoredFile saved, String name, String prefix) throws IOException {
        try (var lease = storage.open(saved.storageRef(), saved.size(), saved.sha256())) {
            var reader = readers.stream().filter(candidate -> candidate.supports(name, null)).findFirst()
                .orElseThrow(() -> new BusinessException(400, "没有可用的文件读取器"));
            var path = lease.path();
            List<RawBlock> blocks = reader instanceof PdfBlockReader pdf ? pdf.readForHistory(path) : reader.read(path);
            if (blocks.stream().mapToLong(block -> block.text() == null ? 0 : block.text().length()).sum() > 2_000_000) {
                throw new BusinessException(413, "文档内容过多，请拆分后上传");
            }
            return new HistorySource(name, prefix, blocks);
        } catch (DocumentReadException exception) {
            log.error("读取历史 RFQ 原件失败 errorType={}", exception.getClass().getSimpleName());
            throw new BusinessException(400, exception.getMessage());
        }
    }
}
