FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /workspace
COPY docker-settings.xml /workspace/docker-settings.xml
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -s /workspace/docker-settings.xml package -DskipTests

# 只作为 JRE 来源，不参与运行（避免在 Debian 上 apt 装 openjdk 的源问题）
FROM eclipse-temurin:17-jre AS jre

# 运行时镜像：Python 官方镜像 + 直接拷贝 Temurin 的 JRE 目录
FROM python:3.12-slim AS runtime

WORKDIR /app
ENV LANG=C.UTF-8 \
    TZ=Asia/Shanghai \
    SERVER_PORT=48081 \
    SPRING_PROFILES_ACTIVE=prod \
    RFQ_MARKITDOWN_PYTHON=/usr/local/bin/python \
    JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH

COPY --from=jre /opt/java/openjdk /opt/java/openjdk

# 仅装少量基础包（时区 + onnxruntime 依赖的 libgomp1），各发行版 main 源内均有
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-markitdown.txt .
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r requirements-markitdown.txt

COPY --from=build --chown=10001:10001 /workspace/target/rfq-service.jar /app/app.jar
RUN mkdir -p /app/data && chown 10001:10001 /app/data
USER 10001:10001
EXPOSE 48081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
