// HuskyPDV Agent — Tauri backend.
// Comandos:
//   - get_hostname()                 -> String
//   - list_printers()                -> Vec<String>     (PowerShell Get-Printer)
//   - print_raw(printer, text)       -> ()              (escreve em arquivo temp + Out-Printer)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn get_hostname() -> String {
    if let Ok(h) = std::env::var("COMPUTERNAME") { return h; }
    if let Ok(h) = std::env::var("HOSTNAME") { return h; }
    "windows".to_string()
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            "Get-Printer | Select-Object -ExpandProperty Name",
        ])
        .creation_flags_no_window()
        .output()
        .map_err(|e| format!("PowerShell falhou: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    Ok(vec!["Impressora de Teste (dev)".to_string()])
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_raw(printer: String, text: String) -> Result<(), String> {
    use std::io::Write;
    // gera arquivo temporário único pra evitar colisão entre jobs paralelos
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos()).unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("huskypdv-job-{nanos}.txt"));

    let mut f = std::fs::File::create(&tmp).map_err(|e| format!("temp write: {e}"))?;
    // BOM UTF-8 para que Get-Content (PowerShell 5.1) detecte a codificação correta
    // e os acentos (ç, ã, é...) sejam impressos sem virar mojibake.
    f.write_all(&[0xEF, 0xBB, 0xBF]).map_err(|e| format!("temp write: {e}"))?;
    f.write_all(text.as_bytes()).map_err(|e| format!("temp write: {e}"))?;
    drop(f);

    // -Encoding UTF8 reforça a leitura como UTF-8 também no PowerShell 7.x.
    let cmd = format!(
        "Get-Content -Encoding UTF8 -Raw -Path '{}' | Out-Printer -Name '{}'",
        tmp.display().to_string().replace('\'', "''"),
        printer.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .creation_flags_no_window()
        .output()
        .map_err(|e| format!("PowerShell falhou: {e}"))?;

    let _ = std::fs::remove_file(&tmp);

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_raw(printer: String, text: String) -> Result<(), String> {
    println!("[dev] print_raw -> {printer}\n{text}");
    Ok(())
}

trait NoWindow { fn creation_flags_no_window(&mut self) -> &mut Self; }

#[cfg(target_os = "windows")]
impl NoWindow for Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        self.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .invoke_handler(tauri::generate_handler![get_hostname, list_printers, print_raw])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
