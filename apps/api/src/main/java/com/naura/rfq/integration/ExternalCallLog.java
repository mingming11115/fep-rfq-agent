package com.naura.rfq.integration;

import com.naura.rfq.common.id.Ids;
import java.net.http.HttpRequest;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.event.Level;

@Slf4j
public final class ExternalCallLog {
    private final String callId = Ids.next("EXT");
    private final String service;
    private final String operation;
    private final long startedAt = System.nanoTime();

    public ExternalCallLog(String service, String operation, HttpRequest request, String parseRunId) {
        this.service = service;
        this.operation = operation;
        long requestBytes = request.bodyPublisher().map(HttpRequest.BodyPublisher::contentLength).orElse(0L);
        log.info("external.call.request callId={} service={} operation={} method={} host={} requestBytes={} parseRunId={}",
            callId, service, operation, request.method(), request.uri().getHost(), requestBytes, parseRunId);
    }

    public String callId() {
        return callId;
    }

    public void response(int status, int responseBytes) {
        log.atLevel(status >= 200 && status < 300 ? Level.INFO : Level.WARN)
            .log("external.call.response callId={} service={} operation={} status={} responseBytes={} durationMs={}",
                callId, service, operation, status, responseBytes, durationMs());
    }

    public void failed(Exception exception) {
        Throwable cause = exception;
        if (exception instanceof ExecutionException && exception.getCause() != null) {
            cause = exception.getCause();
        }
        log.error("external.call.failed callId={} service={} operation={} errorType={} durationMs={}",
            callId, service, operation, cause.getClass().getSimpleName(), durationMs());
    }

    private long durationMs() {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }
}
