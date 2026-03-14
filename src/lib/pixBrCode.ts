/**
 * Generates a Pix BR Code (EMV) string for static QR codes.
 * Follows the Banco Central do Brasil specification.
 */

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixParams {
  /** Pix key (CPF, CNPJ, email, phone, or random key) */
  pixKey: string;
  /** Recipient name (max 25 chars) */
  recipientName: string;
  /** Recipient city (max 15 chars) */
  city: string;
  /** Amount in BRL (optional for static QR) */
  amount?: number;
  /** Transaction identifier (optional, max 25 chars) */
  txId?: string;
}

export function generatePixBrCode(params: PixParams): string {
  const { pixKey, recipientName, city, amount, txId = "***" } = params;

  // ID 00 - Payload Format Indicator
  let payload = tlv("00", "01");

  // ID 26 - Merchant Account Information (Pix)
  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", pixKey);
  payload += tlv("26", gui + key);

  // ID 52 - Merchant Category Code
  payload += tlv("52", "0000");

  // ID 53 - Transaction Currency (986 = BRL)
  payload += tlv("53", "986");

  // ID 54 - Transaction Amount (optional)
  if (amount && amount > 0) {
    payload += tlv("54", amount.toFixed(2));
  }

  // ID 58 - Country Code
  payload += tlv("58", "BR");

  // ID 59 - Merchant Name
  payload += tlv("59", recipientName.substring(0, 25));

  // ID 60 - Merchant City
  payload += tlv("60", city.substring(0, 15));

  // ID 62 - Additional Data Field Template
  const txIdField = tlv("05", txId.substring(0, 25));
  payload += tlv("62", txIdField);

  // ID 63 - CRC16 (placeholder + calculate)
  payload += "6304";
  const crc = crc16(payload);
  payload += crc;

  return payload;
}
