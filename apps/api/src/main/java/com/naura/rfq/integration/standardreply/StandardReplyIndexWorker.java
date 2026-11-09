package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Library;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@RequiredArgsConstructor
public class StandardReplyIndexWorker {
    private static final int POLL_DELAY_SECONDS = 5;
    private static final String DUE = """
        synced_at is null and next_attempt_at <= utc_timestamp(6)
        and (lease_until is null or lease_until <= utc_timestamp(6))
        """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final StandardReplyIndexProperties settings;
    private final StandardReplyIndexClient client;

    @Scheduled(fixedDelayString = "${rfq.standard-reply-index.poll-interval-ms:5000}")
    void sync() {
        if (!settings.enabled()) return;
        sync(Library.STANDARD_REPLY, settings.datasets());
        sync(Library.HISTORY_RFQ, settings.historyDatasets());
    }

    private void sync(Library library, Map<String, String> datasets) {
        if (datasets.isEmpty()) return;
        for (Key key : dueEntries(library, datasets)) {
            String dataset = datasets.get(key.buId());
            if (dataset == null) continue;
            String token = UUID.randomUUID().toString();
            if (claim(library, key, token)) {
                Work work = read(library, key, token);
                if (work != null) finish(library, key, token, work, deliver(key, dataset, work));
            }
        }
    }

    private List<Key> dueEntries(Library library, Map<String, String> datasets) {
        String placeholders = String.join(",", Collections.nCopies(datasets.size(), "?"));
        return jdbc.query("select bu_id,reply_id from " + library.table + " where bu_id in (" + placeholders
                + ") and " + DUE + " order by next_attempt_at,bu_id,reply_id limit 16",
            (row, number) -> new Key(row.getString("bu_id"), row.getString("reply_id")), datasets.keySet().toArray());
    }

    private boolean claim(Library library, Key key, String token) {
        // The lease exceeds two consecutive platform request deadlines, including dataset creation.
        return jdbc.update("""
            update %s
            set lease_token=?,lease_until=timestampadd(second,45,utc_timestamp(6))
            where bu_id=? and reply_id=? and
            """.formatted(library.table) + DUE, token, key.buId(), key.replyId()) == 1;
    }

    private Work read(Library library, Key key, String token) {
        return jdbc.query("""
            select version,operation,payload,updated_at,attempts,job_id from %s
            where bu_id=? and reply_id=? and lease_token=?
            """.formatted(library.table), (row, number) -> new Work(row.getInt("version"), row.getString("operation"),
                row.getString("payload"), row.getObject("updated_at", LocalDateTime.class),
                row.getInt("attempts"), row.getString("job_id")), key.buId(), key.replyId(), token)
            .stream().findFirst().orElse(null);
    }

    private Outcome deliver(Key key, String dataset, Work work) {
        try {
            var result = work.jobId() == null
                ? client.submit(dataset, key.replyId(), work.operation(), projection(key, work), work.updatedAt().toInstant(ZoneOffset.UTC))
                : client.poll(work.jobId(), key.replyId());
            return result.complete()
                ? new Outcome(true, result.jobId(), 0, null, 0)
                : new Outcome(false, result.jobId(), work.attempts(), null, POLL_DELAY_SECONDS);
        } catch (StandardReplyIndexClient.Failure e) {
            return retry(work, e.getMessage(), e.resubmit() ? null : work.jobId());
        } catch (JsonProcessingException e) {
            return retry(work, "INVALID_PROJECTION", null);
        }
    }

    private JsonNode projection(Key key, Work work) throws JsonProcessingException {
        if (work.payload() == null) return null;
        JsonNode data = json.readTree(work.payload());
        if (data == null || !key.buId().equals(data.path("bu_id").asText())
                || data.path("record_version").asInt(-1) != work.version()) {
            throw new StandardReplyIndexClient.Failure("INVALID_PROJECTION", false);
        }
        return data;
    }

    private Outcome retry(Work work, String code, String jobId) {
        int attempts = Math.min(work.attempts(), 999) + 1;
        int seconds = Math.min(300, POLL_DELAY_SECONDS << Math.min(attempts - 1, 6));
        return new Outcome(false, jobId, attempts, code, seconds);
    }

    private void finish(Library library, Key key, String token, Work work, Outcome outcome) {
        int changed = jdbc.update("""
            update %s
            set job_id=?,attempts=?,last_error=?,synced_at=case when ? then utc_timestamp(6) else null end,
                next_attempt_at=timestampadd(second,?,utc_timestamp(6)),lease_token=null,lease_until=null
            where bu_id=? and reply_id=? and lease_token=? and updated_at=?
            """.formatted(library.table), outcome.jobId(), outcome.attempts(), outcome.error(), outcome.complete(), outcome.delaySeconds(),
            key.buId(), key.replyId(), token, work.updatedAt());
        if (changed == 0) {
            // A new desired state arrived during the request. Release only this worker's lease.
            jdbc.update("""
                update %s set lease_token=null,lease_until=null
                where bu_id=? and reply_id=? and lease_token=?
                """.formatted(library.table), key.buId(), key.replyId(), token);
        }
    }

    private record Key(String buId, String replyId) {}
    private record Work(int version, String operation, String payload, LocalDateTime updatedAt, int attempts, String jobId) {}
    private record Outcome(boolean complete, String jobId, int attempts, String error, int delaySeconds) {}
}
