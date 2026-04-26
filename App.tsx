import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Alert,
} from "react-native";
import { Device } from "react-native-ble-plx";
import { useBLE } from "./src/hooks/useBLE";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeightRecord {
  id: string;
  weight: number;
  unit: "kg" | "lbs";
  isStable: boolean;
  timestamp: Date;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const {
    isScanning,
    connectedDevice,
    discoveredDevices,
    scaleReading,
    capturedWeight,
    savedDevice,
    isAutoConnecting,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    captureWeight,
    clearSavedDevice,
  } = useBLE();

  const [weightHistory, setWeightHistory] = useState<WeightRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"scale" | "history">("scale");

  // Once connected, remember it so the UI never flips back during silent reconnect
  const wasEverConnectedRef = useRef(false);
  const lastDeviceNameRef   = useRef<string>("");

  if (connectedDevice) {
    wasEverConnectedRef.current = true;
    lastDeviceNameRef.current   =
      connectedDevice.name || connectedDevice.localName || "Scale";
  }

  // Show connected UI if currently connected OR silently auto-reconnecting
  const showConnectedUI =
    !!connectedDevice || (wasEverConnectedRef.current && isAutoConnecting);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCaptureWeight = () => {
    if (scaleReading) {
      const record: WeightRecord = {
        id:        `${Date.now()}`,
        weight:    scaleReading.weight,
        unit:      scaleReading.unit,
        isStable:  scaleReading.isStable,
        timestamp: new Date(),
      };
      setWeightHistory((prev) => [record, ...prev]);
      captureWeight();
    } else {
      Alert.alert("No Reading", "Please wait for scale data.");
    }
  };

  const handleDisconnect = () => {
    wasEverConnectedRef.current = false;
    lastDeviceNameRef.current   = "";
    disconnect();
  };

  const clearHistory = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to clear all weight records?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => setWeightHistory([]),
        },
      ]
    );
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderHistoryItem = ({
    item,
    index,
  }: {
    item: WeightRecord;
    index: number;
  }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyIndex}>
        <Text style={styles.historyIndexText}>
          #{weightHistory.length - index}
        </Text>
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyWeight}>
          {item.weight.toFixed(2)}{" "}
          <Text style={styles.historyUnit}>{item.unit}</Text>
        </Text>
        <Text style={styles.historyTime}>
          {item.timestamp.toLocaleDateString()} ·{" "}
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </View>
      <View
        style={[
          styles.historyStability,
          item.isStable ? styles.historyStable : styles.historyUnstable,
        ]}
      >
        <Text style={styles.historyStabilityText}>
          {item.isStable ? "Stable" : "Moving"}
        </Text>
      </View>
    </View>
  );

  // ─── Connected Screen ────────────────────────────────────────────────────────

  if (showConnectedUI) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a1a" />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.connectionDot,
                connectedDevice
                  ? styles.connectionDotOn
                  : styles.connectionDotReconnecting,
              ]}
            />
            <View>
              <Text style={styles.headerTitle}>⚖️ BLE Scale</Text>
              <Text style={styles.headerSubtitle}>
                {connectedDevice
                  ? `Connected · ${lastDeviceNameRef.current}`
                  : "Reconnecting silently..."}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleDisconnect}
            style={styles.disconnectBtn}
          >
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "scale" && styles.tabActive]}
            onPress={() => setActiveTab("scale")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "scale" && styles.tabTextActive,
              ]}
            >
              ⚖️ Scale
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "history" && styles.tabActive]}
            onPress={() => setActiveTab("history")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "history" && styles.tabTextActive,
              ]}
            >
              📋 History{" "}
              {weightHistory.length > 0 ? `(${weightHistory.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Scale Tab ── */}
        {activeTab === "scale" && (
          <ScrollView contentContainerStyle={styles.scaleContent}>

            {/* Weight Display */}
            <View style={styles.weightCard}>
              {/* 
                FIX: Always show weight value once connected.
                If scaleReading is null (e.g. during reconnect), show last known
                value from the hook (which restores lastScaleReadingRef).
                If truly no reading yet, show 0.00 kg instead of a spinner.
              */}
              {scaleReading ? (
                <>
                  <Text style={styles.weightValue}>
                    {scaleReading.weight.toFixed(2)}
                  </Text>
                  <Text style={styles.weightUnit}>{scaleReading.unit}</Text>
                  <View
                    style={[
                      styles.stabilityBadge,
                      scaleReading.isStable ? styles.stable : styles.unstable,
                    ]}
                  >
                    <Text style={styles.stabilityText}>
                      {scaleReading.isStable ? "✓ Stable" : "⟳ Measuring..."}
                    </Text>
                  </View>
                  <Text style={styles.timestamp}>
                    Updated: {scaleReading.timestamp.toLocaleTimeString()}
                  </Text>
                </>
              ) : (
                <>
                  {/* Show 0.00 kg when connected but no weight on scale yet */}
                  <Text style={styles.weightValue}>0.00</Text>
                  <Text style={styles.weightUnit}>kg</Text>
                  <View style={[styles.stabilityBadge, styles.stable]}>
                    <Text style={styles.stabilityText}>
                      {connectedDevice ? "✓ Ready" : "⟳ Reconnecting..."}
                    </Text>
                  </View>
                  <Text style={styles.timestamp}>
                    {connectedDevice
                      ? "Place weight on scale"
                      : "Reconnecting in background..."}
                  </Text>
                </>
              )}
            </View>

            {/* Capture Button */}
            <TouchableOpacity
              style={[
                styles.captureBtn,
                !scaleReading && styles.captureBtnDisabled,
              ]}
              onPress={handleCaptureWeight}
              disabled={!scaleReading}
            >
              <Text style={styles.captureBtnText}>📸 Capture Weight</Text>
            </TouchableOpacity>

            {/* Last Captured */}
            {capturedWeight && (
              <View style={styles.capturedCard}>
                <Text style={styles.capturedLabel}>📌 Last Captured</Text>
                <Text style={styles.capturedValue}>
                  {capturedWeight.weight.toFixed(2)} {capturedWeight.unit}
                </Text>
                <Text style={styles.capturedTime}>
                  at {capturedWeight.timestamp.toLocaleTimeString()}
                </Text>
              </View>
            )}

            {/* Recent Records Preview */}
            {weightHistory.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>Recent Records</Text>
                  <TouchableOpacity onPress={() => setActiveTab("history")}>
                    <Text style={styles.viewAllText}>View All →</Text>
                  </TouchableOpacity>
                </View>
                {weightHistory.slice(0, 3).map((item, index) => (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyIndex}>
                      <Text style={styles.historyIndexText}>
                        #{weightHistory.length - index}
                      </Text>
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyWeight}>
                        {item.weight.toFixed(2)}{" "}
                        <Text style={styles.historyUnit}>{item.unit}</Text>
                      </Text>
                      <Text style={styles.historyTime}>
                        {item.timestamp.toLocaleDateString()} ·{" "}
                        {item.timestamp.toLocaleTimeString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.historyStability,
                        item.isStable
                          ? styles.historyStable
                          : styles.historyUnstable,
                      ]}
                    >
                      <Text style={styles.historyStabilityText}>
                        {item.isStable ? "Stable" : "Moving"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {/* ── History Tab ── */}
        {activeTab === "history" && (
          <View style={styles.historySection}>
            {weightHistory.length > 0 ? (
              <>
                <View style={styles.historyToolbar}>
                  <Text style={styles.historyCount}>
                    {weightHistory.length} record
                    {weightHistory.length !== 1 ? "s" : ""}
                  </Text>
                  <TouchableOpacity
                    onPress={clearHistory}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>🗑 Clear All</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={weightHistory}
                  keyExtractor={(item) => item.id}
                  renderItem={renderHistoryItem}
                  contentContainerStyle={styles.historyList}
                />
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>
                  No records yet.{"\n"}Capture weights to build history.
                </Text>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ─── Scan Screen ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a1a" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.connectionDot, styles.connectionDotOff]} />
          <View>
            <Text style={styles.headerTitle}>⚖️ BLE Scale</Text>
            <Text style={styles.headerSubtitle}>Bluetooth Weight Monitor</Text>
          </View>
        </View>
      </View>

      {/* Auto connecting banner */}
      {isAutoConnecting && (
        <View style={styles.autoConnectBanner}>
          <ActivityIndicator size="small" color="#4fffb0" />
          <Text style={styles.autoConnectText}>
            Connecting to {savedDevice?.name}...
          </Text>
          <TouchableOpacity
            onPress={() => {
              wasEverConnectedRef.current = false;
              clearSavedDevice();
            }}
          >
            <Text style={styles.cancelAutoConnect}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scanSection}>
        {/* Saved device quick connect */}
        {savedDevice && !isAutoConnecting && (
          <View style={styles.savedDeviceCard}>
            <Text style={styles.savedDeviceLabel}>⭐ Last Used Scale</Text>
            <Text style={styles.savedDeviceName}>{savedDevice.name}</Text>
            <Text style={styles.savedDeviceId}>{savedDevice.id}</Text>
            <View style={styles.savedDeviceActions}>
              <TouchableOpacity
                style={styles.quickConnectBtn}
                onPress={startScan}
              >
                <Text style={styles.quickConnectText}>🔄 Reconnect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgetBtn}
                onPress={clearSavedDevice}
              >
                <Text style={styles.forgetText}>Forget</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.scanButton, isScanning && styles.scanButtonActive]}
          onPress={isScanning ? stopScan : startScan}
        >
          {isScanning ? (
            <>
              <ActivityIndicator color="#0a0a1a" size="small" />
              <Text style={styles.scanButtonText}>  Scanning...</Text>
            </>
          ) : (
            <Text style={styles.scanButtonText}>🔍 Scan for Scales</Text>
          )}
        </TouchableOpacity>

        {isScanning && (
          <Text style={styles.scanHint}>
            Make sure your scale Bluetooth is active
          </Text>
        )}

        {discoveredDevices.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Found {discoveredDevices.length} device
              {discoveredDevices.length !== 1 ? "s" : ""}
            </Text>
            {discoveredDevices.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.deviceCard}
                onPress={() => connectToDevice(item)}
              >
                <View style={styles.deviceIcon}>
                  <Text style={styles.deviceIconText}>⚖️</Text>
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>
                    {item.name || item.localName || "Unknown Device"}
                  </Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                  <Text style={styles.deviceRssi}>
                    Signal: {item.rssi ? `${item.rssi} dBm` : "N/A"}
                  </Text>
                  {savedDevice?.id === item.id && (
                    <Text style={styles.savedBadge}>⭐ Last Connected</Text>
                  )}
                </View>
                <Text style={styles.connectArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {!isScanning && discoveredDevices.length === 0 && !savedDevice && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyText}>
              No devices found yet.{"\n"}Press Scan to discover nearby BLE
              scales.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a1a" },

  // Header
  header: {
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft:    { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle:   { fontSize: 22, fontWeight: "800", color: "#4fffb0", letterSpacing: 0.5 },
  headerSubtitle:{ fontSize: 12, color: "#555", marginTop: 2 },

  // Connection dot
  connectionDot:             { width: 10, height: 10, borderRadius: 5 },
  connectionDotOn:           { backgroundColor: "#4fffb0" },
  connectionDotReconnecting: { backgroundColor: "#ffaa00" },
  connectionDotOff:          { backgroundColor: "#444" },

  // Disconnect
  disconnectBtn: {
    backgroundColor: "#ff4f4f20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff4f4f60",
  },
  disconnectText: { color: "#ff6b6b", fontSize: 13, fontWeight: "600" },

  // Tabs
  tabBar:        { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1a1a2e" },
  tab:           { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: "#4fffb0" },
  tabText:       { color: "#555", fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#4fffb0" },

  // Scale content
  scaleContent: { padding: 16, paddingBottom: 40 },

  // Weight card
  weightCard: {
    backgroundColor: "#111124",
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4fffb040",
    marginBottom: 16,
    minHeight: 240,
    justifyContent: "center",
  },
  weightValue: {
    fontSize: 80,
    fontWeight: "900",
    color: "#4fffb0",
    letterSpacing: -2,
  },
  weightUnit:     { fontSize: 24, color: "#aaa", fontWeight: "300", marginTop: -8 },
  stabilityBadge: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  stable:         { backgroundColor: "#4fffb020", borderWidth: 1, borderColor: "#4fffb060" },
  unstable:       { backgroundColor: "#ffaa0020", borderWidth: 1, borderColor: "#ffaa0060" },
  stabilityText:  { color: "#fff", fontSize: 13, fontWeight: "600" },
  timestamp:      { color: "#444", fontSize: 12, marginTop: 12 },

  // Capture
  captureBtn: {
    backgroundColor: "#4fffb0",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
  },
  captureBtnDisabled: { backgroundColor: "#4fffb040" },
  captureBtnText:     { color: "#0a0a1a", fontSize: 16, fontWeight: "800" },

  // Captured card
  capturedCard: {
    padding: 16,
    backgroundColor: "#111124",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#4fffb030",
    alignItems: "center",
    marginBottom: 16,
  },
  capturedLabel: { color: "#888", fontSize: 12, fontWeight: "600" },
  capturedValue: { color: "#4fffb0", fontSize: 32, fontWeight: "900", marginTop: 4 },
  capturedTime:  { color: "#444", fontSize: 11, marginTop: 4 },

  // Recent
  recentSection: { marginTop: 8 },
  recentHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  recentTitle:   { color: "#888", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  viewAllText:   { color: "#4fffb0", fontSize: 13, fontWeight: "600" },

  // History
  historySection: { flex: 1 },
  historyToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  historyCount: { color: "#888", fontSize: 13, fontWeight: "600" },
  clearBtn: {
    backgroundColor: "#ff4f4f20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff4f4f40",
  },
  clearBtnText:         { color: "#ff6b6b", fontSize: 13, fontWeight: "600" },
  historyList:          { padding: 16, paddingBottom: 40 },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111124",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1e1e38",
  },
  historyIndex: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1a1a30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  historyIndexText:     { color: "#4fffb0", fontSize: 12, fontWeight: "700" },
  historyInfo:          { flex: 1 },
  historyWeight:        { color: "#fff", fontSize: 18, fontWeight: "800" },
  historyUnit:          { color: "#888", fontSize: 14, fontWeight: "400" },
  historyTime:          { color: "#555", fontSize: 11, marginTop: 2 },
  historyStability:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  historyStable:        { backgroundColor: "#4fffb020", borderWidth: 1, borderColor: "#4fffb040" },
  historyUnstable:      { backgroundColor: "#ffaa0020", borderWidth: 1, borderColor: "#ffaa0040" },
  historyStabilityText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  // Auto connect banner
  autoConnectBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111124",
    padding: 12,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4fffb030",
    gap: 8,
  },
  autoConnectText:   { flex: 1, color: "#4fffb0", fontSize: 13 },
  cancelAutoConnect: { color: "#ff6b6b", fontSize: 13, fontWeight: "600" },

  // Scan
  scanSection: { flex: 1, padding: 16 },
  savedDeviceCard: {
    backgroundColor: "#111124",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4fffb030",
  },
  savedDeviceLabel:   { color: "#4fffb0", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  savedDeviceName:    { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 4 },
  savedDeviceId:      { color: "#555", fontSize: 11, marginTop: 2 },
  savedDeviceActions: { flexDirection: "row", marginTop: 12, gap: 10 },
  quickConnectBtn: {
    flex: 1,
    backgroundColor: "#4fffb0",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  quickConnectText: { color: "#0a0a1a", fontWeight: "800", fontSize: 14 },
  forgetBtn: {
    backgroundColor: "#ff4f4f20",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ff4f4f60",
    paddingHorizontal: 20,
  },
  forgetText:      { color: "#ff6b6b", fontWeight: "600", fontSize: 14 },
  scanButton: {
    backgroundColor: "#4fffb0",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
  },
  scanButtonActive: { backgroundColor: "#2dd88a" },
  scanButtonText:   { color: "#0a0a1a", fontSize: 17, fontWeight: "800" },
  scanHint:         { color: "#666", textAlign: "center", fontSize: 13, marginBottom: 20 },
  sectionTitle: {
    color: "#888",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 8,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111124",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1e1e38",
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#1a1a30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  deviceIconText: { fontSize: 22 },
  deviceInfo:     { flex: 1 },
  deviceName:     { color: "#fff", fontWeight: "700", fontSize: 15 },
  deviceId:       { color: "#555", fontSize: 11, marginTop: 2 },
  deviceRssi:     { color: "#4fffb080", fontSize: 12, marginTop: 3 },
  savedBadge:     { color: "#4fffb0", fontSize: 11, marginTop: 3 },
  connectArrow:   { color: "#4fffb0", fontSize: 28, fontWeight: "300" },
  emptyState:     { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyIcon:      { fontSize: 60, marginBottom: 16 },
  emptyText:      { color: "#555", textAlign: "center", lineHeight: 24, fontSize: 15 },
});