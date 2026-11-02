package com.naura.rfq.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Security-related beans kept apart from Web MVC configuration: the encoder is
 * needed by the auth layer, which the web config itself depends on. Keeping it
 * in its own configuration class avoids a bean creation cycle.
 */
@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
