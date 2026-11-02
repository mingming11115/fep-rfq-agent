package com.naura.rfq;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RfqServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(RfqServiceApplication.class, args);
    }
}
