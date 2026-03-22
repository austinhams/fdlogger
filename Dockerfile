FROM node:22-alpine

RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
EXPOSE 2237/udp

CMD ["node", "server.js"]
