FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "src/server.js"]
