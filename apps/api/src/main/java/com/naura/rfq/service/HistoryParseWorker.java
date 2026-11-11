package com.naura.rfq.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HistoryParseWorker {
    private final HistoryRfqService history;
    private volatile HistoryRfqService.ParseJob active;

    @Value("${rfq.history-parse.worker-enabled:true}")
    private boolean enabled;

    @Bean(defaultCandidate = false)
    static ThreadPoolTaskScheduler historyParseScheduler() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setThreadNamePrefix("history-parse-");
        scheduler.setPoolSize(2);
        return scheduler;
    }

    @Scheduled(fixedDelay = 1000, scheduler = "historyParseScheduler")
    void tick() {
        if (enabled) {
            runOnce();
        }
    }

    @Scheduled(fixedDelay = 60_000, scheduler = "historyParseScheduler")
    void renew() {
        var job = active;
        if (job != null) {
            history.renewParse(job);
        }
    }

    public synchronized void runOnce() {
        var job = history.claimParse();
        if (job == null) {
            return;
        }
        active = job;
        try {
            history.parse(job);
        } finally {
            active = null;
        }
    }
}
