// ─── Collection receipt (plucker or farmer) ──────────────────────────────────
// Same 58 mm layout as wmszip's receipt (RecordPage.showPrinterReceipt),
// for one weighing.

import { ESC, GS } from "./escpos";

export interface CollectionReceiptInput {
  sourceType: "plucker" | "farmer";
  name: string;
  idNumber?: string;
  /** farm name / pluck zone / location — whichever the record has */
  place?: string;
  phone?: string;
  batchNumber: string;
  weight: number;
  unit?: string;
  notes?: string;
  servedBy: string;
  date?: Date;
}

const SEP = "-----------------------------\n";
const two = (n: number): string => String(n).padStart(2, "0");

// Built by hand: toLocaleString() can insert characters printers cannot show.
const stamp = (d: Date): string =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ` +
  `${two(d.getHours())}:${two(d.getMinutes())}`;

export function buildCollectionReceipt(r: CollectionReceiptInput): string {
  const title =
    r.sourceType === "plucker" ? "PLUCKER RECEIPT" : "FARMER RECEIPT";
  const unit = (r.unit || "kg").toUpperCase();

  let t = ESC + "@";
  t += ESC + "3" + "\x18"; // line spacing (dropped for the built-in printer)
  t += ESC + "a" + "\x01" + "TEAFARM PRO\n" + ESC + "a" + "\x00";
  t += ESC + "!" + "\x30" + ESC + "a" + "\x01" + title + "\n";
  t += ESC + "!" + "\x00" + ESC + "a" + "\x00" + "\n";

  t += `Name: ${r.name.slice(0, 24)}\n`;
  if (r.idNumber) t += `ID No: ${r.idNumber.slice(0, 22)}\n`;
  if (r.place)
    t += `${r.sourceType === "plucker" ? "Zone" : "Farm"}: ${r.place.slice(0, 22)}\n`;
  if (r.phone) t += `Phone: ${r.phone.slice(0, 20)}\n`;
  t += `Batch: ${r.batchNumber}\n`;
  t += "Product: Tea\n";
  t += `Date: ${stamp(r.date || new Date())}\n`;
  t += SEP;
  t += `Weight:${(Number.isFinite(r.weight) ? r.weight : 0).toFixed(2).padStart(15)} ${unit}\n`;
  t += SEP;
  if (r.notes) t += `Note: ${r.notes.slice(0, 48)}\n`;
  t += `Served by: ${r.servedBy.slice(0, 18)}\n\n`;
  t += ESC + "a" + "\x01" + "Thank you for your business!\n";
  t += "==========================\n" + ESC + "a" + "\x00";
  t += "\n\n\n";
  t += GS + "V" + "\x00";
  return t;
}
