FROM node:latest

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production

WORKDIR /ai/thailaw

# Runtime code is bind-mounted from the host (see compose.yml).
# node:latest already provides Node.js and npm.

ENTRYPOINT ["/ai/thailaw/start.sh"]
