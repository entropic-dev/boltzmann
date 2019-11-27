FROM mhart/alpine-node:12

WORKDIR /usr/src/app
COPY package*.json ./
RUN apk add --no-cache make gcc g++ python && npm ci --only=production && apk del make gcc g++ python
COPY . .
EXPOSE 5000
ARG GIT_COMMIT_IN=unspecified
ENV GIT_COMMIT=${GIT_COMMIT_IN}
CMD [ "node", "-r", "dotenv/config", "boltzmann.js" ]
