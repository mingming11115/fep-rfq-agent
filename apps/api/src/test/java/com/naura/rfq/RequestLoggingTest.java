package com.naura.rfq;

import com.naura.rfq.service.JwtService;
import com.naura.rfq.service.SessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = RequestLoggingTest.ProbeController.class)
@Import(RequestLoggingTest.ProbeController.class)
@ExtendWith(OutputCaptureExtension.class)
class RequestLoggingTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private JwtService jwt;
    @MockitoBean private SessionService sessions;

    @Test
    void logsRouteTemplateAndReturnsServerRequestId(CapturedOutput output) throws Exception {
        var response = mvc.perform(get("/api/__log_probe/private-path-value")
                        .queryParam("query", "private-query-value")
                        .header("X-Request-Id", "untrusted-client-id"))
                .andExpect(status().isOk()).andReturn().getResponse();
        String requestId = response.getHeader("X-Request-Id");
        assertThat(requestId).matches("[0-9a-f-]{36}").isEqualTo(response.getContentAsString());
        assertThat(output).contains("requestId=" + requestId, "method=GET", "route=/api/__log_probe/{id}",
                        "status=200", "durationMs=")
                .doesNotContain("private-path-value", "private-query-value", "untrusted-client-id");
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    void logsAuthenticationRejectionAndExposesRequestIdThroughCors(CapturedOutput output) throws Exception {
        var response = mvc.perform(get("/api/rfq/__log_probe/private-path-value")
                        .header("Origin", "http://localhost:5173"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Expose-Headers", "X-Request-Id"))
                .andReturn().getResponse();
        assertThat(output).contains("requestId=" + response.getHeader("X-Request-Id"),
                "route=/api/rfq/__log_probe/{id}", "status=401");
    }

    @Test
    void usesSameRequestIdInUnexpectedErrorAndAccessLog(CapturedOutput output) throws Exception {
        var response = mvc.perform(get("/api/__log_probe/error"))
                .andExpect(status().isInternalServerError()).andReturn().getResponse();
        String requestId = response.getHeader("X-Request-Id");
        assertThat(requestId).isNotBlank();
        assertThat(output.getAll().lines()
                .filter(line -> line.contains("Unhandled request exception") || line.contains("status=500")))
                .hasSize(2).allMatch(line -> line.contains("requestId=" + requestId));
    }

    @RestController
    static class ProbeController {
        @GetMapping({"/api/__log_probe/{id}", "/api/rfq/__log_probe/{id}"})
        String requestId() {
            return MDC.get("requestId");
        }

        @GetMapping("/api/__log_probe/error")
        void error() {
            throw new IllegalStateException("test exception");
        }
    }
}
