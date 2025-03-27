# Deploying to RunPod Serverless via GitHub

This document outlines the steps to deploy the Remotion Video API to RunPod Serverless using GitHub repository.

## Prerequisites

1. A RunPod account with billing set up
2. A GitHub repository with your code
3. The RunPod CLI (optional for advanced use)

## Configuration Files

This project includes the following files for RunPod deployment:

- `Dockerfile` - Defines the container image build
- `handler.js` - The serverless function handler
- `runpod.json` - RunPod configuration

## Environment Variables

The following environment variables need to be set in RunPod:

```
PORT=8000
RENDER_CONCURRENCY=3
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_STORAGE_BUCKET=generated-videos
```

## Deployment Steps

### Option 1: Deploy via RunPod Web Console

1. Push your code to GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/remotion-video-api.git
   git push -u origin main
   ```

2. Go to RunPod Serverless console: https://www.runpod.io/console/serverless

3. Create a new Serverless endpoint:
   - Select "GitHub" as the source
   - Connect your GitHub account if not already connected
   - Select your repository
   - Configure the branch (default: main)
   - Set the environment variables listed above
   - Configure memory and CPU requirements (recommend at least 16GB memory and 4 vCPUs)
   - Set the timeout to 600 seconds (10 minutes)

### Option 2: Deploy via RunPod CLI

1. Install the RunPod CLI:
   ```bash
   npm install -g @runpod/cli
   ```

2. Login to RunPod:
   ```bash
   runpod login
   ```

3. Configure your GitHub repository in the runpod.json file (already done)

4. Deploy:
   ```bash
   runpod deploy
   ```

## Testing the Serverless Function

Once deployed, you can test the function with:

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "id": "your-video-id"
    }
  }'
```

Replace `YOUR_ENDPOINT_ID` with your actual RunPod endpoint ID.

## Monitoring

Monitor your serverless function performance and logs from the RunPod console.

## Tips for Optimization

1. Adjust the `RENDER_CONCURRENCY` to match the resources you've allocated
2. If you encounter memory issues, increase the memory allocation in RunPod
3. For long-running video generations, you may need to increase the timeout
4. Consider using RunPod's GPU options if your video generation can benefit from GPU acceleration

## Troubleshooting

If you encounter issues:

1. Check the RunPod logs in the console
2. Verify your environment variables are set correctly
3. Check the build logs in RunPod for any errors during container building
4. Make sure your repository is public or RunPod has access to it 