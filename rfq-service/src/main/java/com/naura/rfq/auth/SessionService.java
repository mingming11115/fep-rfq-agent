package com.naura.rfq.auth;

import com.naura.rfq.domain.AppUser;
import com.naura.rfq.domain.UserBuRole;
import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SessionService {

    private final AppUserMapper users;
    private final UserBuRoleMapper roles;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public Optional<AppUser> authenticate(String username, String rawPassword) {
        return users.findByUsername(username.trim())
                .filter(AppUser::isActive)
                .filter(user -> passwordEncoder.matches(rawPassword, user.getPasswordHash()));
    }

    @Transactional(readOnly = true)
    public Optional<CurrentUser> load(String userId) {
        return users.findById(userId)
                .filter(AppUser::isActive)
                .map(this::toCurrentUser);
    }

    private CurrentUser toCurrentUser(AppUser user) {
        List<CurrentUser.RoleGrant> grants = roles.findByUserIdAndStatus(user.getId(), "ACTIVE").stream()
                .map(this::toGrant)
                .toList();
        return new CurrentUser(user.getId(), user.getDisplayName(), user.isSystemAdmin(), grants);
    }

    private CurrentUser.RoleGrant toGrant(UserBuRole binding) {
        return new CurrentUser.RoleGrant(binding.getBuId(), binding.getRole());
    }
}
