FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /workspace
COPY docker-settings.xml /workspace/docker-settings.xml
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -s /workspace/docker-settings.xml package -DskipTests

# 运行时镜像：Python 官方镜像 + JRE17。Debian bookworm 标准源自带 openjdk-17，
# 避免原 eclipse-temurin(Ubuntu) 镜像 apt 源缺 python3-venv 的问题。
FROM python:3.12-slim AS runtime

WORKDIR /app
ENV LANG=C.UTF-8 \
    TZ=Asia/Shanghai \
    SERVER_PORT=48081 \
    SPRING_PROFILES_ACTIVE=prod \
    RFQ_MARKITDOWN_PYTHON=/usr/local/bin/python

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-markitdown.txt .
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r requirements-markitdown.txt

COPY --from=build --chown=10001:10001 /workspace/target/rfq-service.jar /app/app.jar
RUN mkdir -p /app/data && chown 10001:10001 /app/data
USER 10001:10001
EXPOSE 48081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
