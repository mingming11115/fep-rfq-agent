package com.naura.rfq.config;

import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BusinessUnitMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.BusinessUnit;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.UserBuRole;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the five demo identities that mirror the prototype's identity switcher.
 * Runs only when the user table is empty so real data is never overwritten.
 */
@Component
@RequiredArgsConstructor
public class DemoDataInitializer implements CommandLineRunner {

    public static final String DEMO_PASSWORD = "Rfq@2026";
    public static final String BU_FEP = "BU-FEP";

    private static final Logger log = LoggerFactory.getLogger(DemoDataInitializer.class);

    private final AppUserMapper users;
    private final BusinessUnitMapper businessUnits;
    private final UserBuRoleMapper roles;
    private final ProjectMapper projects;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        if (users.count() > 0) {
            return;
        }
        BusinessUnit fep = new BusinessUnit();
        fep.setId(BU_FEP);
        fep.setCode("FEP");
        fep.setName("FEP 事业部");
        businessUnits.insert(fep);

        seed("demo-sales", "sr01", "张明", "SR", false);
        seed("demo-technical", "tech01", "李工", "TECH", false);
        seed("demo-approver", "appr01", "王强", "APPROVER", false);
        seed("demo-bu-admin", "bu01", "陈静", "BU_ADMIN", false);
        seed("demo-system-admin", "admin", "系统管理员", null, true);

        Project project = new Project();
        project.setId("RFQ-001");
        project.setCode("RFQ-001");
        project.setName("BHEL 2×660MW 锅炉给水泵 RFQ");
        project.setCustomer("BHEL");
        project.setBuId(BU_FEP);
        project.setOwnerId("demo-sales");
        project.setStage("PARSING");
        project.setCreatedBy("demo-sales");
        projects.insert(project);

        log.info("已初始化演示账号，统一密码 {}", DEMO_PASSWORD);
    }

    private void seed(String id, String username, String displayName, String role, boolean systemAdmin) {
        AppUser user = new AppUser();
        user.setId(id);
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(DEMO_PASSWORD));
        user.setDisplayName(displayName);
        user.setSystemAdmin(systemAdmin);
        users.insert(user);
        if (role != null) {
            UserBuRole binding = new UserBuRole();
            binding.setUserId(id);
            binding.setBuId(BU_FEP);
            binding.setRole(role);
            roles.insert(binding);
        }
    }

    public static List<String> roleLabels() {
        return List.of("SR", "TECH", "APPROVER", "BU_ADMIN");
    }
}
