FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp verify

FROM eclipse-temurin:17-jre

WORKDIR /app
ENV SERVER_PORT=48081 \
    SPRING_PROFILES_ACTIVE=prod
COPY --from=build --chown=10001:10001 /workspace/target/rfq-service.jar /app/app.jar
USER 10001:10001
EXPOSE 48081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
