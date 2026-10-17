// Receipt printer settings: choose the printer, printer type, auto-print,
// test prints. Ported from wmszip's SettingsPage.

import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Switch,
} from "react-native";
import { colors, fonts, spacing, radius } from "../theme";
import { PrinterController, PrinterDevice } from "../hooks/usePrinter";
import { PRINTER_MODES, PrinterMode } from "../utils/escpos";

interface Props {
  visible: boolean;
  onClose: () => void;
  printer: PrinterController;
}

export default function PrinterModal({ visible, onClose, printer }: Props) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (visible) {
      setPicking(false);
      setMessage("");
      printer.refreshPaired();
      printer.refreshStatus();
    }
  }, [visible]);

  const choose = async (d: PrinterDevice) => {
    setPicking(false);
    setBusy(true);
    setMessage("");
    const ok = await printer.selectPrinter(d);
    setMessage(
      ok
        ? `Printer connected: ${d.name || d.address}`
        : "Could not connect. Check the printer is switched on and paired with this phone."
    );
    setBusy(false);
  };

  const runTest = async (level: 1 | 2 | 3) => {
    if (!printer.settings.printerAddress) {
      setMessage("Select a printer first.");
      return;
    }
    setBusy(true);
    setMessage(`Sending test ${level}…`);
    try {
      await printer.printTest(level);
      setMessage(`Test ${level} sent. If the paper is blank, try the next test.`);
    } catch (e: any) {
      setMessage(`Test ${level} failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const renderDevice = (d: PrinterDevice) => (
    <TouchableOpacity key={d.address} style={styles.deviceItem} onPress={() => choose(d)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.deviceName}>{d.name || d.address}</Text>
        <Text style={styles.deviceAddr}>{d.address}</Text>
      </View>
      {d.address === printer.settings.printerAddress && (
        <Text style={styles.selectedTag}>Selected</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{picking ? "Select printer" : "🖨️ Receipt Printer"}</Text>
          <TouchableOpacity onPress={picking ? () => setPicking(false) : onClose}>
            <Text style={styles.close}>{picking ? "Back" : "Close"}</Text>
          </TouchableOpacity>
        </View>

        {picking ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>Paired devices</Text>
            {printer.paired.length === 0 && (
              <Text style={styles.hint}>
                None found. Pair the printer in the phone's Bluetooth settings first, or scan below.
              </Text>
            )}
            {printer.paired.map(renderDevice)}
            {printer.found.length > 0 && <Text style={styles.sectionTitle}>Found nearby</Text>}
            {printer.found.map(renderDevice)}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={printer.scan}
              disabled={printer.scanning}
            >
              <Text style={styles.primaryBtnText}>
                {printer.scanning ? "Scanning…" : "Scan for new devices"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>Printer</Text>
            <TouchableOpacity style={styles.selectRow} onPress={() => setPicking(true)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>
                  {printer.settings.printerName || "Select printer"}
                </Text>
                {!!printer.settings.printerAddress && (
                  <Text style={styles.deviceAddr}>{printer.settings.printerAddress}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.status,
                  { color: printer.connected ? colors.success : colors.error },
                ]}
              >
                {printer.connecting ? "Connecting…" : printer.connected ? "Connected" : "Not connected"}
              </Text>
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>Print receipt automatically</Text>
                <Text style={styles.deviceAddr}>
                  Prints for the plucker / farmer every time a weight is recorded.
                </Text>
              </View>
              <Switch
                value={printer.settings.autoPrint}
                onValueChange={printer.setAutoPrint}
                trackColor={{ true: colors.collectorColor }}
              />
            </View>

            <Text style={styles.sectionTitle}>Printer type</Text>
            {(Object.keys(PRINTER_MODES) as PrinterMode[]).map((key) => {
              const active = printer.settings.printerMode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                  onPress={() => printer.setPrinterMode(key)}
                >
                  <Text style={[styles.radio, active && { color: colors.collectorColor }]}>
                    {active ? "◉" : "○"}
                  </Text>
                  <Text style={styles.optionText}>{PRINTER_MODES[key].label}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.hint}>
              Choose "Built-in printer" for the handheld's own printer. It sends the receipt slowly
              in small pieces.
            </Text>

            <Text style={styles.sectionTitle}>Test print</Text>
            {([
              [1, "Test 1 — plain text only"],
              [2, "Test 2 — formatted text"],
              [3, "Test 3 — full sample receipt"],
            ] as [1 | 2 | 3, string][]).map(([level, label]) => (
              <TouchableOpacity
                key={level}
                style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => runTest(level)}
              >
                <Text style={styles.primaryBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {(busy || !!message) && (
          <View style={styles.footer}>
            {busy && <ActivityIndicator color={colors.collectorColor} style={{ marginRight: 8 }} />}
            <Text style={styles.footerText}>{message || "Working…"}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    paddingTop: spacing.xl,
    backgroundColor: colors.collectorColor,
  },
  title: { color: colors.textOnPrimary, fontSize: fonts.sizes.xl, fontWeight: "800" },
  close: { color: colors.textOnPrimary, fontSize: fonts.sizes.md, fontWeight: "700" },
  scroll: { padding: spacing.md, paddingBottom: 100 },
  sectionTitle: {
    fontSize: fonts.sizes.md,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 4, marginBottom: 4 },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  deviceName: { fontSize: fonts.sizes.md, fontWeight: "700", color: colors.textPrimary },
  deviceAddr: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  selectedTag: { color: colors.success, fontWeight: "700", fontSize: fonts.sizes.sm },
  status: { fontSize: fonts.sizes.sm, fontWeight: "700" },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  optionRowActive: { borderColor: colors.collectorColor },
  radio: { fontSize: 20, color: colors.textMuted, marginRight: spacing.sm },
  optionText: { flex: 1, fontSize: fonts.sizes.md, color: colors.textPrimary },
  primaryBtn: {
    backgroundColor: colors.collectorColor,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontWeight: "700", fontSize: fonts.sizes.md },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { flex: 1, color: colors.textSecondary, fontSize: fonts.sizes.sm },
});