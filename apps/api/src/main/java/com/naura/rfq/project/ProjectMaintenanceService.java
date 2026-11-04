package com.naura.rfq.project;

import com.naura.rfq.audit.AuditService;
import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.Project;
import com.naura.rfq.domain.ProjectStage;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.ProjectMemberMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProjectMaintenanceService {
    private final ProjectMapper projects;
    private final ProjectMemberMapper members;
    private final ProjectAccessService projectAccess;
    private final AccessGuard access;
    private final AuditService audit;

    public record PatchCommand(long version,String reason,String name,boolean hasCustomer,String customer,
            boolean hasDeadline,LocalDate deadline) {}

    @Transactional
    public Project patch(CurrentUser actor,String id,PatchCommand command) {
        Project project=editable(actor,id,command.version());
        access.requireActiveProject(project);
        if(command.name()==null && !command.hasCustomer() && !command.hasDeadline())throw new BusinessException(400,"请至少修改一个项目信息字段");
        if(command.name()!=null)project.setName(command.name());
        if(command.hasCustomer())project.setCustomer(command.customer());
        if(command.hasDeadline())project.setDeadline(command.deadline());
        persist(project);
        audit.successInBu(actor.id(),project.getBuId(),"修改项目信息","project",id,versionDetail(command.version(),project)+"；"+command.reason().trim());
        return project;
    }

    @Transactional
    public Project handover(CurrentUser actor,String id,long version,String ownerId,String reason) {
        Project project=editable(actor,id,version); access.requireActiveProject(project);
        if(project.getOwnerId().equals(ownerId))throw new BusinessException(409,"接收人已经是当前项目负责人");
        projectAccess.requireOwner(ownerId,project.getBuId());
        if(!members.find(id,ownerId).map(member->member.isEnabled()).orElse(false))throw new BusinessException(400,"接收人须先获得本项目访问授权");
        String previous=project.getOwnerId();
        // Legacy seeded owners may have implicit access without a member row.
        projectAccess.addOwner(project,actor.id());
        project.setOwnerId(ownerId); persist(project);
        audit.successInBu(actor.id(),project.getBuId(),"移交项目负责人","project",id,
                previous+" → "+ownerId+"；"+versionDetail(version,project)+"；"+reason.trim());
        return project;
    }

    @Transactional
    public Project archive(CurrentUser actor,String id,long version,String reason) {
        Project project=editable(actor,id,version);
        if(!ProjectStage.isActive(project.getStage()))throw new BusinessException(409,"当前项目阶段不允许归档");
        String previous=project.getStage();
        project.setArchivedFromStage(previous); project.setArchivedAt(Instant.now());
        project.setArchivedBy(actor.id()); project.setArchiveReason(reason.trim());
        project.setStage(ProjectStage.CANCELLED.name()); persist(project);
        audit.successInBu(actor.id(),project.getBuId(),"归档项目","project",id,
                previous+" → CANCELLED；"+versionDetail(version,project)+"；"+reason.trim());
        return project;
    }

    @Transactional
    public Project restore(CurrentUser actor,String id,long version,String reason) {
        Project project=editable(actor,id,version);
        if(!project.isArchived())throw new BusinessException(409,"项目尚未归档，不能恢复");
        String previous=project.getArchivedFromStage();
        if(!ProjectStage.isActive(previous))throw new BusinessException(409,"缺少可靠的归档前阶段，请联系管理员核对历史记录");
        project.setStage(previous); project.setArchivedFromStage(null); project.setArchivedAt(null);
        project.setArchivedBy(null); project.setArchiveReason(null); persist(project);
        audit.successInBu(actor.id(),project.getBuId(),"恢复项目","project",id,
                "CANCELLED → "+previous+"；"+versionDetail(version,project)+"；"+reason.trim());
        return project;
    }

    private Project editable(CurrentUser actor,String id,long version) {
        Project project=projects.findByIdForUpdate(id).orElseThrow(()->new BusinessException(404,"项目不存在"));
        access.requireProjectManager(actor,project);
        if(project.getVersion()!=version)throw new BusinessException(409,"项目已被他人修改，请刷新后重试");
        return project;
    }
    private void persist(Project project) {
        project.setUpdatedAt(Instant.now());
        if(projects.updateWithVersion(project)!=1)throw new BusinessException(409,"项目已被他人修改，请刷新后重试");
        project.setVersion(project.getVersion()+1);
    }
    private static String versionDetail(long old,Project project) { return "版本 "+old+" → "+project.getVersion(); }
    public static LocalDate parseDeadline(String value) {
        if(value==null)return null;
        if(value.length()!=10 || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new BusinessException(400,"截止日期须为 yyyy-MM-dd");
        try {
            LocalDate parsed=LocalDate.parse(value);
            if(parsed.getYear()<1000)throw new BusinessException(400,"截止日期年份须为 1000–9999");
            return parsed;
        } catch(DateTimeParseException exception) { throw new BusinessException(400,"截止日期无效"); }
    }
}
