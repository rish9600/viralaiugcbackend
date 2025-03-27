#!/bin/bash

# Test rendering a video with direct URLs
echo "Rendering video with direct URL sources..."
curl -X POST http://localhost:3000/render-video \
  -H "Content-Type: application/json" \
  -d '{
    "videoSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc/dev/test.mp4",
    "demoVideoSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc/0fvz63mttsrme0cn8svvrh4m2g.mp4",
    "audioSourceUrl": "https://rbpvjxsqghhirdixhaay.supabase.co/storage/v1/object/public/ai_ugc/dev/audio.mp3",
    "titleText": "VIDEO FROM DIRECT URL WITH SPLIT SCREEN",
    "textPosition": "bottom",
    "audioOffsetInSeconds": 0,
    "enableAudio": true,
    "splitScreen": true,
    "splitPosition": "left-right"
  }'

echo -e "\n\nNow try viewing the video at the URL shown above."