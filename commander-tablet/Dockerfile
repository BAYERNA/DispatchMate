# 빌드 컨텍스트가 리포지토리 루트다 — packages/design-system(3개 프론트엔드 공유 CSS)가
# npm workspace로 commander-tablet에 링크돼 있어서, commander-tablet 디렉터리만으로는 빌드할 수 없다.
FROM node:22-alpine AS build
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY commander-tablet ./commander-tablet
RUN npm ci
RUN npm run build --workspace=commander-tablet

FROM nginx:1.27-alpine
COPY --from=build /app/commander-tablet/dist /usr/share/nginx/html
COPY commander-tablet/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
