package com.naura.rfq.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestLoggingFilter extends OncePerRequestFilter {
    static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String REQUEST_ID_KEY = "requestId";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String root = request.getContextPath() + "/api";
        String uri = request.getRequestURI();
        return !uri.equals(root) && !uri.startsWith(root + "/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        String previousId = MDC.get(REQUEST_ID_KEY);
        response.setHeader(REQUEST_ID_HEADER, requestId);
        MDC.put(REQUEST_ID_KEY, requestId);
        long started = System.nanoTime();
        boolean aborted = false;
        try {
            chain.doFilter(request, response);
        } catch (ServletException | IOException | RuntimeException | Error failure) {
            log.error("http.request.failed errorType={}", failure.getClass().getSimpleName());
            aborted = true;
            throw failure;
        } finally {
            int status = aborted && !response.isCommitted() ? 500 : response.getStatus();
            Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            Object handler = request.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
            String route = handler instanceof HandlerMethod && pattern != null ? pattern.toString() : "unmatched";
            long durationMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            try {
                log.atLevel(aborted || status >= 500 ? Level.WARN : Level.INFO)
                        .log("http.request method={} route={} status={} durationMs={} aborted={}",
                                request.getMethod(), route, status, durationMs, aborted);
            } finally {
                if (previousId == null) {
                    MDC.remove(REQUEST_ID_KEY);
                } else {
                    MDC.put(REQUEST_ID_KEY, previousId);
                }
            }
        }
    }
}
