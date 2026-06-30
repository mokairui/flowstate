"use client";

import { useId } from "react";

interface CapsuleLogoProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * FlowState 胶囊品牌标识
 *
 * 胶囊形状 = 药丸/时间胶囊隐喻，象征将任务「封存」以待后续处理。
 * 内部渐变流动 = Flow 的流动性与心流状态。
 */
export default function CapsuleLogo({
  size = 32,
  animate = true,
  className = "",
}: CapsuleLogoProps) {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FlowState"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7C3AED">
            {animate && (
              <animate
                attributeName="stop-color"
                values="#7C3AED;#22D3EE;#7C3AED"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#22D3EE">
            {animate && (
              <animate
                attributeName="stop-color"
                values="#22D3EE;#7C3AED;#22D3EE"
                dur="4s"
                repeatCount="indefinite"
              />
            )}
          </stop>
        </linearGradient>
        <clipPath id={`${gradId}-clip`}>
          <rect x="4" y="8" width="24" height="16" rx="8" />
        </clipPath>
      </defs>

      {/* Capsule shell */}
      <rect
        x="4"
        y="8"
        width="24"
        height="16"
        rx="8"
        fill={`url(#${gradId})`}
        opacity={0.15}
      />

      {/* Flow line inside capsule */}
      <g clipPath={`url(#${gradId}-clip)`}>
        <path
          d="M2 16c4-4 8-2 12 0s8-2 12 0"
          stroke={`url(#${gradId})`}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        >
          {animate && (
            <animateTransform
              attributeName="transform"
              type="translate"
              values="-2 0; 2 0; -2 0"
              dur="3s"
              repeatCount="indefinite"
            />
          )}
        </path>
        <path
          d="M2 20c4-2 8 0 12 2s8-2 12 2"
          stroke={`url(#${gradId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity={0.5}
        >
          {animate && (
            <animateTransform
              attributeName="transform"
              type="translate"
              values="2 0; -2 0; 2 0"
              dur="4s"
              repeatCount="indefinite"
            />
          )}
        </path>
      </g>

      {/* Capsule border */}
      <rect
        x="4"
        y="8"
        width="24"
        height="16"
        rx="8"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        fill="none"
        opacity={0.6}
      />

      {/* Small dot — the "state" indicator */}
      <circle cx="24" cy="12" r="2" fill={`url(#${gradId})`} opacity={0.8}>
        {animate && (
          <animate
            attributeName="opacity"
            values="0.8;0.3;0.8"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}
