# Viral AI UGC Video Generation Backend (RunPod Serverless)

This project generates dynamic videos based on user input using Remotion, hosted on RunPod Serverless and triggered by a Supabase Edge Function.

## Architecture

1.  **Supabase Edge Function (`trigger-runpod-worker`):** Listens for requests (e.g., from your frontend or another backend service). It fetches the necessary video generation parameters from your Supabase `generated_videos` table based on a provided `id`.
2.  **RunPod Serverless Endpoint:** The Edge Function sends a request containing the video parameters to this endpoint.
3.  **Node.js Worker (`handler.js`):** This script runs on the RunPod serverless instance. It receives the payload, processes video sources (transcoding if needed), invokes Remotion's `renderMedia` function, and uploads the final video to Supabase Storage.
4.  **Remotion Project (`src/`):** Contains the Remotion components and logic used to define the video compositions.
5.  **Supabase Database & Storage:** Stores video generation requests/status and the final rendered videos.

## Prerequisites

1.  **Node.js:** v18 or higher (for local testing/development, RunPod uses the version specified in Dockerfile).
2.  **Docker:** Required for building the container image for RunPod (if not using Git integration).
3.  **Supabase Account:** For database, storage, and edge functions.
4.  **RunPod Account:** For hosting the serverless video generation worker.
5.  **Supabase CLI:** For deploying edge functions (`npm install -g supabase`).
6.  **Git:** For version control and potentially deploying to RunPod.
7.  **(Optional) FFmpeg:** Install locally if you want to test video processing aspects outside of Docker (`brew install ffmpeg` or `sudo apt install ffmpeg`).

## Setup

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**

    *   **For Supabase Edge Function:** Set these in your Supabase project dashboard under Database -> Functions -> `trigger-runpod-worker` -> Environment Variables:
        *   `SUPABASE_URL`: Your Supabase project URL.
        *   `SUPABASE_ANON_KEY`: Your Supabase project anonymous key.
        *   `RUNPOD_ENDPOINT_URL`: Your RunPod Serverless Endpoint URL (e.g., `https://api.runpod.ai/v2/<your_endpoint_id>/runsync` or `/run`).
        *   `RUNPOD_API_KEY`: Your RunPod API Key.
        *   *(Optional) `SUPABASE_SERVICE_ROLE_KEY`: Only if RLS prevents the anon key from accessing necessary data (use with caution).* 

    *   **For RunPod Serverless Worker:** Set these in your RunPod Serverless Endpoint configuration:
        *   `SUPABASE_URL`: Your Supabase project URL.
        *   `SUPABASE_KEY`: Your Supabase project anonymous key (or service role key if needed for worker operations like status updates/uploads).
        *   `SUPABASE_STORAGE_BUCKET`: The name of your Supabase Storage bucket for video uploads.
        *   *(Other necessary ENV VARS for Remotion/your specific setup)*

    *   **(Optional) Local `.env` file:** For local testing of specific parts (not used by deployed functions/workers):
        ```dotenv
        # Supabase (for local scripts/testing if needed)
        SUPABASE_URL=
        SUPABASE_KEY=
        SUPABASE_STORAGE_BUCKET=
        
        # RunPod (for local scripts/testing if needed)
        RUNPOD_ENDPOINT_URL=
        RUNPOD_API_KEY=
        ```

## Deployment

1.  **Deploy Supabase Edge Function:**
    ```bash
    supabase login
    supabase link --project-ref <your-project-ref>
    supabase functions deploy trigger-runpod-worker --no-verify-jwt
    ```
    *(Remember to set environment variables in the Supabase dashboard as mentioned above)*

2.  **Deploy to RunPod Serverless:**
    *   **Option A: Using GitHub Integration (Recommended):**
        *   Push your code to your GitHub repository.
        *   Create/Configure your RunPod Serverless Endpoint.
        *   Connect the endpoint to your GitHub repository and branch.
        *   Ensure the Dockerfile path is correct in the RunPod settings.
        *   Set the necessary environment variables in the RunPod endpoint settings.
        *   RunPod will automatically build the image from your Dockerfile and deploy.
    *   **Option B: Manual Docker Build & Push:**
        *   Build the Docker image: `docker build -t your-image-name:latest .`
        *   Push the image to a container registry (e.g., Docker Hub, GHCR).
        *   Create/Configure your RunPod Serverless Endpoint.
        *   Point the endpoint to your pushed container image.
        *   Set the necessary environment variables in the RunPod endpoint settings.

## Usage

1.  Ensure a record exists in your Supabase `generated_videos` table with all the required parameters (including the `remotion` JSONB field).
2.  Invoke the `trigger-runpod-worker` Supabase Edge Function by sending a POST request to its URL with the `id` of the record in the body:
    ```bash
    curl -X POST <YOUR_SUPABASE_FUNCTION_URL> \
      -H "Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>" \
      -H "Content-Type: application/json" \
      -d '{"id": "<your_generated_video_id>"}'
    ```
3.  The Edge Function fetches the data, triggers the RunPod worker, and returns a response indicating success or failure of the *trigger*.
4.  The RunPod worker executes asynchronously (if using `/run`) or synchronously (if using `/runsync`), performs the video generation, updates the status in the `generated_videos` table, and uploads the result to Supabase Storage.

## Key Files

*   `handler.js`: Entry point script for the RunPod serverless worker.
*   `src/videoGeneration.js`: Core logic for handling video processing and Remotion rendering.
*   `src/Root.jsx`: Main Remotion composition entry point.
*   `src/Video.jsx`: Example Remotion video component (adapt as needed).
*   `Dockerfile`: Defines the container environment for the RunPod worker.
*   `supabase/functions/trigger-runpod-worker/index.ts`: Supabase Edge Function code.
*   `config/supabase.config.js`: Supabase client configuration (used by worker).
*   `libs/`: Utility functions, Supabase helpers.

## Development Tips

*   You can test the `handleVideoGeneration` function locally by creating a separate script that calls it with mock data.
*   Use RunPod's logs to monitor the execution of your worker.
*   Use Supabase function logs to debug the Edge Function.