FROM node:18-bullseye-slim

# Install dependencies required for video processing and Python package management
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    libvips \
    chromium \
    chromium-sandbox \
    libgbm1 \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install Python dependencies
RUN pip3 install runpod

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p ./out ./dist

# Create a simple HTML file for Remotion
RUN echo '<!DOCTYPE html><html><head><title>Remotion Bundle</title></head><body><div id="root"></div></body></html>' > dist/index.html

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
    REMOTION_CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Expose port - Removed (Not needed for RunPod serverless)
# EXPOSE 8000

# Set the entry point
CMD ["python3", "handler.py"] 