// First, let's create a new file for the shared file server
// fileServer.js
const express = require("express");
const path = require("path");

let fileServer = null;
const serverPort = 8787;
const serverUrl = `http://localhost:${serverPort}`;

/**
 * Initialize the shared file server
 * @param {string} outputDir - Directory to serve files from
 * @returns {Object} Server info including URL and port
 */
function initializeFileServer(outputDir) {
  if (fileServer) {
    console.log("File server already running on port", serverPort);
    return { serverUrl, serverPort };
  }

  try {
    const app = express();

    // Serve files from the output directory
    app.use("/videos", express.static(outputDir));

    // Start the server
    fileServer = app.listen(serverPort, () => {
      console.log(`File server started on ${serverUrl}`);
    });

    return { serverUrl, serverPort };
  } catch (error) {
    console.error("Error starting file server:", error);
    return { serverUrl: null, serverPort: null };
  }
}

/**
 * Get a publicly accessible URL for a local file
 * @param {string} filePath Local file path
 * @returns {string} URL that can be used to access the file
 */
function getFileUrl(filePath) {
  if (!filePath || filePath.startsWith("http")) return filePath;
  const filename = path.basename(filePath);
  return `${serverUrl}/videos/${filename}`;
}

/**
 * Shutdown the file server
 * @returns {Promise} Promise that resolves when server is closed
 */
function shutdownFileServer() {
  return new Promise((resolve) => {
    if (!fileServer) {
      resolve();
      return;
    }

    fileServer.close(() => {
      console.log("File server shut down");
      fileServer = null;
      resolve();
    });
  });
}

module.exports = {
  initializeFileServer,
  getFileUrl,
  shutdownFileServer,
};
