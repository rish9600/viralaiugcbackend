import React from "react";
import { AbsoluteFill, staticFile, Video as RemotionVideo } from "remotion";

/**
 * Component for displaying two videos with configurable split layout
 *
 * @param {Object} props Component props
 * @param {string} props.videoSource Path or URL to the first video
 * @param {string} props.demoVideoSource Path or URL to the second video
 * @param {string} props.splitPosition Layout of the videos (left-right, right-left, top-bottom, bottom-top)
 */
export const SplitScreenVideo = ({
  videoSource,
  demoVideoSource,
  splitPosition,
}) => {
  // Check if video sources are provided
  const hasFirstVideo = videoSource && typeof videoSource === "string";
  const hasSecondVideo = demoVideoSource && typeof demoVideoSource === "string";

  // Determine flex direction based on split position
  let flexDirection = "row"; // Default for left-right and right-left
  if (splitPosition === "top-bottom" || splitPosition === "bottom-top") {
    flexDirection = "column";
  }

  // Determine video order based on split position
  const reverseOrder =
    splitPosition === "right-left" || splitPosition === "bottom-top";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        display: "flex",
        flexDirection: flexDirection,
        overflow: "hidden", // Ensure content stays within bounds
      }}
    >
      {/* First video container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          order: reverseOrder ? 1 : 0,
          minHeight:
            splitPosition === "top-bottom" || splitPosition === "bottom-top"
              ? "50%"
              : "auto",
          minWidth:
            splitPosition === "left-right" || splitPosition === "right-left"
              ? "50%"
              : "auto",
        }}
      >
        {hasFirstVideo ? (
          <RemotionVideo
            src={videoSource}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            volume={1}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#333",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ color: "white", fontSize: "24px" }}>Video 1</div>
          </div>
        )}
      </div>

      {/* Second video container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          order: reverseOrder ? 0 : 1,
          minHeight:
            splitPosition === "top-bottom" || splitPosition === "bottom-top"
              ? "50%"
              : "auto",
          minWidth:
            splitPosition === "left-right" || splitPosition === "right-left"
              ? "50%"
              : "auto",
        }}
      >
        {hasSecondVideo ? (
          <RemotionVideo
            src={demoVideoSource}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            volume={0}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#555",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ color: "white", fontSize: "24px" }}>Video 2</div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
