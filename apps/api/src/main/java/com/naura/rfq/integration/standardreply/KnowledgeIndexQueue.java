package com.naura.rfq.integration.standardreply;

import com.naura.rfq.mapper.KnowledgeIndexMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeIndexQueue {
    @Autowired
    private KnowledgeIndexMapper indexRecords;

    public enum Library {
        STANDARD_REPLY("RFQ 标准回复"),
        HISTORY_RFQ("历史 RFQ"),
        CAPABILITY("机型能力边界");

        final String displayName;

        Library(String displayName) {
            this.displayName = displayName;
        }
    }

    public void enqueue(Library library, String buId, String id, int version, JsonNode projection) {
        String operation = projection == null ? "delete" : "upsert";
        // Preserve an active lease while advancing the desired timestamp.
        indexRecords.enqueue(library, buId, id, version, operation, projection == null ? null : projection.toString());
    }

    public Status status(Library library, String buId, String id, int version) {
        return indexRecords.findStatus(library, buId, id, version)
                .map(row -> Status.from(row.operation(), row.synced(), row.hasError()))
                .orElse(Status.NOT_QUEUED);
    }

    public record Status(String state, String operation) {
        private static final Status NOT_QUEUED = new Status("not_queued", null);

        public static Status from(String operation, boolean synced, boolean hasError) {
            if (operation == null) {
                return NOT_QUEUED;
            }
            return new Status(synced ? "synced" : hasError ? "retrying" : "queued", operation);
        }

        public ObjectNode annotate(ObjectNode payload) {
            payload.put("indexStatus", state);
            if (operation == null) {
                payload.remove("indexOperation");
            } else {
                payload.put("indexOperation", operation);
            }
            return payload;
        }
    }
}
