package com.naura.rfq.service;

import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.AuditEventMapper;
import com.naura.rfq.model.entity.AuditEvent;
import com.naura.rfq.model.query.AuditQuery;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuditQueryService {
    private final AuditEventMapper events;
    private final AccessGuard access;

    @Transactional(readOnly=true)
    public PageView<AuditEvent> list(CurrentUser user, int page,
            int size,String sort,
            String buId,String actorId,
            String action,String objectType,
            String objectId,String result,
            Instant createdFrom, Instant createdTo) {
        var scope=access.managedBuScope(user,filter(buId,64));
        var query=PageQuery.of(page,size,sort,List.of("createdAt"),"createdAt,desc");
        result=filter(result,16);
        if(result!=null && !Set.of("成功","失败").contains(result))throw new BusinessException(400,"结果只能是成功或失败");
        if(createdFrom!=null && createdTo!=null && createdFrom.isAfter(createdTo))throw new BusinessException(400,"开始时间不能晚于结束时间");
        var filters=new AuditQuery(scope,filter(actorId,64),filter(action,64),filter(objectType,32),filter(objectId,64),result,createdFrom,createdTo);
        return PageView.of(events.findPage(filters,query),events.countPage(filters),query.getPage(),query.getSize());
    }
    private static String filter(String value,int max) {
        if(value==null || value.isBlank())return null;
        if(value.length()>max)throw new BusinessException(400,"过滤参数长度超过上限 "+max);
        return value.trim();
    }
}
