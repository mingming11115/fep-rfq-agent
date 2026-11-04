package com.naura.rfq.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private static final String BEARER = "Bearer ";

    private final JwtService jwtService;
    private final SessionService sessions;
    private final ObjectMapper objectMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            return reject(response, "请先登录");
        }
        String userId = jwtService.userId(header.substring(BEARER.length()).trim()).orElse(null);
        if (userId == null) {
            return reject(response, "登录已过期，请重新登录");
        }
        CurrentUser user = sessions.load(userId).orElse(null);
        if (user == null) {
            return reject(response, "账号已停用或不存在");
        }
        CurrentUserHolder.set(user);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
            Object handler, Exception exception) {
        CurrentUserHolder.clear();
    }

    private boolean reject(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), ApiResponse.error(401, message));
        return false;
    }
}
