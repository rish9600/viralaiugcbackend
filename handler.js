const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const supabase = require('./config/supabase.config');
const handleVideoGeneration = require('./src/videoGeneration');
const ffmpeg = require('fluent-ffmpeg');
const { getCompositions } = require('@remotion/renderer');

// Create output directory if it doesn't exist - Use /tmp for serverless environments
const outputDir = path.resolve('/tmp', './out'); 
if (!fs.existsSync(outputDir)) {
    // Recursively create directory if it doesn't exist
    fs.mkdirSync(outputDir, { recursive: true });
}

// Path to the Remotion bundle (Assuming it's copied in Dockerfile)
const bundlePath = path.join(__dirname, 'dist');

// Configuration for video rendering
// Concurrency is handled by RunPod, RENDER_CONCURRENCY might not be needed or used differently
// const RENDER_CONCURRENCY = parseInt(process.env.RENDER_CONCURRENCY || '2');

// Function to validate video file (Keep as it's used by handleVideoGeneration indirectly via ensureCompatibleCodec)
async function validateVideo(videoUrl) {
    return new Promise((resolve, reject) => {
        if (!videoUrl) {
            reject(new Error('No video URL provided'));
            return;
        }

        console.log('Validating video:', videoUrl);

        ffmpeg.ffprobe(videoUrl, (err, metadata) => {
            if (err) {
                console.error('Video validation error:', err);
                reject(new Error(`Failed to validate video: ${err.message}`));
                return;
            }

            // Check if video stream exists
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (!videoStream) {
                reject(new Error('No video stream found'));
                return;
            }

            // Get video metadata without codec restrictions
            resolve({
                width: videoStream.width,
                height: videoStream.height,
                duration: parseFloat(metadata.format.duration),
                codec: videoStream.codec_name,
                format: metadata.format.format_name,
                bitrate: metadata.format.bit_rate,
                size: metadata.format.size
            });
        });
    });
}

// RunPod handler function
// Expects input in event.input
async function handler(event) {
    console.log("RunPod Handler invoked with event:", JSON.stringify(event, null, 2));

    if (!event || !event.input) {
        console.error("Error: Invalid event input received.");
        return {
            error: "Invalid input received. Expected event.input object.",
        };
    }

    // Extract the necessary data passed from the edge function
    // Assuming the edge function sends the 'data' object (fetched from Supabase) and 'id' directly within event.input
    const { id, ...videoData } = event.input; 

    if (!id || !videoData) {
        console.error("Error: Missing 'id' or video data in event.input.");
        return {
            error: "Missing 'id' or video data in event.input.",
        };
    }

    console.log(`Processing job for ID: ${id}`);

    try {
        // Validate required fields in videoData if necessary (though handleVideoGeneration might do this)
        if (!videoData.remotion) {
             throw new Error("Missing 'remotion' configuration in input data");
        }

        // Validate video sources if they exist, using the existing validation function
        // This might be redundant if handleVideoGeneration already does it thoroughly
        if (videoData.remotion.template) {
            console.log(`Validating template URL: ${videoData.remotion.template}`);
            await validateVideo(videoData.remotion.template);
            console.log("Template URL validated.");
        }
        if (videoData.remotion.demo) {
            console.log(`Validating demo URL: ${videoData.remotion.demo}`);
            await validateVideo(videoData.remotion.demo);
             console.log("Demo URL validated.");
        }

        console.log('Starting video generation process...');
        // Directly call the video generation function
        // Pass the id and the data object (which includes 'remotion' field etc.)
        // Pass the adjusted output directory
        await handleVideoGeneration(id, videoData, outputDir);

        console.log(`Successfully completed video generation for ID: ${id}`);

        // Return success response as expected by RunPod
        return {
            message: `Video generation successful for ID: ${id}`,
            videoId: id,
            status: 'completed' 
        };

    } catch (error) {
        console.error(`Error processing video generation for ID ${id}:`, error);

        // Attempt to update Supabase status to 'failed' even if handler fails
        try {
            await supabase
                .from("generated_videos")
                .update({ status: "failed", error_message: error.message })
                .eq("id", id);
        } catch (updateError) {
            console.error(`Failed to update Supabase status to 'failed' for ID ${id}:`, updateError);
        }

        // Return error response as expected by RunPod
        return {
            error: `Video generation failed for ID ${id}: ${error.message}`,
        };
    } finally {
        // Cleanup temporary files - handleVideoGeneration should already do this
        console.log(`Handler execution finished for ID: ${id}.`);
        cleanup(); 
    }
}

// Handle process errors (Keep for robustness within the worker)
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    cleanup(); 
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    cleanup(); 
    process.exit(1);
});

// SIGTERM handling for graceful shutdown (RunPod might send this)
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  cleanup();
  process.exit(0);
});

// Cleanup function (Keep if it handles resources like DB connections or temp files not covered elsewhere)
function cleanup() {
    console.log('Running cleanup tasks...');
    try {
        if (fs.existsSync(outputDir)) {
            console.log(`Cleaning up output directory: ${outputDir}`);
        }
    } catch (err) {
        console.error("Error during cleanup:", err);
    }
    console.log('Cleanup finished.');
}

// Export the handler for RunPod
module.exports = { handler }; 