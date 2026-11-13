package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.AdminService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 事业部成员的业务侧只读接口。
 *
 * <p>与 {@link AdminController#listMembers} 的区别：这里不要求平台/BU 管理权限，
 * 只要登录即可读取。确认人、最终评审人的候选列表依赖它，否则普通业务账号
 * （SR、技术）进入页面后拿不到候选人。
 */
@RestController
@RequestMapping("/api/rfq/business-units")
@RequiredArgsConstructor
@Slf4j
public class BusinessUnitMemberController {

    private final AdminService admin;

    @GetMapping("/{buId}/members")
    public ApiResponse<List<AdminService.MemberView>> members(@PathVariable String buId) {
        try {
            CurrentUserHolder.require();
            return ApiResponse.success(admin.membersOf(buId));
        } catch (Exception exception) {
            log.error("Request failed in members", exception);
            throw exception;
        }
    }
}
