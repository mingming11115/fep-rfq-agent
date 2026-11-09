package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class KnowledgeIndexQueue {
    private final JdbcTemplate jdbc;

    public enum Library {
        STANDARD_REPLY("standard_reply_index_sync"), HISTORY_RFQ("history_rfq_index_sync");

        final String table;

        Library(String table) {
            this.table = table;
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
                (row, number) -> new Status(row.getTimestamp("synced_at") != null ? "synced"
                        : row.getString("last_error") == null ? "queued" : "retrying", row.getString("operation")),
                buId, id, version).stream().findFirst().orElse(new Status("not_queued", null));
    }

    public record Status(String state, String operation) {}
}
