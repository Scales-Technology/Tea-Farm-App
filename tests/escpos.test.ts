import test from "node:test";
import assert from "node:assert/strict";
import { planPrintJob, splitIntoChunks, PRINTER_MODES } from "../src/utils/escpos";
import { buildCollectionReceipt } from "../src/utils/receipt";

const ESC = "\x1B";
const GS = "\x1D";
const receipt = buildCollectionReceipt({
  sourceType: "farmer",
  name: "Jane Wanjiku",
  idNumber: "12345678",
  place: "Kiambu",
  batchNumber: "TEA-261009-12345",
  weight: 4,
  servedBy: "Peter",
  date: new Date(2026, 9, 9, 11, 44),
});

// A chunk must not end in the middle of an ESC/POS command (ESC x n / GS x n).
function cutInsideCommand(chunk: string): boolean {
  const re = /\x1B@|[\x1B\x1D][\s\S][\s\S]|[\s\S]/g;
  const atoms = chunk.match(re) || [];
  const last = atoms[atoms.length - 1] || "";
  return /^[\x1B\x1D]/.test(last) && last !== ESC + "@" && last.length < 3;
}

test("the AOW (built-in) job is paced, and never cuts an ESC/POS command in two", () => {
  const job = planPrintJob(receipt, "builtin");
  assert.ok(job.chunks.length > 8, "many small writes, not one burst");
  for (const c of job.chunks.slice(1)) {
    assert.ok(c.length <= PRINTER_MODES.builtin.chunkSize, `chunk too big: ${c.length}`);
    assert.ok(!cutInsideCommand(c), `chunk ends inside a command: ${JSON.stringify(c)}`);
  }
  assert.ok(job.delaysMs.slice(0, -1).every((d) => d > 0), "a pause after every write");
  assert.ok(job.tailDelayMs > 0);
});

test("the AOW job drops text-size, cut and line-spacing commands but keeps alignment", () => {
  const joined = planPrintJob(receipt, "builtin").chunks.join("");
  assert.ok(!joined.includes(ESC + "!"));
  assert.ok(!joined.includes(GS + "V"));
  assert.ok(!joined.includes(ESC + "3"));
  assert.ok(joined.includes(ESC + "a"));
});

test("nothing is lost: every line of the receipt reaches the printer", () => {
  const joined = planPrintJob(receipt, "builtin").chunks.join("");
  for (const word of ["TEAFARM PRO", "FARMER RECEIPT", "Jane Wanjiku", "12345678", "TEA-261009-12345", "4.00 KG", "Served by: Peter", "Thank you for your business!"]) {
    assert.ok(joined.includes(word), `missing: ${word}`);
  }
});

test("the external (T12) job is unchanged: reset, then everything in one write", () => {
  const job = planPrintJob(receipt, "standard");
  assert.equal(job.chunks.length, 2);
  assert.equal(job.chunks[0], ESC + "@");
  assert.ok(job.chunks[1].includes(GS + "V"));
  assert.equal(job.tailDelayMs, 0);
});

test("splitIntoChunks keeps commands whole even inside a very long line", () => {
  const line = "x".repeat(38) + ESC + "a\x01" + "y".repeat(60);
  const chunks = splitIntoChunks(line, 40);
  assert.equal(chunks.join(""), line);
  for (const c of chunks) assert.ok(!cutInsideCommand(c));
});
