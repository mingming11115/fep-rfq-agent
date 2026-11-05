package com.naura.rfq.service;

import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.UserBuRole;
import com.naura.rfq.security.CurrentUser;
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
    private final BuMemberProfileMapper profiles;
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
        var disabledBus = profiles.findByUserId(user.getId()).stream()
                .filter(profile -> !profile.isEnabled()).map(profile -> profile.getBuId()).toList();
        List<CurrentUser.RoleGrant> grants = roles.findByUserIdAndStatus(user.getId(), "ACTIVE").stream()
                .filter(grant -> !disabledBus.contains(grant.getBuId()))
                .map(this::toGrant)
                .toList();
        return new CurrentUser(user.getId(), user.getDisplayName(), user.isSystemAdmin(), grants);
    }

    private CurrentUser.RoleGrant toGrant(UserBuRole binding) {
        return new CurrentUser.RoleGrant(binding.getBuId(), binding.getRole());
    }
}
