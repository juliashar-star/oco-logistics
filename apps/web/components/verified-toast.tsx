"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function VerifiedToast() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("verified") !== "true") return;

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.textContent = "Email подтверждён ✓";
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "9999",
      padding: "12px 20px",
      borderRadius: "12px",
      background: "var(--success-soft)",
      color: "var(--success)",
      fontSize: "14px",
      fontWeight: "600",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      border: "1px solid var(--success)",
    });
    document.body.appendChild(toast);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("verified");
    const next = params.toString() ? `?${params.toString()}` : "";
    router.replace(`/dashboard${next}`);

    const timer = window.setTimeout(() => {
      toast.remove();
    }, 4000);

    return () => {
      window.clearTimeout(timer);
      toast.remove();
    };
  }, [router, searchParams]);

  return null;
}
