// HuskyPDV Caixa - launcher oficial.
//
// Apenas detecta Chrome ou Edge e abre o HuskyPDV em modo aplicativo
// com impressao automatica. Sem WebSocket, sem servidor local,
// sem comunicacao com impressora.

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

/// URL publica do HuskyPDV. Pode ser sobrescrita em build via env HUSKYPDV_PUBLIC_URL.
const DEFAULT_URL: &str = "https://app.huskypdv.com.br";

fn target_url() -> String {
    let base = option_env!("HUSKYPDV_PUBLIC_URL")
        .unwrap_or(DEFAULT_URL)
        .trim_end_matches('/')
        .to_string();
    format!("{}/caixa", base)
}

#[cfg(target_os = "windows")]
fn find_browser() -> Option<PathBuf> {
    use std::env;

    let program_files = env::var("ProgramFiles").ok();
    let program_files_x86 = env::var("ProgramFiles(x86)").ok();
    let local_appdata = env::var("LocalAppData").ok();

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = &program_files {
        candidates.push(PathBuf::from(format!("{}\\Google\\Chrome\\Application\\chrome.exe", p)));
    }
    if let Some(p) = &program_files_x86 {
        candidates.push(PathBuf::from(format!("{}\\Google\\Chrome\\Application\\chrome.exe", p)));
    }
    if let Some(p) = &local_appdata {
        candidates.push(PathBuf::from(format!("{}\\Google\\Chrome\\Application\\chrome.exe", p)));
    }
    if let Some(p) = &program_files {
        candidates.push(PathBuf::from(format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", p)));
    }
    if let Some(p) = &program_files_x86 {
        candidates.push(PathBuf::from(format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", p)));
    }

    candidates.into_iter().find(|p| p.exists())
}

#[cfg(not(target_os = "windows"))]
fn find_browser() -> Option<PathBuf> {
    None
}

fn launch() -> Result<(), String> {
    let browser = find_browser()
        .ok_or_else(|| "Chrome ou Edge nao encontrado. Instale um deles e tente novamente.".to_string())?;

    let url = target_url();
    let app_arg = format!("--app={}", url);

    Command::new(&browser)
        .arg("--kiosk-printing")
        .arg(app_arg)
        .spawn()
        .map_err(|e| format!("Falha ao abrir o navegador: {}", e))?;

    Ok(())
}

fn main() {
    if let Err(msg) = launch() {
        // Se algo der errado, mostra mensagem nativa do Windows.
        #[cfg(target_os = "windows")]
        {
            use std::ffi::OsStr;
            use std::iter::once;
            use std::os::windows::ffi::OsStrExt;
            extern "system" {
                fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
            }
            let to_wide = |s: &str| -> Vec<u16> {
                OsStr::new(s).encode_wide().chain(once(0)).collect()
            };
            let text = to_wide(&msg);
            let caption = to_wide("HuskyPDV Caixa");
            unsafe {
                MessageBoxW(0, text.as_ptr(), caption.as_ptr(), 0x10);
            }
        }
        #[cfg(not(target_os = "windows"))]
        eprintln!("{}", msg);
        std::process::exit(1);
    }
}
