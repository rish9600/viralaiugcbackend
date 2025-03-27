const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const supabase = require('./config/supabase.config');
const handleVideoGeneration = require('./src/videoGeneration');
const { initializeFileServer } = require('./src/fileServer');
const ffmpeg = require('fluent-ffmpeg');
const { getCompositions } = require('@remotion/renderer');

// Create output directory if it doesn't exist
const outputDir = path.resolve(__dirname, './out');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Path to the Remotion bundle
const bundlePath = path.join(__dirname, 'dist');

// Create Express app
const app = express();
const port = process.env.PORT || 8000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use('/videos', express.static(outputDir));
app.use('/public', express.static(path.join(__dirname, './public')));
app.use('/dist', express.static(bundlePath));

// Configuration for video rendering
const RENDER_CONCURRENCY = parseInt(process.env.RENDER_CONCURRENCY || '2');

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

// Job queue for handling concurrent renders
class RenderQueue {
    constructor(concurrency = 2) {
        this.queue = [];
        this.concurrency = concurrency;
        this.running = 0;
    }

    add(id, data) {
        return new Promise(async (resolve, reject) => {
            try {
                // Validate that we have the required data
                if (!data || !data.remotion) {
                    throw new Error('Missing required video data or remotion configuration');
                }

                // Validate video sources if they exist
                if (data.remotion.template) {
                    await validateVideo(data.remotion.template);
                }
                if (data.remotion.demo) {
                    await validateVideo(data.remotion.demo);
                }

                // Add to queue with validated data
                this.queue.push({ id, data, resolve, reject });
                this.process();
            } catch (error) {
                console.error('Video validation error:', error);
                reject(error);
            }
        });
    }

    async process() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const job = this.queue.shift();
        this.running++;

        try {
            console.log('Processing job with data:', JSON.stringify(job.data));
            await handleVideoGeneration(job.id, job.data, outputDir);
            job.resolve();
        } catch (error) {
            console.error('Job processing error:', error);
            job.reject(error);
        } finally {
            this.running--;
            this.process();
        }
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            runningJobs: this.running,
        };
    }

    clear() {
        this.queue = [];
        this.running = 0;
    }
}

// Initialize render queue
const renderQueue = new RenderQueue(RENDER_CONCURRENCY);

// Status endpoint
app.get('/status', (req, res) => {
    try {
        const queueStatus = renderQueue.getStatus();
        res.status(200).json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            queue: queueStatus,
        });
    } catch (error) {
        console.error('Status endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Video generation endpoint
app.post('/trigger-video-generation', async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameter: id',
            });
        }

        // Fetch the record from Supabase
        const { data, error } = await supabase
            .from('generated_videos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({
                success: false,
                message: 'Record not found',
                error: error.message,
            });
        }

        // Add to the render queue
        renderQueue
            .add(id, data)
            .then(() => {
                console.log(`Video generation for ID: ${id} completed`);
            })
            .catch((error) => {
                console.error(`Video generation for ID: ${id} failed:`, error);
            });

        res.json({
            success: true,
            message: 'Video generation process added to queue',
            id,
            queueStatus: renderQueue.getStatus(),
        });
    } catch (error) {
        console.error('Error triggering video generation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger video generation',
            error: error.message,
        });
    }
});

// Initialize server and setup Supabase subscription
let server = null;

function startServer() {
    return new Promise((resolve, reject) => {
        try {
            if (server) {
                resolve(server);
                return;
            }

            // Initialize file server
            initializeFileServer(outputDir);

            // Start Express server
            server = app.listen(port, async () => {
                console.log(`Server running at http://localhost:${port}`);
                
                try {
                    // Initialize Supabase real-time subscription
                    const subscription = supabase
                        .channel('table-db-changes')
                        .on(
                            'postgres_changes',
                            {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'generated_videos',
                            },
                            (payload) => {
                                console.log('New video generation request received:', payload.new.id);
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

                    console.log('Supabase subscription established');
                    resolve(server);
                } catch (error) {
                    console.error('Failed to initialize services:', error);
                    resolve(server);
                }
            });

            server.on('error', (error) => {
                console.error('Server error:', error);
                reject(error);
            });

        } catch (error) {
            console.error('Error starting server:', error);
            reject(error);
        }
    });
}

// RunPod handler function
async function handler(event) {
    try {
        console.log('Handler started with event:', JSON.stringify(event));

        // Start the server
        await startServer();

        // Validate input
        const { id } = event.input || {};
        if (!id) {
            throw new Error('Missing required parameter: id');
        }

        console.log('Processing video generation for ID:', id);

        // Fetch the record from Supabase to get video data
        const { data: videoData, error } = await supabase
            .from('generated_videos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Supabase fetch error:', error);
            throw new Error(`Failed to fetch video data: ${error.message}`);
        }

        if (!videoData) {
            throw new Error(`No video data found for ID: ${id}`);
        }

        console.log('Video data fetched successfully:', JSON.stringify(videoData));

        // Add to render queue with the full video data
        await renderQueue.add(id, videoData);

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes with 5-second intervals

        while (attempts < maxAttempts) {
            const queueStatus = renderQueue.getStatus();
            console.log('Current queue status:', queueStatus);
            
            if (queueStatus.queueLength === 0 && queueStatus.runningJobs === 0) {
                return {
                    id: id,
                    status: 'completed',
                    message: 'Video generation completed successfully'
                };
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }

        throw new Error('Video generation timed out');
    } catch (error) {
        console.error('Handler error:', error);
        console.error('Error stack:', error.stack);
        
        // Clean up resources
        if (renderQueue) {
            renderQueue.clear();
        }
        
        // Update Supabase with error status
        try {
            await supabase
                .from('generated_videos')
                .update({
                    status: 'failed',
                    error: {
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    }
                })
                .eq('id', event.input?.id);
        } catch (updateError) {
            console.error('Failed to update error status in Supabase:', updateError);
        }

        return {
            error: error.message,
            details: error.stack
        };
    }
}

// Handle process errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    cleanup();
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal');
    cleanup();
});

process.on('SIGINT', () => {
    console.log('Received SIGINT signal');
    cleanup();
});

// Cleanup function
function cleanup() {
    console.log('Cleaning up resources...');
    if (renderQueue) {
        renderQueue.clear();
    }
    if (server) {
        server.close(() => {
            console.log('Server closed');
        });
    }
}

// Export the handler
exports.handler = handler;

// If running directly (for testing)
if (require.main === module) {
    const testEvent = {
        input: {
            id: process.env.TEST_ID || 'test-id'
        }
    };

    handler(testEvent)
        .then(result => {
            console.log('Test result:', result);
        })
        .catch(error => {
            console.error('Test error:', error);
            process.exit(1);
        });
} 