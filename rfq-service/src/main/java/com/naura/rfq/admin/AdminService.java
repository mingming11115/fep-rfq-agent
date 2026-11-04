package com.naura.rfq.admin;

import com.naura.rfq.audit.AuditService;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.domain.AppUser;
import com.naura.rfq.domain.BuMemberProfile;
import com.naura.rfq.domain.BusinessUnit;
import com.naura.rfq.domain.UserBuRole;
import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.BusinessUnitMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台与事业部两级管理。
 *
 * <p>授权模型：系统管理员可管理全部事业部与账号；BU 管理员只能管理本人被授予
 * {@code BU_ADMIN} 的事业部成员，且不能授予 BU_ADMIN、不能改动系统管理员账号，
 * 也不能停用自己 —— 所有判断都在服务端完成，前端只负责展示。
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AdminService {

    public static final String ACTIVE = "ACTIVE";
    public static final String DISABLED = "DISABLED";
    public static final String BU_ADMIN = "BU_ADMIN";
    private static final Set<String> ROLES = Set.of("SR", "TECH", "APPROVER", BU_ADMIN);
    private static final Set<String> STATUSES = Set.of(ACTIVE, DISABLED);
    /** 资料发布资格的可选值，与前端 personnelDomain 的校验保持一致。 */
    private static final Set<String> QUALIFICATIONS = Set.of("knowledge-publish", "capability-publish");

    private final AppUserMapper users;
    private final BusinessUnitMapper businessUnits;
    private final UserBuRoleMapper bindings;
    private final BuMemberProfileMapper profiles;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final AccessGuard access;

    public record UserRow(AppUser user, List<UserBuRole> roles) {
    }

    public record Slice<T>(List<T> rows, long total) {

        public static <T> Slice<T> empty() {
            return new Slice<>(List.of(), 0);
        }
    }

    public record NewUser(String username, String password, String displayName, String email,
            String buId, String role) {
    }

    // ---------------------------------------------------------------- 事业部

    public Slice<BusinessUnit> listBusinessUnits(CurrentUser actor, PageQuery query, String keyword) {
        Collection<String> scope = managedBuScope(actor);
        if (scope != null && scope.isEmpty()) {
            return Slice.empty();
        }
        List<BusinessUnit> rows = businessUnits.findPage(query, keyword, scope);
        return new Slice<>(rows, businessUnits.countPage(keyword, scope));
    }

    public BusinessUnit createBusinessUnit(CurrentUser actor, String code, String name) {
        requireSystemAdmin(actor, "仅系统管理员可以新建事业部");
        businessUnits.findByCode(code).ifPresent(existing -> {
            throw new BusinessException(409, "事业部编码已存在：" + code);
        });
        BusinessUnit unit = new BusinessUnit();
        unit.setId(Ids.next("BU"));
        unit.setCode(code);
        unit.setName(name);
        businessUnits.insert(unit);
        audit.successInBu(actor.id(), unit.getId(), "新建事业部", "business_unit", unit.getId(), code + " · " + name);
        return unit;
    }

    public BusinessUnit renameBusinessUnit(CurrentUser actor, String id, String name) {
        requireSystemAdmin(actor, "仅系统管理员可以修改事业部");
        BusinessUnit unit = businessUnits.findById(id)
                .orElseThrow(() -> new BusinessException(404, "事业部不存在"));
        businessUnits.updateName(id, name);
        audit.successInBu(actor.id(), id, "修改事业部", "business_unit", id, unit.getName() + " → " + name);
        unit.setName(name);
        return unit;
    }

    // ------------------------------------------------------------------ 账号

    public Slice<UserRow> listUsers(CurrentUser actor, PageQuery query, String keyword, String buId) {
        Collection<String> scope = managedBuScope(actor);
        if (scope == null) {
            // 系统管理员：可按事业部收窄
            if (buId != null && !buId.isBlank()) {
                businessUnits.findById(buId).orElseThrow(() -> new BusinessException(404, "事业部不存在"));
                scope = List.of(buId);
            }
        } else {
            if (scope.isEmpty()) {
                return Slice.empty();
            }
            String effectiveBu = (buId == null || buId.isBlank()) ? scope.iterator().next() : buId;
            requireManageBu(actor, effectiveBu);
            scope = List.of(effectiveBu);
        }
        List<AppUser> rows = users.findPage(query, keyword, scope);
        long total = users.countPage(keyword, scope);
        if (rows.isEmpty()) {
            return new Slice<>(List.of(), total);
        }
        Map<String, List<UserBuRole>> grouped = bindings
                .findByUserIds(rows.stream().map(AppUser::getId).toList(), ACTIVE).stream()
                .collect(Collectors.groupingBy(UserBuRole::getUserId));
        return new Slice<>(rows.stream()
                .map(user -> new UserRow(user, grouped.getOrDefault(user.getId(), List.of()).stream()
                        .filter(role -> actor.systemAdmin() || actor.roles().stream().anyMatch(grant ->
                                BU_ADMIN.equals(grant.role()) && grant.buId().equals(role.getBuId()))).toList()))
                .toList(), total);
    }

    @Transactional
    public UserRow createUser(CurrentUser actor, NewUser command) {
        requireRoleCode(command.role());
        boolean systemAdmin = false;
        String buId = command.buId();
        if (actor.systemAdmin()) {
            if (buId == null || buId.isBlank()) {
                throw new BusinessException(400, "请选择所属事业部");
            }
        } else {
            requireManageBu(actor, buId);
            if (BU_ADMIN.equals(command.role())) {
                throw new BusinessException(403, "BU 管理员不能授予 BU_ADMIN 角色");
            }
        }
        businessUnits.findById(buId).orElseThrow(() -> new BusinessException(404, "事业部不存在"));
        users.findByUsername(command.username()).ifPresent(existing -> {
            throw new BusinessException(409, "账号已存在：" + command.username());
        });

        AppUser user = new AppUser();
        user.setId(Ids.next("USR"));
        user.setUsername(command.username());
        user.setPasswordHash(passwordEncoder.encode(command.password()));
        user.setDisplayName(command.displayName());
        user.setEmail(command.email());
        user.setStatus(ACTIVE);
        user.setSystemAdmin(systemAdmin);
        users.insert(user);

        bind(user.getId(), buId, command.role());
        audit.successInBu(actor.id(), buId, "新建账号", "app_user", user.getId(),
                command.username() + " · " + buId + " · " + command.role());
        return new UserRow(user, bindings.findByUserIdAndStatus(user.getId(), ACTIVE));
    }

    public AppUser updateUser(CurrentUser actor, String id, String displayName, String email) {
        AppUser target = requireManagedUser(actor, id);
        requireGlobalUserScope(actor, id);
        users.updateProfile(id, displayName, email);
        auditUserChange(actor, target, "修改账号资料",
                target.getDisplayName() + " → " + displayName);
        target.setDisplayName(displayName);
        target.setEmail(email);
        return target;
    }

    public AppUser updateUserStatus(CurrentUser actor, String id, String status) {
        if (!STATUSES.contains(status)) {
            throw new BusinessException(400, "账号状态只能是 ACTIVE 或 DISABLED");
        }
        AppUser target = requireManagedUser(actor, id);
        requireGlobalUserScope(actor, id);
        if (DISABLED.equals(status)) {
            if (target.getId().equals(actor.id())) {
                throw new BusinessException(400, "不能停用当前登录的账号");
            }
            if (target.isSystemAdmin() && activeSystemAdmins() <= 1) {
                throw new BusinessException(400, "至少保留一个可用的系统管理员");
            }
        }
        users.updateStatus(id, status);
        auditUserChange(actor, target, ACTIVE.equals(status) ? "启用账号" : "停用账号",
                target.getUsername());
        target.setStatus(status);
        return target;
    }

    public void resetPassword(CurrentUser actor, String id, String rawPassword) {
        AppUser target = requireManagedUser(actor, id);
        requireGlobalUserScope(actor, id);
        users.updatePassword(id, passwordEncoder.encode(rawPassword));
        auditUserChange(actor, target, "重置密码", "已重置登录密码");
    }

    // -------------------------------------------------------------- 角色绑定

    @Transactional
    public UserBuRole assignRole(CurrentUser actor, String userId, String buId, String role) {
        requireRoleCode(role);
        requireManagedUser(actor, userId);
        requireManageBu(actor, buId);
        if (!actor.systemAdmin() && BU_ADMIN.equals(role)) {
            throw new BusinessException(403, "BU 管理员不能授予 BU_ADMIN 角色");
        }
        UserBuRole existing = bindings.findByUserIdAndStatus(userId, ACTIVE).stream()
                .filter(binding -> binding.getBuId().equals(buId) && binding.getRole().equals(role))
                .findFirst().orElse(null);
        if (existing != null) {
            return existing;
        }
        UserBuRole revived = bindings.findByUserIdAndStatus(userId, DISABLED).stream()
                .filter(binding -> binding.getBuId().equals(buId) && binding.getRole().equals(role))
                .findFirst().orElse(null);
        if (revived != null) {
            bindings.updateStatus(userId, buId, role, ACTIVE);
            revived.setStatus(ACTIVE);
            audit.successInBu(actor.id(), buId, "恢复角色", "user_bu_role", userId, role);
            return revived;
        }
        bind(userId, buId, role);
        audit.successInBu(actor.id(), buId, "授予角色", "user_bu_role", userId, role);
        return bindings.findByUserIdAndStatus(userId, ACTIVE).stream()
                .filter(binding -> binding.getBuId().equals(buId) && binding.getRole().equals(role))
                .findFirst().orElseThrow(() -> new BusinessException(500, "角色绑定写入后未能读回"));
    }

    @Transactional
    public void revokeRole(CurrentUser actor, String userId, String buId, String role) {
        requireRoleCode(role);
        requireManagedUser(actor, userId);
        requireManageBu(actor, buId);
        if (BU_ADMIN.equals(role)) {
            if (!actor.systemAdmin()) {
                throw new BusinessException(403, "仅系统管理员可以撤销 BU_ADMIN 角色");
            }
            if (userId.equals(actor.id())) {
                throw new BusinessException(400, "不能撤销自己的 BU 管理员角色");
            }
            long remaining = bindings.countActiveByBuAndRole(buId, BU_ADMIN, ACTIVE);
            if (remaining <= 1) {
                throw new BusinessException(400, "该事业部至少保留一个 BU 管理员");
            }
        }
        int changed = bindings.updateStatus(userId, buId, role, DISABLED);
        if (changed == 0) {
            throw new BusinessException(404, "角色绑定不存在");
        }
        audit.successInBu(actor.id(), buId, "撤销角色", "user_bu_role", userId, role);
    }

    // -------------------------------------------------------------- 成员资格

    /** 成员完整视图：角色与启停来自 user_bu_role，资格配置来自 bu_member_profile。 */
    public record MemberView(String userId, String username, String displayName, List<String> roles,
            boolean enabled, boolean canConfirm, boolean canFinalReview, List<String> resourceQualifications) {
    }

    @Transactional(readOnly = true)
    public List<MemberView> listMembers(CurrentUser actor, String buId) {
        requireManageBu(actor, buId);
        return membersOf(buId);
    }

    /** 业务候选目录按当前身份校验 BU；无需额外的管理角色。 */
    @Transactional(readOnly = true)
    public List<MemberView> membersOf(String buId) {
        if (buId == null || buId.isBlank()) {
            throw new BusinessException(400, "请指定事业部");
        }
        access.requireBu(CurrentUserHolder.require(), buId);
        List<UserBuRole> grants = bindings.findByBuId(buId);
        if (grants.isEmpty()) {
            return List.of();
        }
        Map<String, AppUser> userById = users.findByIds(
                        grants.stream().map(UserBuRole::getUserId).distinct().toList()).stream()
                .collect(Collectors.toMap(AppUser::getId, user -> user, (a, b) -> b));
        Map<String, BuMemberProfile> profileByUser = profiles.findByBuId(buId).stream()
                .collect(Collectors.toMap(BuMemberProfile::getUserId, profile -> profile, (a, b) -> b));
        Map<String, List<UserBuRole>> grantsByUser = grants.stream()
                .collect(Collectors.groupingBy(UserBuRole::getUserId));
        return grantsByUser.entrySet().stream()
                .filter(entry -> userById.containsKey(entry.getKey()))
                .map(entry -> toMemberView(userById.get(entry.getKey()), buId, entry.getValue(),
                        profileByUser.get(entry.getKey())))
                .filter(member -> member != null)
                .sorted(Comparator.comparing(MemberView::userId))
                .toList();
    }

    /**
     * 更新成员的资格配置。只改 bu_member_profile，业务角色仍走 assignRole / revokeRole。
     * 未启用或不允许条款确认时，最终评审资格会自动失效，避免留下自相矛盾的授权组合。
     */
    @Transactional
    public MemberView updateMemberProfile(CurrentUser actor, String buId, String userId,
            Boolean canConfirm, Boolean canFinalReview, List<String> resourceQualifications) {
        requireManageBu(actor, buId);
        AppUser target = requireManagedUser(actor, userId);
        List<UserBuRole> grants = bindings.findByUserId(userId).stream()
                .filter(grant -> buId.equals(grant.getBuId()))
                .toList();
        if (grants.isEmpty()) {
            throw new BusinessException(400, "该账号不属于所选事业部");
        }

        List<String> nextQualification = resourceQualifications != null
                ? resourceQualifications.stream().filter(q -> q != null && !q.isBlank())
                        .map(String::trim).distinct().sorted().toList()
                : null;
        for (String qualification : nextQualification == null ? List.<String>of() : nextQualification) {
            if (!QUALIFICATIONS.contains(qualification)) {
                throw new BusinessException(400, "无效的资料发布权限：" + qualification);
            }
        }

        profiles.patchQualifications(userId, buId, canConfirm, canFinalReview,
                nextQualification == null ? null : String.join(",", nextQualification));
        BuMemberProfile profile = profiles.findByBuIdAndUserId(buId,userId);

        audit.successInBu(actor.id(), buId, "更新BU成员资格", "bu_member_profile", buId + "/" + userId,
                target.getDisplayName() + "：条款确认=" + profile.isCanConfirm() + "，最终评审=" + profile.isCanFinalReview()
                        + "，资料发布=" + profile.getResourceQualifications());
        return toMemberView(target, buId, grants, profile);
    }

    /** 暂停成员只改变档案 enabled，保留各角色原有授予/撤销状态。 */
    @Transactional
    public MemberView updateMemberEnabled(CurrentUser actor, String buId, String userId, boolean enabled) {
        requireManageBu(actor, buId);
        AppUser target = requireManagedUser(actor, userId);
        if (bindings.findByUserId(userId).stream().noneMatch(grant -> buId.equals(grant.getBuId()))) {
            throw new BusinessException(400, "该账号不属于所选事业部");
        }
        var grants = bindings.findByUserId(userId).stream().filter(grant -> buId.equals(grant.getBuId())).toList();
        if (!actor.systemAdmin() && grants.stream().anyMatch(grant -> BU_ADMIN.equals(grant.getRole()))) {
            throw new BusinessException(403, "仅系统管理员可以调整 BU 管理员的成员状态");
        }
        profiles.setEnabled(userId,buId,enabled);
        audit.successInBu(actor.id(), buId, enabled ? "启用BU成员" : "停用BU成员", "bu_member_profile",
                buId + "/" + userId, target.getDisplayName());
        return toMemberView(target, buId, bindings.findByUserId(userId),
                profiles.findByBuIdAndUserId(buId, userId));
    }

    private MemberView toMemberView(AppUser user, String buId, List<UserBuRole> roles, BuMemberProfile profile) {
        List<UserBuRole> grants = roles.stream().filter(grant -> buId.equals(grant.getBuId())).toList();
        if (grants.isEmpty()) {
            return null;
        }
        // 只有 ACTIVE 的角色才算数：停用的角色不应让该账号出现在候选人列表里。
        List<UserBuRole> active = grants.stream().filter(grant -> ACTIVE.equals(grant.getStatus())).toList();
        boolean enabled = user.isActive() && !active.isEmpty() && (profile == null || profile.isEnabled());
        return new MemberView(user.getId(), user.getUsername(), user.getDisplayName(),
                active.stream().map(UserBuRole::getRole).distinct().sorted().toList(),
                enabled,
                enabled && profile != null && profile.isCanConfirm(),
                enabled && profile != null && profile.isCanConfirm() && profile.isCanFinalReview(),
                splitQualifications(profile == null ? "" : profile.getResourceQualifications()));
    }

    private List<String> splitQualifications(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Stream.of(raw.split(",")).map(String::trim).filter(value -> !value.isEmpty())
                .distinct().sorted().toList();
    }

    // ---------------------------------------------------------------- 内部

    public List<UserBuRole> rolesOf(String userId) {
        return bindings.findByUserIdAndStatus(userId, ACTIVE);
    }

    private void bind(String userId, String buId, String role) {
        UserBuRole binding = new UserBuRole();
        binding.setUserId(userId);
        binding.setBuId(buId);
        binding.setRole(role);
        binding.setStatus(ACTIVE);
        bindings.insert(binding);
    }

    /** null = 不限范围（系统管理员）；集合 = 仅这些事业部。 */
    private Collection<String> managedBuScope(CurrentUser actor) {
        if (actor.systemAdmin()) {
            return null;
        }
        List<String> managed = actor.roles().stream()
                .filter(grant -> BU_ADMIN.equals(grant.role()))
                .map(CurrentUser.RoleGrant::buId)
                .distinct()
                .toList();
        if (managed.isEmpty()) {
            throw new BusinessException(403, "当前账号没有平台或事业部管理权限");
        }
        return managed;
    }

    private void requireSystemAdmin(CurrentUser actor, String message) {
        if (!actor.systemAdmin()) {
            throw new BusinessException(403, message);
        }
    }

    private void requireManageBu(CurrentUser actor, String buId) {
        if (buId == null || buId.isBlank()) {
            throw new BusinessException(400, "请指定事业部");
        }
        if (actor.systemAdmin()) {
            return;
        }
        boolean managed = actor.roles().stream()
                .anyMatch(grant -> BU_ADMIN.equals(grant.role()) && grant.buId().equals(buId));
        if (!managed) {
            throw new BusinessException(403, "只能管理本人负责的事业部");
        }
    }

    /** 目标账号必须在操作者的管理范围内，且 BU 管理员不能操作系统管理员账号。 */
    private AppUser requireManagedUser(CurrentUser actor, String userId) {
        AppUser target = users.findById(userId).orElseThrow(() -> new BusinessException(404, "账号不存在"));
        if (actor.systemAdmin()) {
            return target;
        }
        if (target.isSystemAdmin()) {
            throw new BusinessException(403, "无权修改系统管理员账号");
        }
        List<String> managed = actor.roles().stream()
                .filter(grant -> BU_ADMIN.equals(grant.role()))
                .map(CurrentUser.RoleGrant::buId)
                .toList();
        if (managed.isEmpty()) {
            throw new BusinessException(403, "当前账号没有账号管理权限");
        }
        boolean inScope = bindings.findByUserId(userId).stream()
                .anyMatch(binding -> managed.contains(binding.getBuId()));
        if (!inScope) {
            throw new BusinessException(403, "只能管理本人负责事业部内的账号");
        }
        return target;
    }

    private void requireGlobalUserScope(CurrentUser actor, String userId) {
        if (actor.systemAdmin()) return;
        var managed = managedBuScope(actor);
        if (bindings.findByUserId(userId).stream().anyMatch(grant -> !managed.contains(grant.getBuId()))) {
            throw new BusinessException(403, "该账号关联其他事业部，全局资料、密码和账号状态请联系平台管理员维护");
        }
    }

    private void auditUserChange(CurrentUser actor, AppUser target, String action, String detail) {
        var bus = bindings.findByUserId(target.getId()).stream().map(UserBuRole::getBuId).distinct().toList();
        if(bus.isEmpty())audit.success(actor.id(),action,"app_user",target.getId(),detail);
        else for(String buId:bus)audit.successInBu(actor.id(),buId,action,"app_user",target.getId(),detail);
    }

    private void requireRoleCode(String role) {
        if (role == null || !ROLES.contains(role)) {
            throw new BusinessException(400, "角色只能是 SR、TECH、APPROVER 或 BU_ADMIN");
        }
    }

    private long activeSystemAdmins() {
        return users.countActiveSystemAdmins(ACTIVE);
    }
}
