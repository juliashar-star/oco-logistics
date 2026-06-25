import { Suspense } from "react";
import { VerifiedToast } from "@/components/verified-toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <VerifiedToast />
      </Suspense>
    </>
  );
}
