package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RequirementMatchWorker {
    private final RequirementMatchService runs;
    private final MatchEvaluator evaluator;
    private final ObjectMapper json;

    @Value("${rfq.match.worker-enabled:false}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "${rfq.match.poll-interval-ms:3000}")
    void tick() {
        if (enabled) runOnce();
    }

    public void runOnce() {
        for (String id : runs.due()) {
            try {
                var job = runs.claim(id, UUID.randomUUID().toString());
                if (job == null) continue;
                MatchEvaluator.Evaluation outcome;
                try {
                    outcome = runs.active(job) ? evaluator.evaluate(job.input()) : failure("MATCH_INPUT_CHANGED");
                } catch (RuntimeException failure) {
                    log.warn("条款比对失败 run={} type={}", id, failure.getClass().getSimpleName());
                    outcome = failure("MATCH_WORKER_ERROR");
                }
                runs.finish(job, outcome);
            } catch (RuntimeException failure) {
                // A database interruption leaves the lease recoverable by the next worker.
                log.warn("比对任务未能交付 run={} type={}", id, failure.getClass().getSimpleName());
            }
        }
    }

    private MatchEvaluator.Evaluation failure(String reason) {
        var result = json.createObjectNode().put("reason", reason);
        return new MatchEvaluator.Evaluation("retry_wait", result, json.createObjectNode(), 5);
    }
}
