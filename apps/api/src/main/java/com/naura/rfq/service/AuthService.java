package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.BusinessUnitMapper;
import com.naura.rfq.model.dto.LoginRequest;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.BusinessUnit;
import com.naura.rfq.model.vo.AuthBuView;
import com.naura.rfq.model.vo.AuthRoleView;
import com.naura.rfq.model.vo.AuthUserView;
import com.naura.rfq.model.vo.LoginResult;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final SessionService sessions;
    private final JwtService jwtService;
    private final BusinessUnitMapper businessUnits;

    public LoginResult login(LoginRequest request) {
        AppUser account = sessions.authenticate(request.username(), request.password())
                .orElseThrow(() -> new BusinessException(401, "账号或密码错误"));
        CurrentUser user = sessions.load(account.getId())
                .orElseThrow(() -> new BusinessException(401, "账号不可用"));
        String token = jwtService.issue(account.getId());
        return new LoginResult(token, jwtService.ttlSeconds(), toView(user));
    }

    public AuthUserView me(CurrentUser user) {
        return toView(user);
    }

    private AuthUserView toView(CurrentUser user) {
        List<AuthRoleView> roles = user.roles().stream()
                .map(grant -> new AuthRoleView(grant.buId(), grant.role()))
                .toList();
        Map<String, BusinessUnit> known = businessUnits.findAll().stream()
                .collect(Collectors.toMap(BusinessUnit::getId, Function.identity()));
        List<AuthBuView> bus = user.buIds().stream()
                .map(known::get)
                .filter(java.util.Objects::nonNull)
                .map(bu -> new AuthBuView(bu.getId(), bu.getCode(), bu.getName()))
                .toList();
        return new AuthUserView(user.id(), user.displayName(), user.systemAdmin(), roles, bus);
    }
}
