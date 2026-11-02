package com.naura.rfq.admin;

import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.domain.AppUser;
import com.naura.rfq.domain.BusinessUnit;
import com.naura.rfq.domain.UserBuRole;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台管理接口：事业部与账号。授权在 {@link AdminService} 内完成，
 * 系统管理员管全部，BU 管理员只能管本人负责的事业部。
 */
@RestController
@RequestMapping("/api/rfq/admin")
@RequiredArgsConstructor
public class AdminController {

    private static final List<String> BU_SORTS = List.of("createdAt", "code", "name");
    private static final List<String> USER_SORTS = List.of("createdAt", "username", "displayName");

    private final AdminService admin;

    public record BuView(String id, String code, String name, Instant createdAt) {

        public static BuView of(BusinessUnit unit) {
            return new BuView(unit.getId(), unit.getCode(), unit.getName(), unit.getCreatedAt());
        }
    }

    public record RoleView(String buId, String role) {

        public static RoleView of(UserBuRole binding) {
            return new RoleView(binding.getBuId(), binding.getRole());
        }
    }

    public record UserView(String id, String username, String displayName, String email, String status,
            boolean systemAdmin, List<RoleView> roles, Instant createdAt) {

        public static UserView of(AdminService.UserRow row) {
            AppUser user = row.user();
            return new UserView(user.getId(), user.getUsername(), user.getDisplayName(), user.getEmail(),
                    user.getStatus(), user.isSystemAdmin(),
                    row.roles().stream().map(RoleView::of).toList(), user.getCreatedAt());
        }
    }

    public record CreateBuRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{2,16}", message = "事业部编码仅支持字母、数字、下划线和短横线（2-16 位）") String code,
            @NotBlank @Size(max = 64, message = "事业部名称最长 64 个字符") String name) {
    }

    public record RenameBuRequest(@NotBlank @Size(max = 64, message = "事业部名称最长 64 个字符") String name) {
    }

    public record CreateUserRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9._-]{3,32}", message = "账号仅支持字母、数字、点、下划线和短横线（3-32 位）") String username,
            @NotBlank @Size(min = 8, max = 64, message = "密码长度需在 8-64 位之间") String password,
            @NotBlank @Size(max = 64, message = "姓名最长 64 个字符") String displayName,
            @Email(message = "邮箱格式不正确") @Size(max = 128) String email,
            @NotBlank String buId,
            @NotBlank String role) {
    }

    public record UpdateUserRequest(
            @NotBlank @Size(max = 64, message = "姓名最长 64 个字符") String displayName,
            @Email(message = "邮箱格式不正确") @Size(max = 128) String email) {
    }

    public record UpdateStatusRequest(@NotBlank String status) {
    }

    public record ResetPasswordRequest(
            @NotBlank @Size(min = 8, max = 64, message = "密码长度需在 8-64 位之间") String password) {
    }

    public record AssignRoleRequest(@NotBlank String buId, @NotBlank String role) {
    }

    // ---------------------------------------------------------------- 事业部

    @GetMapping("/business-units")
    public ApiResponse<PageView<BuView>> listBusinessUnits(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String keyword) {
        CurrentUser actor = CurrentUserHolder.require();
        PageQuery query = PageQuery.of(page, size, sort, BU_SORTS, "createdAt,asc");
        AdminService.Slice<BusinessUnit> slice = admin.listBusinessUnits(actor, query, keyword);
        return ApiResponse.success(PageView.of(slice.rows().stream().map(BuView::of).toList(),
                slice.total(), query.getPage(), query.getSize()));
    }

    @PostMapping("/business-units")
    public ApiResponse<BuView> createBusinessUnit(@Valid @RequestBody CreateBuRequest request) {
        return ApiResponse.success(BuView.of(
                admin.createBusinessUnit(CurrentUserHolder.require(), request.code().trim(),
                        request.name().trim())));
    }

    @PatchMapping("/business-units/{id}")
    public ApiResponse<BuView> renameBusinessUnit(@PathVariable String id,
            @Valid @RequestBody RenameBuRequest request) {
        return ApiResponse.success(BuView.of(
                admin.renameBusinessUnit(CurrentUserHolder.require(), id, request.name().trim())));
    }

    // ------------------------------------------------------------------ 账号

    @GetMapping("/users")
    public ApiResponse<PageView<UserView>> listUsers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String buId) {
        CurrentUser actor = CurrentUserHolder.require();
        PageQuery query = PageQuery.of(page, size, sort, USER_SORTS, "createdAt,desc");
        AdminService.Slice<AdminService.UserRow> slice = admin.listUsers(actor, query, keyword, buId);
        return ApiResponse.success(PageView.of(slice.rows().stream().map(UserView::of).toList(),
                slice.total(), query.getPage(), query.getSize()));
    }

    @PostMapping("/users")
    public ApiResponse<UserView> createUser(@Valid @RequestBody CreateUserRequest request) {
        CurrentUser actor = CurrentUserHolder.require();
        AdminService.UserRow row = admin.createUser(actor, new AdminService.NewUser(
                request.username().trim(), request.password(), request.displayName().trim(),
                request.email(), request.buId(), request.role()));
        return ApiResponse.success(UserView.of(row));
    }

    @PatchMapping("/users/{id}")
    public ApiResponse<UserView> updateUser(@PathVariable String id,
            @Valid @RequestBody UpdateUserRequest request) {
        CurrentUser actor = CurrentUserHolder.require();
        AppUser updated = admin.updateUser(actor, id, request.displayName().trim(), request.email());
        return ApiResponse.success(UserView.of(
                new AdminService.UserRow(updated, rolesOf(id))));
    }

    @PatchMapping("/users/{id}/status")
    public ApiResponse<UserView> updateUserStatus(@PathVariable String id,
            @Valid @RequestBody UpdateStatusRequest request) {
        CurrentUser actor = CurrentUserHolder.require();
        AppUser updated = admin.updateUserStatus(actor, id, request.status());
        return ApiResponse.success(UserView.of(
                new AdminService.UserRow(updated, rolesOf(id))));
    }

    @PostMapping("/users/{id}/password")
    public ApiResponse<Void> resetPassword(@PathVariable String id,
            @Valid @RequestBody ResetPasswordRequest request) {
        admin.resetPassword(CurrentUserHolder.require(), id, request.password());
        return ApiResponse.success(null);
    }

    @PostMapping("/users/{id}/roles")
    public ApiResponse<RoleView> assignRole(@PathVariable String id,
            @Valid @RequestBody AssignRoleRequest request) {
        UserBuRole binding = admin.assignRole(CurrentUserHolder.require(), id, request.buId(),
                request.role());
        return ApiResponse.success(RoleView.of(binding));
    }

    @DeleteMapping("/users/{id}/roles")
    public ApiResponse<Void> revokeRole(@PathVariable String id,
            @RequestParam String buId, @RequestParam String role) {
        admin.revokeRole(CurrentUserHolder.require(), id, buId, role);
        return ApiResponse.success(null);
    }

    // ------------------------------------------------------------ 成员资格

    @GetMapping("/business-units/{buId}/members")
    public ApiResponse<List<AdminService.MemberView>> listMembers(@PathVariable String buId) {
        return ApiResponse.success(admin.listMembers(CurrentUserHolder.require(), buId));
    }

    public record MemberProfileRequest(Boolean canConfirm, Boolean canFinalReview,
            List<String> resourceQualifications) {
    }

    @PatchMapping("/business-units/{buId}/members/{userId}")
    public ApiResponse<AdminService.MemberView> updateMemberProfile(@PathVariable String buId,
            @PathVariable String userId, @RequestBody MemberProfileRequest request) {
        return ApiResponse.success(admin.updateMemberProfile(CurrentUserHolder.require(), buId, userId,
                request.canConfirm(), request.canFinalReview(), request.resourceQualifications()));
    }

    public record MemberStatusRequest(boolean enabled) {
    }

    @PatchMapping("/business-units/{buId}/members/{userId}/status")
    public ApiResponse<AdminService.MemberView> updateMemberStatus(@PathVariable String buId,
            @PathVariable String userId, @RequestBody MemberStatusRequest request) {
        return ApiResponse.success(admin.updateMemberEnabled(CurrentUserHolder.require(), buId, userId,
                request.enabled()));
    }

    private List<UserBuRole> rolesOf(String userId) {
        return admin.rolesOf(userId);
    }
}
