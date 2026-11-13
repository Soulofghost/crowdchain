FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY contracts/ ./contracts/

ENV PORT=4023
EXPOSE 4023

CMD ["node", "backend/src/server.js"]
