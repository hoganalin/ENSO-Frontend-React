import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/services/db/auth";
import type { ProfileRow } from "@/services/db/types";

export function useMember() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getCurrentProfile().then(p => { if (active) setProfile(p); })
      .catch(() => { if (active) setError("會員資料讀取失敗，請稍後重試。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return { profile, loading, error, retry: () => retry(n => n + 1) };
}
