// ============================================================
// HuskyPDV — Print Agent (coffee-print)
// Polling loop: busca print_jobs pendentes e envia para a
// impressora térmica configurada localmente.
// ============================================================

require("dotenv").config();
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { renderJob } = require("./renderers");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TENANT_ID,
  STATION = "Caixa",
  PRINTER_DEVICE = "/dev/usb/lp0",
  WIDTH = "48",
  POLL_INTERVAL_MS = "2000",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[fatal] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env");
  process.exit(1);
}
if (!TENANT_ID) {
  console.error("[fatal] TENANT_ID é obrigatório no .env (UUID do estabelecimento)");
  process.exit(1);
}

const width = parseInt(WIDTH, 10) || 48;
const pollMs = parseInt(POLL_INTERVAL_MS, 10) || 2000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("============================================");
console.log("  HuskyPDV Print Agent");
console.log("============================================");
console.log(`  Tenant:   ${TENANT_ID}`);
console.log(`  Station:  ${STATION}`);
console.log(`  Device:   ${PRINTER_DEVICE}`);
console.log(`  Width:    ${width} cols`);
console.log(`  Polling:  ${pollMs}ms`);
console.log("============================================");

// ------------------------------------------------------------
// Envia buffer ESC/POS para a impressora
// ------------------------------------------------------------
function sendToPrinter(buffer) {
  return new Promise((resolve, reject) => {
    try {
      // Linux/macOS: write direto no device
      // Windows: assumir que PRINTER_DEVICE é um path de share/porta
      fs.writeFile(PRINTER_DEVICE, buffer, "binary", (err) => {
        if (err) return reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ------------------------------------------------------------
// Heartbeat: marca printers.last_seen_at para o painel mostrar online
// ------------------------------------------------------------
async function heartbeat() {
  try {
    await supabase
      .from("printers")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("tenant_id", TENANT_ID)
      .eq("station", STATION)
      .eq("active", true);
  } catch (e) {
    // silencioso — não é crítico
  }
}

// ------------------------------------------------------------
// Processa um único job
// ------------------------------------------------------------
async function processJob(job) {
  console.log(`[job ${job.id.slice(0, 8)}] type=${job.payload?.type} station=${job.station}`);

  // Marca como processing
  await supabase.from("print_jobs").update({ status: "processing" }).eq("id", job.id);

  try {
    const buffer = renderJob(job, width);
    if (!buffer) {
      // Tipos especiais sem impressão (ex.: discover_usb)
      await supabase.from("print_jobs").update({ status: "printed", printed_at: new Date().toISOString() }).eq("id", job.id);
      return;
    }
    await sendToPrinter(Buffer.from(buffer, "binary"));
    await supabase
      .from("print_jobs")
      .update({ status: "printed", printed_at: new Date().toISOString() })
      .eq("id", job.id);
    console.log(`[job ${job.id.slice(0, 8)}] OK`);
  } catch (err) {
    console.error(`[job ${job.id.slice(0, 8)}] ERRO:`, err.message);
    await supabase
      .from("print_jobs")
      .update({ status: "error" })
      .eq("id", job.id);
  }
}

// ------------------------------------------------------------
// Loop principal
// ------------------------------------------------------------
async function tick() {
  try {
    const { data: jobs, error } = await supabase
      .from("print_jobs")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .eq("station", STATION)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) {
      console.error("[poll] erro:", error.message);
      return;
    }

    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (e) {
    console.error("[tick] exception:", e.message);
  }
}

// ------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------
let running = true;

async function loop() {
  while (running) {
    await tick();
    await heartbeat();
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

process.on("SIGINT", () => { console.log("\n[shutdown] SIGINT"); running = false; process.exit(0); });
process.on("SIGTERM", () => { console.log("\n[shutdown] SIGTERM"); running = false; process.exit(0); });

loop().catch((e) => {
  console.error("[fatal] loop crashed:", e);
  process.exit(1);
});
