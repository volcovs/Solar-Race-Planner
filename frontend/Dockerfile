# Builds the web app and serves it as static files.
# Settings are baked in at build time: pass VITE_API_URL (and optionally VITE_REPO_URL) as build arguments.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL VITE_REPO_URL
ENV VITE_API_URL=$VITE_API_URL VITE_REPO_URL=$VITE_REPO_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
