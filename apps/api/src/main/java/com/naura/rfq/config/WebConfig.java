package com.naura.rfq.config;

import com.naura.rfq.security.AuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Only the new business API is protected; the existing craft/office endpoints keep
        // their current contract so the document editor integration does not break.
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/rfq/**")
                .excludePathPatterns("/api/rfq/auth/login");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 只管业务接口。office/craft 端点自带 @CrossOrigin(origins = "*")，两处叠加会被
        // Spring 合并成 "*" 加 allowCredentials=true，直接抛 IllegalArgumentException。
        registry.addMapping("/api/rfq/**")
                .allowedOriginPatterns("http://127.0.0.1:*", "http://localhost:*")
                .allowedMethods("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
