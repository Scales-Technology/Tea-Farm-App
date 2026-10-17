// ─── Scale data parser ────────────────────────────────────────────────────────
// Turns whatever the classic-Bluetooth scale sends into a weight in kg.
// Pure function, no React / Bluetooth imports, so it's easy to test.
//
// This is a deliberate, near byte-for-byte port of wmszip's
// `parseBluetoothData` (Screens/RecordPage.js / AdvancementsPage.js) --
// that version is proven against this exact HC-06-style scale hardware in
// the field. An earlier, more "correct-looking" version in this file went
// through two bugs before being replaced with this port:
//
//   1. It rejected a real decode over a single stray noise byte and fell
//      back to parsing raw base64 TEXT, turning a genuine 0.4 kg reading
//      into a displayed "401.00 kg" (the digits "401" were sitting inside
//      the base64 characters themselves, not the decoded weight).
//   2. The fix for #1 added a multi-packet reassembly buffer so a frame
//      split across two Bluetooth packets could still complete. But the
//      display only updates on a SUCCESSFUL parse, so when a later
//      packet's parse failed for any reason, the UI silently kept
//      showing whatever the last successful reading was -- observed on
//      the real device as the weight getting stuck at one number (e.g.
//      "4.00 kg") no matter what was actually on the scale afterwards.
//
// wmszip's version has neither failure mode: it never refuses a decode
// over its CONTENT (atob() only throws when the input isn't valid base64
// at all, in which case the original text is used instead), and every
// received chunk is parsed and shown independently and immediately --
// there is no buffer to get stuck waiting on.
//
// Traded away on purpose to match wmszip, since none of it showed up in
// what this scale actually sends: automatic lb->kg conversion, the
// "ST,GS,+12.50kg" formatted frames, STX/idle-frame filtering, and
// treating a plain digit string (e.g. "1250") that happens to also be
// valid base64 as a literal number -- atob() decodes it first, same as
// wmszip, and only the decoded text's first number counts.

export interface ScaleReading {
  weightKg: number;
  isStable: boolean;
  raw: string;
  timestamp: Date;
}

const NUMBER_RE = /-?\d+(?:\.\d+)?/;

/** atob() if available (Hermes/RN and modern Node both have it), else the
 *  equivalent base64 decode via Buffer. Throws exactly when the input
 *  isn't valid base64, same as atob -- callers decide what to do then. */
function base64Decode(data: string): string {
  if (typeof atob === "function") return atob(data);
  return Buffer.from(data, "base64").toString("latin1");
}

/** Best-effort "make this readable" helper, kept for callers that just
 *  want the decoded text (e.g. for logging). Returns the original text
 *  when it isn't valid base64. */
export function decodeScaleChunk(data: unknown): string {
  if (typeof data === "number") return String(data);
  if (typeof data !== "string" || data.length === 0) return "";
  try {
    return base64Decode(data);
  } catch {
    return data;
  }
}

/**
 * Returns the weight found in `data`, or null when no number is found.
 * Mirrors wmszip exactly: try a base64 decode of the chunk and take the
 * first number out of THAT; only fall back to scanning the original text
 * when the chunk wasn't valid base64 to begin with (decode throws) --
 * not merely when the decode happened not to contain a number.
 */
export function parseScaleData(data: unknown): ScaleReading | null {
  let numericValue: number | null = null;
  let raw = "";

  if (typeof data === "string") {
    raw = data;
    try {
      const decoded = base64Decode(data);
      raw = decoded;
      const m = decoded.match(NUMBER_RE);
      if (m) numericValue = parseFloat(m[0]);
    } catch {
      const m = data.match(NUMBER_RE);
      if (m) numericValue = parseFloat(m[0]);
    }
  } else if (typeof data === "number") {
    numericValue = data;
    raw = String(data);
  }

  if (numericValue === null || !isFinite(numericValue)) return null;
  return {
    weightKg: Math.round(numericValue * 100) / 100,
    isStable: true,
    raw,
    timestamp: new Date(),
  };
}
