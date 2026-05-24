"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted only while the player's job_started_at flag is set. Triggers a
 * router.refresh() every 4s so the server component re-runs and either
 * reveals the finished portraits or surfaces the job_error.
 */
export function PollWhileGenerating() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
