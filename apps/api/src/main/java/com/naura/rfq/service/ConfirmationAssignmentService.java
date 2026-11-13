package com.naura.rfq.service;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.*;
import com.naura.rfq.model.dto.AssignConfirmationRequest;
import com.naura.rfq.model.entity.*;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.*;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@NoArgsConstructor
@AllArgsConstructor
public class ConfirmationAssignmentService {
    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private AppUserMapper users;
    @Autowired
    private UserBuRoleMapper roles;
    @Autowired
    private BuMemberProfileMapper profiles;
    @Autowired
    private ProjectMemberMapper members;
    @Autowired
    private AccessGuard access;
    @Autowired
    private AuditService audit;

    public record Candidate(String userId, String name) {}

    @Transactional(readOnly=true)
    public List<Candidate> candidates(CurrentUser actor, String id) {
        Requirement row=requirement(id);
        Project project=projects.findById(row.getProjectId()).orElseThrow(()->new BusinessException(404,"项目不存在"));
        access.requireProjectManager(actor,project);
        return roles.findByBuId(project.getBuId()).stream().map(UserBuRole::getUserId).distinct()
                .filter(userId->eligible(project,userId))
                .map(userId->new Candidate(userId,users.findById(userId).orElseThrow().getDisplayName())).toList();
    }

    @Transactional
    public RequirementView assign(CurrentUser actor,String id,AssignConfirmationRequest request) {
        Requirement row=requirement(id);
        Project project=projects.findByIdForUpdate(row.getProjectId()).orElseThrow(()->new BusinessException(404,"项目不存在"));
        access.requireProjectManager(actor,project);
        access.requireActiveProject(project);
        documents.findByIdForUpdate(row.getDocumentId()).orElseThrow(()->new BusinessException(404,"文档不存在"));
        // Same lock order as parsing: project, document, then current requirements.
        row=requirements.findByDocumentIdForUpdate(row.getDocumentId()).stream().filter(r->id.equals(r.getId()))
                .findFirst().orElseThrow(()->new BusinessException(409,"条款已重新解析，请刷新后重试"));
        if(!request.version().equals(row.getVersion())) {
            throw new BusinessException(409,"确认分工或条款已变化，请刷新后重试");
        }
        if(!eligible(project,request.userId())) {
            throw new BusinessException(400,"确认人须具有本 BU 确认资格及项目授权");
        }
        if(request.userId().equals(row.getConfirmationAssigneeId())) {
            throw new BusinessException(400,"请选择其他确认人");
        }
        String before=row.getConfirmationAssigneeId();
        row.setConfirmationAssigneeId(request.userId());
        row.setConfirmationAssignedBy(actor.id());row.setConfirmationAssignedAt(Instant.now());
        row.setConfirmationAssignmentReason(request.reason().trim());
        if(requirements.assignConfirmation(row)!=1) {
            throw new BusinessException(409,"确认分工已变化，请刷新后重试");
        }
        row.setVersion(row.getVersion()+1);
        audit.successInBu(actor.id(),project.getBuId(),"分派条款确认人","requirement",id,
                String.valueOf(before)+" -> "+request.userId()+"："+request.reason().trim());
        return RequirementView.of(row);
    }

    private Requirement requirement(String id) {
        return requirements.findById(id).orElseThrow(()->new BusinessException(404,"条款不存在"));
    }
    boolean eligible(Project project,String id) {
        return qualified(project.getBuId(),id)
                &&(id.equals(project.getOwnerId())||members.find(project.getId(),id).map(ProjectMember::isEnabled).orElse(false));
    }

    String defaultAssigneeId(Project project) {
        String creatorId=project.getCreatedBy();
        String ownerId=project.getOwnerId();
        return creatorId!=null&&!creatorId.equals(ownerId)&&eligible(project,creatorId)?creatorId:ownerId;
    }

    boolean qualified(String buId,String id) {
        var target=users.findById(id);
        if(target.isEmpty()||!target.get().isActive()||target.get().isSystemAdmin()) {
            return false;
        }
        var profile=profiles.findByBuIdAndUserId(buId,id);
        if(profile!=null&&!profile.isEnabled()) {
            return false;
        }
        return roles.findByUserIdAndStatus(id,"ACTIVE").stream().filter(r->buId.equals(r.getBuId())).anyMatch(r->"SR".equals(r.getRole())
                ||Set.of("TECH","APPROVER").contains(r.getRole())&&profile!=null&&profile.isCanConfirm());
    }
}
