package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class KnowledgeIndexQueue {
    private final JdbcTemplate jdbc;

    public enum Library {
        STANDARD_REPLY("standard_reply_index_sync", "RFQ 标准回复"),
        HISTORY_RFQ("history_rfq_index_sync", "历史 RFQ"),
        CAPABILITY("capability_index_sync", "机型能力边界");

        final String table;
        final String displayName;

        Library(String table, String displayName) {
            this.table = table;
            this.displayName = displayName;
        }
    }

    public void enqueue(Library library, String buId, String id, int version, JsonNode projection) {
        String operation = projection == null ? "delete" : "upsert";
        // Preserve an active lease while advancing the desired timestamp.
        jdbc.update("""
                insert into %1$s(bu_id,reply_id,version,operation,payload,updated_at,next_attempt_at)
                values (?,?,?,?,?,utc_timestamp(6),utc_timestamp(6)) as desired
                on duplicate key update version=desired.version, operation=desired.operation, payload=desired.payload,
                  updated_at=greatest(utc_timestamp(6), timestampadd(microsecond,1,%1$s.updated_at)),
                  next_attempt_at=utc_timestamp(6), attempts=0, job_id=null, last_error=null, synced_at=null
                """.formatted(library.table), buId, id, version, operation, projection == null ? null : projection.toString());
    }

    public Status status(Library library, String buId, String id, int version) {
        return jdbc.query("select operation, synced_at, last_error from " + library.table
                        + " where bu_id=? and reply_id=? and version=?",
                (row, number) -> Status.from(row.getString("operation"), row.getTimestamp("synced_at") != null,
                        row.getString("last_error") != null),
                buId, id, version).stream().findFirst().orElse(Status.NOT_QUEUED);
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
