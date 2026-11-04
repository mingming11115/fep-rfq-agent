package com.naura.rfq.audit;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.AuditEvent;
import com.naura.rfq.mapper.AuditEventMapper;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/audit")
@RequiredArgsConstructor
public class AuditController {
    private final AuditEventMapper events;
    private final AccessGuard access;

    @GetMapping
    @Transactional(readOnly=true)
    public ApiResponse<PageView<AuditEvent>> list(@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) String sort,
            @RequestParam(required=false) String buId,@RequestParam(required=false) String actorId,
            @RequestParam(required=false) String action,@RequestParam(required=false) String objectType,
            @RequestParam(required=false) String objectId,@RequestParam(required=false) String result,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant createdFrom,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant createdTo) {
        var scope=access.managedBuScope(CurrentUserHolder.require(),filter(buId,64));
        var query=PageQuery.of(page,size,sort,List.of("createdAt"),"createdAt,desc");
        result=filter(result,16);
        if(result!=null && !Set.of("成功","失败").contains(result))throw new BusinessException(400,"结果只能是成功或失败");
        if(createdFrom!=null && createdTo!=null && createdFrom.isAfter(createdTo))throw new BusinessException(400,"开始时间不能晚于结束时间");
        var filters=new AuditQuery(scope,filter(actorId,64),filter(action,64),filter(objectType,32),filter(objectId,64),result,createdFrom,createdTo);
        return ApiResponse.success(PageView.of(events.findPage(filters,query),events.countPage(filters),query.getPage(),query.getSize()));
    }
    private static String filter(String value,int max) {
        if(value==null || value.isBlank())return null;
        if(value.length()>max)throw new BusinessException(400,"过滤参数长度超过上限 "+max);
        return value.trim();
    }
}
