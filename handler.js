const path = require('path');
const fs = require('fs');
const supabase = require('./config/supabase.config');
const handleVideoGeneration = require('./src/videoGeneration');
const ffmpeg = require('fluent-ffmpeg');

// Create output directory if it doesn't exist
const outputDir = path.resolve(__dirname, './out');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Function to validate video file
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

// MODIFY RunPod handler function
async function handler(event) {
    console.log("Received Supabase Webhook event:", JSON.stringify(event, null, 2)); // Log the actual payload

    // Extract input data from the default Supabase webhook payload
    // Assuming the new row data is in event.record
    if (!event.record || !event.record.id) {
        console.error("Missing 'record.id' in Supabase webhook payload");
        return {
            error: "Missing required data (record.id) in webhook payload"
        };
    }

    const { id } = event.record;
    console.log(`Processing video generation for ID: ${id}`);

    try {
        // 1. Fetch the record from Supabase
        console.log(`Fetching record for ID: ${id} from Supabase...`);
        const { data: videoData, error: fetchError } = await supabase
            .from('generated_videos')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error(`Supabase fetch error for ID ${id}:`, fetchError.message);
            return {
                error: `Record not found or Supabase error: ${fetchError.message}`
            };
        }

        if (!videoData) {
             console.error(`Record not found in Supabase for ID: ${id}`);
             return { error: `Record not found for ID: ${id}` };
        }

        console.log(`Successfully fetched data for ID: ${id}`); // videoData: ${JSON.stringify(videoData)}`); // Avoid logging potentially large data

        // 2. Validate video sources if necessary (assuming data structure)
        // Adjust paths based on actual data structure in `videoData`
        if (videoData.remotion && videoData.remotion.template) {
            console.log(`Validating template video: ${videoData.remotion.template}`);
            await validateVideo(videoData.remotion.template);
            console.log("Template video validated.");
        }
        if (videoData.remotion && videoData.remotion.demo) {
             console.log(`Validating demo video: ${videoData.remotion.demo}`);
            await validateVideo(videoData.remotion.demo);
             console.log("Demo video validated.");
        }

        // 3. Call the core video generation logic
        console.log(`Starting video generation process for ID: ${id}...`);
        // Pass the necessary data from videoData to handleVideoGeneration
        // Ensure outputDir is defined correctly (it should be from the top of the file)
        const result = await handleVideoGeneration(id, videoData, outputDir);
        console.log(`Video generation successful for ID: ${id}. Result: ${JSON.stringify(result)}`);

        // 4. Return success response for RunPod
        // Include any relevant output, like the final video URL if available in 'result'
        return {
            success: true,
            message: `Video generation completed for ID: ${id}`,
            videoId: id,
            // output: result // Or specific fields from result like result.outputUrl
        };

    } catch (error) {
        console.error(`Video generation failed for ID: ${id}:`, error);
        // Return error response for RunPod
        return {
            error: `Video generation failed for ID ${id}: ${error.message || error}`
        };
    }
}

// Handle process errors (Good practice, keep)
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Export the handler (Keep)
exports.handler = handler;