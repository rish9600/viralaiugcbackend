const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const supabase = require('./config/supabase.config');
const handleVideoGeneration = require('./src/videoGeneration');
const ffmpeg = require('fluent-ffmpeg');

// Create output directory if it doesn't exist - Use /tmp for serverless environments
const outputDir = path.resolve('/tmp', './out'); 
if (!fs.existsSync(outputDir)) {
    // Recursively create directory if it doesn't exist
    fs.mkdirSync(outputDir, { recursive: true });
}

// Path to the Remotion bundle (Assuming it's copied in Dockerfile)
const bundlePath = path.join(__dirname, 'dist');

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

// This function is now the main execution logic called from the command line
async function processVideoJob(jobInput) {
    console.log("Node.js script invoked with input:", JSON.stringify(jobInput, null, 2));

    // Extract data from the input passed by Python
    const { id, ...videoData } = jobInput;

    if (!id || !videoData) {
        console.error("Error: Missing 'id' or video data in job input.");
        // Return error as JSON string for Python to capture
        return JSON.stringify({
            error: "Missing 'id' or video data in job input.",
        });
    }

    console.log(`Node: Processing job for ID: ${id}`);

    try {
        // --- Keep validation logic if necessary ---
        if (!videoData.remotion) {
             throw new Error("Missing 'remotion' configuration in input data");
        }
        if (videoData.remotion.template) {
            console.log(`Node: Validating template URL: ${videoData.remotion.template}`);
            await validateVideo(videoData.remotion.template);
            console.log("Node: Template URL validated.");
        }
        if (videoData.remotion.demo) {
            console.log(`Node: Validating demo URL: ${videoData.remotion.demo}`);
            await validateVideo(videoData.remotion.demo);
             console.log("Node: Demo URL validated.");
        }
        // -------------------------------------------

        console.log('Node: Starting video generation process...');
        
        // Call the video generation function
        // NOTE: Ensure handleVideoGeneration internally handles Supabase updates 
        // for success/failure, or modify it to return status/data
        // which we can then use to update Supabase *here* if preferred.
        // For now, assuming handleVideoGeneration manages its own status updates.
        await handleVideoGeneration(id, videoData, outputDir); 

        console.log(`Node: Successfully completed video generation for ID: ${id}`);

        // Return success response as JSON string for Python
        return JSON.stringify({
            message: `Video generation successful for ID: ${id}`,
            videoId: id,
            status: 'completed' // Assuming success if no error thrown
        });

    } catch (error) {
        console.error(`Node: Error processing video generation for ID ${id}:`, error);

        // handleVideoGeneration should ideally handle the Supabase 'failed' update internally.
        // If not, uncomment the Supabase update logic here.
        /*
        try {
            await supabase
                .from("generated_videos")
                .update({ status: "failed", error_message: error.message })
                .eq("id", id);
        } catch (updateError) {
            console.error(`Node: Failed to update Supabase status to 'failed' for ID ${id}:`, updateError);
        }
        */

        // Return error response as JSON string for Python
        return JSON.stringify({
            error: `Video generation failed for ID ${id}: ${error.message}`,
        });
    } finally {
        // Cleanup temporary files if needed (handleVideoGeneration might do this)
        console.log(`Node: Handler execution finished for ID: ${id}.`);
        // Call cleanup if it's still relevant and not handled within handleVideoGeneration
        // cleanup(); 
    }
}

// --- Main execution block --- 
// Read input JSON from command line argument
if (process.argv.length < 3) {
    console.error("Error: No input JSON provided as command line argument.");
    // Output error as JSON string
    console.log(JSON.stringify({ error: "No input JSON provided to Node.js script." }));
    process.exit(1);
}

const inputJson = process.argv[2];

try {
    const jobInput = JSON.parse(inputJson);
    // Call the main processing function and output its result
    processVideoJob(jobInput)
        .then(resultJson => {
            console.log(resultJson); // Output the result JSON to stdout for Python
            process.exit(0); // Exit cleanly
        })
        .catch(err => { // Catch any unexpected errors in processVideoJob promise chain
            console.error("Node: Unhandled error in processVideoJob:", err);
            console.log(JSON.stringify({ error: `Unhandled Node.js error: ${err.message}` }));
            process.exit(1);
        });
} catch (parseError) {
    console.error("Error: Failed to parse input JSON argument:", parseError);
    console.log(JSON.stringify({ error: `Failed to parse input JSON: ${parseError.message}` }));
    process.exit(1);
}
// ---------------------------

// Handle process errors (Keep for robustness within the worker)
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // cleanup(); 
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // cleanup(); 
    process.exit(1);
});

// SIGTERM handling for graceful shutdown (RunPod might send this)
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  // cleanup();
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