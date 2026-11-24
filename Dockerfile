FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV VITE_USE_MOCK=false
ENV VITE_API_BASE_URL=/api/v1
ENV VITE_LLM_API_BASE_URL=/llm-api/v1
ENV VITE_GOVERNANCE_BACKEND=llm
ENV VITE_LLM_ACCESS_TOKEN=""

RUN npm run build

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf

EXPOSE 80