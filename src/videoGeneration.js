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

  console.log(`Checking codec compatibility for: ${videoUrl}`);

  try {
    // Try to detect source video codec using ffprobe
    let needsTranscode = false;

    try {
      const ffprobeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoUrl}"`;
      const { stdout } = await execPromise(ffprobeCommand);

      const detectedCodec = stdout.trim().toLowerCase();
      console.log(`Detected source codec: ${detectedCodec}`);

      // Check if transcoding is needed
      if (detectedCodec === "hevc" || detectedCodec === "h265") {
        needsTranscode = true;
        console.log("HEVC/H.265 codec detected, transcoding required");
      }
    } catch (err) {
      console.warn(
        "Could not detect video codec, will transcode to be safe:",
        err.message
      );
      needsTranscode = true;
    }

    // If transcoding is not needed, return original URL
    if (!needsTranscode) {
      console.log("Video already uses compatible codec, no transcoding needed");
      return videoUrl;
    }

    // Transcode to H.264
    const tempFile = path.join(outputDir, `temp-h264-${id}-${Date.now()}.mp4`);
    console.log(`Transcoding to H.264: ${tempFile}`);

    return new Promise((resolve, reject) => {
      ffmpeg(videoUrl)
        .outputOptions([
          "-c:v libx264", // Use H.264 codec
          "-crf 23", // Reasonable quality
          "-preset fast", // Fast encoding speed
          "-c:a aac", // AAC audio codec
          "-strict experimental",
        ])
        .output(tempFile)
        .on("progress", (progress) => {
          // console.log(
          //   `Transcoding progress: ${Math.round(progress.percent || 0)}%`
          // );
        })
        .on("end", () => {
          console.log("Transcoding completed successfully");
          resolve(tempFile);
        })
        .on("error", (err) => {
          console.error("Transcoding error:", err);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error("Error in codec compatibility check:", error);
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
