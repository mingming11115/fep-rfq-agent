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

    public static void main(String[] args) {
        Path apiDirectory = Path.of("apps", "api");
        Path dataDirectory = Files.isRegularFile(apiDirectory.resolve("pom.xml"))
                ? apiDirectory.resolve("data")
                : Path.of("data");
        SpringApplication application = new SpringApplication(RfqServiceApplication.class);
        application.setDefaultProperties(Map.of("rfq.data-dir", dataDirectory.toAbsolutePath().normalize().toString()));
        application.run(args);
    }
}
