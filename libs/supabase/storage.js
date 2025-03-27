// CommonJS Version
const fs = require("fs");
const supabase = require("../../config/supabase.config");

const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "generated-videos";

// Function to upload video to Supabase storage
async function uploadToSupabase(filePath, fileName) {
  try {
    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Supabase storage
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: "video/mp4",
        upsert: true, // Overwrite if the file already exists
      });

    if (error) {
      throw error;
    }

    // Get the public URL of the uploaded file
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading to Supabase:", error);
    throw error;
  }
}

module.exports = {
  uploadToSupabase,
};
