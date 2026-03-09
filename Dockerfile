# Build stage
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install 'serve' package
RUN npm install -g serve

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Expose the port (Cloud Run defaults to 8080)
EXPOSE 8080

# Start command with environment variable expansion
CMD ["sh", "-c", "serve -s dist -p ${PORT:-8080}"]
