"use client";
import { useMemo } from "react";
import { AccountApp } from "../components/account-app";
import { platformClient } from "../lib/platform-client";
export default function Page() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return url && key ? platformClient({ url, key }) : null;
  }, []);
  return <AccountApp client={client} />;
}
