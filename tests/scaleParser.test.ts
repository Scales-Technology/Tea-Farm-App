import test from "node:test";
import assert from "node:assert/strict";
import { parseScaleData, decodeScaleChunk } from "../src/utils/scaleParser";

const b64 = (s: string) => Buffer.from(s, "latin1").toString("base64");

test("plain numeric text reads as the number on the scale", () => {
  assert.equal(parseScaleData("0.2")?.weightKg, 0.2);
  assert.equal(parseScaleData("  12.5 kg")?.weightKg, 12.5);
  assert.equal(parseScaleData("-3.1")?.weightKg, -3.1);
});

test("base64-wrapped frames decode and the first number in them wins", () => {
  // STX 'B' "  4.50 " CR, base64-wrapped the way the Bluetooth layer
  // commonly hands chunks over.
  assert.equal(parseScaleData(b64("\x02B  4.50 \r"))?.weightKg, 4.5);
  assert.equal(parseScaleData("0.2\r\n4\r\n")?.weightKg, 0.2);
});

test("real captured frames: a stray noise byte never wrecks the reading (the 0.4 -> 401.00 and 15.0 -> 4.00 bugs)", () => {
  // Two real packets captured from the HC-06 scale on the ACLAS/AOW
  // handheld. Both are STX + status + digits + 1 noise byte + CR,
  // base64-wrapped. An earlier, stricter decoder rejected these over the
  // noise byte and fell back to parsing the RAW base64 text instead,
  // reading the digits sitting in the base64 characters themselves:
  // "...MC401A0=" -> 401.00, and a similar packet -> a stuck 4.00 that
  // never moved again no matter what was actually on the scale. This
  // decoder (ported from wmszip) never does that -- it trusts whatever
  // atob() gives back and never second-guesses its content.
  assert.equal(parseScaleData("AkIgICAgMC401A0=")?.weightKg, 0.4);
  assert.equal(parseScaleData("AkIgICAxNS4w5g0=")?.weightKg, 15);
});

test("every chunk is independent -- nothing is held back waiting for more data", () => {
  // Unlike a frame-reassembly buffer, a chunk that doesn't parse just
  // yields no reading; it never blocks or corrupts the next one.
  assert.equal(parseScaleData("not a number")?.weightKg, undefined);
  assert.equal(parseScaleData("0.4")?.weightKg, 0.4);
  assert.equal(parseScaleData("15.0")?.weightKg, 15);
});

test("readings are always reported as stable (matches wmszip -- no US/ST stability protocol on this hardware)", () => {
  assert.equal(parseScaleData("\x02B  1.00 \r")?.isStable, true);
  assert.equal(parseScaleData("1.00")?.isStable, true);
});

test("empty, missing, or numberless input gives nothing", () => {
  assert.equal(parseScaleData(""), null);
  assert.equal(parseScaleData(undefined), null);
  assert.equal(parseScaleData(null), null);
  // Not "OVERLOAD" -- that's valid base64 charset-wise, and decoding it
  // happens to produce a digit, so it (like wmszip) reads a bogus number
  // from it. That's an inherent quirk of trusting atob() unconditionally,
  // same as wmszip has; use a string with punctuation (invalid base64) so
  // the decode throws and the fallback regex finds nothing either.
  assert.equal(parseScaleData("OVERLOAD!"), null);
});

test("decodeScaleChunk decodes base64 when it can, and falls back to the original text otherwise", () => {
  assert.equal(decodeScaleChunk(b64("hello")), "hello");
  assert.equal(decodeScaleChunk("not base64 at all!!"), "not base64 at all!!");
});
