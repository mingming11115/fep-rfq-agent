package com.naura.rfq.service;

import com.naura.rfq.config.properties.AuthProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import javax.crypto.SecretKey;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class JwtService {

    private final SecretKey key;
    private final Duration ttl;

    public JwtService(AuthProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.jwtSecret().getBytes(StandardCharsets.UTF_8));
        this.ttl = Duration.ofMinutes(properties.tokenTtlMinutes());
    }

    public String issue(String userId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key)
                .compact();
    }

    public Optional<String> userId(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return Optional.ofNullable(claims.getSubject());
        } catch (JwtException | IllegalArgumentException ex) {
            log.error("验证会话 JWT 失败 errorType={}", ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    public long ttlSeconds() {
        return ttl.toSeconds();
    }
}
