FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN apk upgrade --no-cache \
	&& npm ci --omit=dev \
	&& npm cache clean --force \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

RUN addgroup -S app && adduser -S app -G app

COPY app.js ./

EXPOSE 3000

USER app

CMD ["node", "app.js"]
