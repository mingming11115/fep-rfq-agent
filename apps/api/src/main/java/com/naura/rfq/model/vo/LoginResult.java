package com.naura.rfq.model.vo;

public record LoginResult(String token, long expiresInSeconds, AuthUserView user) {
}
