package com.naura.rfq.integration.standardreply;

import com.naura.rfq.common.exception.BusinessException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
@Slf4j
public class StandardReplyImportParser {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DATA_ROWS = 1000;
    private static final int MAX_COLUMNS = 64;

    public record ParsedImport(String filename, String sha256, List<ImportRow> rows, List<RowError> errors) {}
    public record ImportRow(int rowNumber, String title, String requirement, String answer, String conditions) {}
    public record RowError(int rowNumber, String message) {}

    private record SourceRow(int number, List<String> values, Set<Integer> invalidCells) {
        String value(int column) {
            return column < values.size() ? values.get(column).strip() : "";
        }
    }

    public ParsedImport parse(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "请选择非空的标准回复文件");
        }
        String filename = filename(file.getOriginalFilename());
        String extension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!Set.of("csv", "xls", "xlsx").contains(extension) || !filename.contains(".")) {
            throw new BusinessException(400, "标准回复文件支持 .csv、.xls 和 .xlsx 格式");
        }
        byte[] bytes = read(file);
        List<SourceRow> source = extension.equals("csv") ? csv(bytes) : excel(bytes, extension);
        if (source.isEmpty()) {
            throw new BusinessException(400, "标准回复文件缺少表头");
        }
        Map<Field, Integer> columns = columns(source.get(0));
        if (source.size() == 1) {
            throw new BusinessException(400, "标准回复文件没有数据行");
        }
        List<ImportRow> rows = new ArrayList<>();
        List<RowError> errors = new ArrayList<>();
        for (SourceRow row : source.subList(1, source.size())) {
            List<String> problems = validate(row, columns);
            if (problems.isEmpty()) {
                rows.add(new ImportRow(row.number(), row.value(columns.get(Field.TITLE)),
                        row.value(columns.get(Field.REQUIREMENT)), row.value(columns.get(Field.ANSWER)),
                        row.value(columns.get(Field.CONDITIONS))));
            } else {
                errors.add(new RowError(row.number(), String.join("，", problems)));
            }
        }
        return new ParsedImport(filename, sha256(bytes), List.copyOf(rows), List.copyOf(errors));
    }

    private static String filename(String original) {
        String path = original == null ? "" : original.replace('\\', '/');
        String name = path.substring(path.lastIndexOf('/') + 1).strip();
        if (name.isEmpty() || name.length() > 255 || name.chars().anyMatch(Character::isISOControl)) {
            throw new BusinessException(400, "标准回复文件名无效");
        }
        return name;
    }

    private static byte[] read(MultipartFile file) {
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException(413, "标准回复文件最多 5 MiB");
        }
        try (var stream = file.getInputStream()) {
            byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw new BusinessException(413, "标准回复文件最多 5 MiB");
            }
            return bytes;
        } catch (IOException exception) {
            log.error("读取标准回复导入文件失败", exception);
            throw new BusinessException(400, "无法读取标准回复文件");
        }
    }

    private static List<SourceRow> excel(byte[] bytes, String extension) {
        try (var workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            if ((workbook instanceof HSSFWorkbook) != extension.equals("xls")) {
                throw new BusinessException(400, "Excel 文件内容与扩展名不一致");
            }
            var formatter = new DataFormatter(Locale.ROOT);
            List<SourceRow> rows = new ArrayList<>();
            int dataSheet = -1;
            for (int sheet = 0; sheet < workbook.getNumberOfSheets(); sheet++) {
                for (var row : workbook.getSheetAt(sheet)) {
                    List<String> values = new ArrayList<>();
                    Set<Integer> invalid = new HashSet<>();
                    for (var cell : row) {
                        boolean unsupported = cell.getCellType() == CellType.FORMULA || cell.getCellType() == CellType.ERROR;
                        String value = unsupported ? "" : formatter.formatCellValue(cell);
                        if (!unsupported && value.isBlank()) {
                            continue;
                        }
                        int column = cell.getColumnIndex();
                        checkColumnCount(column + 1, row.getRowNum() + 1);
                        while (values.size() <= column) values.add("");
                        values.set(column, value);
                        if (unsupported) {
                            invalid.add(column);
                        }
                    }
                    if (values.isEmpty()) {
                        continue;
                    }
                    if (dataSheet != -1 && dataSheet != sheet) {
                        throw new BusinessException(400, "请在一个 Excel 工作表中填写标准回复");
                    }
                    dataSheet = sheet;
                    addRow(rows, row.getRowNum() + 1, values, invalid);
                }
            }
            return rows;
        } catch (BusinessException exception) {
            log.error("校验标准回复 Excel 文件失败 errorType={}", exception.getClass().getSimpleName());
            throw exception;
        } catch (IOException | RuntimeException exception) {
            log.error("解析标准回复 Excel 文件失败 errorType={}", exception.getClass().getSimpleName());
            throw new BusinessException(400, "无法解析 Excel 标准回复文件，请检查文件格式或加密设置");
        }
    }

    private static List<SourceRow> csv(byte[] bytes) {
        String input;
        try {
            input = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            log.error("解码标准回复 CSV 文件失败", exception);
            throw new BusinessException(400, "CSV 文件须使用 UTF-8 编码");
        }
        input = input.replace("\r\n", "\n").replace('\r', '\n');
        List<SourceRow> rows = new ArrayList<>();
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        int line = 1;
        int rowStart = line;
        boolean quoted = false;
        boolean quoteClosed = false;
        for (int i = input.startsWith("\uFEFF") ? 1 : 0; i < input.length(); i++) {
            char character = input.charAt(i);
            if (quoted) {
                if (character == '"') {
                    if (i + 1 < input.length() && input.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        quoted = false;
                        quoteClosed = true;
                    }
                } else {
                    field.append(character);
                    if (character == '\n') {
                        line++;
                    }
                }
            } else if (character == ',' || character == '\n') {
                checkColumnCount(fields.size() + 1, rowStart);
                fields.add(field.toString());
                field.setLength(0);
                quoteClosed = false;
                if (character == '\n') {
                    addRow(rows, rowStart, fields, Set.of());
                    fields.clear();
                    rowStart = ++line;
                }
            } else if (quoteClosed || character == '"' && field.length() > 0) {
                throw invalidCsv(rowStart);
            } else if (character == '"') {
                quoted = true;
            } else {
                field.append(character);
            }
        }
        if (quoted) {
            throw invalidCsv(rowStart);
        }
        if (!fields.isEmpty() || field.length() > 0) {
            checkColumnCount(fields.size() + 1, rowStart);
            fields.add(field.toString());
            addRow(rows, rowStart, fields, Set.of());
        }
        return rows;
    }

    private static void addRow(List<SourceRow> rows, int number, List<String> values, Set<Integer> invalid) {
        if (invalid.isEmpty() && values.stream().allMatch(String::isBlank)) {
            return;
        }
        if (rows.size() == MAX_DATA_ROWS + 1) {
            throw new BusinessException(400, "每次最多导入 1000 条标准回复");
        }
        rows.add(new SourceRow(number, List.copyOf(values), Set.copyOf(invalid)));
    }

    private static void checkColumnCount(int count, int row) {
        if (count > MAX_COLUMNS) {
            throw new BusinessException(400, "第 " + row + " 行超过 64 列");
        }
    }

    private static BusinessException invalidCsv(int row) {
        return new BusinessException(400, "CSV 第 " + row + " 行的引号格式有误");
    }

    private static Map<Field, Integer> columns(SourceRow header) {
        Map<Field, Integer> columns = new EnumMap<>(Field.class);
        for (int column = 0; column < header.values().size(); column++) {
            String name = header.value(column);
            for (Field field : Field.values()) {
                if ((field.label.equals(name) || field.alias.equalsIgnoreCase(name))
                        && columns.putIfAbsent(field, column) != null) {
                    throw new BusinessException(400, "表头重复：" + field.label);
                }
            }
        }
        List<String> missing = new ArrayList<>();
        for (Field field : Field.values()) {
            if (!columns.containsKey(field)) {
                missing.add(field.label);
            }
        }
        if (!missing.isEmpty()) {
            throw new BusinessException(400, "表头缺少：" + String.join("、", missing));
        }
        return columns;
    }

    private static List<String> validate(SourceRow row, Map<Field, Integer> columns) {
        List<String> problems = new ArrayList<>();
        for (Field field : Field.values()) {
            int column = columns.get(field);
            String value = row.value(column);
            if (row.invalidCells().contains(column)) {
                problems.add(field.label + "须填写实际值，不能使用公式或错误单元格");
            } else if (value.isEmpty()) {
                problems.add(field.label + "为必填项");
            } else if (value.length() > field.maxLength) {
                problems.add(field.label + "最多 " + field.maxLength + " 个字符");
            }
        }
        return problems;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            log.error("计算标准回复文件的 SHA-256 摘要失败", exception);
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
