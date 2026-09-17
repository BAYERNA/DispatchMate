# 빌드 컨텍스트가 리포지토리 루트다 — packages/design-system(3개 프론트엔드 공유 CSS)가
# npm workspace로 responder-app에 링크돼 있어서, responder-app 디렉터리만으로는 빌드할 수 없다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY responder-app ./responder-app
RUN npm ci
RUN npm run build --workspace=responder-app

FROM nginx:1.27-alpine
COPY --from=build /app/responder-app/dist /usr/share/nginx/html
COPY responder-app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
