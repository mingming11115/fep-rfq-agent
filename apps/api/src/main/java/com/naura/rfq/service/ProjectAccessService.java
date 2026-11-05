package com.naura.rfq.service;

import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.*;
import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.ProjectMemberMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.ProjectMember;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProjectAccessService {
    private final ProjectMapper projects;
    private final ProjectMemberMapper members;
    private final AppUserMapper users;
    private final UserBuRoleMapper roles;
    private final BuMemberProfileMapper profiles;
    private final AccessGuard access;
    private final AuditService audit;

    public record AccessView(String projectId, String buId, String ownerId, long version) {
        static AccessView of(Project p) { return new AccessView(p.getId(),p.getBuId(),p.getOwnerId(),p.getVersion()); }
    }
    public record MemberView(String projectId,String userId,String displayName,boolean enabled,boolean owner,Instant updatedAt) {}

    @Transactional(readOnly=true)
    public AccessView describe(CurrentUser actor,String id) {
        Project project=project(id,false); access.requireProjectAccessManager(actor,project);
        return AccessView.of(project);
    }
    @Transactional(readOnly=true)
    public PageView<MemberView> list(CurrentUser actor,String id,PageQuery query) {
        Project project=project(id,false); access.requireProjectAccessManager(actor,project);
        var rows=members.findPage(id,query);
        Map<String,com.naura.rfq.model.entity.AppUser> byId=rows.isEmpty()?Map.of():users.findByIds(rows.stream().map(ProjectMember::getUserId).toList())
                .stream().collect(Collectors.toMap(user->user.getId(),Function.identity()));
        return PageView.of(rows.stream().map(member->new MemberView(id,member.getUserId(),
                byId.containsKey(member.getUserId())?byId.get(member.getUserId()).getDisplayName():member.getUserId(),
                member.isEnabled(),project.getOwnerId().equals(member.getUserId()),member.getUpdatedAt())).toList(),
                members.count(id),query.getPage(),query.getSize());
    }
    @Transactional
    public AccessView update(CurrentUser actor,String projectId,String userId,boolean enabled,long version,String reason) {
        Project project=project(projectId,true); access.requireProjectAccessManager(actor,project);
        if(project.getVersion()!=version) throw new BusinessException(409,"项目授权已被他人修改，请刷新后重试");
        if(!enabled && project.getOwnerId().equals(userId)) throw new BusinessException(409,"不能撤销当前项目负责人授权，请先变更负责人");
        if(enabled) requireEligible(userId,project.getBuId(),false);
        else if(members.find(projectId,userId).isEmpty()) throw new BusinessException(404,"项目授权不存在");
        saveMember(projectId,userId,enabled,actor.id());
        project.setUpdatedAt(Instant.now()); projects.update(project); project.setVersion(version+1);
        audit.successInBu(actor.id(),project.getBuId(),enabled?"授予项目访问":"撤销项目访问","project",projectId,userId+"："+reason.trim());
        return AccessView.of(project);
    }
    public void requireOwner(String userId,String buId) { requireEligible(userId,buId,true); }
    public void addOwner(Project project,String actorId) { saveMember(project.getId(),project.getOwnerId(),true,actorId); }
    private void saveMember(String projectId,String userId,boolean enabled,String actorId) {
        ProjectMember member=new ProjectMember(); member.setProjectId(projectId); member.setUserId(userId);
        member.setEnabled(enabled); member.setGrantedBy(actorId); members.upsert(member);
    }
    private void requireEligible(String id,String buId,boolean owner) {
        var target=users.findById(id).orElseThrow(()->new BusinessException(400,"人员不在本 BU 有效业务范围"));
        var profile=profiles.findByBuIdAndUserId(buId,id);
        boolean eligible=target.isActive() && !target.isSystemAdmin() && (profile==null || profile.isEnabled())
                && roles.findByUserIdAndStatus(id,"ACTIVE").stream().anyMatch(role->buId.equals(role.getBuId())
                    && (owner?"SR".equals(role.getRole()):Set.of("SR","TECH","APPROVER").contains(role.getRole())));
        if(!eligible)throw new BusinessException(400,owner?"项目负责人必须是本 BU 有效 SR":"人员不在本 BU 有效业务范围");
    }
    private Project project(String id,boolean locked) {
        return (locked?projects.findByIdForUpdate(id):projects.findById(id)).orElseThrow(()->new BusinessException(404,"项目不存在"));
    }
}
