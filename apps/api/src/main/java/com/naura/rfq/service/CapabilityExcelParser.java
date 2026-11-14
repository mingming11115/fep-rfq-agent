package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.dto.CapabilityLibraryRequest.Draft;
import com.naura.rfq.model.dto.CapabilityLibraryRequest.EvidenceRef;
import jakarta.validation.Validator;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
@Slf4j
class CapabilityExcelParser {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_ROWS = 1000;
    private static final List<String> HEADERS = List.of("机型ID", "机型版本", "工艺ID", "工艺版本", "配置基线", "指标编码",
            "指标名称", "运算符", "下限", "上限", "含下限", "含上限", "单位", "值类型", "适用条件", "限制", "证据ID", "证据版本", "证据位置");
    @Autowired
    private Validator validator;

    record Row(int number, Draft data) {}
    record Error(int rowNumber, String message) {}
    record Parsed(String filename, String sheet, String sha256, List<Row> rows, List<Error> errors) {}

    Parsed parse(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().replace('\\', '/');
        String filename = original.substring(original.lastIndexOf('/') + 1).strip();
        if (file.isEmpty() || filename.length() > 255 || filename.chars().anyMatch(Character::isISOControl)
                || !filename.toLowerCase(Locale.ROOT).endsWith(".xlsx")) {
            throw new BusinessException(400, "请选择非空的能力边界 .xlsx 文件");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(413, "能力文件最多 5 MiB");
        }
        try (var stream = file.getInputStream()) {
            byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw new BusinessException(413, "能力文件最多 5 MiB");
            }
            return workbook(filename, bytes);
        } catch (IOException failure) {
            log.error("读取能力边界 Excel 文件失败", failure);
            throw new BusinessException(400, "无法读取能力边界 Excel 文件");
        }
    }

    private Parsed workbook(String filename, byte[] bytes) {
        var formatter = new DataFormatter(Locale.ROOT);
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            if (workbook.getNumberOfSheets() != 1) {
                throw new BusinessException(400, "能力文件需要一个工作表");
            }
            var sheet = workbook.getSheetAt(0);
            var header = sheet.getRow(0);
            if (header == null || !HEADERS.equals(cells(header, formatter))) {
                throw new BusinessException(400, "能力文件表头须依次为 " + String.join("、", HEADERS));
            }
            var rows = new ArrayList<Row>();
            var errors = new ArrayList<Error>();
            for (var source : sheet) {
                if (source.getRowNum() == 0) {
                    continue;
                }
                int number = source.getRowNum() + 1;
                try {
                    var values = cells((XSSFRow) source, formatter);
                    if (values.stream().allMatch(String::isBlank)) {
                        continue;
                    }
                    var draft = draft(values);
                    if (!validator.validate(draft).isEmpty()) {
                        throw new IllegalArgumentException("字段缺失、超长或版本无效");
                    }
                    rows.add(new Row(number, draft));
                } catch (NumberFormatException failure) {
                    log.error("解析能力边界 Excel 行的数值失败 errorType={}", failure.getClass().getSimpleName());
                    errors.add(new Error(number, "版本或数值格式错误"));
                } catch (IllegalArgumentException failure) {
                    log.error("校验能力边界 Excel 行失败 errorType={}", failure.getClass().getSimpleName());
                    errors.add(new Error(number, failure.getMessage()));
                }
                if (rows.size() + errors.size() > MAX_ROWS) {
                    throw new BusinessException(413, "能力文件最多 1,000 条数据");
                }
            }
            if (rows.isEmpty() && errors.isEmpty()) {
                throw new BusinessException(400, "能力文件没有数据行");
            }
            return new Parsed(filename, sheet.getSheetName(), digest(bytes), List.copyOf(rows), List.copyOf(errors));
        } catch (BusinessException failure) {
            log.error("校验能力边界 Excel 文件失败 errorType={}", failure.getClass().getSimpleName());
            throw failure;
        } catch (IOException | RuntimeException failure) {
            log.error("解析能力边界 Excel 文件失败 errorType={}", failure.getClass().getSimpleName());
            throw new BusinessException(400, "能力边界 Excel 文件格式无效");
        }
    }

    private List<String> cells(XSSFRow row, DataFormatter formatter) {
        var result = new ArrayList<String>();
        for (int i = 0; i < HEADERS.size(); i++) result.add("");
        for (var cell : row) {
            if (cell.getCellType() == CellType.FORMULA || cell.getCellType() == CellType.ERROR) {
                throw new IllegalArgumentException("请将公式或错误单元格替换为实际值");
            }
            int index = cell.getColumnIndex();
            String value = (index == 8 || index == 9) && cell.getCellType() == CellType.NUMERIC
                    ? ((org.apache.poi.xssf.usermodel.XSSFCell) cell).getRawValue() : formatter.formatCellValue(cell).strip();
            if (value.isBlank()) {
                continue;
            }
            if (index >= HEADERS.size()) {
                throw new IllegalArgumentException("数据列超出模板范围");
            }
            result.set(index, value);
        }
        return result;
    }

    private Draft draft(List<String> values) {
        return new Draft(null, null, values.get(0), Integer.valueOf(values.get(1)), values.get(2), Integer.valueOf(values.get(3)),
                values.get(4), values.get(5), values.get(6), values.get(7), decimal(values.get(8)), decimal(values.get(9)),
                inclusive(values.get(10)), inclusive(values.get(11)), values.get(12), values.get(13), values.get(14), values.get(15),
                List.of(new EvidenceRef(values.get(16), Integer.valueOf(values.get(17)), values.get(18))));
    }

    private BigDecimal decimal(String value) { return value.isBlank() ? null : new BigDecimal(value); }

    private Boolean inclusive(String value) {
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "" -> null;
            case "是", "true" -> true;
            case "否", "false" -> false;
            default -> throw new IllegalArgumentException("区间端点请填写「是」或「否」");
        };
    }

    private String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException failure) {
            log.error("计算能力边界 Excel 文件的 SHA-256 摘要失败", failure);
            throw new IllegalStateException(failure);
        }
    }
}
