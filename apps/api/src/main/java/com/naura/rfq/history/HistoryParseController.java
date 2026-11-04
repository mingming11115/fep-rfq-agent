package com.naura.rfq.history;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.document.DocumentStorage;
import com.naura.rfq.parse.DocumentBlockReader;
import com.naura.rfq.parse.DocumentReadException;
import com.naura.rfq.parse.RawBlock;
import com.naura.rfq.parse.PdfBlockReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq/history")
@RequiredArgsConstructor
public class HistoryParseController {
    private final AccessGuard access;
    private final DocumentStorage storage;
    private final List<DocumentBlockReader> readers;
    private final HistoryExtractor extractor;
    public record Source(String name, String prefix, List<RawBlock> blocks) { }
    public record View(Map<String, String> metadata, List<HistoryExtractor.Clause> clauses, List<Source> sources, List<String> issues) { }

    @PostMapping("/parse")
    public ApiResponse<View> parse(@RequestParam MultipartFile file,
            @RequestParam(required = false) MultipartFile responseFile, @RequestParam String buId) throws IOException {
        access.requireBu(CurrentUserHolder.require(), buId);
        List<Source> sources = new ArrayList<>();
        sources.add(read(file, "main:"));
        if (responseFile != null && !responseFile.isEmpty()) sources.add(read(responseFile, "answer:"));
        var result = extractor.extract(sources.get(0).blocks(), sources.size() > 1 ? sources.get(1).blocks() : List.of());
        return ApiResponse.success(new View(result.metadata(), result.clauses(), sources, result.issues()));
    }
    private Source read(MultipartFile file, String prefix) throws IOException {
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String lower = name.toLowerCase(Locale.ROOT);
        String extension = lower.endsWith(".docx") ? ".docx" : lower.endsWith(".pdf") ? ".pdf" : "";
        if (extension.isBlank()) throw new BusinessException(400, "历史 RFQ 当前支持 DOCX 和 PDF，请先转换其他格式");
        var saved = storage.save("history-" + UUID.randomUUID(), file, extension);
        try (var lease = storage.open(saved.storageRef(), saved.size(), saved.sha256())) {
            var reader = readers.stream().filter(candidate -> candidate.supports(name, null)).findFirst()
                .orElseThrow(() -> new BusinessException(400, "没有可用的文件读取器"));
            var path = lease.path();
            List<RawBlock> blocks = reader instanceof PdfBlockReader pdf ? pdf.readForHistory(path) : reader.read(path);
            if (blocks.stream().mapToLong(block -> block.text() == null ? 0 : block.text().length()).sum() > 2_000_000)
                throw new BusinessException(413, "文档内容过多，请拆分后上传");
            return new Source(name.replace('\\', '/').substring(name.replace('\\', '/').lastIndexOf('/') + 1), prefix, blocks);
        } catch (DocumentReadException exception) {
            throw new BusinessException(400, exception.getMessage());
        } finally { storage.delete(saved.storageRef()); }
    }
}
