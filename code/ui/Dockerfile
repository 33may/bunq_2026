# ── build stage ───────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /ui

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build with empty VITE_API_BASE so all API calls go same-origin → nginx
# proxies them to the api container.
ENV VITE_API_BASE=""
RUN npm run build

# ── serve stage ───────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /ui/dist /usr/share/nginx/html

EXPOSE 80
