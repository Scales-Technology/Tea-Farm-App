// ─── Collection Screen — TeaFarm Pro ─────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, RefreshControl, Dimensions, Modal,
  Alert, Animated, Easing,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { useBLE } from "../../hooks/useBLE";
import { useClassicBluetooth } from "../../hooks/useClassicBluetooth";
import ScaleSelectorModal, { ScaleType } from "../../components/ScaleSelectorModal";
import { usePrinter } from "../../hooks/usePrinter";
import PrinterModal from "../../components/PrinterModal";
import { buildCollectionReceipt } from "../../utils/receipt";
import { COLLECTIONS } from "../../firebase/auth";
import TeaLoader from "../../components/TeaLoader";
import NetInfo from "@react-native-community/netinfo";
import { offlineSave } from "../../utils/offlineSave";
import { saveCache, loadCache } from "../../hooks/useOfflineCache";

const db      = getFirestore();
const auth    = getAuth();
const { width, height } = Dimensions.get("window");

type SourceType  = "plucker" | "farmer";
type Step        = "select" | "weigh";
type WeighTab    = "weigh" | "history";

interface Source {
  id:               string;
  name:             string;
  idNumber?:        string;
  phone?:           string;
  location?:        string;
  paymentMethod?:   string;
  paymentDuration?: string;
  pluckZone?:       string;
  farmName?:        string;
}

interface CollectionRecord {
  id:          string;
  batchNumber: string;
  sourceType:  string;
  sourceId:    string;
  sourceName:  string;
  weightKg:    number;
  unit:        string;
  date:        string;
  notes:       string;
  recordedBy:  string;
  createdAt:   any;
}

const generateBatchNumber = (): string => {
  const now  = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `BATCH-${date}-${rand}`;
};

const formatDateTime = (ts: any): string => {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
};

export default function CollectionScreen({ navigation, route }: any) {
  const preSourceType: SourceType | undefined = route?.params?.sourceType;
  const preSourceId:   string | undefined     = route?.params?.sourceId;
  const preSourceName: string | undefined     = route?.params?.sourceName;

  const [step,           setStep]           = useState<Step>(preSourceId ? "weigh" : "select");
  const [sourceType,     setSourceType]     = useState<SourceType>(preSourceType || "plucker");
  const [sources,        setSources]        = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [showBLEModal,   setShowBLEModal]   = useState(false);
  const [batchNumber,    setBatchNumber]    = useState(generateBatchNumber());
  const [manualWeight,   setManualWeight]   = useState("");
  const [useManual,      setUseManual]      = useState(false);
  const [notes,          setNotes]          = useState("");
  const [savedCount,     setSavedCount]     = useState(0);
  const [showSuccess,    setShowSuccess]    = useState(false);
  const [lastRecord,     setLastRecord]     = useState<any>(null);
  const [weighTab,       setWeighTab]       = useState<WeighTab>("weigh");
  const [history,        setHistory]        = useState<CollectionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isOffline,      setIsOffline]      = useState(false);
  const [activeScaleType, setActiveScaleType] = useState<ScaleType>("ble");
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [printStatus,   setPrintStatus]   = useState<"idle" | "printing" | "printed" | "failed" | "skipped">("idle");
  const [printError,    setPrintError]    = useState("");
  const [lastReceipt,   setLastReceipt]   = useState<string | null>(null);

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");
  const roleRef      = useRef("");

  // ── BLE ───────────────────────────────────────────────────────────────────
  const {
    isScanning, connectedDevice, discoveredDevices,
    scaleReading, capturedWeight, savedDevice, isAutoConnecting,
    startScan, stopScan, connectToDevice, disconnect,
    captureWeight, clearSavedDevice,
  } = useBLE();

  // ── Classic Bluetooth ─────────────────────────────────────────────────────
  // useClassicBluetooth now uses rn-bluetooth-classic's useBluetooth hook
  // internally — receivedData is reactive, base64 decoded correctly,
  // and isAutoConnecting is separate from isConnecting.
  const {
    pairedDevices:        classicPairedDevices,
    connectedDevice:      classicConnectedDevice,
    scaleReading:         classicScaleReading,
    capturedWeight:       classicCapturedWeight,
    savedDevice:          classicSavedDevice,
    isConnecting:         classicIsConnecting,
    isAutoConnecting:     classicIsAutoConnecting,   // ← NEW
    isScanning:           classicIsScanning,
    isEnabled:            classicIsEnabled,
    error:                classicError,
    getPairedDevices:     classicGetPaired,
    connectToDevice:      classicConnect,
    disconnect:           classicDisconnect,
    clearSavedDevice:     classicClearSaved,
    captureWeight:        classicCapture,
    enableBluetooth:      classicEnableBt,
  } = useClassicBluetooth();

  // ── Receipt printer (classic Bluetooth, for both BLE and classic scales) ──
  const printer = usePrinter();
  const printerStatusColor = !printer.settings.printerAddress
    ? colors.error
    : printer.connected ? colors.success : colors.warning;

  // Receipts are printed for the collector supervisor only. This screen is only
  // reachable from the collector navigator; an unknown role (offline profile
  // read) is allowed, any other role is not.
  const canPrintReceipts = () =>
    roleRef.current === "" || roleRef.current === "collector_supervisor";

  const runPrint = async (text: string) => {
    setPrintStatus("printing");
    setPrintError("");
    try {
      await printer.print(text);
      setPrintStatus("printed");
    } catch (e: any) {
      setPrintStatus("failed");
      setPrintError(e?.message || "Printer error.");
    }
  };

  // ── Unified scale abstractions ────────────────────────────────────────────
  const activeScaleReading   = activeScaleType === "ble" ? scaleReading   : classicScaleReading;
  const activeCapturedWeight = activeScaleType === "ble" ? capturedWeight : classicCapturedWeight;
  const activeWeight: number = useManual
    ? (parseFloat(manualWeight) || 0)
    : (activeCapturedWeight?.weight ?? activeScaleReading?.weight ?? 0);
  const activeUnit           = activeCapturedWeight?.unit ?? activeScaleReading?.unit ?? "kg";
  const activeConnected      = activeScaleType === "ble" ? !!connectedDevice : !!classicConnectedDevice;

  // FIX: Classic now uses isAutoConnecting OR isConnecting (both mean "working
  // on connecting"), but only when not yet connected — mirrors BLE pattern.
  const activeConnecting = activeScaleType === "ble"
    ? (isAutoConnecting && !connectedDevice)
    : (classicIsAutoConnecting || classicIsConnecting) && !classicConnectedDevice;

  const activeSavedDevice = activeScaleType === "ble" ? savedDevice : classicSavedDevice;

  // ── Unified capture / disconnect helpers ──────────────────────────────────
  const handleCaptureWeight = () => {
    if (activeScaleType === "ble") captureWeight();
    else classicCapture();
  };
  const handleDisconnect = () => {
    if (activeScaleType === "ble") disconnect();
    else classicDisconnect();
  };
  const handleClearSaved = () => {
    if (activeScaleType === "ble") clearSavedDevice();
    else classicClearSaved();
    Alert.alert("Cleared", "Saved scale removed.");
  };

  // ── Unified scale status UI helpers ──────────────────────────────────────
  const scaleStatusColor = activeConnected
    ? colors.success
    : activeConnecting
    ? colors.warning
    : colors.error;

  const scaleStatusLabel = (() => {
    if (activeConnected) {
      const name = activeScaleType === "ble"
        ? (connectedDevice?.name || savedDevice?.name || "BLE Scale")
        : (classicConnectedDevice?.name || classicSavedDevice?.name || "Classic Scale");
      return name;
    }
    if (activeConnecting) return "Connecting...";
    if (activeSavedDevice) return `Saved: ${activeSavedDevice.name}`;
    return "No scale";
  })();

  const scaleTypeLabel = activeScaleType === "ble" ? "BLE" : "Classic";

  // ── Pulse animation ───────────────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<any>(null);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    pulseLoop.current.start();
  };
  const stopPulse = () => {
    if (pulseLoop.current) pulseLoop.current.stop();
    pulseAnim.setValue(1);
  };

  useEffect(() => {
    if (activeScaleReading?.isStable) startPulse(); else stopPulse();
    return stopPulse;
  }, [activeScaleReading?.isStable]);

  // ── Load sources ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const network = await NetInfo.fetch();
      const online  = !!network.isConnected && !!network.isInternetReachable;
      setIsOffline(!online);

      const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current     = oid;
      actorNameRef.current = me.name || "Collector";
      actorIdRef.current   = uid;
      roleRef.current      = me.role || "";
      if (!oid) return;

      const col      = sourceType === "plucker" ? COLLECTIONS.PLUCKERS : "farmers";
      const cacheKey = `sources_${col}_${oid}`;

      if (!online) {
        const cached = await loadCache<Source[]>(cacheKey);
        if (cached) {
          setSources(cached);
          if (preSourceId && preSourceName) {
            const found = cached.find((s: Source) => s.id === preSourceId);
            setSelectedSource(found || { id: preSourceId, name: preSourceName });
          }
        }
        return;
      }

      const snap = await getDocs(query(collection(db, col), where("organizationId", "==", oid)));
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Source))
        .filter((s: any) => s.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
      setSources(list);
      await saveCache(cacheKey, list);

      if (preSourceId && preSourceName) {
        const found = list.find(s => s.id === preSourceId);
        setSelectedSource(found || { id: preSourceId, name: preSourceName });
      }
    } catch (e: any) { console.log("Collection load error:", e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [sourceType]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!orgIdRef.current) return;
    setHistoryLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const snap  = await getDocs(query(
        collection(db, COLLECTIONS.COLLECTIONS),
        where("organizationId", "==", orgIdRef.current),
        where("date", "==", today),
      ));
      const recs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CollectionRecord))
        .sort((a, b) => {
          const aT = a.createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        });
      setHistory(recs);
    } catch (e: any) { console.log("History load error:", e.message); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (weighTab === "history" && orgIdRef.current) loadHistory();
  }, [weighTab, loadHistory]);

  // ── History analytics ─────────────────────────────────────────────────────
  const historyStats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayRecs = history.filter(r => r.date === today);

    const personMap: Record<string, { name: string; type: string; totalKg: number; records: CollectionRecord[] }> = {};
    todayRecs.forEach(r => {
      if (!personMap[r.sourceId]) {
        personMap[r.sourceId] = { name: r.sourceName, type: r.sourceType, totalKg: 0, records: [] };
      }
      personMap[r.sourceId].totalKg += r.weightKg || 0;
      personMap[r.sourceId].records.push(r);
    });

    const persons       = Object.values(personMap).sort((a, b) => b.totalKg - a.totalKg);
    const pluckerRecs   = todayRecs.filter(r => r.sourceType === "plucker");
    const farmerRecs    = todayRecs.filter(r => r.sourceType === "farmer");
    const totalPluckers = Math.round(pluckerRecs.reduce((s, r) => s + (r.weightKg || 0), 0) * 100) / 100;
    const totalFarmers  = Math.round(farmerRecs.reduce( (s, r) => s + (r.weightKg || 0), 0) * 100) / 100;
    const grandTotal    = Math.round((totalPluckers + totalFarmers) * 100) / 100;

    return { persons, totalPluckers, totalFarmers, grandTotal, count: todayRecs.length };
  }, [history]);

  const handleRefresh = () => { setRefreshing(true); loadData(); };

  const handleSelectSource = (source: Source) => {
    setSelectedSource(source);
    setBatchNumber(generateBatchNumber());
    setManualWeight(""); setNotes("");
    setStep("weigh"); setWeighTab("weigh");
  };

  const handleSave = async () => {
    if (!selectedSource) return Alert.alert("Error", "No source selected.");
    if (activeWeight <= 0) return Alert.alert("No Weight", "Capture or enter a valid weight first.");

    const today  = new Date().toISOString().split("T")[0];
    const record = {
      batchNumber,
      sourceType,
      sourceId:       selectedSource.id,
      sourceName:     selectedSource.name,
      weightKg:       activeWeight,
      unit:           activeUnit,
      date:           today,
      notes:          notes.trim(),
      organizationId: orgIdRef.current,
      recordedBy:     actorNameRef.current,
      recordedById:   actorIdRef.current,
      scaleType:      activeScaleType,
    };

    setSaving(true);
    setPrintStatus("idle");
    setPrintError("");
    try {
      const result = await offlineSave(COLLECTIONS.COLLECTIONS, record);

      await offlineSave(COLLECTIONS.AUDIT_LOGS, {
        actorId:        actorIdRef.current,
        actorName:      actorNameRef.current,
        actorRole:      "collector_supervisor",
        action:         `Recorded collection: ${selectedSource.name} — ${activeWeight}${activeUnit} (${batchNumber}) via ${activeScaleType === "ble" ? "BLE" : "Classic BT"}`,
        module:         "collections",
        outcome:        "success",
        organizationId: orgIdRef.current,
        referenceId:    result.id || batchNumber,
      });

      const newRec: CollectionRecord = {
        id:          result.id || `offline_${Date.now()}`,
        batchNumber, sourceType,
        sourceId:    selectedSource.id,
        sourceName:  selectedSource.name,
        weightKg:    activeWeight,
        unit:        activeUnit,
        date:        today,
        notes:       notes.trim(),
        recordedBy:  actorNameRef.current,
        createdAt:   new Date(),
      };
      setHistory(prev => [newRec, ...prev]);
      setIsOffline(!result.savedOnline);
      setSavedCount(prev => prev + 1);
      setLastRecord({ ...record, id: newRec.id, savedOnline: result.savedOnline });
      setShowSuccess(true);

      // ── Receipt for the plucker / farmer who brought the tea ──
      const receiptText = buildCollectionReceipt({
        sourceType,
        name:        selectedSource.name,
        idNumber:    selectedSource.idNumber,
        place:       sourceType === "plucker"
          ? (selectedSource.pluckZone || selectedSource.location)
          : (selectedSource.farmName  || selectedSource.location),
        phone:       selectedSource.phone,
        batchNumber,
        weight:      activeWeight,
        unit:        activeUnit,
        notes:       notes.trim(),
        servedBy:    actorNameRef.current,
      });
      setLastReceipt(receiptText);
      if (canPrintReceipts() && printer.settings.autoPrint) {
        runPrint(receiptText);          // runs in the background; result shows in the success card
      } else {
        setPrintStatus("skipped");
      }

      if (!result.savedOnline) {
        setTimeout(() => {
          Alert.alert(
            "📴 Saved Offline",
            "No network detected. This record is saved on your device and will automatically sync to the cloud when you reconnect.",
            [{ text: "OK" }]
          );
        }, 600);
      }
    } catch (e: any) {
      Alert.alert("Save Failed", e.message || "Could not save collection record.");
    } finally { setSaving(false); }
  };

  const handleNextSame = () => {
    setShowSuccess(false);
    setBatchNumber(generateBatchNumber());
    setManualWeight(""); setNotes(""); setUseManual(false);
  };

  const handleNextDifferent = () => {
    setShowSuccess(false);
    setSelectedSource(null);
    setBatchNumber(generateBatchNumber());
    setManualWeight(""); setNotes(""); setUseManual(false);
    setStep("select");
  };

  const filtered = sources.filter(s =>
    !searchQuery ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.idNumber  || "").includes(searchQuery) ||
    (s.pluckZone || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.farmName  || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <TeaLoader message="Loading Collection..." subMessage="Collector Supervisor" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.collectorColor} />

      {/* ════ STEP 1 — SELECT ════ */}
      {step === "select" && (
        <View style={styles.flex1}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>⚖️ Tea Collection</Text>
                <Text style={styles.headerSub}>Select who you are collecting from</Text>
              </View>
              <TouchableOpacity
                style={[styles.scalePill, { backgroundColor: scaleStatusColor + "30", borderColor: scaleStatusColor }]}
                onPress={() => setShowBLEModal(true)}
              >
                <View style={[styles.scaleDot, { backgroundColor: scaleStatusColor }]} />
                <Text style={[styles.scalePillText, { color: scaleStatusColor }]}>
                  {activeConnected ? `⚖️ ${scaleTypeLabel}` : activeConnecting ? "🔄" : `⚠️ ${scaleTypeLabel}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scalePill, { marginLeft: 6, backgroundColor: printerStatusColor + "30", borderColor: printerStatusColor }]}
                onPress={() => setShowPrinterModal(true)}
              >
                <View style={[styles.scaleDot, { backgroundColor: printerStatusColor }]} />
                <Text style={[styles.scalePillText, { color: printerStatusColor }]}>🖨️</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sourceToggle}>
              <TouchableOpacity
                style={[styles.sourceToggleBtn, sourceType === "plucker" && styles.sourceToggleBtnActive]}
                onPress={() => { setSourceType("plucker"); setLoading(true); }}
              >
                <Text style={styles.sourceToggleIcon}>🧺</Text>
                <Text style={[styles.sourceToggleText, sourceType === "plucker" && styles.sourceToggleTextActive]}>Pluckers</Text>
                <View style={[styles.sourceCountBadge, { backgroundColor: sourceType === "plucker" ? colors.collectorColor : colors.border }]}>
                  <Text style={[styles.sourceCountText, { color: sourceType === "plucker" ? "#fff" : colors.textMuted }]}>{sources.length}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sourceToggleBtn, sourceType === "farmer" && styles.sourceToggleBtnActive]}
                onPress={() => { setSourceType("farmer"); setLoading(true); }}
              >
                <Text style={styles.sourceToggleIcon}>👨‍🌾</Text>
                <Text style={[styles.sourceToggleText, sourceType === "farmer" && styles.sourceToggleTextActive]}>Farmers</Text>
              </TouchableOpacity>
            </View>

            {isOffline && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>📴 Offline — records will sync when reconnected</Text>
              </View>
            )}
            {savedCount > 0 && (
              <View style={styles.sessionBanner}>
                <Text style={styles.sessionBannerText}>✅ {savedCount} batch{savedCount !== 1 ? "es" : ""} recorded this session</Text>
              </View>
            )}
          </View>

          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${sourceType === "plucker" ? "pluckers" : "farmers"}...`}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.flex1}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.collectorColor]} tintColor={colors.collectorColor} />}
          >
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>{sourceType === "plucker" ? "🧺" : "👨‍🌾"}</Text>
                <Text style={styles.emptyTitle}>No {sourceType === "plucker" ? "pluckers" : "farmers"} found</Text>
                <Text style={styles.emptySub}>{sources.length === 0 ? "None registered yet" : "Try a different search"}</Text>
              </View>
            ) : filtered.map(source => (
              <TouchableOpacity key={source.id} style={styles.sourceCard} onPress={() => handleSelectSource(source)} activeOpacity={0.82}>
                <View style={[styles.sourceAvatar, { backgroundColor: colors.collectorLight }]}>
                  <Text style={[styles.sourceAvatarText, { color: colors.collectorColor }]}>{source.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.sourceInfo}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  {source.idNumber  && <Text style={styles.sourceMeta}>🪪 {source.idNumber}</Text>}
                  {source.pluckZone && <Text style={styles.sourceMeta}>🌿 Zone: {source.pluckZone}</Text>}
                  {source.farmName  && <Text style={styles.sourceMeta}>🌾 {source.farmName}</Text>}
                  {source.location  && <Text style={styles.sourceMeta}>📍 {source.location}</Text>}
                  {source.paymentMethod && (
                    <View style={styles.paymentTag}>
                      <Text style={styles.paymentTagText}>
                        {source.paymentMethod?.toLowerCase() === "mpesa" ? "📱" : source.paymentMethod?.toLowerCase() === "bank" ? "🏦" : "💵"} {source.paymentMethod}
                        {source.paymentDuration ? ` · ${source.paymentDuration}` : ""}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.sourceArrow}>
                  <Text style={styles.sourceArrowText}>⚖️</Text>
                  <Text style={styles.sourceArrowLabel}>Collect</Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      )}

      {/* ════ STEP 2 — WEIGH & HISTORY ════ */}
      {step === "weigh" && selectedSource && (
        <View style={styles.flex1}>
          <View style={styles.weighHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => {
              if (preSourceId) navigation.goBack();
              else { setStep("select"); setSelectedSource(null); }
            }}>
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.weighHeaderTitle}>⚖️ {selectedSource.name}</Text>
              <Text style={styles.weighHeaderSub}>{sourceType === "plucker" ? "🧺 Plucker" : "👨‍🌾 Farmer"}{selectedSource.idNumber ? ` · ${selectedSource.idNumber}` : ""}</Text>
            </View>
            <TouchableOpacity
              style={[styles.scalePill, { backgroundColor: scaleStatusColor + "30", borderColor: scaleStatusColor }]}
              onPress={() => setShowBLEModal(true)}
            >
              <View style={[styles.scaleDot, { backgroundColor: scaleStatusColor }]} />
              <Text style={[styles.scalePillText, { color: scaleStatusColor }]}>
                {activeConnected ? `⚖️ ${scaleTypeLabel}` : activeConnecting ? "🔄" : "⚠️"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scalePill, { marginLeft: 6, backgroundColor: printerStatusColor + "30", borderColor: printerStatusColor }]}
              onPress={() => setShowPrinterModal(true)}
            >
              <View style={[styles.scaleDot, { backgroundColor: printerStatusColor }]} />
              <Text style={[styles.scalePillText, { color: printerStatusColor }]}>🖨️</Text>
            </TouchableOpacity>
          </View>

          {isOffline && (
            <View style={[styles.offlineBanner, { marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md }]}>
              <Text style={styles.offlineBannerText}>📴 Offline mode — records queued for sync</Text>
            </View>
          )}

          <View style={styles.subTabRow}>
            <TouchableOpacity style={[styles.subTab, weighTab === "weigh" && styles.subTabActive]} onPress={() => setWeighTab("weigh")}>
              <Text style={[styles.subTabText, weighTab === "weigh" && styles.subTabTextActive]}>⚖️ Record Weight</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTab, weighTab === "history" && styles.subTabActive]}
              onPress={() => { setWeighTab("history"); if (orgIdRef.current) loadHistory(); }}
            >
              <Text style={[styles.subTabText, weighTab === "history" && styles.subTabTextActive]}>
                📊 Today's Records {history.length > 0 ? `(${history.length})` : ""}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── WEIGH TAB ── */}
          {weighTab === "weigh" && (
            <ScrollView style={styles.flex1} contentContainerStyle={styles.weighContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              <View style={styles.sourceInfoCard}>
                <View style={[styles.sourceInfoAvatar, { backgroundColor: colors.collectorLight }]}>
                  <Text style={[styles.sourceInfoAvatarText, { color: colors.collectorColor }]}>{selectedSource.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceInfoName}>{selectedSource.name}</Text>
                  {selectedSource.pluckZone  && <Text style={styles.sourceInfoMeta}>🌿 Zone: {selectedSource.pluckZone}</Text>}
                  {selectedSource.farmName   && <Text style={styles.sourceInfoMeta}>🌾 {selectedSource.farmName}</Text>}
                  {selectedSource.paymentMethod && (
                    <Text style={styles.sourceInfoMeta}>💳 {selectedSource.paymentMethod}{selectedSource.paymentDuration ? ` · ${selectedSource.paymentDuration}` : ""}</Text>
                  )}
                  {(() => {
                    const personRecs  = history.filter(r => r.sourceId === selectedSource.id);
                    const personTotal = personRecs.reduce((s, r) => s + (r.weightKg || 0), 0);
                    if (personTotal > 0) return (
                      <View style={styles.personTodayBadge}>
                        <Text style={styles.personTodayText}>
                          Today so far: {personTotal.toFixed(2)} kg ({personRecs.length} batch{personRecs.length !== 1 ? "es" : ""})
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* ── Scale type toggle (BLE / Classic) ── */}
              <View style={styles.scaleTypeToggle}>
                <TouchableOpacity
                  style={[styles.scaleTypeBtn, activeScaleType === "ble" && styles.scaleTypeBtnActive]}
                  onPress={() => setActiveScaleType("ble")}
                >
                  <Text style={styles.scaleTypeIcon}>📡</Text>
                  <Text style={[styles.scaleTypeText, activeScaleType === "ble" && styles.scaleTypeTextActive]}>BLE Scale</Text>
                  {connectedDevice && <View style={styles.scaleTypeActiveDot} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scaleTypeBtn, activeScaleType === "classic" && styles.scaleTypeBtnActive]}
                  onPress={() => { setActiveScaleType("classic"); if (!classicIsEnabled) classicEnableBt(); }}
                >
                  <Text style={styles.scaleTypeIcon}>🔵</Text>
                  <Text style={[styles.scaleTypeText, activeScaleType === "classic" && styles.scaleTypeTextActive]}>Classic BT</Text>
                  {classicConnectedDevice && <View style={[styles.scaleTypeActiveDot, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
              </View>

              {/* Classic BT: not enabled warning */}
              {activeScaleType === "classic" && !classicIsEnabled && (
                <TouchableOpacity style={styles.btEnableCard} onPress={classicEnableBt}>
                  <Text style={styles.btEnableIcon}>🔵</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.btEnableTitle}>Bluetooth is off</Text>
                    <Text style={styles.btEnableSub}>Tap to enable Classic Bluetooth</Text>
                  </View>
                  <Text style={styles.btEnableArrow}>→</Text>
                </TouchableOpacity>
              )}

              {/* Classic BT: error */}
              {activeScaleType === "classic" && classicError && (
                <View style={styles.btErrorCard}>
                  <Text style={styles.btErrorText}>⚠️ {classicError}</Text>
                </View>
              )}

              {/* Scale display */}
              <View style={[styles.scaleDisplay, { borderColor: activeConnected ? (activeScaleReading?.isStable ? colors.success : colors.collectorColor) : colors.border }]}>
                <View style={[styles.scaleStatusBar, { backgroundColor: scaleStatusColor }]}>
                  <View style={styles.scaleStatusDot} />
                  <Text style={styles.scaleStatusText}>{scaleStatusLabel}</Text>
                  <TouchableOpacity onPress={() => setShowBLEModal(true)}>
                    <Text style={styles.scaleManageText}>Manage</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.scaleWeightWrap}>
                  {activeConnected && !useManual ? (
                    <>
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Text style={[styles.scaleWeightValue, { color: activeScaleReading?.isStable ? colors.success : colors.collectorColor }]}>
                          {activeScaleReading ? activeScaleReading.weight.toFixed(2) : "0.00"}
                        </Text>
                      </Animated.View>
                      <Text style={styles.scaleWeightUnit}>{activeScaleReading?.unit ?? "kg"}</Text>
                      <View style={[styles.stabilitBadge, { backgroundColor: activeScaleReading?.isStable ? colors.successLight : colors.warningLight }]}>
                        <Text style={[styles.stabilityText, { color: activeScaleReading?.isStable ? colors.success : colors.warning }]}>
                          {activeScaleReading?.isStable ? "✅ STABLE — Ready to capture" : "⏳ Stabilizing..."}
                        </Text>
                      </View>
                      {activeScaleType === "classic" && !!(classicScaleReading as any)?.raw && (
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: "center" }}>
                          {"Scale sends: " + String((classicScaleReading as any).raw).slice(-40)}
                        </Text>
                      )}
                    </>
                  ) : useManual ? (
                    <>
                      <Text style={[styles.scaleWeightValue, { color: colors.primary }]}>
                        {parseFloat(manualWeight) > 0 ? parseFloat(manualWeight).toFixed(2) : "0.00"}
                      </Text>
                      <Text style={styles.scaleWeightUnit}>kg</Text>
                      <View style={[styles.stabilitBadge, { backgroundColor: colors.primaryPale }]}>
                        <Text style={[styles.stabilityText, { color: colors.primary }]}>✏️ Manual Entry</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.scaleOfflineWrap}>
                      <Text style={styles.scaleOfflineIcon}>⚖️</Text>
                      <Text style={styles.scaleOfflineText}>{activeConnecting ? "Connecting to scale..." : "Scale not connected"}</Text>
                      <Text style={styles.scaleOfflineSub}>Tap "Manage" to connect or enter weight manually</Text>
                    </View>
                  )}
                </View>

                {activeCapturedWeight && !useManual && (
                  <View style={styles.capturedBanner}>
                    <View>
                      <Text style={styles.capturedBannerLabel}>📌 Captured Weight</Text>
                      <Text style={styles.capturedBannerValue}>{activeCapturedWeight.weight.toFixed(2)} {activeCapturedWeight.unit}</Text>
                    </View>
                    <View style={[styles.capturedBadge, { backgroundColor: colors.success }]}>
                      <Text style={styles.capturedBadgeText}>LOCKED ✓</Text>
                    </View>
                  </View>
                )}

                <View style={styles.scaleActions}>
                  {activeConnected && !useManual && (
                    <TouchableOpacity
                      style={[styles.captureBtn, { backgroundColor: activeScaleReading?.isStable ? colors.success : colors.border }]}
                      onPress={handleCaptureWeight}
                      disabled={!activeScaleReading?.isStable}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.captureBtnIcon}>📌</Text>
                      <Text style={[styles.captureBtnText, { color: activeScaleReading?.isStable ? "#fff" : colors.textMuted }]}>
                        {activeCapturedWeight ? "Re-Capture" : "Capture Weight"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.manualBtn, useManual && styles.manualBtnActive]}
                    onPress={() => { setUseManual(!useManual); setManualWeight(""); }}
                  >
                    <Text style={[styles.manualBtnText, useManual && { color: colors.primary }]}>
                      {useManual ? "↩ Use Scale" : "✏️ Manual"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {useManual && (
                <View style={styles.manualInputCard}>
                  <Text style={styles.manualInputLabel}>Enter Weight (kg)</Text>
                  <View style={styles.manualInputWrap}>
                    <Text style={styles.manualInputIcon}>⚖️</Text>
                    <TextInput
                      style={styles.manualInput}
                      value={manualWeight}
                      onChangeText={setManualWeight}
                      placeholder="e.g. 12.50"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                    <Text style={styles.manualInputSuffix}>kg</Text>
                  </View>
                </View>
              )}

              <View style={styles.batchCard}>
                <View style={styles.batchCardLeft}>
                  <Text style={styles.batchCardLabel}>🔢 Batch Number</Text>
                  <Text style={styles.batchCardValue}>{batchNumber}</Text>
                </View>
                <TouchableOpacity style={styles.batchRefreshBtn} onPress={() => setBatchNumber(generateBatchNumber())}>
                  <Text style={styles.batchRefreshIcon}>🔄</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.notesCard}>
                <Text style={styles.notesLabel}>📝 Notes (optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Any notes about this collection..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📋 Collection Summary</Text>
                <SummaryRow icon="👤" label="Collected From" value={selectedSource.name} />
                <SummaryRow icon={sourceType === "plucker" ? "🧺" : "👨‍🌾"} label="Type" value={sourceType === "plucker" ? "Plucker" : "Farmer"} />
                <SummaryRow icon="⚖️" label="Weight" value={activeWeight > 0 ? `${activeWeight.toFixed(2)} ${activeUnit}` : "—"} highlight={activeWeight > 0} />
                <SummaryRow icon="🔢" label="Batch No." value={batchNumber} />
                <SummaryRow icon="📅" label="Date" value={new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })} />
                <SummaryRow icon={activeScaleType === "ble" ? "📡" : "🔵"} label="Scale Type" value={activeScaleType === "ble" ? "BLE Bluetooth" : "Classic Bluetooth"} />
                {notes.trim() && <SummaryRow icon="📝" label="Notes" value={notes.trim()} />}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (activeWeight <= 0 || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || activeWeight <= 0}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "💾 Saving..." : activeWeight > 0 ? `✅ Save ${activeWeight.toFixed(2)} ${activeUnit} — ${selectedSource.name}` : "⚖️ Capture weight first"}
                </Text>
              </TouchableOpacity>
              <View style={{ height: 48 }} />
            </ScrollView>
          )}

          {/* ── HISTORY TAB ── */}
          {weighTab === "history" && (
            <ScrollView
              style={styles.flex1}
              contentContainerStyle={styles.historyContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={historyLoading} onRefresh={loadHistory} colors={[colors.collectorColor]} tintColor={colors.collectorColor} />}
            >
              {historyLoading && history.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>⏳</Text>
                  <Text style={styles.emptyTitle}>Loading records...</Text>
                </View>
              ) : history.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📋</Text>
                  <Text style={styles.emptyTitle}>No collections today</Text>
                  <Text style={styles.emptySub}>Records saved today will appear here</Text>
                </View>
              ) : (
                <>
                  {historyStats.persons.map((person, pi) => {
                    const personRecs = person.records.sort((a, b) => {
                      const aT = a.createdAt?.toDate?.()?.getTime() || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
                      const bT = b.createdAt?.toDate?.()?.getTime() || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
                      return bT - aT;
                    });
                    const isCurrentPerson = selectedSource && person.records[0]?.sourceId === selectedSource.id;
                    return (
                      <View key={personRecs[0]?.sourceId || pi} style={[styles.personGroup, isCurrentPerson && styles.personGroupHighlighted]}>
                        <View style={styles.personGroupHeader}>
                          <View style={[styles.personGroupAvatar, { backgroundColor: person.type === "plucker" ? colors.collectorLight : colors.primaryPale }]}>
                            <Text style={[styles.personGroupAvatarText, { color: person.type === "plucker" ? colors.collectorColor : colors.primary }]}>
                              {person.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.personGroupName}>{person.name}</Text>
                            <Text style={styles.personGroupType}>{person.type === "plucker" ? "🧺 Plucker" : "👨‍🌾 Farmer"} · {personRecs.length} batch{personRecs.length !== 1 ? "es" : ""}</Text>
                          </View>
                          <View style={[styles.personTotalBadge, { backgroundColor: person.type === "plucker" ? colors.collectorColor : colors.primary }]}>
                            <Text style={styles.personTotalBadgeValue}>{person.totalKg.toFixed(2)}</Text>
                            <Text style={styles.personTotalBadgeUnit}>kg total</Text>
                          </View>
                        </View>

                        {personRecs.map((rec) => (
                          <View key={rec.id} style={styles.weightRecordRow}>
                            <View style={styles.weightRecordLeft}>
                              <View style={styles.weightRecordDot} />
                              <View>
                                <Text style={styles.weightRecordBatch}>{rec.batchNumber}</Text>
                                <Text style={styles.weightRecordTime}>🕐 {formatDateTime(rec.createdAt)}</Text>
                                {rec.notes ? <Text style={styles.weightRecordNotes}>💬 {rec.notes}</Text> : null}
                              </View>
                            </View>
                            <View style={styles.weightRecordRight}>
                              <Text style={styles.weightRecordKg}>{(rec.weightKg || 0).toFixed(2)}</Text>
                              <Text style={styles.weightRecordUnit}>{rec.unit}</Text>
                            </View>
                          </View>
                        ))}

                        <View style={styles.personSubtotalRow}>
                          <Text style={styles.personSubtotalLabel}>
                            {person.name} Total ({personRecs.length} batch{personRecs.length !== 1 ? "es" : ""})
                          </Text>
                          <Text style={[styles.personSubtotalValue, { color: person.type === "plucker" ? colors.collectorColor : colors.primary }]}>
                            {person.totalKg.toFixed(2)} kg
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.grandTotalsCard}>
                    <Text style={styles.grandTotalsTitle}>📊 Today's Collection Totals</Text>

                    {historyStats.totalPluckers > 0 && (
                      <View style={styles.grandTotalRow}>
                        <View style={styles.grandTotalLeft}>
                          <Text style={styles.grandTotalIcon}>🧺</Text>
                          <View>
                            <Text style={styles.grandTotalLabel}>All Pluckers</Text>
                            <Text style={styles.grandTotalSub}>{history.filter(r => r.sourceType === "plucker").length} batches · {new Set(history.filter(r => r.sourceType === "plucker").map(r => r.sourceId)).size} pluckers</Text>
                          </View>
                        </View>
                        <Text style={[styles.grandTotalValue, { color: colors.collectorColor }]}>{historyStats.totalPluckers.toFixed(2)} kg</Text>
                      </View>
                    )}

                    {historyStats.totalFarmers > 0 && (
                      <>
                        <View style={styles.grandTotalDivider} />
                        <View style={styles.grandTotalRow}>
                          <View style={styles.grandTotalLeft}>
                            <Text style={styles.grandTotalIcon}>👨‍🌾</Text>
                            <View>
                              <Text style={styles.grandTotalLabel}>All Farmers</Text>
                              <Text style={styles.grandTotalSub}>{history.filter(r => r.sourceType === "farmer").length} batches · {new Set(history.filter(r => r.sourceType === "farmer").map(r => r.sourceId)).size} farmers</Text>
                            </View>
                          </View>
                          <Text style={[styles.grandTotalValue, { color: colors.primary }]}>{historyStats.totalFarmers.toFixed(2)} kg</Text>
                        </View>
                      </>
                    )}

                    <View style={styles.grandTotalFinalRow}>
                      <View style={styles.grandTotalLeft}>
                        <Text style={styles.grandTotalIcon}>🌿</Text>
                        <View>
                          <Text style={[styles.grandTotalLabel, { fontWeight: "900", fontSize: fonts.sizes.md }]}>Grand Total</Text>
                          <Text style={styles.grandTotalSub}>{historyStats.count} total batches today</Text>
                        </View>
                      </View>
                      <Text style={styles.grandTotalFinalValue}>{historyStats.grandTotal.toFixed(2)} kg</Text>
                    </View>
                  </View>
                </>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          )}
        </View>
      )}

      {/* ════ SUCCESS MODAL ════ */}
      <Modal visible={showSuccess} animationType="fade" transparent>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>{lastRecord?.savedOnline === false ? "📴" : "🎉"}</Text>
            <Text style={styles.successTitle}>
              {lastRecord?.savedOnline === false ? "Saved Offline!" : "Collection Saved!"}
            </Text>
            {lastRecord?.savedOnline === false && (
              <Text style={styles.successOfflineNote}>Will sync when network returns</Text>
            )}
            {lastRecord && (
              <>
                <Text style={styles.successValue}>{lastRecord.weightKg.toFixed(2)} {lastRecord.unit}</Text>
                <Text style={styles.successName}>{lastRecord.sourceName}</Text>
                <Text style={styles.successBatch}>{lastRecord.batchNumber}</Text>
                {printStatus !== "idle" && (
                  <View style={styles.printRow}>
                    <Text
                      style={[
                        styles.printRowText,
                        { color: printStatus === "printed" ? colors.success : printStatus === "failed" ? colors.error : colors.textMuted },
                      ]}
                    >
                      {printStatus === "printing" ? "🖨️ Printing receipt…"
                        : printStatus === "printed" ? "🖨️ Receipt printed"
                        : printStatus === "failed"  ? `🖨️ Not printed: ${printError}`
                        : "🖨️ Auto-print is off"}
                    </Text>
                    {printStatus !== "printing" && !!lastReceipt && (
                      <TouchableOpacity style={styles.reprintBtn} onPress={() => runPrint(lastReceipt)}>
                        <Text style={styles.reprintBtnText}>
                          {printStatus === "printed" ? "Print again" : "Print receipt"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}
            <View style={styles.successStats}>
              <View style={styles.successStat}>
                <Text style={styles.successStatValue}>{savedCount}</Text>
                <Text style={styles.successStatLabel}>This Session</Text>
              </View>
              <View style={[styles.successStat, { marginLeft: 24 }]}>
                <Text style={styles.successStatValue}>{historyStats.grandTotal.toFixed(1)}</Text>
                <Text style={styles.successStatLabel}>kg Today</Text>
              </View>
            </View>
            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successBtnPrimary} onPress={handleNextSame}>
                <Text style={styles.successBtnPrimaryText}>⚖️ Same {sourceType === "plucker" ? "Plucker" : "Farmer"} Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.successBtnSecondary} onPress={handleNextDifferent}>
                <Text style={styles.successBtnSecondaryText}>👤 Next Person</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.successBtnHistory} onPress={() => { setShowSuccess(false); setWeighTab("history"); }}>
                <Text style={styles.successBtnHistoryText}>📊 View Today's Records</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════ SCALE SELECTOR MODAL (BLE + Classic) ════ */}
      <ScaleSelectorModal
        visible={showBLEModal}
        onClose={() => { setShowBLEModal(false); if (isScanning) stopScan(); }}
        activeScaleType={activeScaleType}
        onChangeScaleType={(t: ScaleType) => {
          setActiveScaleType(t);
          if (t === "classic" && !classicIsEnabled) classicEnableBt();
        }}
        // ── BLE props ──
        bleConnectedDevice={connectedDevice}
        bleSavedDevice={savedDevice}
        bleScaleReading={scaleReading}
        bleIsScanning={isScanning}
        bleIsAutoConnecting={isAutoConnecting}
        bleDiscoveredDevices={discoveredDevices}
        onBleStartScan={startScan}
        onBleStopScan={stopScan}
        onBleConnect={(device: any) => { connectToDevice(device); setShowBLEModal(false); }}
        onBleDisconnect={disconnect}
        onBleClearSaved={() => { clearSavedDevice(); Alert.alert("Cleared", "Saved BLE scale removed."); }}
        // ── Classic BT props ──
        classicConnectedDevice={classicConnectedDevice}
        classicSavedDevice={classicSavedDevice}
        classicScaleReading={classicScaleReading}
        classicIsConnecting={classicIsConnecting}
        classicIsAutoConnecting={classicIsAutoConnecting}
        classicIsScanning={classicIsScanning}
        classicIsEnabled={classicIsEnabled}
        classicError={classicError}
        classicPairedDevices={classicPairedDevices}
        onClassicGetPaired={classicGetPaired}
        onClassicConnect={(device: any) => { classicConnect(device); setShowBLEModal(false); }}
        onClassicDisconnect={classicDisconnect}
        onClassicClearSaved={() => { classicClearSaved(); Alert.alert("Cleared", "Saved Classic scale removed."); }}
        onClassicEnableBt={classicEnableBt}
      />

      {/* ════ RECEIPT PRINTER ════ */}
      <PrinterModal
        visible={showPrinterModal}
        onClose={() => setShowPrinterModal(false)}
        printer={printer}
      />
    </View>
  );
}

// ── SummaryRow ────────────────────────────────────────────────────────────────
function SummaryRow({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={sStyles.row}>
      <Text style={sStyles.icon}>{icon}</Text>
      <Text style={sStyles.label}>{label}</Text>
      <Text style={[sStyles.value, highlight && sStyles.valueHighlight]}>{value}</Text>
    </View>
  );
}

const sStyles = StyleSheet.create({
  row:            { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  icon:           { fontSize: 16, marginRight: 10, width: 24 },
  label:          { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  value:          { fontSize: fonts.sizes.sm, color: colors.textPrimary, fontWeight: "700", textAlign: "right", flex: 1.5 },
  valueHighlight: { color: colors.success, fontWeight: "900", fontSize: fonts.sizes.md },
});

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },

  header:      { backgroundColor: colors.collectorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  scalePill:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5 },
  scaleDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  scalePillText: { fontSize: 11, fontWeight: "800" },

  sourceToggle:           { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 4, gap: 4, marginBottom: spacing.sm },
  sourceToggleBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  sourceToggleBtnActive:  { backgroundColor: "#fff" },
  sourceToggleIcon:       { fontSize: 18 },
  sourceToggleText:       { fontSize: fonts.sizes.sm, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  sourceToggleTextActive: { color: colors.collectorColor },
  sourceCountBadge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  sourceCountText:        { fontSize: 10, fontWeight: "800" },

  sessionBanner:     { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  sessionBannerText: { fontSize: fonts.sizes.xs, color: "#fff", fontWeight: "700", textAlign: "center" },

  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },

  listContent: { padding: spacing.md },

  sourceCard:       { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", padding: spacing.sm, ...shadows.md },
  sourceAvatar:     { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginRight: 12 },
  sourceAvatarText: { fontSize: fonts.sizes.lg, fontWeight: "900" },
  sourceInfo:       { flex: 1 },
  sourceName:       { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  sourceMeta:       { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  paymentTag:       { backgroundColor: colors.primaryPale, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: "flex-start", marginTop: 5 },
  paymentTagText:   { fontSize: 10, color: colors.primary, fontWeight: "700" },
  sourceArrow:      { alignItems: "center", paddingLeft: spacing.sm },
  sourceArrowText:  { fontSize: 22 },
  sourceArrowLabel: { fontSize: 9, color: colors.collectorColor, fontWeight: "700", marginTop: 2 },

  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  weighHeader:      { backgroundColor: colors.collectorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, flexDirection: "row", alignItems: "center", gap: 10, ...shadows.md },
  backBtn:          { backgroundColor: "rgba(255,255,255,0.2)", width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  backIcon:         { fontSize: 20, color: "#fff", fontWeight: "700" },
  weighHeaderTitle: { fontSize: fonts.sizes.lg, fontWeight: "900", color: "#fff" },
  weighHeaderSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  subTabRow:        { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, padding: 3, gap: 3, ...shadows.sm },
  subTab:           { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  subTabActive:     { backgroundColor: colors.collectorColor },
  subTabText:       { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  subTabTextActive: { color: "#fff" },

  weighContent:   { padding: spacing.md },
  historyContent: { padding: spacing.md },

  scaleTypeToggle:     { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, gap: 3, marginBottom: spacing.md, ...shadows.sm },
  scaleTypeBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: radius.sm },
  scaleTypeBtnActive:  { backgroundColor: colors.collectorColor },
  scaleTypeIcon:       { fontSize: 16 },
  scaleTypeText:       { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  scaleTypeTextActive: { color: "#fff" },
  scaleTypeActiveDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success, marginLeft: 2 },

  btEnableCard:  { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.primary + "50" },
  btEnableIcon:  { fontSize: 24 },
  btEnableTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary },
  btEnableSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  btEnableArrow: { fontSize: 18, color: colors.primary, fontWeight: "700" },
  btErrorCard:   { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  btErrorText:   { fontSize: fonts.sizes.xs, color: colors.error, fontWeight: "600", textAlign: "center" },

  sourceInfoCard:       { backgroundColor: colors.collectorLight, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.collectorColor + "40" },
  sourceInfoAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  sourceInfoAvatarText: { fontSize: fonts.sizes.xl, fontWeight: "900" },
  sourceInfoName:       { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  sourceInfoMeta:       { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  personTodayBadge:     { backgroundColor: colors.collectorColor + "20", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: "flex-start" },
  personTodayText:      { fontSize: 10, color: colors.collectorColor, fontWeight: "700" },

  scaleDisplay:     { backgroundColor: colors.surface, borderRadius: radius.xl, marginBottom: spacing.md, borderWidth: 2, overflow: "hidden", ...shadows.lg },
  scaleStatusBar:   { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 8, gap: 8 },
  scaleStatusDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.7)" },
  scaleStatusText:  { flex: 1, fontSize: fonts.sizes.xs, color: "#fff", fontWeight: "700" },
  scaleManageText:  { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.8)", fontWeight: "700", textDecorationLine: "underline" },
  scaleWeightWrap:  { alignItems: "center", paddingVertical: spacing.xl },
  scaleWeightValue: { fontSize: 72, fontWeight: "900", letterSpacing: -2 },
  scaleWeightUnit:  { fontSize: fonts.sizes.lg, color: colors.textMuted, fontWeight: "600", marginTop: -8 },
  stabilitBadge:    { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.full, marginTop: spacing.sm },
  stabilityText:    { fontSize: fonts.sizes.xs, fontWeight: "800" },
  scaleOfflineWrap: { alignItems: "center", paddingVertical: spacing.xl },
  scaleOfflineIcon: { fontSize: 48, marginBottom: 8 },
  scaleOfflineText: { fontSize: fonts.sizes.md, fontWeight: "700", color: colors.textMuted },
  scaleOfflineSub:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 4, textAlign: "center", paddingHorizontal: spacing.md },

  capturedBanner:      { backgroundColor: colors.successLight, borderTopWidth: 1, borderTopColor: colors.success + "40", paddingHorizontal: spacing.md, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  capturedBannerLabel: { fontSize: 10, color: colors.success, fontWeight: "700" },
  capturedBannerValue: { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.success },
  capturedBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  capturedBadgeText:   { fontSize: 10, color: "#fff", fontWeight: "800" },

  scaleActions:    { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingTop: 0 },
  captureBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md },
  captureBtnIcon:  { fontSize: 18 },
  captureBtnText:  { fontSize: fonts.sizes.sm, fontWeight: "800" },
  manualBtn:       { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
  manualBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryPale },
  manualBtnText:   { fontSize: fonts.sizes.xs, fontWeight: "700", color: colors.textMuted },

  manualInputCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  manualInputLabel:  { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textSecondary, marginBottom: 8 },
  manualInputWrap:   { flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, height: 56 },
  manualInputIcon:   { fontSize: 20, marginRight: 10 },
  manualInput:       { flex: 1, fontSize: 28, fontWeight: "900", color: colors.primary },
  manualInputSuffix: { fontSize: fonts.sizes.md, color: colors.textMuted, fontWeight: "600" },

  batchCard:        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", ...shadows.sm },
  batchCardLeft:    { flex: 1 },
  batchCardLabel:   { fontSize: fonts.sizes.xs, color: colors.textMuted, fontWeight: "600" },
  batchCardValue:   { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  batchRefreshBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  batchRefreshIcon: { fontSize: 18 },

  notesCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  notesLabel:  { fontSize: fonts.sizes.xs, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  notesInput:  { fontSize: fonts.sizes.sm, color: colors.textPrimary, minHeight: 48 },

  summaryCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  summaryTitle: { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },

  saveBtn:         { backgroundColor: colors.collectorColor, borderRadius: radius.lg, height: 58, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, ...shadows.lg },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText:     { fontSize: fonts.sizes.sm, fontWeight: "900", color: "#fff", textAlign: "center", paddingHorizontal: spacing.sm },

  personGroup:            { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, overflow: "hidden", ...shadows.md },
  personGroupHighlighted: { borderWidth: 2, borderColor: colors.collectorColor },
  personGroupHeader:      { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, backgroundColor: colors.background },
  personGroupAvatar:      { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  personGroupAvatarText:  { fontSize: fonts.sizes.lg, fontWeight: "900" },
  personGroupName:        { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  personGroupType:        { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  personTotalBadge:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, alignItems: "center" },
  personTotalBadgeValue:  { fontSize: fonts.sizes.lg, fontWeight: "900", color: "#fff" },
  personTotalBadgeUnit:   { fontSize: 9, color: "rgba(255,255,255,0.8)", marginTop: 1 },

  weightRecordRow:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  weightRecordLeft:  { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  weightRecordDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.collectorColor, marginTop: 5 },
  weightRecordBatch: { fontSize: fonts.sizes.xs, fontWeight: "700", color: colors.textPrimary },
  weightRecordTime:  { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  weightRecordNotes: { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontStyle: "italic" },
  weightRecordRight: { alignItems: "flex-end" },
  weightRecordKg:    { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.collectorColor },
  weightRecordUnit:  { fontSize: 10, color: colors.textMuted },

  personSubtotalRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.collectorLight },
  personSubtotalLabel: { fontSize: fonts.sizes.xs, fontWeight: "700", color: colors.textSecondary },
  personSubtotalValue: { fontSize: fonts.sizes.md, fontWeight: "900" },

  grandTotalsCard:      { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, borderWidth: 2, borderColor: colors.collectorColor, ...shadows.lg },
  grandTotalsTitle:     { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.textPrimary, marginBottom: spacing.md },
  grandTotalRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  grandTotalLeft:       { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  grandTotalIcon:       { fontSize: 28 },
  grandTotalLabel:      { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  grandTotalSub:        { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  grandTotalValue:      { fontSize: fonts.sizes.lg, fontWeight: "900" },
  grandTotalDivider:    { height: 1, backgroundColor: colors.divider },
  grandTotalFinalRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, marginTop: 4, borderTopWidth: 2, borderTopColor: colors.collectorColor + "40" },
  grandTotalFinalValue: { fontSize: 28, fontWeight: "900", color: colors.collectorColor },

  successOverlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  successCard:             { backgroundColor: colors.surface, borderRadius: 28, padding: spacing.xl, alignItems: "center", width: width - 64, ...shadows.lg },
  successEmoji:            { fontSize: 64, marginBottom: 12 },
  successTitle:            { fontSize: fonts.sizes.xl, fontWeight: "900", color: colors.success, marginBottom: 8 },
  successValue:            { fontSize: 40, fontWeight: "900", color: colors.textPrimary },
  successName:             { fontSize: fonts.sizes.md, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  successBatch:            { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  successStats:            { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.lg },
  successStat:             { alignItems: "center" },
  successStatValue:        { fontSize: 28, fontWeight: "900", color: colors.collectorColor },
  successStatLabel:        { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  successActions:          { width: "100%", gap: spacing.sm },
  successBtnPrimary:       { backgroundColor: colors.collectorColor, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  successBtnPrimaryText:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
  successBtnSecondary:     { backgroundColor: colors.primaryPale, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  successBtnSecondaryText: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary },
  successBtnHistory:       { backgroundColor: colors.border, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  successBtnHistoryText:   { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textSecondary },
  printRow:                { alignItems: "center", marginTop: 8, marginBottom: 4 },
  printRowText:            { fontSize: fonts.sizes.sm, fontWeight: "700", textAlign: "center" },
  reprintBtn:              { marginTop: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.collectorColor },
  reprintBtnText:          { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.collectorColor },

  offlineBanner:      { backgroundColor: "#7C3AED20", borderWidth: 1, borderColor: "#7C3AED50", paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  offlineBannerText:  { fontSize: fonts.sizes.xs, color: "#7C3AED", fontWeight: "700", textAlign: "center" },
  successOfflineNote: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: 8 },
});