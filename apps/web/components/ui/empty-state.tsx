"use client";

import { type ComponentType, useId } from "react";

export type EmptyStateIllustration = "shipments" | "carrier" | "dashboard";

export type EmptyStateProps = {
  illustration: EmptyStateIllustration;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

function ShipmentsIllustration({ patternId }: { patternId: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <defs>
        <pattern id={patternId} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#0d8f99" opacity="0.12" />
        </pattern>
      </defs>
      <rect x="10" y="18" width="76" height="68" rx="10" fill={`url(#${patternId})`} />
      <rect x="10" y="18" width="76" height="20" rx="10" fill="#0d8f99" />
      <rect x="10" y="28" width="76" height="10" fill="#0d8f99" />
      <rect x="22" y="25" width="20" height="5" rx="2.5" fill="white" opacity="0.45" />
      <rect x="50" y="25" width="14" height="5" rx="2.5" fill="white" opacity="0.25" />
      <rect x="22" y="50" width="48" height="4" rx="2" fill="#0d8f99" opacity="0.22" />
      <rect x="22" y="60" width="34" height="4" rx="2" fill="#0d8f99" opacity="0.15" />
      <rect x="22" y="70" width="42" height="4" rx="2" fill="#0d8f99" opacity="0.1" />
      <circle cx="76" cy="20" r="14" fill="white" stroke="#0d8f99" strokeWidth="2" />
      <path
        d="M70 20l4 4 8-8"
        stroke="#0d8f99"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function CarrierIllustration({ patternId }: { patternId: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <defs>
        <pattern id={patternId} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" stroke="#0d8f99" strokeWidth="0.4" opacity="0.18" fill="none" />
        </pattern>
      </defs>
      <rect
        x="6"
        y="42"
        width="60"
        height="38"
        rx="8"
        fill={`url(#${patternId})`}
        stroke="#0d8f99"
        strokeWidth="1.5"
      />
      <rect
        x="66"
        y="52"
        width="26"
        height="20"
        rx="5"
        fill="#d9f0f1"
        stroke="#0d8f99"
        strokeWidth="1.5"
      />
      <circle cx="20" cy="82" r="8" fill="white" stroke="#0d8f99" strokeWidth="2" />
      <circle cx="20" cy="82" r="3.5" fill="#0d8f99" />
      <circle cx="68" cy="82" r="8" fill="white" stroke="#0d8f99" strokeWidth="2" />
      <circle cx="68" cy="82" r="3.5" fill="#0d8f99" />
      <circle cx="48" cy="22" r="16" fill="#eef4f3" stroke="#0d8f99" strokeWidth="2" />
      <circle cx="48" cy="22" r="9" fill="#d9f0f1" />
      <path
        d="M43 22h10M48 17v10"
        stroke="#0d8f99"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function DashboardIllustration({ patternId }: { patternId: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <defs>
        <pattern id={patternId} x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="#0d8f99" strokeWidth="0.5" opacity="0.15" fill="none" />
        </pattern>
      </defs>
      <rect x="6" y="28" width="84" height="56" rx="8" fill={`url(#${patternId})`} />
      <rect x="14" y="70" width="14" height="8" rx="3" fill="#d9f0f1" />
      <rect x="32" y="56" width="14" height="22" rx="3" fill="#0d8f99" opacity="0.25" />
      <rect x="50" y="42" width="14" height="36" rx="3" fill="#0d8f99" opacity="0.55" />
      <rect x="68" y="30" width="14" height="48" rx="3" fill="#0d8f99" />
      <path d="M6 80h84" stroke="#e3ecea" strokeWidth="1.5" fill="none" />
      <path
        d="M21 66 Q39 51 57 38 Q68 31 75 30"
        stroke="#0d8f99"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="8" y="8" width="34" height="16" rx="8" fill="#0d8f99" />
      <rect x="12" y="13" width="10" height="6" rx="3" fill="white" opacity="0.5" />
      <rect x="26" y="13" width="12" height="6" rx="3" fill="white" opacity="0.3" />
    </svg>
  );
}

const ILLUSTRATIONS: Record<
  EmptyStateIllustration,
  ComponentType<{ patternId: string }>
> = {
  shipments: ShipmentsIllustration,
  carrier: CarrierIllustration,
  dashboard: DashboardIllustration,
};

export function EmptyState({
  illustration,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const patternId = useId();
  const Illustration = ILLUSTRATIONS[illustration];

  return (
    <div className="flex flex-col items-center px-8 py-16">
      <Illustration patternId={patternId} />
      <h3 className="mt-4 text-lg font-semibold text-text">{title}</h3>
      <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-text-3">
        {description}
      </p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
