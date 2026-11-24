"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase Auth client (sign-in only; app data lives in our API). Null when not configured or on the server. */
export const supabase = url && key && typeof window !== "undefined" ? createClient(url, key) : null;
export const authConfigured = Boolean(url && key);
