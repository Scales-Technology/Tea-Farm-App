// ─── The one place the app sends a receipt to the printer ─────────────────────
// Borrowed from wmszip/lib/printService.js. Differences: settings are passed
// in (no Redux store here).
//
// Every receipt gets the same treatment: ASCII clean-up, a guaranteed printer
// reset, a connection check (reconnects if the printer dropped), and — for the
// built-in printer — small paced writes. See utils/escpos.ts for why.

import RNBluetoothClassic from "react-native-bluetooth-classic";
import { planPrintJob, buildTestPayload, PrinterMode } from "../utils/escpos";

type WriteFn = (
  address: string,
  data: string,
  encoding?: string,
) => Promise<any>;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface PrintOptions {
  address: string;
  mode: PrinterMode;
  raw?: boolean;
}

/** Makes sure the printer has a live connection; throws a readable error if not. */
export async function ensurePrinterConnected(address: string): Promise<void> {
  let connected = true;
  try {
    connected = await RNBluetoothClassic.isDeviceConnected(address);
  } catch (_err) {
    return; // could not tell — let the write decide
  }
  if (connected) return;
  try {
    await RNBluetoothClassic.connectToDevice(address);
    // give a freshly (re)connected printer a moment before the first byte
    await sleep(400);
  } catch (err: any) {
    throw new Error(
      "Could not connect to the printer (" +
        (err && err.message ? err.message : "unknown error") +
        "). Check it is switched on and chosen in Devices.",
    );
  }
}

/** Sends `text` to the chosen printer. Throws with a readable message on failure. */
export async function printReceipt(
  write: WriteFn,
  text: string,
  options: PrintOptions,
): Promise<void> {
  if (!options.address) {
    throw new Error("No printer selected. Open Devices and choose a printer.");
  }

  await ensurePrinterConnected(options.address);

  const job = planPrintJob(text, options.mode, { raw: options.raw });
  for (let i = 0; i < job.chunks.length; i++) {
    const accepted = await write(options.address, job.chunks[i], "ascii");
    if (accepted === false)
      throw new Error("The printer did not accept the data.");
    if (job.delaysMs[i] > 0) await sleep(job.delaysMs[i]);
  }
  // let a slow built-in printer finish before anything else touches the link
  if (job.tailDelayMs > 0) await sleep(job.tailDelayMs);
}

/** Diagnostic pages for Devices > Test print. level: 1, 2 or 3. */
export async function printTestPage(
  write: WriteFn,
  level: 1 | 2 | 3,
  options: PrintOptions,
): Promise<void> {
  const { raw, text } = buildTestPayload(level);
  await printReceipt(write, text, { ...options, raw });
}
