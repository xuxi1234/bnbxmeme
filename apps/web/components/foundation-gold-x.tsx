"use client";

import { useId } from "react";

type FoundationGoldXProps = Readonly<{
  className?: string;
}>;

const X_PATH = "M17 7 50 39 83 7 94 19 63 50 94 81 82 93 50 62 18 93 6 81 37 50 6 19Z";

export function FoundationGoldX({ className }: FoundationGoldXProps) {
  const id = useId().replaceAll(":", "");
  const faceId = `${id}-foundationGoldFace`;
  const edgeId = `${id}-foundationGoldEdge`;
  const highlightId = `${id}-foundationGoldHighlight`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={edgeId} x1="18" y1="8" x2="82" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9A5A00" />
          <stop offset="0.48" stopColor="#5E3100" />
          <stop offset="1" stopColor="#2A1400" />
        </linearGradient>
        <linearGradient id={faceId} x1="12" y1="8" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF4A6" />
          <stop offset="0.22" stopColor="#FFD75A" />
          <stop offset="0.52" stopColor="#F3A90A" />
          <stop offset="0.78" stopColor="#C87800" />
          <stop offset="1" stopColor="#FFCA32" />
        </linearGradient>
        <linearGradient id={highlightId} x1="12" y1="10" x2="73" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#FFE889" stopOpacity="0.42" />
          <stop offset="1" stopColor="#FFE889" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={X_PATH} fill={`url(#${edgeId})`} transform="translate(0 5)" />
      <path d={X_PATH} fill={`url(#${faceId})`} stroke="#FFD95B" strokeWidth="1.25" />
      <path
        d="M18 10 50 42 82 10 88 17 50 54 12 17Z"
        fill={`url(#${highlightId})`}
        opacity="0.78"
      />
      <path
        d="M17 7 50 39 83 7"
        fill="none"
        stroke="#FFF8C8"
        strokeLinecap="round"
        strokeWidth="2"
        opacity="0.72"
      />
    </svg>
  );
}
