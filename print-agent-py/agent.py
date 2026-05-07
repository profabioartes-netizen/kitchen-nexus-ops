"""HuskyPDV Print Agent — servidor local que recebe cupons do HuskyPDV
e envia direto para a impressora padrão do Windows em modo RAW.

Endpoints:
- GET  /ping  → status + nome da impressora padrão
- POST /print → { "content": "<texto>", "copies": 1 }

Bind apenas em 127.0.0.1 (loopback). CORS aberto para qualquer origem
porque navegadores permitem fetch de página HTTPS para 127.0.0.1.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    import win32print  # type: ignore
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

VERSION = "1.0.0"

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


def get_default_printer() -> str:
    if not HAS_WIN32:
        return ""
    try:
        return win32print.GetDefaultPrinter()
    except Exception:
        return ""


@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({
        "ok": True,
        "version": VERSION,
        "printer": get_default_printer(),
        "platform_supported": HAS_WIN32,
    }), 200


@app.route("/print", methods=["POST", "OPTIONS"])
def print_receipt():
    if request.method == "OPTIONS":
        return ("", 204)
    try:
        if not HAS_WIN32:
            return jsonify({"status": "error", "message": "win32print indisponível (não-Windows)"}), 500

        data = request.get_json(silent=True) or {}
        content = data.get("content", "")
        copies = int(data.get("copies", 1) or 1)
        printer_name = data.get("printer") or get_default_printer()

        if not content:
            return jsonify({"status": "error", "message": "content vazio"}), 400
        if not printer_name:
            return jsonify({"status": "error", "message": "Nenhuma impressora padrão configurada no Windows"}), 500

        payload = content.encode("utf-8", errors="replace")

        for _ in range(max(1, copies)):
            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(
                    hPrinter, 1, ("HuskyPDV Print", None, "RAW")
                )
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, payload)
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

        return jsonify({"status": "success", "printer": printer_name}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    print(f"HuskyPDV Print Agent v{VERSION}")
    print(f"Impressora padrão: {get_default_printer() or '(nenhuma)'}")
    print("Escutando em http://127.0.0.1:8080")
    app.run(host="127.0.0.1", port=8080, debug=False)
