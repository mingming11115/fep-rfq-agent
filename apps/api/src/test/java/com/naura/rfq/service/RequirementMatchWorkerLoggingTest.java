package com.naura.rfq.service;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RequirementMatchWorkerLoggingTest {
    @Test
    void logsClaimFailureWithPhaseAndRunIdWithoutExceptionMessage() {
        var runs = mock(RequirementMatchService.class);
        var worker = new RequirementMatchWorker();
        ReflectionTestUtils.setField(worker, "runs", runs);
        when(runs.due()).thenReturn(List.of("MATCH-1"));
        when(runs.claim(org.mockito.ArgumentMatchers.eq("MATCH-1"), org.mockito.ArgumentMatchers.anyString()))
                .thenThrow(new IllegalStateException("private-provider-detail"));
        var logger = (Logger) LoggerFactory.getLogger(RequirementMatchWorker.class);
        var events = new ListAppender<ILoggingEvent>();
        events.start();
        logger.addAppender(events);
        try {
            worker.runOnce();
            assertThat(events.list).singleElement().satisfies(event -> {
                assertThat(event.getFormattedMessage())
                        .contains("runId=MATCH-1", "phase=claim", "errorType=IllegalStateException")
                        .doesNotContain("private-provider-detail");
                assertThat(event.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(events);
            events.stop();
        }
    }
}
