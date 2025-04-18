const fs = require("fs");
const path = require("path");
const { bundle } = require("@remotion/bundler");
const { getCompositions, renderMedia } = require("@remotion/renderer");
const generateDynamicVideo = require("./generateDynamicVideo");
const { uploadToSupabase } = require("../libs/supabase/storage");
const supabase = require("../config/supabase.config");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const util = require("util");
const { exec } = require("child_process");
const getVideoDuration = require("../libs/utils");
const { getFileUrl } = require("./fileServer");

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);
const execPromise = util.promisify(exec);

/**
 * Ensures video is using a compatible codec (H.264) for Remotion
 * @param {string} videoUrl URL of the video to check/transcode
 * @param {string} outputDir Directory to save transcoded file
 * @param {string} id Unique identifier for the file
 * @returns {Promise<string>} Path to the compatible video file
 */
async function ensureCompatibleCodec(videoUrl, outputDir, id) {
  if (!videoUrl) return null;

  console.log(`[${id}] Starting processing for video URL: ${videoUrl}`);

  try {
    // Always transcode to ensure consistent output
    const tempFile = path.join(outputDir, `temp-h264-${id}-${Date.now()}.mp4`);
    console.log(`[${id}] Transcoding to H.264 target path: ${tempFile}`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoUrl)
        .outputOptions([
          "-c:v libx264", // Use H.264 codec
          "-crf 23", // Standard quality
          "-preset medium", // Balanced encoding speed
          "-c:a aac", // AAC audio codec
          "-b:a 128k", // Standard audio bitrate
          "-strict experimental",
          "-movflags +faststart", // Enable fast start for web playback
          "-pix_fmt yuv420p", // Ensure compatibility
          "-profile:v baseline", // Use baseline profile for maximum compatibility
          "-level 3.0", // Set compatibility level
          "-maxrate 2M", // Conservative maximum bitrate
          "-bufsize 4M", // Conservative buffer size
          "-threads 0", // Use all available CPU threads
          "-y", // Overwrite output file if exists
          "-vf scale=1920:1080:force_original_aspect_ratio=decrease", // Force 1080p resolution
          "-r 30", // Force 30fps
          "-vsync 1", // Ensure frame rate consistency
          "-async 1", // Ensure audio sync
          "-max_muxing_queue_size 1024" // Increase muxing queue size
        ])
        .output(tempFile);

      // Log FFmpeg command for debugging
      console.log(`[${id}] FFmpeg command: ffmpeg ${command._getArguments().join(' ')}`);

      command
        .on("progress", (progress) => {
          const percent = Math.round(progress.percent || 0);
          if (percent % 25 === 0) { // Log every 25%
            console.log(`[${id}] Transcoding progress: ${percent}%`);
          }
        })
        .on("end", () => {
          console.log(`[${id}] FFmpeg transcoding completed successfully for: ${tempFile}`);
          // Optional: Add a small delay or check file existence/size here if needed
          resolve(tempFile);
        })
        .on("error", (err, stdout, stderr) => { // Capture stdout/stderr
          console.error(`[${id}] FFmpeg transcoding error for URL ${videoUrl}:`, err.message);
          console.error(`[${id}] FFmpeg stdout:`, stdout);
          console.error(`[${id}] FFmpeg stderr:`, stderr);
          // Reject with a more informative error
          reject(new Error(`FFmpeg failed for ${videoUrl}: ${err.message}`));
        })
        .run();
    });
  } catch (error) {
    console.error(`[${id}] Error in ensureCompatibleCodec for ${videoUrl}:`, error);
    // Fallback might hide the root cause, consider re-throwing or handling differently
    // For now, keep the fallback but log the error clearly
    return videoUrl; // Fall back to original URL if anything fails
  }
}

/**
 * Main function to handle video generation triggered by Supabase
 * @param {string} id The ID of the generated_videos record
 * @param {Object} data The data from the generated_videos record
 * @param {string} outputDir Directory to save output files
 */
async function handleVideoGeneration(id, data, outputDir) {
  console.log(`Processing video generation for ID: ${id}`);
  // console.log(`Data received:`, JSON.stringify(data));

  // Track temporary files to clean up later
  const tempFiles = [];

  try {
    // Extract properties from data and remotion JSONB field
    const remotionData = data.remotion || {};

    // Map fields based on provided mapping
    const audioOffsetInSeconds = remotionData.audio_offset || 0;
    const titleText = remotionData.caption || "Default Title";
    const textPosition = data.text_alignment || "bottom";
    const videoSource = remotionData.template || null;
    const demoVideoSource = remotionData.demo || null;
    const audioSource = remotionData.sound || null;
    const enableAudio = audioSource !== null;
    const sequentialMode = data.video_alignment === "serial";
    const splitScreen = !sequentialMode && demoVideoSource !== null;

    let splitPosition = null;
    if (splitScreen) {
      if (data.video_alignment === "side") {
        splitPosition = "right-left";
      } else if (data.video_alignment === "top") {
        splitPosition = "bottom-top";
      }
    }

    // Default fallback durations in case we can't determine real durations
    let firstVideoDuration = 6; // Default fallback
    let durationInSeconds = 30; // Default fallback

    // Update Supabase with status
    await supabase
      .from("generated_videos")
      .update({ status: "processing" })
      .eq("id", id);

    // Validate splitPosition value if splitScreen is enabled and not in sequential mode
    const validSplitPositions = [
      "left-right",
      "right-left",
      "top-bottom",
      "bottom-top",
    ];

    if (
      splitScreen &&
      !sequentialMode &&
      !validSplitPositions.includes(splitPosition)
    ) {
      throw new Error(
        "Invalid splitPosition value. Must be one of: left-right, right-left, top-bottom, bottom-top"
      );
    }
    // // Log parameters for debugging
    // console.log("\nParameters for video generation:");
    // console.log("Title Text:", titleText);
    // console.log("Duration (seconds):", durationInSeconds);
    // console.log("Text Position:", textPosition);
    // console.log("Enable Audio:", enableAudio);
    // console.log("Split Screen:", splitScreen);
    // console.log("Sequential Mode:", sequentialMode);
    // console.log("First Video Duration:", firstVideoDuration);
    // console.log("Split Position:", splitPosition);
    // console.log("Video Source URL:", videoSource);
    // console.log("Demo Video Source URL:", demoVideoSource);
    // console.log("Audio Source URL:", audioSource);
    // console.log("Audio Offset (seconds):", audioOffsetInSeconds);

    // Process video sources to ensure codec compatibility
    console.log("\nEnsuring video codec compatibility...");

    // Process main video
    let localMainVideoPath = null;
    const processedVideoSource = await ensureCompatibleCodec(
      videoSource,
      outputDir,
      `${id}-main`
    );
    if (processedVideoSource !== videoSource && processedVideoSource !== null) {
      console.log(`Main video transcoded to: ${processedVideoSource}`);
      localMainVideoPath = processedVideoSource;
      tempFiles.push(processedVideoSource);
    }

    // Process demo video if needed
    let localDemoVideoPath = null;
    let processedDemoSource = null;
    if ((splitScreen || sequentialMode) && demoVideoSource) {
      processedDemoSource = await ensureCompatibleCodec(
        demoVideoSource,
        outputDir,
        `${id}-demo`
      );
      if (
        processedDemoSource !== demoVideoSource &&
        processedDemoSource !== null
      ) {
        console.log(`Demo video transcoded to: ${processedDemoSource}`);
        localDemoVideoPath = processedDemoSource;
        tempFiles.push(processedDemoSource);
      }
    }

    // Get proper URLs for videos using the shared file server
    const mainVideoUrl = localMainVideoPath
      ? getFileUrl(localMainVideoPath)
      : videoSource;
    const demoVideoUrl = localDemoVideoPath
      ? getFileUrl(localDemoVideoPath)
      : demoVideoSource;

    // Determine video durations
    console.log("\nDetecting video durations...");
    const mainVideoDuration = await getVideoDuration(mainVideoUrl, execPromise);
    const demoVideoDuration = await getVideoDuration(demoVideoUrl, execPromise);

    console.log(
      `Main video: ${mainVideoDuration || "unknown"} secs, Demo video: ${
        demoVideoDuration || "unknown"
      } secs`
    );

    // Apply the dynamic duration logic based on the requirements
    if (mainVideoDuration !== null) {
      // Case 4: If no demo video, use main video duration
      if (demoVideoSource === null) {
        durationInSeconds = mainVideoDuration;
      }

      // Case 3: In sequential mode, firstVideoDuration = main video duration
      if (sequentialMode) {
        firstVideoDuration = mainVideoDuration;
      }
    }

    if (demoVideoDuration !== null) {
      // Case 1: If splitPosition is not null, use demo video duration
      if (splitPosition !== null) {
        durationInSeconds = demoVideoDuration;
      }

      // Case 2: In sequential mode, use sum of both video durations
      if (sequentialMode && mainVideoDuration !== null) {
        durationInSeconds = mainVideoDuration + demoVideoDuration;
      }
    }

    // Log the calculated durations
    console.log(
      `[Durations] Template: ${firstVideoDuration} secs, Demo: ${durationInSeconds} secs`
    );

    // Generate a dynamic video component with the specified values
    console.log("\nGenerating dynamic component with title:", titleText);
    const { indexPath, componentName } = generateDynamicVideo({
      titleText,
      durationInSeconds,
      audioOffsetInSeconds,
      textPosition,
      videoSource: mainVideoUrl,
      audioSource,
      enableAudio,
      splitScreen,
      demoVideoSource: demoVideoUrl,
      splitPosition,
      sequentialMode,
      firstVideoDuration,
    });

    console.log("Generated dynamic component:", componentName);
    console.log("Dynamic index path:", indexPath);

    // Generate a unique filename
    const outputFilename = `video-${id}-${Date.now()}.mp4`;
    const outputPath = path.resolve(outputDir, outputFilename);

    // Make sure the filename has the proper extension for the codec
    if (outputFilename.endsWith(".m4a")) {
      console.log(
        "Warning: Changing output extension from .m4a to .mp4 for compatibility"
      );
      outputFilename = outputFilename.replace(".m4a", ".mp4");
    }

    // Bundle the dynamic Remotion project
    console.log("Bundling dynamic component...\n");
    const bundled = await bundle(indexPath);

    // Get the compositions
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c) => c.id === componentName);

    if (!composition) {
      throw new Error(`Composition '${componentName}' not found`);
    }

    // Render the video with increased timeout for safety
    console.log(`Starting render video - ${id}...`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      timeoutInMilliseconds: 900000, // 15 minutes overall timeout (increased from 7 min)
      concurrency: 1,
      onProgress: (progress) => {
        // Use process.stdout.write with \r to update the same line
        const percent = Math.floor(progress.progress * 100);

        // process.stdout.write(
        //   `\rRendering progress: ${percent}%`
        // );

        // Log every 25% for debugging
        if (percent % 25 === 0 && percent > 0 && progress.renderedFrames) {
          process.stdout.write(`\rRendering progress video ${id}: ${percent}%`);
        }
      },
    });
    process.stdout.write("\nRendering completed.\n");

    // Clean up the generated component files
    try {
      fs.unlinkSync(indexPath);
      fs.unlinkSync(indexPath.replace("-index.jsx", ".jsx"));
      console.log("\nCleaned up temporary component files");
    } catch (err) {
      console.warn("Failed to clean up temporary component files:", err);
    }

    console.log("Video rendered successfully. Uploading to Supabase...");

    // Upload the rendered video to Supabase storage
    const supabaseUrl = await uploadToSupabase(outputPath, outputFilename);
    console.log("Video uploaded to Supabase:", supabaseUrl);

    // Update the remotion_video field in the database
    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        remotion_video: supabaseUrl,
        error: null,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Failed to update database: ${updateError.message}`);
    }

    // Clean up the local video file
    try {
      fs.unlinkSync(outputPath);
      console.log("Deleted local video file");

      // Clean up all temporary transcoded files
      for (const tempFile of tempFiles) {
        try {
          fs.unlinkSync(tempFile);
          console.log(`Deleted temporary file: ${tempFile}`);
        } catch (err) {
          console.warn(`Failed to delete temporary file ${tempFile}:`, err);
        }
      }
    } catch (err) {
      console.warn("Failed to delete local video file:", err);
    }

    console.log("Video generation and upload completed successfully!");
    console.log(
      "\n-------------------------------------------\n-------------------------------------------\n"
    );
  } catch (error) {
    console.error("Error in video generation:", error);

    // Clean up any temporary files if an error occurred
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          console.log(`Cleaned up temporary file: ${tempFile}`);
        }
      } catch (err) {
        console.warn(`Error cleaning up temporary file ${tempFile}:`, err);
      }
    }

    // Update the database with the error information
    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
        status: "failed",
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update error in database:", updateError);
    }
  }
}

module.exports = handleVideoGeneration;
