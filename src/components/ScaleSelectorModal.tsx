// ─── ScaleSelectorModal — BLE + Classic Bluetooth ────────────────────────────
// Drop in at: src/components/ScaleSelectorModal.tsx
// Export type ScaleType so CollectionScreen can import it.
import React from "react";
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Alert,
} from "react-native";
import { colors, fonts, spacing, radius, shadows } from "../theme";

export type ScaleType = "ble" | "classic";

interface ScaleSelectorModalProps {
  visible: boolean;
  onClose: () => void;

  // Which protocol is currently active
  activeScaleType: ScaleType;
  onChangeScaleType: (t: ScaleType) => void;

  // ── BLE ──────────────────────────────────────────────────────────────────
  bleConnectedDevice:    any | null;
  bleSavedDevice:        any | null;
  bleScaleReading:       any | null;
  bleIsScanning:         boolean;
  bleIsAutoConnecting:   boolean;
  bleDiscoveredDevices:  any[];
  onBleStartScan:        () => void;
  onBleStopScan:         () => void;
  onBleConnect:          (device: any) => void;
  onBleDisconnect:       () => void;
  onBleClearSaved:       () => void;

  // ── Classic BT ───────────────────────────────────────────────────────────
  classicConnectedDevice: any | null;
  classicSavedDevice:     any | null;
  classicScaleReading:    any | null;
  classicIsConnecting:    boolean;
  classicIsScanning:      boolean;
  classicIsEnabled:       boolean;
  classicError:           string | null;
  classicPairedDevices:   any[];
  onClassicGetPaired:     () => void;
  onClassicConnect:       (device: any) => void;
  onClassicDisconnect:    () => void;
  onClassicClearSaved:    () => void;
  onClassicEnableBt:      () => void;
}

const { height } = Dimensions.get("window");

export default function ScaleSelectorModal({
  visible, onClose,
  activeScaleType, onChangeScaleType,
  // BLE
  bleConnectedDevice, bleSavedDevice, bleScaleReading,
  bleIsScanning, bleIsAutoConnecting, bleDiscoveredDevices,
  onBleStartScan, onBleStopScan, onBleConnect,
  onBleDisconnect, onBleClearSaved,
  // Classic
  classicConnectedDevice, classicSavedDevice, classicScaleReading,
  classicIsConnecting, classicIsScanning, classicIsEnabled,
  classicError, classicPairedDevices,
  onClassicGetPaired, onClassicConnect,
  onClassicDisconnect, onClassicClearSaved, onClassicEnableBt,
}: ScaleSelectorModalProps) {

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚖️ Scale Connection</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Protocol toggle */}
          <View style={styles.protocolToggle}>
            <TouchableOpacity
              style={[styles.protocolBtn, activeScaleType === "ble" && styles.protocolBtnActive]}
              onPress={() => onChangeScaleType("ble")}
            >
              <Text style={styles.protocolIcon}>📡</Text>
              <Text style={[styles.protocolText, activeScaleType === "ble" && styles.protocolTextActive]}>BLE Scale</Text>
              {bleConnectedDevice && <View style={[styles.activeDot, { backgroundColor: colors.success }]} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.protocolBtn, activeScaleType === "classic" && styles.protocolBtnActive]}
              onPress={() => { onChangeScaleType("classic"); if (!classicIsEnabled) onClassicEnableBt(); }}
            >
              <Text style={styles.protocolIcon}>🔵</Text>
              <Text style={[styles.protocolText, activeScaleType === "classic" && styles.protocolTextActive]}>Classic BT</Text>
              {classicConnectedDevice && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

            {/* ══════════ BLE TAB ══════════ */}
            {activeScaleType === "ble" && (
              <>
                {/* Connected device */}
                {bleConnectedDevice ? (
                  <View style={[styles.connectedCard, { borderColor: colors.success + "60", backgroundColor: colors.successLight }]}>
                    <View style={styles.connectedLeft}>
                      <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                      <View>
                        <Text style={styles.connectedName}>{bleConnectedDevice.name || bleSavedDevice?.name || "BLE Scale"}</Text>
                        <Text style={styles.connectedSub}>
                          {bleScaleReading
                            ? `Live: ${bleScaleReading.weight.toFixed(2)} ${bleScaleReading.unit} ${bleScaleReading.isStable ? "✅ Stable" : "⏳"}`
                            : "Connected — waiting for reading..."}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.disconnectBtn} onPress={onBleDisconnect}>
                      <Text style={styles.disconnectText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.connectedCard, { backgroundColor: colors.warningLight, borderColor: colors.warning + "60" }]}>
                    <View style={[styles.statusDot, { backgroundColor: bleIsAutoConnecting ? colors.warning : colors.error }]} />
                    <Text style={[styles.connectedName, { color: colors.warning }]}>
                      {bleIsAutoConnecting ? "Auto-connecting..." : bleSavedDevice ? `Saved: ${bleSavedDevice.name}` : "No BLE scale connected"}
                    </Text>
                  </View>
                )}

                {/* Saved device */}
                {bleSavedDevice && !bleConnectedDevice && (
                  <View style={styles.savedCard}>
                    <Text style={styles.savedIcon}>💾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedName}>{bleSavedDevice.name}</Text>
                      <Text style={styles.savedSub}>Saved — auto-connects on next open</Text>
                    </View>
                    <TouchableOpacity onPress={onBleClearSaved}>
                      <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Scan button */}
                {!bleConnectedDevice && (
                  <TouchableOpacity
                    style={[styles.actionBtn, bleIsScanning && { backgroundColor: colors.error }]}
                    onPress={bleIsScanning ? onBleStopScan : onBleStartScan}
                  >
                    <Text style={styles.actionBtnText}>{bleIsScanning ? "⏹ Stop Scanning" : "🔍 Scan for BLE Scale"}</Text>
                  </TouchableOpacity>
                )}

                {bleIsScanning && bleDiscoveredDevices.length === 0 && (
                  <View style={styles.scanningWrap}>
                    <Text style={styles.scanningText}>🔄 Scanning for nearby BLE devices...</Text>
                  </View>
                )}

                {bleDiscoveredDevices.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Nearby Devices ({bleDiscoveredDevices.length})</Text>
                    {bleDiscoveredDevices.map(device => (
                      <TouchableOpacity key={device.id} style={styles.deviceCard} onPress={() => onBleConnect(device)}>
                        <View style={styles.deviceLeft}>
                          <Text style={styles.deviceIcon}>⚖️</Text>
                          <View>
                            <Text style={styles.deviceName}>{device.name || device.localName || "Unknown Device"}</Text>
                            <Text style={styles.deviceId}>{device.id.substring(0, 20)}...</Text>
                          </View>
                        </View>
                        <View style={styles.connectBtn}>
                          <Text style={styles.connectBtnText}>Connect</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            {/* ══════════ CLASSIC BT TAB ══════════ */}
            {activeScaleType === "classic" && (
              <>
                {/* BT not enabled */}
                {!classicIsEnabled && (
                  <TouchableOpacity style={styles.btEnableCard} onPress={onClassicEnableBt}>
                    <Text style={styles.btEnableIcon}>🔵</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.btEnableTitle}>Bluetooth is off</Text>
                      <Text style={styles.btEnableSub}>Tap to enable Classic Bluetooth</Text>
                    </View>
                    <Text style={styles.btEnableArrow}>→</Text>
                  </TouchableOpacity>
                )}

                {/* Error */}
                {classicError && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>⚠️ {classicError}</Text>
                  </View>
                )}

                {/* Connected device */}
                {classicConnectedDevice ? (
                  <View style={[styles.connectedCard, { borderColor: colors.success + "60", backgroundColor: colors.successLight }]}>
                    <View style={styles.connectedLeft}>
                      <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                      <View>
                        <Text style={styles.connectedName}>{classicConnectedDevice.name || classicSavedDevice?.name || "Classic Scale"}</Text>
                        <Text style={styles.connectedSub}>
                          {classicScaleReading
                            ? `Live: ${classicScaleReading.weight.toFixed(2)} ${classicScaleReading.unit} ${classicScaleReading.isStable ? "✅ Stable" : "⏳"}`
                            : "Connected — waiting for reading..."}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.disconnectBtn} onPress={onClassicDisconnect}>
                      <Text style={styles.disconnectText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                ) : classicIsConnecting ? (
                  <View style={[styles.connectedCard, { backgroundColor: colors.warningLight, borderColor: colors.warning + "60" }]}>
                    <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                    <Text style={[styles.connectedName, { color: colors.warning }]}>Connecting...</Text>
                  </View>
                ) : classicSavedDevice ? (
                  <View style={[styles.connectedCard, { backgroundColor: colors.warningLight, borderColor: colors.warning + "60" }]}>
                    <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
                    <Text style={[styles.connectedName, { color: colors.warning }]}>Saved: {classicSavedDevice.name} — not connected</Text>
                  </View>
                ) : null}

                {/* Saved device (classic) */}
                {classicSavedDevice && !classicConnectedDevice && (
                  <View style={styles.savedCard}>
                    <Text style={styles.savedIcon}>💾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedName}>{classicSavedDevice.name}</Text>
                      <Text style={styles.savedSub}>Saved — auto-connects on next open</Text>
                    </View>
                    <TouchableOpacity onPress={onClassicClearSaved}>
                      <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Get paired devices */}
                {classicIsEnabled && !classicConnectedDevice && (
                  <TouchableOpacity
                    style={[styles.actionBtn, classicIsScanning && { backgroundColor: colors.error }]}
                    onPress={onClassicGetPaired}
                    disabled={classicIsScanning}
                  >
                    <Text style={styles.actionBtnText}>
                      {classicIsScanning ? "🔄 Loading paired devices..." : "📋 Show Paired Devices"}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Paired devices list */}
                {classicPairedDevices.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Paired Devices ({classicPairedDevices.length})</Text>
                    <Text style={styles.sectionHint}>Only shows devices already paired in phone Settings → Bluetooth</Text>
                    {classicPairedDevices.map(device => (
                      <TouchableOpacity
                        key={device.address || device.id}
                        style={styles.deviceCard}
                        onPress={() => onClassicConnect(device)}
                      >
                        <View style={styles.deviceLeft}>
                          <Text style={styles.deviceIcon}>🔵</Text>
                          <View>
                            <Text style={styles.deviceName}>{device.name || "Unknown Device"}</Text>
                            <Text style={styles.deviceId}>{device.address || device.id}</Text>
                          </View>
                        </View>
                        <View style={[styles.connectBtn, { backgroundColor: colors.primary }]}>
                          <Text style={styles.connectBtnText}>Connect</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {/* No paired devices */}
                {classicIsEnabled && classicPairedDevices.length === 0 && !classicIsScanning && !classicConnectedDevice && (
                  <View style={styles.noPairedCard}>
                    <Text style={styles.noPairedIcon}>📵</Text>
                    <Text style={styles.noPairedTitle}>No paired devices found</Text>
                    <Text style={styles.noPairedSub}>Pair your scale in phone Settings → Bluetooth first, then return here.</Text>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:   { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: height * 0.82 },

  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  headerTitle: { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  closeBtn:    { padding: 4 },
  closeIcon:   { fontSize: 20, color: colors.textMuted },

  protocolToggle:      { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.md, padding: 3, gap: 3, marginBottom: spacing.md },
  protocolBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  protocolBtnActive:   { backgroundColor: colors.collectorColor },
  protocolIcon:        { fontSize: 16 },
  protocolText:        { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  protocolTextActive:  { color: "#fff" },
  activeDot:           { width: 7, height: 7, borderRadius: 4, marginLeft: 2 },

  scroll: { maxHeight: height * 0.6 },

  connectedCard:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5 },
  connectedLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  statusDot:      { width: 12, height: 12, borderRadius: 6 },
  connectedName:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  connectedSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  disconnectBtn:  { backgroundColor: colors.errorLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  disconnectText: { fontSize: 11, color: colors.error, fontWeight: "700" },

  savedCard:   { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  savedIcon:   { fontSize: 20 },
  savedName:   { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  savedSub:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  clearText:   { fontSize: 11, color: colors.error, fontWeight: "700", paddingHorizontal: 8 },

  actionBtn:     { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginBottom: spacing.sm },
  actionBtnText: { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },

  scanningWrap: { alignItems: "center", paddingVertical: spacing.md },
  scanningText: { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600" },

  sectionTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: 4 },
  sectionHint:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm },

  deviceCard:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginBottom: 6 },
  deviceLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  deviceIcon:    { fontSize: 22 },
  deviceName:    { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  deviceId:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  connectBtn:    { backgroundColor: colors.collectorColor, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  connectBtnText:{ fontSize: 11, color: "#fff", fontWeight: "800" },

  btEnableCard:  { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.primary + "50" },
  btEnableIcon:  { fontSize: 24 },
  btEnableTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary },
  btEnableSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  btEnableArrow: { fontSize: 18, color: colors.primary, fontWeight: "700" },

  errorCard: { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  errorText: { fontSize: fonts.sizes.xs, color: colors.error, fontWeight: "600", textAlign: "center" },

  noPairedCard:  { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  noPairedIcon:  { fontSize: 48, marginBottom: 12 },
  noPairedTitle: { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  noPairedSub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 20 },
});