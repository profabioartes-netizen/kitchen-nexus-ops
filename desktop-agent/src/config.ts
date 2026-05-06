// Public config — safe to ship inside the binary.
// O token de agente (sensível) é gravado em runtime via tauri-plugin-store em
// `appConfigDir/agent.json` (criptografado pelo Windows DPAPI no nível do FS via
// permissões de usuário; idealmente futuramente usar tauri-plugin-stronghold).
export const SUPABASE_URL = "https://rydfhkphvhkqxwpqoeku.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5ZGZoa3BodmhrcXh3cHFvZWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTYwMzUsImV4cCI6MjA5MzU3MjAzNX0.2u0w1SiYUoG34A0SRqUnvQOBjy94xkvfq0p3XjLdgzo";
export const AGENT_VERSION = "0.1.0";
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const POLL_INTERVAL_MS = 4_000;
export const POLL_BATCH = 5;
