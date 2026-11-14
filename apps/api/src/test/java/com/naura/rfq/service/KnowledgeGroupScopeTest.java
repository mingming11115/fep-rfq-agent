package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证知识分组范围：项目绑定分组自身及其全部上级（含根分组）参与比对，
 * 未关联分组的资料视同根分组，对所有项目生效。
 */
class KnowledgeGroupScopeTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void ancestorsCoverGroupAndEveryParentUntilRoot() throws Exception {
        assertThat(KnowledgeGroupService.ancestors(catalog(), "LEAF")).containsExactly("LEAF", "MID", "ROOT");
        assertThat(KnowledgeGroupService.ancestors(catalog(), "ROOT")).containsExactly("ROOT");
        assertThat(KnowledgeGroupService.ancestors(catalog(), "MISSING")).isEmpty();
        assertThat(KnowledgeGroupService.ancestors(catalog(), " ")).isEmpty();
    }

    @Test
    void ungroupedRecordAppliesToEveryGroup() {
        assertThat(KnowledgeGroupService.withinScope(JSON.createObjectNode(), List.of("ROOT"))).isTrue();
        assertThat(KnowledgeGroupService.withinScope(JSON.createObjectNode().putArray("groupIds"), List.of("ROOT"))).isTrue();
    }

    @Test
    void recordMatchesOwnGroupOrAnyAncestor() {
        var scope = List.of("LEAF", "MID", "ROOT");
        assertThat(KnowledgeGroupService.withinScope(group("LEAF"), scope)).isTrue();
        assertThat(KnowledgeGroupService.withinScope(group("MID"), scope)).isTrue();
        assertThat(KnowledgeGroupService.withinScope(JSON.createObjectNode().put("groupId", "ROOT"), scope)).isTrue();
        assertThat(KnowledgeGroupService.withinScope(group("OTHER"), scope)).isFalse();
        assertThat(KnowledgeGroupService.withinScope(group("LEAF"), List.of())).isTrue();
    }

    private static ObjectNode group(String... ids) {
        var payload = JSON.createObjectNode();
        var groups = payload.putArray("groupIds");
        for (String id : ids) {
            groups.add(id);
        }
        return payload;
    }

    private static ObjectNode catalog() throws Exception {
        return (ObjectNode) JSON.readTree("""
                {"nodes":[
                    {"id":"ROOT","levelId":"l1","name":"根分组"},
                    {"id":"MID","levelId":"l2","parentId":"ROOT","name":"中间分组"},
                    {"id":"LEAF","levelId":"l3","parentId":"MID","name":"末级分组"}
                ]}
                """);
    }
}
