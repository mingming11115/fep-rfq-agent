package com.naura.rfq.integration.standardreply;

import com.naura.rfq.mapper.KnowledgeIndexMapper;
import com.naura.rfq.mapper.KnowledgeIndexMapper.Key;
import com.naura.rfq.mapper.KnowledgeIndexMapper.Work;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Library;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class StandardReplyIndexWorker {
    private static final int POLL_DELAY_SECONDS = 5;

    @Autowired
    private KnowledgeIndexMapper indexRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private StandardReplyIndexProperties settings;
    @Autowired
    private StandardReplyIndexClient client;

    @Scheduled(fixedDelayString = "${rfq.standard-reply-index.poll-interval-ms:5000}")
    void sync() {
        if (!settings.enabled()) {
            return;
        }
        for (Library library : Library.values()) {
            sync(library, settings.datasets(library));
        }
    }

    private void sync(Library library, Map<String, String> datasets) {
        if (datasets.isEmpty()) {
            return;
        }
        for (Key key : dueEntries(library, datasets)) {
            String dataset = datasets.get(key.buId());
            if (dataset == null) {
                continue;
            }
            String token = UUID.randomUUID().toString();
            if (claim(library, key, token)) {
                Work work = read(library, key, token);
                if (work != null) {
                    finish(library, key, token, work, deliver(key, dataset, work));
                }
            }
        }
    }

    private List<Key> dueEntries(Library library, Map<String, String> datasets) {
        return indexRecords.listDue(library, datasets.keySet());
    }

    private boolean claim(Library library, Key key, String token) {
        // The lease exceeds two consecutive platform request deadlines, including dataset creation.
        return indexRecords.claim(library, key.buId(), key.replyId(), token) == 1;
    }

    private Work read(Library library, Key key, String token) {
        return indexRecords.findClaimed(library, key.buId(), key.replyId(), token);
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
            log.error("同步知识索引失败", e);
            return retry(work, e.getMessage(), e.resubmit() ? null : work.jobId());
        } catch (JsonProcessingException e) {
            log.error("解析知识索引数据失败 errorType={}", e.getClass().getSimpleName());
            return retry(work, "INVALID_PROJECTION", null);
        }
    }

    private JsonNode projection(Key key, Work work) throws JsonProcessingException {
        if (work.payload() == null) {
            return null;
        }
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
        int changed = indexRecords.finish(library, key.buId(), key.replyId(), token, work.updatedAt(),
                outcome.jobId(), outcome.attempts(), outcome.error(), outcome.complete(), outcome.delaySeconds());
        if (changed == 0) {
            // A new desired state arrived during the request. Release only this worker's lease.
            indexRecords.release(library, key.buId(), key.replyId(), token);
        }
    }

    private record Outcome(boolean complete, String jobId, int attempts, String error, int delaySeconds) {}
}
