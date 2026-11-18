package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.log.StageLog;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.event.Level;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RequirementMatchWorker {
    @Autowired
    private RequirementMatchService runs;
    @Autowired
    private MatchEvaluator evaluator;
    @Autowired
    private ObjectMapper json;

    @Value("${rfq.match.worker-enabled:false}")
    private boolean enabled;
    private String reviewCursor = "";

    @Scheduled(fixedDelayString = "${rfq.match.poll-interval-ms:3000}")
    void tick() {
        if (enabled) {
            runOnce();
        }
    }

    @Scheduled(fixedDelayString = "${rfq.match.reference-check-interval-ms:30000}")
    void recheckReferences() {
        if (!enabled) {
            return;
        }
        var batch = runs.adoptedAfter(reviewCursor);
        for (String id : batch) {
            try { runs.recheckAdoption(id); }
            catch (RuntimeException failure) {
                log.error("requirement.match.reference_check_failed requirementId={} errorType={}",
                        id, failure.getClass().getSimpleName());
            }
        }
        reviewCursor = batch.size() < 25 ? "" : batch.get(batch.size() - 1);
    }

    public void runOnce() {
        var due = runs.due();
        if (!due.isEmpty()) {
            StageLog.begin(log, "比对工作轮询 待比对条款=" + due.size());
            log.info("requirement.match.worker.tick 本轮开始处理待比对条款 条数={}", due.size());
        }
        int processed = 0;
        for (String id : due) {
            long started = System.nanoTime();
            String phase = "claim";
            try {
                var job = runs.claim(id, UUID.randomUUID().toString());
                if (job == null) {
                    continue;
                }
                MatchEvaluator.Evaluation outcome;
                try {
                    outcome = runs.active(job) ? evaluator.evaluate(job.input()) : failure("MATCH_INPUT_CHANGED");
                } catch (RuntimeException failure) {
                    log.error("requirement.match.evaluate_failed runId={} requirementId={} attempt={} errorType={}",
                            id, job.requirement(), job.attempts(), failure.getClass().getSimpleName());
                    outcome = failure("MATCH_WORKER_ERROR");
                }
                phase = "persist";
                var finished = runs.finish(job, outcome);
                if (finished != null) {
                    logResult(job, finished, started);
                    processed++;
                }
            } catch (RuntimeException failure) {
                // A database interruption leaves the lease recoverable by the next worker.
                log.error("requirement.match.delivery_failed runId={} phase={} errorType={} durationMs={}", id,
                        phase, failure.getClass().getSimpleName(), TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            }
        }
        if (!due.isEmpty()) {
            log.info("requirement.match.worker.tick.done 本轮待比对条款处理结束 待处理={} 已完成={}", due.size(), processed);
            StageLog.end(log, "比对工作轮询 待处理=" + due.size() + " 已完成=" + processed);
        }
    }

    private void logResult(RequirementMatchService.Run job, RequirementMatchService.Finished finished, long started) {
        var progress = finished.progress();
        var stages = progress.path("stages");
        String stage = "-";
        for (String name : job.input().order()) {
            String status = stages.path(name).path("status").asText();
            if ("failed".equals(status) || "blocked".equals(status)) {
                stage = name;
            }
        }
        var stageProgress = stages.path(stage);
        String reason = progress.path("reason").asText(stageProgress.path("reason").asText("-"));
        // Deployment runs at INFO, so DEBUG lines would never reach the log file: keep every outcome visible.
        Level level = switch (finished.status()) {
            case "failed" -> Level.ERROR;
            case "retry_wait" -> Level.WARN;
            case "blocked" -> job.attempts() == 1 ? Level.WARN : Level.INFO;
            default -> Level.INFO;
        };
        log.atLevel(level).log("requirement.match.result 条款比对完成 runId={} requirementId={} documentId={} parseRunId={} projectId={}"
                        + " status={} stage={} reason={} attempt={} failureCount={} retryInSeconds={} durationMs={}"
                        + " platformRequestId={} indexVersion={}",
                job.id(), job.requirement(), job.document(), job.parseRun(), job.input().project(), finished.status(), stage,
                reason, job.attempts(), progress.path("failureCount").asInt(0), finished.retrySeconds(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started),
                stageProgress.path("platformRequestId").asText("-"), stageProgress.path("indexVersion").asText("-"));
    }

    private MatchEvaluator.Evaluation failure(String reason) {
        var result = json.createObjectNode().put("reason", reason);
        return new MatchEvaluator.Evaluation("retry_wait", result, json.createObjectNode(), 5);
    }
}
