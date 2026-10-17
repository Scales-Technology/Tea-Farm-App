// ─── ESC/POS helpers (borrowed from wmszip/lib/escpos.js) ─────────────────────
// Pure helpers that turn a receipt string into a safe, paced ESC/POS job.
// No React / Bluetooth imports on purpose.
//
// Why this exists
//  - Some handheld printers (the built-in AOW one) drop most of a big burst of
//    data, so the paper feeds but nothing prints. "builtin" mode sends small
//    chunks with a pause between them.
//  - toLocaleTimeString() on newer Android returns a narrow no-break space
//    (U+202F). Sent as "ascii" it becomes a stray control byte, so all text is
//    cleaned to plain 7-bit ASCII first.
//  - Every job starts with an ESC @ reset so it does not inherit the previous
//    job's print mode.

export const ESC = "\x1B";
export const GS = "\x1D";

export type PrinterMode = "standard" | "builtin";

export interface PrinterProfile {
  label: string;
  chunkSize: number;
  chunkDelayMs: number;
  initDelayMs: number;
  dropCut: boolean;
  dropLineSpacing: boolean;
  /** remove ESC ! n / GS ! n (text size): some built-in printers choke on them */
  dropTextSize: boolean;
  /** wait this long after the last chunk so the printer can finish */
  tailDelayMs: number;
}

export const PRINTER_MODES: Record<PrinterMode, PrinterProfile> = {
  standard: {
    label: "External Bluetooth printer (T12, etc.) - fast",
    chunkSize: Infinity,
    chunkDelayMs: 0,
    initDelayMs: 0,
    dropCut: false,
    dropLineSpacing: false,
    dropTextSize: false,
    tailDelayMs: 0,
  },
  builtin: {
    label: "AOW handheld / built-in printer - slow & safe",
    // Small chunks that are cut only at line ends (never inside an ESC/POS
    // command), with a pause between them: the built-in printer has a tiny
    // receive buffer and loses a big burst, which printed only the first line.
    chunkSize: 40,
    chunkDelayMs: 90,
    initDelayMs: 300,
    dropCut: true,
    dropLineSpacing: true,
    dropTextSize: true,
    tailDelayMs: 500,
  },
};

export function normalizeMode(mode: unknown): PrinterMode {
  return typeof mode === "string" &&
    Object.prototype.hasOwnProperty.call(PRINTER_MODES, mode)
    ? (mode as PrinterMode)
    : "standard";
}

const REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
  "\u202F": " ",
  "\u2009": " ",
  "\u2002": " ",
  "\u2003": " ",
  "\u00D7": "x",
};

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Plain 7-bit ASCII; ESC/POS control characters are kept untouched. */
export function toPrinterAscii(text: unknown): string {
  const s = String(text == null ? "" : text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .replace(INVISIBLE, "");

  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (code <= 0x7f) {
      out += ch;
    } else if (REPLACEMENTS[ch] !== undefined) {
      out += REPLACEMENTS[ch];
    } else {
      let plain = "";
      try {
        plain = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      } catch (_err) {
        plain = "";
      }
      out += plain && plain.charCodeAt(0) <= 0x7f ? plain : "?";
    }
  }
  return out;
}

/**
 * ESC/POS commands are 3 bytes (ESC a n, ESC ! n, GS V m ...) or 2 (ESC @).
 * A chunk boundary inside one leaves the printer waiting for the rest and it
 * then eats or prints the next bytes as parameters -- so commands are kept
 * whole.
 */
function toAtoms(text: string): string[] {
  return text.match(/\x1B@|[\x1B\x1D][\s\S][\s\S]|[\s\S]/g) || [];
}

/**
 * Splits `text` into chunks of at most `size` characters. Cuts only between
 * lines where possible, and never inside an ESC/POS command.
 */
export function splitIntoChunks(text: string, size: number): string[] {
  if (!Number.isFinite(size) || size <= 0 || text.length <= size) {
    return text.length ? [text] : [];
  }
  const lines = text.match(/[^\n]*\n|[^\n]+/g) || [];
  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };
  for (const line of lines) {
    if (line.length <= size) {
      if (cur.length + line.length > size) flush();
      cur += line;
    } else {
      flush();
      for (const atom of toAtoms(line)) {
        if (cur.length + atom.length > size) flush();
        cur += atom;
      }
      flush();
    }
  }
  flush();
  return chunks;
}

export interface PrintJob {
  mode: PrinterMode;
  chunks: string[];
  /** delaysMs[i] = how long to wait AFTER sending chunks[i] */
  delaysMs: number[];
  /** pause after the last chunk */
  tailDelayMs: number;
}

export function planPrintJob(
  text: string,
  mode: unknown,
  options: { raw?: boolean } = {},
): PrintJob {
  const key = normalizeMode(mode);
  const profile = PRINTER_MODES[key];

  let body = toPrinterAscii(text);
  if (profile.dropLineSpacing) body = body.replace(/\x1B\x33[\s\S]/g, ""); // ESC 3 n
  if (profile.dropCut) body = body.replace(/\x1D\x56[\s\S]/g, ""); // GS V m
  if (profile.dropTextSize) {
    body = body.replace(/\x1B\x21[\s\S]/g, ""); // ESC ! n
    body = body.replace(/\x1D\x21[\s\S]/g, ""); // GS ! n
  }

  const chunks: string[] = [];
  const delaysMs: number[] = [];

  if (!options.raw) {
    const init = ESC + "@";
    if (body.startsWith(init)) body = body.slice(init.length);
    chunks.push(init);
    delaysMs.push(profile.initDelayMs);
  }

  const pieces = splitIntoChunks(body, profile.chunkSize);
  pieces.forEach((piece, i) => {
    chunks.push(piece);
    delaysMs.push(i === pieces.length - 1 ? 0 : profile.chunkDelayMs);
  });

  return { mode: key, chunks, delaysMs, tailDelayMs: profile.tailDelayMs };
}

/**
 * Three increasingly "real" test pages, so a blank result points at the cause.
 *   1: three plain lines, no control codes
 *   2: reset + normal / double-size / centred text
 *   3: a full-length sample receipt
 */
export function buildTestPayload(level: 1 | 2 | 3): {
  raw: boolean;
  text: string;
} {
  const stamp = "TEST";
  if (level === 1) {
    return {
      raw: true,
      text: `${stamp} 1 PLAIN TEXT\nIf you can read this,\nthe printer is receiving data.\n\n\n\n`,
    };
  }
  if (level === 2) {
    return {
      raw: false,
      text:
        ESC +
        "!" +
        "\x30" +
        ESC +
        "a" +
        "\x01" +
        `${stamp} 2\n` +
        ESC +
        "!" +
        "\x00" +
        ESC +
        "a" +
        "\x00" +
        "Normal size text line\n" +
        ESC +
        "a" +
        "\x01" +
        "Centred text line\n" +
        ESC +
        "a" +
        "\x00" +
        "0123456789 ABCDEFGHIJ\n\n\n\n",
    };
  }
  const sep = "-----------------------------\n";
  let text =
    ESC +
    "!" +
    "\x30" +
    ESC +
    "a" +
    "\x01" +
    "SAMPLE RECEIPT\n" +
    ESC +
    "!" +
    "\x00" +
    ESC +
    "a" +
    "\x00" +
    "\n";
  text += "Farmer: Test Farmer   ID: 001\nLocation: Test Location\n";
  text += "Batch: TEA-000000-00000\nProduct: Tea\n" + sep;
  text += "Weight:            18.75 KG\n";
  text +=
    "Price per KG: Ksh      500.00\nTotal Amount: Ksh     9375.00\n" + sep;
  text +=
    ESC + "a" + "\x01" + "Thank you for your business!\n" + ESC + "a" + "\x00";
  text += "\n\n\n" + GS + "V" + "\x00";
  return { raw: false, text };
}
