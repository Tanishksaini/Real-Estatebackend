# ==========================================
# Stage 1: Build & Dependency Installation
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy the rest of the application source code
COPY . .

# ==========================================
# Stage 2: Production Runtime Environment
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source code from the builder stage
COPY --from=builder /usr/src/app/src ./src

# Create uploads directory (if needed for temporary file storage)
RUN mkdir -p uploads && chmod 777 uploads

# Expose the application port
EXPOSE 4000

# Use non-root user for security
USER node

# Start the application
CMD ["node", "src/server.js"]
