package com.naura.rfq;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.exception.BusinessException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ErrorHandlingTest.ProbeController.class)
class ErrorHandlingTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void serializesSuccessfulResponseUsingPlatformCompatibleEnvelope() throws Exception {
        mvc.perform(post("/__test__/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"RFQ\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.msg").value("成功"))
                .andExpect(jsonPath("$.data").value("RFQ"));
    }

    @Test
    void rejectsBlankInputWithValidationMessageAndHttp400() throws Exception {
        mvc.perform(post("/__test__/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("name: 名称不能为空"));
    }

    @Test
    void rejectsMalformedJsonWithoutExposingParserDetails() throws Exception {
        mvc.perform(post("/__test__/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("请求体格式错误"))
                .andExpect(content().string(not(containsString("JsonEOFException"))));
    }

    @Test
    void rejectsMissingRequestBodyWithHttp400() throws Exception {
        mvc.perform(post("/__test__/echo").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void preservesBusinessErrorCodeAndHttpStatus() throws Exception {
        mvc.perform(get("/__test__/business-error"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001))
                .andExpect(jsonPath("$.msg").value("示例业务异常"));
    }

    @Test
    void hidesUnexpectedExceptionDetailsFromHttpResponse() throws Exception {
        mvc.perform(get("/__test__/unexpected-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500))
                .andExpect(jsonPath("$.msg").value("服务内部错误"))
                .andExpect(content().string(not(containsString("private-diagnostic"))))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void preservesNotFoundStatusForUnknownRoutes() throws Exception {
        mvc.perform(get("/missing-route"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    void preservesMethodNotAllowedStatusAndAllowHeader() throws Exception {
        mvc.perform(get("/__test__/echo"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("POST")))
                .andExpect(jsonPath("$.code").value(405));
    }

    // These routes only exist in tests and are excluded from the application jar.
    @RestController
    @RequestMapping("/__test__")
    static class ProbeController {

        @PostMapping("/echo")
        ApiResponse<String> echo(@Valid @RequestBody NameRequest request) {
            return ApiResponse.success(request.name());
        }

        @GetMapping("/business-error")
        void businessError() {
            throw new BusinessException(40001, "示例业务异常");
        }

        @GetMapping("/unexpected-error")
        void unexpectedError() {
            throw new IllegalStateException("private-diagnostic");
        }
    }

    record NameRequest(@NotBlank(message = "名称不能为空") String name) {
    }
}
