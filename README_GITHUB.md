# Remotion Video API - RunPod Serverless Deployment

This repository contains a Remotion video generation API configured for RunPod Serverless deployment via GitHub.

## Project Structure

- `index.js` - Main Express server for video generation
- `handler.js` - RunPod serverless handler
- `Dockerfile` - Container configuration
- `runpod.json` - RunPod deployment configuration
- `src/` - Video generation components and logic
- `libs/` - Utility libraries
- `out/` - Output directory for generated videos

## Deployment Steps

### 1. GitHub Repository Setup

1. Create a GitHub repository for this project
2. Push the code to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/remotion-video-api.git
   git push -u origin main
   ```

### 2. RunPod Setup

1. Create an account at [RunPod.io](https://www.runpod.io) if you don't have one
2. Navigate to the Serverless console
3. Create a new endpoint:
   - Select GitHub as the source
   - Connect your GitHub account and select your repository
   - Choose the main branch
   - Set required environment variables:
     ```
     PORT=8000
     RENDER_CONCURRENCY=3
     SUPABASE_URL=your_supabase_url
     SUPABASE_KEY=your_supabase_key
     SUPABASE_STORAGE_BUCKET=generated-videos
     ```
   - Configure resources (min 4 vCPU, 16GB RAM recommended)
   - Set timeout to 600 seconds

### 3. Testing

Once deployed, test your endpoint with:

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "id": "your-video-id"
    }
  }'
```

## Configuration Files

### runpod.json

This file configures how RunPod builds and deploys your serverless function:

```json
{
  "name": "remotion-video-api",
  "version": "1.0.0",
  "description": "Remotion video generation API as a serverless function",
  "handler": "handler.js",
  "runtime": "nodejs18",
  "minVCPU": 4,
  "minMemory": 16,
  "maxConcurrency": 5,
  "timeout": 600,
  "github": {
    "branch": "main",
    "buildType": "dockerfile"
  },
  "buildConfig": {
    "commands": ["npm ci"]
  }
}
```

### Dockerfile

Defines how the container is built:

```dockerfile
FROM node:18-bullseye-slim

# Install dependencies required for video processing
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    libvips \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p ./out
EXPOSE 8000
CMD ["node", "handler.js"]
```

## Updating the Deployment

To update your deployed function, simply push changes to your GitHub repository. RunPod will automatically rebuild and redeploy your function.

For more details, see the [RUNPOD_DEPLOYMENT.md](./RUNPOD_DEPLOYMENT.md) file. 