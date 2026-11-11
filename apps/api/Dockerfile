FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp verify

FROM eclipse-temurin:17-jre

WORKDIR /app
COPY requirements-markitdown.txt .
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv \
    && python3 -m venv /opt/markitdown \
    && /opt/markitdown/bin/pip install --no-cache-dir -r requirements-markitdown.txt \
    && rm -rf /var/lib/apt/lists/*
ENV SERVER_PORT=48081 \
    SPRING_PROFILES_ACTIVE=prod \
    RFQ_MARKITDOWN_PYTHON=/opt/markitdown/bin/python
COPY --from=build --chown=10001:10001 /workspace/target/rfq-service.jar /app/app.jar
RUN mkdir -p /app/data && chown 10001:10001 /app/data
USER 10001:10001
EXPOSE 48081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
