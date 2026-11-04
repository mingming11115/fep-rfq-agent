package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.LoginRequest;
import com.naura.rfq.model.vo.AuthUserView;
import com.naura.rfq.model.vo.LoginResult;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService service;

    @PostMapping("/login")
    public ApiResponse<LoginResult> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(service.login(request));
    }

    @GetMapping("/me")
    public ApiResponse<AuthUserView> me() {
        return ApiResponse.success(service.me(CurrentUserHolder.require()));
    }
}
