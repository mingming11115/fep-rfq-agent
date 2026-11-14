package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.LoginRequest;
import com.naura.rfq.model.vo.AuthUserView;
import com.naura.rfq.model.vo.LoginResult;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.AuthService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq/auth")
@Slf4j
public class AuthController {
    @Autowired
    private AuthService service;

    @PostMapping("/login")
    public ApiResponse<LoginResult> login(@Valid @RequestBody LoginRequest request) {
        try {
            return ApiResponse.success(service.login(request));
        } catch (Exception exception) {
            log.error("Request failed in login", exception);
            throw exception;
        }
    }

    @GetMapping("/me")
    public ApiResponse<AuthUserView> me() {
        try {
            return ApiResponse.success(service.me(CurrentUserHolder.require()));
        } catch (Exception exception) {
            log.error("Request failed in me", exception);
            throw exception;
        }
    }
}
