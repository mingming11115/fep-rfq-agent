package com.naura.rfq.storage;

import io.minio.*;
import io.minio.errors.ErrorResponseException;
import java.io.*;
import java.nio.file.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Lazy client: local storage requires no MinIO connection or credentials. */
@Component
@Slf4j
public class MinioObjectStore {
    private final String endpoint, accessKey, secretKey;
    private volatile MinioClient client;
    public MinioObjectStore(@Value("${rfq.minio.endpoint:}") String endpoint,
            @Value("${rfq.minio.access-key:}") String accessKey,
            @Value("${rfq.minio.secret-key:}") String secretKey) {
        this.endpoint = endpoint; this.accessKey = accessKey; this.secretKey = secretKey;
    }
    private synchronized MinioClient client() throws IOException {
        if (client == null) {
            if (endpoint.isBlank() || accessKey.isBlank() || secretKey.isBlank()) {
                throw new IOException("MinIO endpoint/access-key/secret-key 未配置");
            }
            try {
                client = MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey).build();
                client.setTimeout(5000, 30000, 30000);
            } catch (RuntimeException e) {
                log.error("初始化 MinIO 客户端失败 errorType={}", e.getClass().getSimpleName());
                throw new IOException("MinIO 配置无效", e);
            }
        }
        return client;
    }
    public void put(String bucket, String key, Path file) throws IOException {
        try (var input = Files.newInputStream(file)) {
            client().putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                .stream(input, Files.size(file), -1).contentType(key.endsWith(".pdf") ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document").build());
        } catch (Exception e) {
            log.error("上传 MinIO 原件失败 errorType={}", e.getClass().getSimpleName());
            throw new IOException("MinIO 上传失败", e);
        }
    }
    public InputStream get(String bucket, String key) throws IOException {
        try { return client().getObject(GetObjectArgs.builder().bucket(bucket).object(key).build()); }
        catch (ErrorResponseException e) {
            log.error("MinIO 返回原件读取错误 errorType={}", e.getClass().getSimpleName());
            if ("NoSuchKey".equals(e.errorResponse().code())) {
                throw new FileNotFoundException("MinIO 原件不存在");
            }
            throw new IOException("MinIO 读取失败", e);
        } catch (Exception e) {
            log.error("读取 MinIO 原件失败 errorType={}", e.getClass().getSimpleName());
            throw new IOException("MinIO 读取失败", e);
        }
    }
    public void delete(String bucket, String key) throws IOException {
        try { client().removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build()); }
        catch (Exception e) {
            log.error("删除 MinIO 原件失败 errorType={}", e.getClass().getSimpleName());
            throw new IOException("MinIO 删除失败", e);
        }
    }
}
