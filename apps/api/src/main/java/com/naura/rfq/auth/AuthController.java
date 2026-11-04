package com.naura.rfq.auth;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.AppUser;
import com.naura.rfq.domain.BusinessUnit;
import com.naura.rfq.mapper.BusinessUnitMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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

    private final SessionService sessions;
    private final JwtService jwtService;
    private final BusinessUnitMapper businessUnits;

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record BuView(String id, String code, String name) {
    }

    public record RoleView(String buId, String role) {
    }

    public record UserView(String id, String displayName, boolean systemAdmin,
            List<RoleView> roles, List<BuView> bus) {
    }

    public record LoginResult(String token, long expiresInSeconds, UserView user) {
    }

    @PostMapping("/login")
    public ApiResponse<LoginResult> login(@Valid @RequestBody LoginRequest request) {
        AppUser account = sessions.authenticate(request.username(), request.password())
                .orElseThrow(() -> new BusinessException(401, "账号或密码错误"));
        CurrentUser user = sessions.load(account.getId())
                .orElseThrow(() -> new BusinessException(401, "账号不可用"));
        String token = jwtService.issue(account.getId());
        return ApiResponse.success(new LoginResult(token, jwtService.ttlSeconds(), toView(user)));
    }

    @GetMapping("/me")
    public ApiResponse<UserView> me() {
        return ApiResponse.success(toView(CurrentUserHolder.require()));
    }

    private UserView toView(CurrentUser user) {
        List<RoleView> roles = user.roles().stream()
                .map(grant -> new RoleView(grant.buId(), grant.role()))
                .toList();
        Map<String, BusinessUnit> known = businessUnits.findAll().stream()
                .collect(Collectors.toMap(BusinessUnit::getId, Function.identity()));
        List<BuView> bus = user.buIds().stream()
                .map(known::get)
                .filter(java.util.Objects::nonNull)
                .map(bu -> new BuView(bu.getId(), bu.getCode(), bu.getName()))
                .toList();
        return new UserView(user.id(), user.displayName(), user.systemAdmin(), roles, bus);
    }
}
