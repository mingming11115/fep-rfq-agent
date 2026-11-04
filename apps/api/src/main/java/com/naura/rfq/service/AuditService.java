package com.naura.rfq.service;

import com.naura.rfq.common.id.Ids;
import com.naura.rfq.mapper.AuditEventMapper;
import com.naura.rfq.model.entity.AuditEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditEventMapper events;

    @Transactional
    public void success(String actorId, String action, String objectType, String objectId, String detail) {
        write(actorId, null, action, objectType, objectId, "成功", detail);
    }

    @Transactional
    public void successInBu(String actorId,String buId,String action,String objectType,String objectId,String detail) {
        write(actorId,buId,action,objectType,objectId,"成功",detail);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failure(String actorId, String action, String objectType, String objectId, String detail) {
        write(actorId, null, action, objectType, objectId, "失败", detail);
    }

    private void write(String actorId, String buId, String action, String objectType, String objectId,
            String result, String detail) {
        AuditEvent event = new AuditEvent();
        event.setId(Ids.next("EVT"));
        event.setActorId(actorId);
        event.setBuId(buId);
        event.setAction(action);
        event.setObjectType(objectType);
        event.setObjectId(objectId);
        event.setResult(result);
        event.setDetail(detail != null && detail.length() > 900 ? detail.substring(0, 900) : detail);
        events.insert(event);
    }
}
