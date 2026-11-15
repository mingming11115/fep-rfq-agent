package com.naura.rfq.integration.parse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ParseHttpClientModelContentTest {
    private final ObjectMapper json = new ObjectMapper();
    private final ParseHttpClient client = new ParseHttpClient(json);

    @Test
    void dropsMarkdownEscapesTheModelAddedByMistake() throws Exception {
        JsonNode parsed = parse("""
                {"summaries": [{"text": "产能须达到 1.5\\*10^4 pcs/h，符合**SEMI** 标准"}]}
                """);
        assertThat(parsed.path("summaries").path(0).path("text").asText())
                .isEqualTo("产能须达到 1.5*10^4 pcs/h，符合**SEMI** 标准");
    }

    @Test
    void keepsLatexCommandsOfUnits() throws Exception {
        JsonNode parsed = parse("""
                {"answers": [{"text": "颗粒度不大于 5\\mu m，真空度 \\leq 10^{-3} Pa"}]}
                """);
        assertThat(parsed.path("answers").path(0).path("text").asText())
                .isEqualTo("颗粒度不大于 5\\mu m，真空度 \\leq 10^{-3} Pa");
    }

    @Test
    void escapesRawNewlinesAndTrimsProseAroundTheJson() throws Exception {
        JsonNode parsed = parse("""
                以下是解析结果：
                {"requirements": [{"text": "第一行
                第二行"}]}
                以上。""");
        assertThat(parsed.path("requirements").path(0).path("text").asText()).isEqualTo("第一行\n第二行");
    }

    @Test
    void keepsValidEscapesAndCodeFences() throws Exception {
        JsonNode parsed = parse("""
                ```json
                {"text": "换行\\n与引号\\"均正常", "count": 2}
                ```
                """);
        assertThat(parsed.path("text").asText()).isEqualTo("换行\n与引号\"均正常");
        assertThat(parsed.path("count").asInt()).isEqualTo(2);
    }

    @Test
    void reportsFailureWhenTheJsonIsStillBroken() {
        assertThatThrownBy(() -> parse("{\"text\": }"))
                .isInstanceOf(JsonProcessingException.class);
    }

    private JsonNode parse(String content) throws Exception {
        Map<String, Object> response = Map.of("choices", List.of(Map.of("message", Map.of("content", content))));
        return client.modelContent(json.valueToTree(response));
    }
}
