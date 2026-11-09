# Pengele Engele als Container. Keine npm-Abhängigkeiten – nur Node selbst.
# Die App-Dateien gehören root, die App läuft als unprivilegierter Benutzer "node"
# und speichert nur in /data (Volume).
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    TZ=Europe/Vienna

WORKDIR /app
COPY . .
RUN chmod -R a+rX /app && mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
CMD ["node", "server.js"]
