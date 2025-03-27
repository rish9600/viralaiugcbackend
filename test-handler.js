/**
 * Test script for the RunPod handler
 * Run with: node test-handler.js
 */

// Import the handler
const { handler } = require('./handler');

// Create a test event
const testEvent = {
  input: {
    id: process.env.TEST_ID || 'test-id',
  },
};

console.log('Testing handler with event:', testEvent);

// Run the handler
handler(testEvent)
  .then((result) => {
    console.log('Handler result:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Handler error:', error);
    process.exit(1);
  }); 