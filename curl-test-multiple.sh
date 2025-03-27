#!/bin/bash

# Test rendering a video with direct URLs
echo "Rendering video with direct URL sources..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc//0fvz63mttsrme0cn8svvrh4m2g.mp4",
    "demoVideoSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc//tmpfwk9oqq4.output.mp4",
    "titleText": "VIDEO FROM DIRECT URL WITH SPLIT SCREEN",
    "textPosition": "center",
    "enableAudio": false,
    "splitScreen": true,
    "splitPosition": "bottom-top"
  }'

sleep 2

# Test rendering a video with direct URLs
echo "Rendering video with direct URL sources..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "durationInSeconds": 10,
    "videoSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc//0fvz63mttsrme0cn8svvrh4m2g.mp4",
    "titleText": "VIDEO FROM DIRECT URL",
    "textPosition": "top",
    "enableAudio": false,
    "splitScreen": false
  }'

echo -e "\n\nNow try viewing the videos at the URLs shown above."