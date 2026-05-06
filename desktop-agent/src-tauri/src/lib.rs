// HuskyPDV Agent — Tauri backend.
// Comandos expostos ao frontend:
//   - get_hostname()        -> String
//   - list_printers()       -> Vec<String>      (Windows: PowerShell Get-Printer)
//   - print_test(printer, station, tenant) -> ()  (envia cupom de teste via PowerShell)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn get_hostname() -> String {
    hostname()
}

fn hostname() -> String {
    if let Ok(h) = std::env::var("COMPUTERNAME") {
        return h;
    }
    if let Ok(h) = std::env::var("HOSTNAME") {
        return h;
    }
    "windows".to_string()
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    // Get-Printer | Select -ExpandProperty Name
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Printer | Select-Object -ExpandProperty Name",
        ])
        .creation_flags_no_window()
        .output()
        .map_err(|e| format!("PowerShell falhou: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let printers: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    Ok(printers)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    // Stub para dev em macOS/Linux
    Ok(vec!["Impressora de Teste (dev)".to_string()])
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_test(printer: String, station: String, tenant: String) -> Result<(), String> {
    let body = format!(
        "================================\r\n      HuskyPDV - TESTE\r\n================================\r\n{}\r\nEstacao: {}\r\nData: {}\r\n--------------------------------\r\nSe voce esta vendo este cupom,\r\na impressora esta funcionando!\r\n================================\r\n\r\n\r\n\r\n",
        tenant,
        station,
        chrono_now()
    );

    // Escreve em arquivo temporário e envia com Out-Printer.
    let tmp = std::env::temp_dir().join("huskypdv-test.txt");
    std::fs::write(&tmp, body).map_err(|e| format!("temp write: {e}"))?;

    let cmd = format!(
        "Get-Content -Path '{}' -Raw | Out-Printer -Name '{}'",
        tmp.display().to_string().replace('\'', "''"),
        printer.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .creation_flags_no_window()
        .output()
        .map_err(|e| format!("PowerShell falhou: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_test(_printer: String, _station: String, _tenant: String) -> Result<(), String> {
    println!("[dev] print_test invoked");
    Ok(())
}

fn chrono_now() -> String {
    // Sem dep extra: usa date do PowerShell? Mais simples: timestamp Rust formatado manualmente.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    // Formato simples YYYY-MM-DD HH:MM (UTC). Suficiente pro cupom de teste.
    let days = secs / 86_400;
    let hh = (secs / 3600) % 24;
    let mm = (secs / 60) % 60;
    // 1970-01-01 + days, ignora ano-bissexto pra simplicidade
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let ydays = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        if d < ydays { break; }
        d -= ydays;
        y += 1;
    }
    format!("{:04}-{:03} {:02}:{:02} UTC", y, d + 1, hh, mm)
}

// Trait helper: oculta janela do PowerShell no Windows
trait NoWindow {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}

#[cfg(target_os = "windows")]
impl NoWindow for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW
        self.creation_flags(0x0800_0000)
    }
}

#[cfg(not(target_os = "windows"))]
impl NoWindow for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self { self }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_hostname,
            list_printers,
            print_test
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
