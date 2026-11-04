package com.naura.rfq;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** Guard the layer boundaries without requiring a database or a Spring context. */
class ArchitectureTest {
    private static final Path ROOT = Path.of("src/main/java/com/naura/rfq");

    private List<Path> sources() throws Exception {
        try (var paths = Files.walk(ROOT)) {
            return paths.filter(path -> path.toString().endsWith(".java")).toList();
        }
    }

    @Test
    void controllersAndServicesUseLayerPackages() throws Exception {
        for (Path path : sources()) {
            String source = Files.readString(path);
            if (source.contains("@RestController\n")) {
                assertThat(source).as(path.toString()).startsWith("package com.naura.rfq.controller;");
            }
            if (source.contains("@Service\n")) {
                assertThat(source).as(path.toString()).startsWith("package com.naura.rfq.service;");
            }
        }
    }

    @Test
    void controllersDoNotAccessMappersOrOwnTransactions() throws Exception {
        for (Path path : sources()) {
            String source = Files.readString(path);
            if (!source.contains("@RestController\n")) continue;
            assertThat(source).as(path.toString())
                    .doesNotContain("com.naura.rfq.mapper.", "@Transactional", ".transaction.annotation.Transactional");
        }
    }

    @Test
    void servicesAndModelsDoNotDependOnControllers() throws Exception {
        for (Path path : sources()) {
            Path relative = ROOT.relativize(path);
            if (!relative.startsWith("service") && !relative.startsWith("model")) continue;
            assertThat(Files.readString(path)).as(path.toString()).doesNotContain("com.naura.rfq.controller.");
        }
    }
}
