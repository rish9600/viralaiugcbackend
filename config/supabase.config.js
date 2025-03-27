// Load environment variables from .env file
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Add validation
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials:");
  console.error("SUPABASE_URL:", supabaseUrl ? "Set" : "Missing");
  console.error("SUPABASE_KEY:", supabaseKey ? "Set" : "Missing");
  console.error("Please check your .env file or environment variables.");
  process.exit(1); // Exit with error
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
