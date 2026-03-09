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

# Expose the port
EXPOSE 3000

# Start command
CMD ["serve", "-s", "dist", "-p", "3000"]
