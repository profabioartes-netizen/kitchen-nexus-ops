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

// ---------- Logging persistente em %LOCALAPPDATA%\HuskyPDV Agent\agent.log ----------

fn log_path() -> std::path::PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("HuskyPDV Agent");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("agent.log")
}

fn log_line(msg: &str) {
    use std::io::Write;
    let path = log_path();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

#[cfg(target_os = "windows")]
fn show_error_box(title: &str, body: &str) {
    use std::os::windows::ffi::OsStrExt;
    let to_wide = |s: &str| -> Vec<u16> {
        std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    };
    let title_w = to_wide(title);
    let body_w = to_wide(body);
    unsafe {
        winapi::um::winuser::MessageBoxW(
            std::ptr::null_mut(),
            body_w.as_ptr(),
            title_w.as_ptr(),
            winapi::um::winuser::MB_ICONERROR | winapi::um::winuser::MB_OK,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_error_box(_title: &str, _body: &str) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Captura panics e grava no log + MessageBox antes de morrer.
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}");
        log_line(&msg);
        show_error_box(
            "HuskyPDV Agent — erro fatal",
            &format!(
                "{msg}\n\nLog: {}\n\nPossíveis causas:\n• Microsoft Edge WebView2 Runtime ausente.\n• Antivírus bloqueando a execução.\n• Pasta de instalação sem permissão.",
                log_path().display()
            ),
        );
    }));

    log_line(&format!("Iniciando HuskyPDV Agent v{}", env!("CARGO_PKG_VERSION")));

    let result = std::panic::catch_unwind(|| {
        tauri::Builder::default()
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_store::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
            .invoke_handler(tauri::generate_handler![get_hostname, list_printers, print_raw])
            .run(tauri::generate_context!())
    });

    match result {
        Ok(Ok(())) => log_line("Encerrado normalmente."),
        Ok(Err(e)) => {
            let msg = format!("Tauri falhou ao iniciar: {e}");
            log_line(&msg);
            show_error_box(
                "HuskyPDV Agent — falha ao iniciar",
                &format!(
                    "{msg}\n\nLog: {}\n\nProvavelmente o Microsoft Edge WebView2 Runtime não está instalado neste computador. Baixe em:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703",
                    log_path().display()
                ),
            );
        }
        Err(_) => log_line("Panic não capturado pelo hook."),
    }
}
