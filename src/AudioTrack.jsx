import React from "react";
import { Audio, useVideoConfig } from "remotion";

// TODO: Use enableAudio or pass a param externalAudioOnly to make the volume 100%
export const AudioTrack = ({ enableAudio, audioSource, offsetInSeconds }) => {
  const { fps } = useVideoConfig();

  // Convert offset to frames
  const offsetInFrames = Math.round(offsetInSeconds * fps);

  return (
    <Audio
      src={audioSource}
      startFrom={offsetInFrames} // Start audio from specified offset in frames
      volume={0.12} // Volume for external audio - 12%
    />
  );
};
