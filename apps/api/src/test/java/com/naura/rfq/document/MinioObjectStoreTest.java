package com.naura.rfq.document;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class MinioObjectStoreTest {
    @TempDir Path root;
    @Test void sdkSendsAuthenticatedPutGetAndDelete() throws Exception {
        var requests = new CopyOnWriteArrayList<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        byte[] bytes = "original".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        server.createContext("/", exchange -> {
            try {
                assertThat(exchange.getRequestHeaders().getFirst("Authorization")).startsWith("AWS4-HMAC-SHA256");
                String method = exchange.getRequestMethod();
                if (exchange.getRequestURI().getQuery() != null) {
                    byte[] region = "<LocationConstraint xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">us-east-1</LocationConstraint>".getBytes();
                    exchange.sendResponseHeaders(200, region.length); exchange.getResponseBody().write(region);
                } else {
                    requests.add(method);
                    if (method.equals("PUT")) {
                        assertThat(exchange.getRequestBody().readAllBytes()).contains(bytes);
                        exchange.getResponseHeaders().add("ETag", "\"test-etag\"");
                        exchange.sendResponseHeaders(200, -1);
                    } else if (method.equals("GET")) {
                        exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes);
                    } else exchange.sendResponseHeaders(204, -1);
                }
            } finally { exchange.close(); }
        });
        server.start();
        try {
            var store = new MinioObjectStore("http://127.0.0.1:" + server.getAddress().getPort(), "test-access", "test-secret");
            Path file = root.resolve("source.pdf"); Files.write(file, bytes);
            store.put("rfq-files", "DOC/source.pdf", file);
            try (var input = store.get("rfq-files", "DOC/source.pdf")) { assertThat(input.readAllBytes()).isEqualTo(bytes); }
            store.delete("rfq-files", "DOC/source.pdf");
            assertThat(requests).containsExactly("PUT", "GET", "DELETE");
        } finally { server.stop(0); }
    }
}
