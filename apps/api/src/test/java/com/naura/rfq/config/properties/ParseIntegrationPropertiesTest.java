package com.naura.rfq.config.properties;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.parse.ParseHttpClient;
import com.naura.rfq.integration.parse.RuleBasedExtractor;
import com.naura.rfq.integration.parse.WordMarkdownExtractor;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

class ParseIntegrationPropertiesTest {
    @Test void absentOrBlankSharedSwitchDefaultsToDisabled() {
        assertSwitches(Map.of(), false, false);
        assertSwitches(Map.of("RFQ_LLM_ENABLED", ""), false, false);
    }

    @Test void onlyTheShortEnvironmentVariableControlsTheSharedSwitch() {
        assertSwitches(Map.of("RFQ_LLM_ENABLED", "false", "RFQ_PARSE_INTEGRATIONS_LLM_ENABLED", "true"), false, false);
        assertSwitches(Map.of("RFQ_LLM_ENABLED", "true", "RFQ_PARSE_INTEGRATIONS_LLM_ENABLED", "false"), true, true);
    }

    @Test void historyCanOverrideTheSharedSwitch() {
        assertSwitches(Map.of("RFQ_LLM_ENABLED", "false", "RFQ_HISTORY_LLM_ENABLED", "true"), false, true);
        assertSwitches(Map.of("RFQ_LLM_ENABLED", "true", "RFQ_HISTORY_LLM_ENABLED", "false"), true, false);
        assertSwitches(Map.of("RFQ_LLM_ENABLED", "true", "RFQ_HISTORY_LLM_ENABLED", ""), true, true);
    }

    private void assertSwitches(Map<String, Object> variables, boolean sharedEnabled, boolean historyEnabled) {
        new ApplicationContextRunner()
                .withInitializer(context -> {
                    String source = StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME;
                    context.getEnvironment().getPropertySources().replace(source,
                            new SystemEnvironmentPropertySource(source, variables));
                    new ConfigDataApplicationContextInitializer().initialize(context);
                })
                .withUserConfiguration(SettingsConfiguration.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getEnvironment().getProperty("rfq.llm.enabled"))
                            .isEqualTo(variables.getOrDefault("RFQ_LLM_ENABLED", "false"));
                    var settings = context.getBean(ParseIntegrationProperties.class);
                    var json = new ObjectMapper();
                    var word = new WordMarkdownExtractor(settings, new ParseHttpClient(json), new RuleBasedExtractor(json));
                    assertThat(word.enabled()).isEqualTo(sharedEnabled);
                    assertThat(settings.historyLlmEnabled()).isEqualTo(historyEnabled);
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ParseIntegrationProperties.class)
    static class SettingsConfiguration {
    }
}
