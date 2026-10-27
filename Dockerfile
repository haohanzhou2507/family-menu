FROM node:22-alpine

WORKDIR /app
COPY index.html styles.css app.js server.js tutorial.js ./

ENV PORT=3000
ENV DATA_FILE=/app/data/state.json
EXPOSE 3000

CMD ["node", "server.js"]
