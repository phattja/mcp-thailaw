FROM node:latest

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    THAILAW_HTTP_PORT=8005 \
    THAILAW_HTTP_HOST=0.0.0.0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

EXPOSE 8005

USER node

CMD ["node", "dist/cli.js"]
