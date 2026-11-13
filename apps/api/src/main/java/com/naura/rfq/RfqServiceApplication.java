package com.naura.rfq;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RfqServiceApplication {
    private static final Path API_DIRECTORY = Path.of("apps", "api");
    private static final String API_MODULE_MARKER = "pom.xml";
    private static final String DATA_DIRECTORY = "data";

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(RfqServiceApplication.class);
        application.setDefaultProperties(Map.of("rfq.data-dir", dataDirectory().toString()));
        application.run(args);
    }

    /** 项目根启动和 apps/api 启动都落到同一个 data 目录，避免出现两套原件存储路径。 */
    static Path dataDirectory() {
        Path data = Files.isRegularFile(API_DIRECTORY.resolve(API_MODULE_MARKER))
                ? API_DIRECTORY.resolve(DATA_DIRECTORY)
                : Path.of(DATA_DIRECTORY);
        return data.toAbsolutePath().normalize();
    }
}
