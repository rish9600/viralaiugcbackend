const fs = require("fs");
const path = require("path");

/**
 * Generates a dynamic video component with hardcoded values
 * @param {Object} options Options for the video
 * @param {string} options.titleText The title text to display
 * @param {string} options.durationInSeconds The duration of the video to be generated
 * @param {string} options.audioOffsetInSeconds The sudio offset duration
 * @param {string} options.textPosition The position of the text (top, center, bottom)
 * @param {string} options.videoSource Path or URL to the video source
 * @param {boolean} options.enableAudio Whether to enable additional audio alongside video
 * @param {boolean} options.splitScreen Whether to show two videos side by side
 * @param {string} options.demoVideoSource Path or URL to the right video (when splitScreen is true)
 * @param {string} options.splitPosition Layout of the videos (left-right, right-left, top-bottom, bottom-top)
 * @param {boolean} options.sequentialMode Whether to show videos sequentially (one after another) instead of split screen
 * @param {number} options.firstVideoDuration Duration of the first video in seconds when in sequential mode
 * @returns {Object} Information about the generated component
 */
function generateDynamicVideo(options) {
  const {
    titleText,
    durationInSeconds,
    audioOffsetInSeconds = 0,
    textPosition,
    videoSource,
    audioSource,
    enableAudio,
    splitScreen = false,
    demoVideoSource,
    splitPosition,
    sequentialMode = false,
    firstVideoDuration,
  } = options;

  // Create a unique filename based on timestamp
  const timestamp = Date.now();
  const componentName = `DynamicVideo${timestamp}`;
  const filePath = path.join(__dirname, `${componentName}.jsx`);

  // Generate the component code with hardcoded values
  const componentCode = `
import React from 'react';
import { AbsoluteFill, Video as RemotionVideo } from 'remotion';
import { AudioTrack } from './AudioTrack';
import { SplitScreenVideo } from './SplitScreenVideo';
import { SequentialVideo } from './SequentialVideo';

// Dynamically generated component
export const ${componentName} = (props) => {
  // Hardcoded values from generation
  const videoSource = ${
    videoSource ? `"${videoSource.replace(/"/g, '\\"')}"` : "null"
  };
  const demoVideoSource = ${
    demoVideoSource ? `"${demoVideoSource.replace(/"/g, '\\"')}"` : "null"
  };
  const audioSource = ${
    audioSource ? `"${audioSource.replace(/"/g, '\\"')}"` : "null"
  };
  const titleText = "${titleText.replace(/"/g, '\\"')}";
  const textPosition = "${textPosition}";
  const splitScreen = ${splitScreen ? "true" : "false"};
  const splitPosition = "${splitPosition}";
  const sequentialMode = ${sequentialMode ? "true" : "false"};
  const firstVideoDuration = ${firstVideoDuration};
  
  // Determine text position style
  const getTextPositionStyle = () => {
    switch(textPosition) {
      case 'top':
        return {
          top: '10%',
          bottom: 'auto'
        };
      case 'center':
        return {
          top: '50%',
          transform: 'translateY(-50%)',
          bottom: 'auto'
        };
      case 'bottom':
      default:
        return {
          bottom: '10%',
          top: 'auto'
        };
    }
  };
  
  // Get position style
  const positionStyle = getTextPositionStyle();

  // Always include audio if audioSource is available, regardless of split screen mode
  const AudioComponent = audioSource ? (
    <AudioTrack 
      audioSource={audioSource} 
      offsetInSeconds={${audioOffsetInSeconds}}
      enableAudio={${enableAudio}}
    />
  ) : null;

  // For sequential mode
  if (sequentialMode && demoVideoSource) {
    return (
      <AbsoluteFill style={{ backgroundColor: 'black' }}>
        {/* Sequential Video Display */}
        <SequentialVideo 
          videoSource={videoSource}
          demoVideoSource={demoVideoSource}
          firstVideoDuration={firstVideoDuration}
          titleText={titleText}
          textPosition={textPosition}
        />
        
        {/* Audio handling - always include if available */}
        {AudioComponent}
      </AbsoluteFill>
    );
  }

  // For split screen mode
  if (splitScreen && demoVideoSource) {
    return (
      <AbsoluteFill style={{ backgroundColor: 'black' }}>
        {/* Split Screen Video Display */}
        <SplitScreenVideo 
          videoSource={videoSource}
          demoVideoSource={demoVideoSource}
          splitPosition={splitPosition}
        />

        {/* Title with dynamic position - displayed on top of both videos */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              textAlign: 'center',
              padding: '0 20px',
              zIndex: 20,
              ...positionStyle
            }}
          >
            <h1
              style={{
                color: 'white',
                fontSize: '64px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                textShadow:
                      '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, 0 -4px 0 #000, 0 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000',
                margin: 0,
                lineHeight: 1.2,
                paddingLeft: "12px",
                paddingRight: "12px",
              }}
            >
              {titleText}
            </h1>
          </div>
        
        {/* Audio handling - always include if available */}
        {AudioComponent}
      </AbsoluteFill>
    );
  }

  // Default single video/image mode
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video or Image Background */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <RemotionVideo
        src={videoSource}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
        {/* Title with dynamic position */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              textAlign: 'center',
              padding: '0 20px',
              ...positionStyle
            }}
          >
            <h1
              style={{
                color: 'white',
                fontSize: '64px',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                textShadow:
                      '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, 0 -4px 0 #000, 0 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000',
                margin: 0,
                lineHeight: 1.2,
                paddingLeft: "12px",
                paddingRight: "12px",
              }}
            >
              {titleText}
            </h1>
          </div>
      </div>
      
      {/* Audio handling - always include if available */}
      {AudioComponent}
    </AbsoluteFill>
  );
};
  `;

  // Write the component to a file
  fs.writeFileSync(filePath, componentCode);

  // Generate dynamic index file that exports this component
  const dynamicIndexPath = path.join(__dirname, `${componentName}-index.jsx`);
  const indexCode = `
import {Composition} from 'remotion';
import {${componentName}} from './${componentName}';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="${componentName}"
        component={${componentName}}
        durationInFrames={${durationInSeconds * 30}}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          durationInSeconds: ${durationInSeconds}
        }}
      />
    </>
  );
};

import {registerRoot} from 'remotion';
registerRoot(RemotionRoot);
  `;

  fs.writeFileSync(dynamicIndexPath, indexCode);

  return {
    componentPath: filePath,
    indexPath: dynamicIndexPath,
    componentName,
  };
}

module.exports = generateDynamicVideo;
