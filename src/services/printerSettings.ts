// Saved printer choice (AsyncStorage). wmszip kept this in Redux.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrinterMode, normalizeMode } from "../utils/escpos";

export interface PrinterSettings {
  printerAddress: string;
  printerName: string;
  printerMode: PrinterMode;
  /** print a receipt automatically every time a weight is recorded */
  autoPrint: boolean;
  /** 2 = printer type was chosen on purpose (older saves default to paced) */
  modeVersion?: number;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  printerAddress: "",
  printerName: "",
  // Paced writes are safe for every printer (the T12 just prints a little
  // slower); the fast single burst loses data on the AOW built-in printer.
  printerMode: "builtin",
  autoPrint: true,
};

const KEY = "teafarm_printer_settings_v1";

export async function loadPrinterSettings(): Promise<PrinterSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRINTER_SETTINGS;
    const p = JSON.parse(raw);
    return {
      printerAddress: String(p.printerAddress || ""),
      printerName: String(p.printerName || ""),
      // Saves from before the AOW fix stored "standard" by default, not by
      // choice: move them to the safe paced mode once.
      printerMode:
        p.modeVersion === 2 ? normalizeMode(p.printerMode) : "builtin",
      autoPrint: p.autoPrint !== false,
      modeVersion: 2,
    };
  } catch (_) {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

export async function savePrinterSettings(s: PrinterSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...s, modeVersion: 2 }));
  } catch (_) {}
}
