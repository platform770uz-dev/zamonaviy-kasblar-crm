import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createLoginHandler } from "./file2.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(createLoginHandler(admin, () => Deno.env.get("TELEGRAM_BOT_TOKEN") ?? ""));
