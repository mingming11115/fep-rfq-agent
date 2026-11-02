package com.naura.rfq.parse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Bounded response and whole-request deadline, including request upload and response body. */
@Component
@RequiredArgsConstructor
public class ParseHttpClient {
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private final ObjectMapper json;
    private final ConcurrentHashMap<Duration, HttpClient> clients = new ConcurrentHashMap<>();

    public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body) throws Exception {
        URI uri = URI.create(settings.getUrl());
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null)
            throw new IllegalArgumentException("服务地址未配置或不合法");
        Duration timeout = positive(settings.getTimeout());
        HttpClient client = clients.computeIfAbsent(positive(settings.getConnectTimeout()), duration -> HttpClient.newBuilder()
            .connectTimeout(duration).followRedirects(HttpClient.Redirect.NEVER).build());
        var builder = HttpRequest.newBuilder(uri).timeout(timeout)
            .header("Content-Type", "application/json; charset=UTF-8")
            .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)));
        if (settings.getApiKey() != null && !settings.getApiKey().isBlank())
            builder.header("Authorization", "Bearer " + settings.getApiKey());
        var pending = client.sendAsync(builder.build(), info -> new LimitedBody());
        try {
            HttpResponse<byte[]> response = pending.get(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS);
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new RemoteStatusException(response.statusCode());
            return json.readTree(response.body());
        } finally {
            if (!pending.isDone()) pending.cancel(true);
        }
    }
    private Duration positive(Duration value) {
        if (value == null || value.isNegative() || value.isZero()) throw new IllegalArgumentException("服务超时必须大于零");
        return value;
    }
    public static String reason(Exception e) {
        Throwable reason = e;
        while (reason.getCause() != null && (reason instanceof java.util.concurrent.ExecutionException
                || reason instanceof java.util.concurrent.CompletionException)) reason = reason.getCause();
        if (reason instanceof java.util.concurrent.TimeoutException || reason instanceof java.net.http.HttpTimeoutException)
            return "请求超时";
        if (reason instanceof RemoteStatusException status) return "HTTP " + status.status;
        return "配置、连接或响应校验失败";
    }
    private static class RemoteStatusException extends Exception {
        private final int status;
        RemoteStatusException(int status) { this.status = status; }
    }
    private static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription subscription) { this.subscription = subscription; subscription.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if ((long) bytes.size() + buffer.remaining() > MAX_RESPONSE_BYTES) {
                    subscription.cancel(); result.completeExceptionally(new IllegalArgumentException("服务响应超过大小上限")); return;
                }
                byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
