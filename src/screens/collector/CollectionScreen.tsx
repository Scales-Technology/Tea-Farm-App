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

const formatTime = (ts: any): string => {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
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

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");

  // ── BLE ───────────────────────────────────────────────────────────────────
  const {
    isScanning, connectedDevice, discoveredDevices,
    scaleReading, capturedWeight, savedDevice, isAutoConnecting,
    startScan, stopScan, connectToDevice, disconnect,
    captureWeight, clearSavedDevice,
  } = useBLE();

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
    if (scaleReading?.isStable) startPulse(); else stopPulse();
    return stopPulse;
  }, [scaleReading?.isStable]);

  // ── Load sources ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // ── Check connectivity first ──────────────────────────────────────
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
      if (!oid) return;

      const col      = sourceType === "plucker" ? COLLECTIONS.PLUCKERS : "farmers";
      const cacheKey = `sources_${col}_${oid}`;

      if (!online) {
        // ── Offline: serve from cache ─────────────────────────────────
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

      // ── Online: fetch fresh then cache ────────────────────────────────
      const snap = await getDocs(query(collection(db, col), where("organizationId", "==", oid)));
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Source))
        .filter((s: any) => s.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
      setSources(list);
      await saveCache(cacheKey, list); // ← cache for next offline use

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

  // Load history when switching to history tab
  useEffect(() => {
    if (weighTab === "history" && orgIdRef.current) loadHistory();
  }, [weighTab, loadHistory]);

  // ── History analytics ─────────────────────────────────────────────────────
  const historyStats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayRecs = history.filter(r => r.date === today);

    // Per-person totals
    const personMap: Record<string, { name: string; type: string; totalKg: number; records: CollectionRecord[] }> = {};
    todayRecs.forEach(r => {
      if (!personMap[r.sourceId]) {
        personMap[r.sourceId] = { name: r.sourceName, type: r.sourceType, totalKg: 0, records: [] };
      }
      personMap[r.sourceId].totalKg += r.weightKg || 0;
      personMap[r.sourceId].records.push(r);
    });

    const persons = Object.values(personMap).sort((a, b) => b.totalKg - a.totalKg);

    const pluckerRecs = todayRecs.filter(r => r.sourceType === "plucker");
    const farmerRecs  = todayRecs.filter(r => r.sourceType === "farmer");

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

  const activeWeight: number = useManual
    ? (parseFloat(manualWeight) || 0)
    : (capturedWeight?.weight ?? scaleReading?.weight ?? 0);

  const activeUnit = capturedWeight?.unit ?? scaleReading?.unit ?? "kg";

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
    };

    setSaving(true);
    try {
      // ── offlineSave: writes to Firestore if online, queues if offline ──
      const result = await offlineSave(COLLECTIONS.COLLECTIONS, record);

      // Audit log — also offline-safe
      await offlineSave(COLLECTIONS.AUDIT_LOGS, {
        actorId:        actorIdRef.current,
        actorName:      actorNameRef.current,
        actorRole:      "collector_supervisor",
        action:         `Recorded collection: ${selectedSource.name} — ${activeWeight}${activeUnit} (${batchNumber})`,
        module:         "collections",
        outcome:        "success",
        organizationId: orgIdRef.current,
        referenceId:    result.id || batchNumber,
      });

      // Add to local history immediately (works online AND offline)
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

      // Notify user if saved offline
      if (!result.savedOnline) {
        setTimeout(() => {
          Alert.alert(
            "📴 Saved Offline",
            "No network detected. This record is saved on your device and will automatically sync to the cloud when you reconnect.",
            [{ text: "OK" }]
          );
        }, 600); // slight delay so success modal shows first
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

  const scaleConnected  = !!connectedDevice;
  const scaleConnecting = isAutoConnecting && !connectedDevice;
  const scaleStatusColor = scaleConnected ? colors.success : scaleConnecting ? colors.warning : colors.error;

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
                  {scaleConnected ? "⚖️ Scale" : scaleConnecting ? "🔄" : "⚠️ Scale"}
                </Text>
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
            <TextInput style={styles.searchInput} placeholder={`Search ${sourceType === "plucker" ? "pluckers" : "farmers"}...`}
              placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" />
            {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery("")}><Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text></TouchableOpacity>}
          </View>

          <ScrollView style={styles.flex1} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
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
          {/* Weigh header */}
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
                {scaleConnected ? "⚖️ ON" : scaleConnecting ? "🔄" : "⚠️"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Offline banner */}
          {isOffline && (
            <View style={[styles.offlineBanner, { marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md }]}>
              <Text style={styles.offlineBannerText}>📴 Offline mode — records queued for sync</Text>
            </View>
          )}

          {/* Sub-tabs */}
          <View style={styles.subTabRow}>
            <TouchableOpacity style={[styles.subTab, weighTab === "weigh" && styles.subTabActive]} onPress={() => setWeighTab("weigh")}>
              <Text style={[styles.subTabText, weighTab === "weigh" && styles.subTabTextActive]}>⚖️ Record Weight</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.subTab, weighTab === "history" && styles.subTabActive]}
              onPress={() => { setWeighTab("history"); if (orgIdRef.current) loadHistory(); }}>
              <Text style={[styles.subTabText, weighTab === "history" && styles.subTabTextActive]}>
                📊 Today's Records {history.length > 0 ? `(${history.length})` : ""}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── WEIGH TAB ── */}
          {weighTab === "weigh" && (
            <ScrollView style={styles.flex1} contentContainerStyle={styles.weighContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Source info card */}
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
                  {/* This person's total today */}
                  {(() => {
                    const personTotal = history.filter(r => r.sourceId === selectedSource.id).reduce((s, r) => s + (r.weightKg || 0), 0);
                    if (personTotal > 0) return (
                      <View style={styles.personTodayBadge}>
                        <Text style={styles.personTodayText}>Today so far: {personTotal.toFixed(2)} kg ({history.filter(r => r.sourceId === selectedSource.id).length} batch{history.filter(r => r.sourceId === selectedSource.id).length !== 1 ? "es" : ""})</Text>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* Scale display */}
              <View style={[styles.scaleDisplay, { borderColor: scaleConnected ? (scaleReading?.isStable ? colors.success : colors.collectorColor) : colors.border }]}>
                <View style={[styles.scaleStatusBar, { backgroundColor: scaleStatusColor }]}>
                  <View style={[styles.scaleStatusDot]} />
                  <Text style={styles.scaleStatusText}>
                    {scaleConnected ? (connectedDevice?.name || savedDevice?.name || "BLE Scale") : scaleConnecting ? "Connecting..." : savedDevice ? `Saved: ${savedDevice.name}` : "No scale"}
                  </Text>
                  <TouchableOpacity onPress={() => setShowBLEModal(true)}>
                    <Text style={styles.scaleManageText}>Manage</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.scaleWeightWrap}>
                  {scaleConnected && !useManual ? (
                    <>
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Text style={[styles.scaleWeightValue, { color: scaleReading?.isStable ? colors.success : colors.collectorColor }]}>
                          {scaleReading ? scaleReading.weight.toFixed(2) : "0.00"}
                        </Text>
                      </Animated.View>
                      <Text style={styles.scaleWeightUnit}>{scaleReading?.unit ?? "kg"}</Text>
                      <View style={[styles.stabilitBadge, { backgroundColor: scaleReading?.isStable ? colors.successLight : colors.warningLight }]}>
                        <Text style={[styles.stabilityText, { color: scaleReading?.isStable ? colors.success : colors.warning }]}>
                          {scaleReading?.isStable ? "✅ STABLE — Ready to capture" : "⏳ Stabilizing..."}
                        </Text>
                      </View>
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
                      <Text style={styles.scaleOfflineText}>{scaleConnecting ? "Connecting to scale..." : "Scale not connected"}</Text>
                      <Text style={styles.scaleOfflineSub}>Tap "Manage" to connect or enter weight manually</Text>
                    </View>
                  )}
                </View>

                {capturedWeight && !useManual && (
                  <View style={styles.capturedBanner}>
                    <View>
                      <Text style={styles.capturedBannerLabel}>📌 Captured Weight</Text>
                      <Text style={styles.capturedBannerValue}>{capturedWeight.weight.toFixed(2)} {capturedWeight.unit}</Text>
                    </View>
                    <View style={[styles.capturedBadge, { backgroundColor: colors.success }]}>
                      <Text style={styles.capturedBadgeText}>LOCKED ✓</Text>
                    </View>
                  </View>
                )}

                <View style={styles.scaleActions}>
                  {scaleConnected && !useManual && (
                    <TouchableOpacity
                      style={[styles.captureBtn, { backgroundColor: scaleReading?.isStable ? colors.success : colors.border }]}
                      onPress={captureWeight} disabled={!scaleReading?.isStable} activeOpacity={0.85}
                    >
                      <Text style={styles.captureBtnIcon}>📌</Text>
                      <Text style={[styles.captureBtnText, { color: scaleReading?.isStable ? "#fff" : colors.textMuted }]}>
                        {capturedWeight ? "Re-Capture" : "Capture Weight"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.manualBtn, useManual && styles.manualBtnActive]} onPress={() => { setUseManual(!useManual); setManualWeight(""); }}>
                    <Text style={[styles.manualBtnText, useManual && { color: colors.primary }]}>{useManual ? "↩ Use Scale" : "✏️ Manual"}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {useManual && (
                <View style={styles.manualInputCard}>
                  <Text style={styles.manualInputLabel}>Enter Weight (kg)</Text>
                  <View style={styles.manualInputWrap}>
                    <Text style={styles.manualInputIcon}>⚖️</Text>
                    <TextInput style={styles.manualInput} value={manualWeight} onChangeText={setManualWeight}
                      placeholder="e.g. 12.50" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" autoFocus />
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
                <TextInput style={styles.notesInput} value={notes} onChangeText={setNotes}
                  placeholder="Any notes about this collection..." placeholderTextColor={colors.textMuted} multiline numberOfLines={2} textAlignVertical="top" />
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📋 Collection Summary</Text>
                <SummaryRow icon="👤" label="Collected From" value={selectedSource.name} />
                <SummaryRow icon={sourceType === "plucker" ? "🧺" : "👨‍🌾"} label="Type" value={sourceType === "plucker" ? "Plucker" : "Farmer"} />
                <SummaryRow icon="⚖️" label="Weight" value={activeWeight > 0 ? `${activeWeight.toFixed(2)} ${activeUnit}` : "—"} highlight={activeWeight > 0} />
                <SummaryRow icon="🔢" label="Batch No." value={batchNumber} />
                <SummaryRow icon="📅" label="Date" value={new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })} />
                {notes.trim() && <SummaryRow icon="📝" label="Notes" value={notes.trim()} />}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (activeWeight <= 0 || saving) && styles.saveBtnDisabled]}
                onPress={handleSave} disabled={saving || activeWeight <= 0} activeOpacity={0.85}
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
            <ScrollView style={styles.flex1} contentContainerStyle={styles.historyContent} showsVerticalScrollIndicator={false}
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
                  {/* ── Per-person breakdown ── */}
                  {historyStats.persons.map((person, pi) => {
                    const personRecs = person.records.sort((a, b) => {
                      const aT = a.createdAt?.toDate?.()?.getTime() || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
                      const bT = b.createdAt?.toDate?.()?.getTime() || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
                      return bT - aT;
                    });
                    const isCurrentPerson = selectedSource && person.records[0]?.sourceId === selectedSource.id;
                    return (
                      <View key={personRecs[0]?.sourceId || pi} style={[styles.personGroup, isCurrentPerson && styles.personGroupHighlighted]}>
                        {/* Person header */}
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

                        {/* Individual weight records */}
                        {personRecs.map((rec, ri) => (
                          <View key={rec.id} style={styles.weightRecordRow}>
                            <View style={styles.weightRecordLeft}>
                              <View style={styles.weightRecordDot} />
                              <View>
                                <Text style={styles.weightRecordBatch}>{rec.batchNumber}</Text>
                                <Text style={styles.weightRecordTime}>
                                  🕐 {formatDateTime(rec.createdAt)}
                                </Text>
                                {rec.notes ? <Text style={styles.weightRecordNotes}>💬 {rec.notes}</Text> : null}
                              </View>
                            </View>
                            <View style={styles.weightRecordRight}>
                              <Text style={styles.weightRecordKg}>{(rec.weightKg || 0).toFixed(2)}</Text>
                              <Text style={styles.weightRecordUnit}>{rec.unit}</Text>
                            </View>
                          </View>
                        ))}

                        {/* Person subtotal */}
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

                  {/* ── Grand Totals Card ── */}
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
                        <Text style={[styles.grandTotalValue, { color: colors.collectorColor }]}>
                          {historyStats.totalPluckers.toFixed(2)} kg
                        </Text>
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
                          <Text style={[styles.grandTotalValue, { color: colors.primary }]}>
                            {historyStats.totalFarmers.toFixed(2)} kg
                          </Text>
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

      {/* ════ BLE MODAL ════ */}
      <Modal visible={showBLEModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bleModal}>
            <View style={styles.bleModalHeader}>
              <Text style={styles.bleModalTitle}>⚖️ Scale Connection</Text>
              <TouchableOpacity onPress={() => { setShowBLEModal(false); if (isScanning) stopScan(); }}>
                <Text style={styles.bleModalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {connectedDevice ? (
              <View style={styles.bleConnectedCard}>
                <View style={styles.bleConnectedLeft}>
                  <View style={[styles.bleConnectedDot, { backgroundColor: colors.success }]} />
                  <View>
                    <Text style={styles.bleConnectedName}>{connectedDevice.name || savedDevice?.name || "BLE Scale"}</Text>
                    <Text style={styles.bleConnectedSub}>
                      {scaleReading ? `Live: ${scaleReading.weight.toFixed(2)} ${scaleReading.unit} ${scaleReading.isStable ? "✅ Stable" : "⏳"}` : "Connected — waiting for reading..."}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.bleDisconnectBtn} onPress={disconnect}>
                  <Text style={styles.bleDisconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.bleConnectedCard, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
                <View style={[styles.bleConnectedDot, { backgroundColor: scaleConnecting ? colors.warning : colors.error }]} />
                <Text style={[styles.bleConnectedName, { color: colors.warning }]}>
                  {scaleConnecting ? "Auto-connecting..." : savedDevice ? `Saved: ${savedDevice.name}` : "No scale connected"}
                </Text>
              </View>
            )}

            {savedDevice && !connectedDevice && (
              <View style={styles.bleSavedCard}>
                <Text style={styles.bleSavedIcon}>💾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bleSavedName}>{savedDevice.name}</Text>
                  <Text style={styles.bleSavedSub}>Saved — auto-connects on next open</Text>
                </View>
                <TouchableOpacity onPress={() => { clearSavedDevice(); Alert.alert("Cleared", "Saved scale removed."); }}>
                  <Text style={styles.bleSavedClear}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {!connectedDevice && (
              <TouchableOpacity style={[styles.bleScanBtn, isScanning && styles.bleScanBtnActive]} onPress={isScanning ? stopScan : startScan}>
                <Text style={styles.bleScanBtnText}>{isScanning ? "⏹ Stop Scanning" : "🔍 Scan for Scale"}</Text>
              </TouchableOpacity>
            )}

            {isScanning && discoveredDevices.length === 0 && (
              <View style={styles.bleScanningWrap}>
                <Text style={styles.bleScanningText}>🔄 Scanning for nearby BLE devices...</Text>
              </View>
            )}

            {discoveredDevices.length > 0 && (
              <>
                <Text style={styles.bleDevicesTitle}>Nearby Devices ({discoveredDevices.length})</Text>
                <ScrollView style={styles.bleDevicesList} showsVerticalScrollIndicator={false}>
                  {discoveredDevices.map(device => (
                    <TouchableOpacity key={device.id} style={styles.bleDeviceCard} onPress={() => { connectToDevice(device); setShowBLEModal(false); }}>
                      <View style={styles.bleDeviceLeft}>
                        <Text style={styles.bleDeviceIcon}>⚖️</Text>
                        <View>
                          <Text style={styles.bleDeviceName}>{device.name || device.localName || "Unknown Device"}</Text>
                          <Text style={styles.bleDeviceId}>{device.id.substring(0, 17)}...</Text>
                        </View>
                      </View>
                      <View style={styles.bleConnectBtn}>
                        <Text style={styles.bleConnectBtnText}>Connect</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <View style={{ height: 24 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

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

  sourceToggle:          { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 4, gap: 4, marginBottom: spacing.sm },
  sourceToggleBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.sm },
  sourceToggleBtnActive: { backgroundColor: "#fff" },
  sourceToggleIcon:      { fontSize: 18 },
  sourceToggleText:      { fontSize: fonts.sizes.sm, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  sourceToggleTextActive:{ color: colors.collectorColor },
  sourceCountBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  sourceCountText:       { fontSize: 10, fontWeight: "800" },

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

  // Weigh step
  weighHeader:      { backgroundColor: colors.collectorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, flexDirection: "row", alignItems: "center", gap: 10, ...shadows.md },
  backBtn:          { backgroundColor: "rgba(255,255,255,0.2)", width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  backIcon:         { fontSize: 20, color: "#fff", fontWeight: "700" },
  weighHeaderTitle: { fontSize: fonts.sizes.lg, fontWeight: "900", color: "#fff" },
  weighHeaderSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  // Sub-tabs
  subTabRow:        { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, padding: 3, gap: 3, ...shadows.sm },
  subTab:           { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  subTabActive:     { backgroundColor: colors.collectorColor },
  subTabText:       { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  subTabTextActive: { color: "#fff" },

  weighContent:  { padding: spacing.md },
  historyContent:{ padding: spacing.md },

  sourceInfoCard:       { backgroundColor: colors.collectorLight, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.collectorColor + "40" },
  sourceInfoAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  sourceInfoAvatarText: { fontSize: fonts.sizes.xl, fontWeight: "900" },
  sourceInfoName:       { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  sourceInfoType:       { fontSize: fonts.sizes.xs, color: colors.collectorColor, fontWeight: "700", marginTop: 2 },
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

  batchCard:       { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", ...shadows.sm },
  batchCardLeft:   { flex: 1 },
  batchCardLabel:  { fontSize: fonts.sizes.xs, color: colors.textMuted, fontWeight: "600" },
  batchCardValue:  { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  batchRefreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryPale, alignItems: "center", justifyContent: "center" },
  batchRefreshIcon:{ fontSize: 18 },

  notesCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  notesLabel:  { fontSize: fonts.sizes.xs, color: colors.textMuted, fontWeight: "600", marginBottom: 8 },
  notesInput:  { fontSize: fonts.sizes.sm, color: colors.textPrimary, minHeight: 48 },

  summaryCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  summaryTitle: { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },

  saveBtn:         { backgroundColor: colors.collectorColor, borderRadius: radius.lg, height: 58, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, ...shadows.lg },
  saveBtnDisabled: { backgroundColor: colors.border },
  saveBtnText:     { fontSize: fonts.sizes.sm, fontWeight: "900", color: "#fff", textAlign: "center", paddingHorizontal: spacing.sm },

  // ── History ──
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

  // Grand totals
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

  // Success
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

  // BLE modal
  modalOverlay:     { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  bleModal:         { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: height * 0.75 },
  bleModalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  bleModalTitle:    { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  bleModalClose:    { fontSize: 20, color: colors.textMuted, padding: 4 },
  bleConnectedCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.success + "40" },
  bleConnectedLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  bleConnectedDot:  { width: 12, height: 12, borderRadius: 6 },
  bleConnectedName: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  bleConnectedSub:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  bleDisconnectBtn: { backgroundColor: colors.errorLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  bleDisconnectText:{ fontSize: 11, color: colors.error, fontWeight: "700" },
  bleSavedCard:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  bleSavedIcon:     { fontSize: 20 },
  bleSavedName:     { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  bleSavedSub:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  bleSavedClear:    { fontSize: 11, color: colors.error, fontWeight: "700", paddingHorizontal: 8 },
  bleScanBtn:       { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginBottom: spacing.sm },
  bleScanBtnActive: { backgroundColor: colors.error },
  bleScanBtnText:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
  bleScanningWrap:  { alignItems: "center", paddingVertical: spacing.md },
  bleScanningText:  { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600" },
  bleDevicesTitle:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  bleDevicesList:   { maxHeight: 200 },
  bleDeviceCard:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginBottom: 6 },
  bleDeviceLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  bleDeviceIcon:    { fontSize: 22 },
  bleDeviceName:    { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  bleDeviceId:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  bleConnectBtn:    { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  bleConnectBtnText:{ fontSize: 11, color: "#fff", fontWeight: "800" },

  // ── Offline banner ──
  offlineBanner:     { backgroundColor: "#7C3AED20", borderWidth: 1, borderColor: "#7C3AED50", paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  offlineBannerText: { fontSize: fonts.sizes.xs, color: "#7C3AED", fontWeight: "700", textAlign: "center" },
  successOfflineNote:{ fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: 8 },
});