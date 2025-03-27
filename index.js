require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const supabase = require("./config/supabase.config");
const handleVideoGeneration = require("./src/videoGeneration");
const {
  initializeFileServer,
  shutdownFileServer,
} = require("./src/fileServer");

// Create output directory if it doesn't exist
const outputDir = path.resolve(__dirname, "./out");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use("/videos", express.static(outputDir));
app.use("/public", express.static(path.join(__dirname, "./public")));

// Configuration for video rendering
const RENDER_CONCURRENCY = parseInt(process.env.RENDER_CONCURRENCY || "2"); // How many videos to render simultaneously

// Job queue for handling concurrent renders
class RenderQueue {
  constructor(concurrency = 2) {
    this.queue = [];
    this.concurrency = concurrency;
    this.running = 0;
  }

  add(id, data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, data, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.running++;

    try {
      await handleVideoGeneration(job.id, job.data, outputDir);
      job.resolve();
    } catch (error) {
      job.reject(error);
    } finally {
      this.running--;
      // Check for more jobs
      this.process();
    }
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      runningJobs: this.running,
    };
  }
}

// Initialize render queue
const renderQueue = new RenderQueue(RENDER_CONCURRENCY);

/**
 * Setup Supabase real-time subscription
 */
async function setupRealTimeSubscription() {
  console.log("Setting up Supabase real-time subscription...");

  // Subscribe to all inserts on the generated_videos table
  const subscription = supabase
    .channel("table-db-changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "generated_videos",
      },
      (payload) => {
        console.log("New video generation request received:", payload.new.id);
        // Add to queue instead of processing immediately
        renderQueue
          .add(payload.new.id, payload.new)
          .catch((error) =>
            console.error(
              `Queue processing error for ${payload.new.id}:`,
              error
            )
          );
      }
    )
    .subscribe();

  console.log("Subscription established, waiting for events...");

  return subscription;
}

// Simple status endpoint
app.get("/status", (req, res) => {
  const queueStatus = renderQueue.getStatus();

  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    queue: queueStatus,
  });
});

// Add a metrics endpoint for monitoring
app.get("/metrics", (req, res) => {
  const queueStatus = renderQueue.getStatus();

  res.status(200).json({
    queue_length: queueStatus.queueLength,
    active_jobs: queueStatus.runningJobs,
    uptime_seconds: process.uptime(),
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    total_memory_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
  });
});

app.post("/trigger-video-generation", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: id",
      });
    }

    // Fetch the record from Supabase
    const { data, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
        error: error.message,
      });
    }

    // Add to the render queue
    renderQueue
      .add(id, data)
      .then(() => {
        console.log(
          `Manually triggered video generation for ID: ${id} completed`
        );
      })
      .catch((error) => {
        console.error(
          `Manually triggered video generation for ID: ${id} failed:`,
          error
        );
      });

    res.json({
      success: true,
      message: "Video generation process added to queue",
      id,
      queueStatus: renderQueue.getStatus(),
    });
  } catch (error) {
    console.error("Error triggering video generation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to trigger video generation",
      error: error.message,
    });
  }
});

// Start the server and setup Supabase subscription
const server = app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);

  try {
    // Initialize file server at startup
    initializeFileServer(outputDir);

    // Initialize Supabase real-time subscription
    const subscription = await setupRealTimeSubscription();

    // Setup graceful shutdown for normal process termination
    process.on("SIGINT", async () => {
      console.log("Server shutdown initiated...");

      // Close subscription
      await subscription.unsubscribe();

      // Shutdown file server
      await shutdownFileServer();

      // Close server
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    });

    console.log("Service started successfully!");
  } catch (error) {
    console.error("Failed to initialize services:", error);
    console.log("Server is running but some initializations failed.");
  }
});
