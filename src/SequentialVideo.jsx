import React from "react";
import {
  AbsoluteFill,
  Video as RemotionVideo,
  useVideoConfig,
  Sequence,
} from "remotion";

/**
 * Component for displaying two videos sequentially (one after the other)
 *
 * @param {Object} props Component props
 * @param {string} props.videoSource Path or URL to the first video
 * @param {string} props.demoVideoSource Path or URL to the second video
 * @param {number} props.firstVideoDuration Duration of the first video in seconds
 * @param {string} props.titleText Title text to display (only shown during first video)
 * @param {string} props.textPosition Position of the title text (top, center, bottom)
 */
export const SequentialVideo = ({
  videoSource,
  demoVideoSource,
  firstVideoDuration,
  titleText,
  textPosition,
}) => {
  const { fps } = useVideoConfig();

  // Calculate the transition frame (when to switch videos)
  const transitionFrame = Math.floor(firstVideoDuration * fps);

  // Determine text position style
  const getTextPositionStyle = () => {
    switch (textPosition) {
      case "top":
        return {
          top: "10%",
          bottom: "auto",
        };
      case "center":
        return {
          top: "50%",
          transform: "translateY(-50%)",
          bottom: "auto",
        };
      case "bottom":
      default:
        return {
          bottom: "10%",
          top: "auto",
        };
    }
  };

  // Get position style
  const positionStyle = getTextPositionStyle();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* First Video Sequence */}
      <Sequence durationInFrames={transitionFrame} from={0}>
        {videoSource && (
          <>
            <RemotionVideo
              src={videoSource}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              volume={1}
            />

            {/* Title text - only shown during first video if titleText exists */}
            {titleText && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  padding: "0 20px",
                  zIndex: 20,
                  ...positionStyle,
                }}
              >
                <h1
                  style={{
                    color: "white",
                    fontSize: "64px",
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 700,
                    textShadow:
                      "-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, 0 -4px 0 #000, 0 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000",
                    margin: 0,
                    lineHeight: 1.2,
                    paddingLeft: "12px",
                    paddingRight: "12px",
                  }}
                >
                  {titleText}
                </h1>
              </div>
            )}
          </>
        )}
      </Sequence>

      {/* Second Video Sequence - starts exactly after the first video ends */}
      <Sequence from={transitionFrame}>
        {demoVideoSource && (
          <RemotionVideo
            src={demoVideoSource}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            volume={1}
          />
        )}
      </Sequence>
    </AbsoluteFill>
  );
};
