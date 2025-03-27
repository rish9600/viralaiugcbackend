# Local Development Setup Guide

This guide will help you set up and run the Remotion Video API locally on your machine.

## Prerequisites

1. Node.js (v18 or higher)
2. FFmpeg (for video processing)
3. Git (for cloning the repository)

## Step 1: Install FFmpeg

### macOS
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

### Windows
Download FFmpeg from the official website: https://ffmpeg.org/download.html

## Step 2: Clone the Repository

```bash
git clone <repository-url>
cd remotion-video-api
```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Environment Setup

1. Create a `.env` file in the root directory:
```bash
touch .env
```

2. Add the following environment variables to your `.env` file:
```
# App
PORT=3000
RENDER_CONCURRENCY=5

# Supabase
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_STORAGE_BUCKET=
```

Replace the placeholder values with your actual Supabase credentials.

## Step 5: Start the Server

```bash
npm start
```

The server will start on:
- Main API server: http://localhost:3000
- File server: http://localhost:8787

## Step 6: Verify Installation

1. Check if the server is running by visiting http://localhost:3000/health in your browser
2. You should see a "Service is healthy" message

## Common Issues and Solutions

1. **Port Already in Use**
   If you see the error `EADDRINUSE: address already in use :::3000`, you can kill the existing process:
   ```bash
   lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
   ```

2. **FFmpeg Not Found**
   If you see errors related to FFmpeg not being found, make sure it's properly installed and available in your system's PATH.

3. **Missing Dependencies**
   If you encounter any missing dependency errors, run:
   ```bash
   npm install
   ```

## Development Tips

1. The server automatically restarts when you make changes to the code
2. Check the console output for any errors or warnings
3. The file server at port 8787 is used for serving temporary files during video processing

## API Endpoints

The server provides the following main endpoints:

- `POST /api/generate-video`: Generate a new video
- `GET /api/status/:videoId`: Check the status of a video generation
- `GET /health`: Health check endpoint

For detailed API documentation, refer to the API documentation in the project. 