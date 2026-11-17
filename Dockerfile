FROM node:22-alpine AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY backend/pom.xml ./
RUN mvn -q dependency:go-offline
COPY backend/src ./src
COPY --from=ui /ui/dist ./src/main/resources/static
RUN mvn -q verify

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
RUN groupadd --system splitly && useradd --system --gid splitly splitly
COPY --from=build /build/target/splitly-0.1.0.jar app.jar
USER splitly
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
