// ─── Grading Screen v3 — TeaFarm Pro ──────────────────────────────────────────
// STEP 2 of flow: Grade raw stock ONLY — no sale, no price, no buyer yet.
// Saves to COLLECTIONS.GRADINGS. Sales happen separately in NewSaleScreen.
// v3: Full BLE + Classic Bluetooth dual-scale support.
//     useClassicBluetooth now uses rn-bluetooth-classic useBluetooth hook
//     internally — receivedData reactive, base64 decoded, isAutoConnecting split.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
  KeyboardAvoidingView, Platform, RefreshControl, Animated, Easing,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { COLLECTIONS } from "../../firebase/auth";
import { useBLE } from "../../hooks/useBLE";
import { useClassicBluetooth } from "../../hooks/useClassicBluetooth";
import ScaleSelectorModal, { ScaleType } from "../../components/ScaleSelectorModal";
import TeaLoader from "../../components/TeaLoader";
import { useLoader } from "../../context/LoaderContext";
import { offlineSave } from "../../utils/offlineSave";

const db   = getFirestore();
const auth = getAuth();
type WeighTarget = "A" | "B" | null;

interface GradingRecord {
  id: string; batchNumber: string; gradeA_kg: number; gradeB_kg: number;
  rejected_kg: number; gradedBy: string; date: string; notes: string;
  createdAt: any; soldA_kg?: number; soldB_kg?: number;
}
interface GradingStats {
  totalGradeA: number; totalGradeB: number; totalRejected: number;
  totalBatches: number; availableA: number; availableB: number;
}

const genBatch = () => {
  const n = new Date();
  return `GRD-${n.getFullYear()}${String(n.getMonth()+1).padStart(2,"0")}${String(n.getDate()).padStart(2,"0")}-${Math.floor(Math.random()*9000+1000)}`;
};

export default function GradingScreen({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [records, setRecords]       = useState<GradingRecord[]>([]);
  const [stats, setStats]           = useState<GradingStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [activeTab, setActiveTab]   = useState<"records"|"stats">("records");
  const [rawStock, setRawStock]     = useState(0);
  const [showBLEModal, setShowBLEModal] = useState(false);
  const [activeScaleType, setActiveScaleType] = useState<ScaleType>("ble");

  // form
  const [batch, setBatch]       = useState(genBatch());
  const [notes, setNotes]       = useState("");
  const [aMode, setAMode]       = useState<"scale"|"manual">("scale");
  const [aManual, setAManual]   = useState("");
  const [aCap, setACap]         = useState<{weight:number;unit:string}|null>(null);
  const [bMode, setBMode]       = useState<"scale"|"manual">("scale");
  const [bManual, setBManual]   = useState("");
  const [bCap, setBCap]         = useState<{weight:number;unit:string}|null>(null);
  const [rejKgStr, setRejKgStr] = useState("");
  const [target, setTarget]     = useState<WeighTarget>(null);

  const orgId = useRef(""); const actor = useRef(""); const actorId = useRef("");

  // ── BLE ───────────────────────────────────────────────────────────────────
  const {
    isScanning, connectedDevice, discoveredDevices, scaleReading, capturedWeight,
    savedDevice, isAutoConnecting, startScan, stopScan, connectToDevice,
    disconnect, captureWeight, clearSavedDevice,
  } = useBLE();

  // ── Classic Bluetooth ─────────────────────────────────────────────────────
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

  // ── Unified scale abstractions ────────────────────────────────────────────
  const activeScaleReading   = activeScaleType === "ble" ? scaleReading   : classicScaleReading;
  const activeCapturedWeight = activeScaleType === "ble" ? capturedWeight : classicCapturedWeight;
  const activeConnected      = activeScaleType === "ble" ? !!connectedDevice : !!classicConnectedDevice;

  // FIX: use both isAutoConnecting + isConnecting for Classic, guard with !connected
  const activeConnecting = activeScaleType === "ble"
    ? (isAutoConnecting && !connectedDevice)
    : (classicIsAutoConnecting || classicIsConnecting) && !classicConnectedDevice;

  const activeSavedDevice = activeScaleType === "ble" ? savedDevice : classicSavedDevice;

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

  // ── Unified scale status UI ───────────────────────────────────────────────
  const scaleStatusColor = activeConnected
    ? colors.success
    : activeConnecting
    ? colors.warning
    : colors.error;

  const scaleStatusLabel = (() => {
    if (activeConnected) {
      const name = activeScaleType === "ble"
        ? (connectedDevice?.name    || savedDevice?.name    || "BLE Scale")
        : (classicConnectedDevice?.name || classicSavedDevice?.name || "Classic Scale");
      return name;
    }
    if (activeConnecting) return "Connecting...";
    if (activeSavedDevice) return `Saved: ${activeSavedDevice.name}`;
    return "No scale";
  })();

  const scaleTypeLabel = activeScaleType === "ble" ? "BLE" : "Classic";

  // ── Pulse animation ───────────────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(1)).current;
  const loop  = useRef<any>(null);
  const startP = () => {
    loop.current = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.07, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.current.start();
  };
  const stopP = () => { loop.current?.stop(); pulse.setValue(1); };
  useEffect(() => {
    if (activeScaleReading?.isStable) startP(); else stopP();
    return stopP;
  }, [activeScaleReading?.isStable]);

  // ── Route captured weight to the correct grade slot ───────────────────────
  const prevBleCap     = useRef<typeof capturedWeight>(null);
  const prevClassicCap = useRef<typeof classicCapturedWeight>(null);

  useEffect(() => {
    if (!capturedWeight || capturedWeight === prevBleCap.current) return;
    prevBleCap.current = capturedWeight;
    if (activeScaleType !== "ble") return;
    if (target === "A") setACap({ weight: capturedWeight.weight, unit: capturedWeight.unit });
    else if (target === "B") setBCap({ weight: capturedWeight.weight, unit: capturedWeight.unit });
  }, [capturedWeight, target, activeScaleType]);

  useEffect(() => {
    if (!classicCapturedWeight || classicCapturedWeight === prevClassicCap.current) return;
    prevClassicCap.current = classicCapturedWeight;
    if (activeScaleType !== "classic") return;
    if (target === "A") setACap({ weight: classicCapturedWeight.weight, unit: classicCapturedWeight.unit });
    else if (target === "B") setBCap({ weight: classicCapturedWeight.weight, unit: classicCapturedWeight.unit });
  }, [classicCapturedWeight, target, activeScaleType]);

  // ── Derived weights ───────────────────────────────────────────────────────
  const aKg   = aMode === "manual" ? (parseFloat(aManual) || 0) : (aCap?.weight ?? 0);
  const bKg   = bMode === "manual" ? (parseFloat(bManual) || 0) : (bCap?.weight ?? 0);
  const rKg   = parseFloat(rejKgStr) || 0;
  const total = aKg + bKg + rKg;
  const shortfall = Math.max(0, total - rawStock);
  const stockOk   = shortfall === 0 || total === 0;

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid; if (!uid) return;
      const uSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
      if (!uSnap.exists()) return;
      const u = uSnap.data()!;
      orgId.current   = u.organizationId || "";
      actor.current   = u.name || "Sales Supervisor";
      actorId.current = uid;
      if (!orgId.current) return;

      const [gSnap, cSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.GRADINGS),    where("organizationId", "==", orgId.current))),
        getDocs(query(collection(db, COLLECTIONS.COLLECTIONS), where("organizationId", "==", orgId.current))),
        getDocs(query(collection(db, COLLECTIONS.SALES),       where("organizationId", "==", orgId.current))),
      ]);

      const soldMap: Record<string, { sA: number; sB: number }> = {};
      sSnap.docs.forEach(d => {
        const s = d.data(); const g = s.gradingId || "";
        if (!soldMap[g]) soldMap[g] = { sA: 0, sB: 0 };
        soldMap[g].sA += s.gradeA_kg || 0;
        soldMap[g].sB += s.gradeB_kg || 0;
      });

      const recs = gSnap.docs.map(d => {
        const data = d.data(); const sm = soldMap[d.id] || { sA: 0, sB: 0 };
        return { id: d.id, ...data, soldA_kg: sm.sA, soldB_kg: sm.sB } as GradingRecord;
      }).sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));

      setRecords(recs);

      let tA = 0, tB = 0, tR = 0, avA = 0, avB = 0;
      recs.forEach(r => {
        tA  += r.gradeA_kg || 0; tB += r.gradeB_kg || 0; tR += r.rejected_kg || 0;
        avA += Math.max(0, (r.gradeA_kg || 0) - (r.soldA_kg || 0));
        avB += Math.max(0, (r.gradeB_kg || 0) - (r.soldB_kg || 0));
      });
      setStats({
        totalGradeA:   Math.round(tA * 10) / 10,
        totalGradeB:   Math.round(tB * 10) / 10,
        totalRejected: Math.round(tR * 10) / 10,
        totalBatches:  recs.length,
        availableA:    Math.round(avA * 10) / 10,
        availableB:    Math.round(avB * 10) / 10,
      });

      let col = 0;
      cSnap.docs.forEach(d => { col += d.data().weightKg || 0; });
      setRawStock(Math.max(0, Math.round((col - tA - tB - tR) * 10) / 10));
    } catch (e: any) { console.log("Grading load:", e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setBatch(genBatch()); setNotes(""); setAMode("scale"); setAManual(""); setACap(null);
    setBMode("scale"); setBManual(""); setBCap(null); setRejKgStr(""); setTarget(null);
  };

  // ── Save grading record ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!aKg && !bKg) return Alert.alert("Required", "Enter at least Grade A or Grade B weight.");
    if (total > rawStock) return Alert.alert(
      "⚠️ Insufficient Stock",
      `Only ${rawStock.toFixed(1)} kg available.\nRequested: ${total.toFixed(1)} kg`
    );
    setSaving(true); showLoader("Saving grading record...");
    try {
      const today = new Date().toISOString().split("T")[0];

      const result = await offlineSave(COLLECTIONS.GRADINGS, {
        batchNumber: batch.trim(), gradeA_kg: aKg, gradeB_kg: bKg, rejected_kg: rKg,
        notes: notes.trim(), gradedBy: actor.current, date: today,
        organizationId: orgId.current,
        scaleType: activeScaleType,
      });

      await offlineSave(COLLECTIONS.AUDIT_LOGS, {
        actorId: actorId.current, actorName: actor.current, actorRole: "sales_supervisor",
        action: `Graded ${batch}: A=${aKg}kg B=${bKg}kg R=${rKg}kg via ${activeScaleType === "ble" ? "BLE" : "Classic BT"}`,
        module: "gradings", outcome: "success", organizationId: orgId.current,
        referenceId: result.id ?? "offline",
      });

      if (!result.savedOnline) {
        Alert.alert(
          "📴 Saved Offline",
          "No internet connection. This record has been saved to your device and will automatically sync to the cloud when you reconnect.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "✅ Grading Saved",
          `A: ${aKg}kg  B: ${bKg}kg  Rejected: ${rKg}kg\n\nHead to Sales to sell when ready.`
        );
      }

      setShowModal(false); reset(); await load();
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSaving(false); hideLoader(); }
  };

  if (loading) return <TeaLoader message="Loading Grading..." subMessage="Sales Supervisor" />;

  const tTea = (stats?.totalGradeA || 0) + (stats?.totalGradeB || 0) + (stats?.totalRejected || 0);
  const pA   = tTea > 0 ? Math.round(((stats?.totalGradeA   || 0) / tTea) * 100) : 0;
  const pB   = tTea > 0 ? Math.round(((stats?.totalGradeB   || 0) / tTea) * 100) : 0;
  const pR   = tTea > 0 ? Math.round(((stats?.totalRejected || 0) / tTea) * 100) : 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* ════ HEADER ════ */}
      <View style={s.header}>
        <View style={s.hRow}>
          <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.hTitle}>🏷️ Tea Grading</Text>
            <Text style={s.hSub}>{stats?.totalBatches ?? 0} batches · step 1 of 2</Text>
          </View>
          <TouchableOpacity
            style={[s.scalePill, { backgroundColor: scaleStatusColor + "25", borderColor: scaleStatusColor }]}
            onPress={() => setShowBLEModal(true)}
          >
            <View style={[s.scaleDot, { backgroundColor: scaleStatusColor }]} />
            <Text style={[s.scaleTxt, { color: scaleStatusColor }]}>
              {activeConnected ? `⚖️ ${scaleTypeLabel}` : activeConnecting ? "🔄" : `⚠️ ${scaleTypeLabel}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowModal(true)}>
            <Text style={s.addBtnTxt}>+ Grade</Text>
          </TouchableOpacity>
        </View>

        <View style={s.flowHint}>
          <View style={s.flowStep}>
            <Text style={s.flowStepNum}>1</Text>
            <Text style={s.flowStepTxt}>Grade Tea</Text>
          </View>
          <View style={s.flowArrow}><Text style={s.flowArrowTxt}>→</Text></View>
          <View style={[s.flowStep, { opacity: 0.5 }]}>
            <Text style={s.flowStepNum}>2</Text>
            <Text style={s.flowStepTxt}>Sell to Factory</Text>
          </View>
        </View>

        <View style={[s.banner, { backgroundColor: rawStock > 0 ? "rgba(255,255,255,0.15)" : "rgba(239,68,68,0.3)" }]}>
          <Text style={s.bannerIcon}>{rawStock > 0 ? "📦" : "⚠️"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerLabel}>Raw Stock to Grade</Text>
            <Text style={s.bannerVal}>{rawStock} kg ungraded</Text>
          </View>
          <View style={[s.bannerBadge, { backgroundColor: rawStock > 0 ? colors.success : colors.error }]}>
            <Text style={s.bannerBadgeTxt}>{rawStock > 0 ? "Ready" : "Empty"}</Text>
          </View>
        </View>

        <View style={s.pillRow}>
          {[
            { icon: "🅰️", val: `${stats?.availableA ?? 0}kg`, lbl: "A Available" },
            { icon: "🅱️", val: `${stats?.availableB ?? 0}kg`, lbl: "B Available" },
            { icon: "🏷️", val: `${stats?.totalBatches ?? 0}`,  lbl: "Batches"     },
          ].map(p => (
            <View key={p.lbl} style={s.pill}>
              <Text style={s.pillIcon}>{p.icon}</Text>
              <Text style={s.pillVal}>{p.val}</Text>
              <Text style={s.pillLbl}>{p.lbl}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ════ TABS ════ */}
      <View style={s.tabRow}>
        {(["records", "stats"] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, activeTab === t && s.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[s.tabTxt, activeTab === t && s.tabTxtActive]}>{t === "records" ? "📋 Records" : "📊 Report"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ════ CONTENT ════ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={[colors.salesColor]}
            tintColor={colors.salesColor}
          />
        }
      >
        {activeTab === "records" ? (
          records.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏷️</Text>
              <Text style={s.emptyTitle}>No grading records</Text>
              <Text style={s.emptySub}>Tap "+ Grade" to grade raw stock</Text>
            </View>
          ) : records.map(rec => {
            const avA  = Math.max(0, (rec.gradeA_kg   || 0) - (rec.soldA_kg || 0));
            const avB  = Math.max(0, (rec.gradeB_kg   || 0) - (rec.soldB_kg || 0));
            const done = avA === 0 && avB === 0 && (rec.gradeA_kg > 0 || rec.gradeB_kg > 0);
            return (
              <View key={rec.id} style={[s.card, done && { opacity: 0.7 }]}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardBatch}>{rec.batchNumber}</Text>
                    <Text style={s.cardDate}>{rec.date}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: done ? colors.success + "20" : colors.warning + "20" }]}>
                    <Text style={[s.statusTxt, { color: done ? colors.success : colors.warning }]}>
                      {done ? "✅ Fully Sold" : "🕐 Pending Sale"}
                    </Text>
                  </View>
                </View>
                <View style={s.gradeRow}>
                  {[
                    { icon: "🅰️", lbl: "Grade A",  kg: rec.gradeA_kg   ?? 0, av: avA, color: colors.success, bg: colors.successLight },
                    { icon: "🅱️", lbl: "Grade B",  kg: rec.gradeB_kg   ?? 0, av: avB, color: colors.warning, bg: colors.warningLight },
                    { icon: "🚫", lbl: "Rejected",  kg: rec.rejected_kg ?? 0, av: 0,   color: colors.error,   bg: colors.errorLight   },
                  ].map(g => (
                    <View key={g.lbl} style={[s.gpill, { backgroundColor: g.bg }]}>
                      <Text style={s.gpillIcon}>{g.icon}</Text>
                      <Text style={[s.gpillKg, { color: g.color }]}>{g.kg}kg</Text>
                      <Text style={s.gpillLbl}>{g.lbl}</Text>
                      {g.lbl !== "Rejected" && (
                        <Text style={s.gpillAv}>{g.av > 0 ? `${g.av.toFixed(1)}kg avail` : "sold out"}</Text>
                      )}
                    </View>
                  ))}
                </View>
                {!done && (avA > 0 || avB > 0) && (
                  <TouchableOpacity
                    style={s.sellBtn}
                    onPress={() => navigation.navigate("NewSale", {
                      gradingId: rec.id, availableA: avA, availableB: avB, batchNumber: rec.batchNumber,
                    })}
                  >
                    <Text style={s.sellBtnTxt}>💰 Sell from this batch →</Text>
                  </TouchableOpacity>
                )}
                <Text style={s.gradedBy}>Graded by {rec.gradedBy || "—"}</Text>
              </View>
            );
          })
        ) : (
          <View style={s.reportCard}>
            <Text style={s.reportTitle}>📊 Grading Summary</Text>
            <View style={s.availCard}>
              <Text style={s.availTitle}>📦 Currently Available for Sale</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={[s.availItem, { backgroundColor: colors.successLight }]}>
                  <Text style={[s.availKg, { color: colors.success }]}>{stats?.availableA ?? 0} kg</Text>
                  <Text style={s.availLbl}>Grade A unsold</Text>
                </View>
                <View style={[s.availItem, { backgroundColor: colors.warningLight }]}>
                  <Text style={[s.availKg, { color: colors.warning }]}>{stats?.availableB ?? 0} kg</Text>
                  <Text style={s.availLbl}>Grade B unsold</Text>
                </View>
              </View>
            </View>
            <View style={s.qualBar}>
              <View style={{ flex: pA || 1, backgroundColor: colors.success }} />
              <View style={{ flex: pB || 1, backgroundColor: colors.warning }} />
              <View style={{ flex: pR || 1, backgroundColor: colors.error   }} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginBottom: spacing.md }}>
              {[
                { c: colors.success, l: `Grade A — ${pA}%`  },
                { c: colors.warning, l: `Grade B — ${pB}%`  },
                { c: colors.error,   l: `Rejected — ${pR}%` },
              ].map(x => (
                <View key={x.l} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.c }} />
                  <Text style={{ fontSize: fonts.sizes.xs, color: colors.textSecondary, fontWeight: "600" }}>{x.l}</Text>
                </View>
              ))}
            </View>
            <View style={s.divider} />
            {[
              { l: "Total Batches",  v: `${stats?.totalBatches  ?? 0}`     },
              { l: "Grade A Total",  v: `${stats?.totalGradeA   ?? 0} kg`, c: colors.success },
              { l: "Grade B Total",  v: `${stats?.totalGradeB   ?? 0} kg`, c: colors.warning },
              { l: "Rejected Total", v: `${stats?.totalRejected ?? 0} kg`, c: colors.error   },
            ].map(r => (
              <View key={r.l} style={s.rrow}>
                <Text style={s.rlbl}>{r.l}</Text>
                <Text style={[s.rval, r.c ? { color: r.c } : {}]}>{r.v}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ════ GRADING MODAL ════ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav}>
            <View style={s.mCard}>
              <View style={s.mHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mTitle}>🏷️ Grade Tea Batch</Text>
                  <Text style={s.mSub}>Weights only — prices set when selling</Text>
                </View>
                <TouchableOpacity
                  style={[s.scPill, { backgroundColor: scaleStatusColor + "20", borderColor: scaleStatusColor }]}
                  onPress={() => { setShowModal(false); setShowBLEModal(true); }}
                >
                  <View style={[s.scDot, { backgroundColor: scaleStatusColor }]} />
                  <Text style={[s.scTxt, { color: scaleStatusColor }]}>
                    {activeConnected ? `⚖️ ${scaleTypeLabel}` : activeConnecting ? "🔄" : "⚠️"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowModal(false); reset(); }} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 20, color: colors.textMuted }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Stock card */}
                <View style={[s.stockCard, {
                  backgroundColor: rawStock > 0 ? colors.successLight : colors.errorLight,
                  borderColor: rawStock > 0 ? colors.success + "60" : colors.error + "60",
                }]}>
                  <Text style={{ fontSize: 26 }}>{rawStock > 0 ? "📦" : "⚠️"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.stockCardTxt, { color: rawStock > 0 ? colors.success : colors.error }]}>
                      {rawStock > 0 ? `${rawStock} kg raw stock available` : "No raw stock"}
                    </Text>
                    <Text style={s.stockCardSub}>{total > 0 ? `Grading: ${total.toFixed(2)} kg` : "Enter weights below"}</Text>
                  </View>
                  {total > 0 && (
                    <View style={[s.stockBadge, { backgroundColor: stockOk ? colors.success : colors.error }]}>
                      <Text style={s.stockBadgeTxt}>{stockOk ? "✅ OK" : `⚠️ -${shortfall.toFixed(1)}kg`}</Text>
                    </View>
                  )}
                </View>

                {/* ── Scale type toggle (BLE / Classic) ── */}
                <View style={s.scaleTypeToggle}>
                  <TouchableOpacity
                    style={[s.scaleTypeBtn, activeScaleType === "ble" && s.scaleTypeBtnActive]}
                    onPress={() => setActiveScaleType("ble")}
                  >
                    <Text style={s.scaleTypeIcon}>📡</Text>
                    <Text style={[s.scaleTypeText, activeScaleType === "ble" && s.scaleTypeTextActive]}>BLE Scale</Text>
                    {connectedDevice && <View style={s.scaleTypeActiveDot} />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.scaleTypeBtn, activeScaleType === "classic" && s.scaleTypeBtnActive]}
                    onPress={() => { setActiveScaleType("classic"); if (!classicIsEnabled) classicEnableBt(); }}
                  >
                    <Text style={s.scaleTypeIcon}>🔵</Text>
                    <Text style={[s.scaleTypeText, activeScaleType === "classic" && s.scaleTypeTextActive]}>Classic BT</Text>
                    {classicConnectedDevice && <View style={[s.scaleTypeActiveDot, { backgroundColor: colors.primary }]} />}
                  </TouchableOpacity>
                </View>

                {/* Classic BT: not enabled */}
                {activeScaleType === "classic" && !classicIsEnabled && (
                  <TouchableOpacity style={s.btEnableCard} onPress={classicEnableBt}>
                    <Text style={s.btEnableIcon}>🔵</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.btEnableTitle}>Bluetooth is off</Text>
                      <Text style={s.btEnableSub}>Tap to enable Classic Bluetooth</Text>
                    </View>
                    <Text style={s.btEnableArrow}>→</Text>
                  </TouchableOpacity>
                )}

                {/* Classic BT: error */}
                {activeScaleType === "classic" && classicError && (
                  <View style={s.btErrorCard}>
                    <Text style={s.btErrorText}>⚠️ {classicError}</Text>
                  </View>
                )}

                <Text style={s.secTitle}>📦 Batch Reference</Text>
                <FieldInput label="Batch Number"    icon="🔢" value={batch} onChange={setBatch} placeholder="GRD-..." />
                <FieldInput label="Notes (optional)" icon="📝" value={notes} onChange={setNotes} placeholder="Any notes..." />

                <WeighBlock
                  grade="A" label="Grade A — Premium" accent={colors.success} icon="🅰️"
                  mode={aMode} setMode={setAMode} manual={aManual} setManual={setAManual}
                  captured={aCap} clearCap={() => setACap(null)}
                  SC={activeConnected} connecting={activeConnecting}
                  scaleReading={activeScaleReading}
                  isTarget={target === "A"} activateTarget={() => setTarget("A")}
                  onCapture={() => { setTarget("A"); handleCaptureWeight(); }}
                  onManageScale={() => { setShowModal(false); setShowBLEModal(true); }}
                  pulse={pulse}
                />

                <WeighBlock
                  grade="B" label="Grade B — Standard" accent={colors.warning} icon="🅱️"
                  mode={bMode} setMode={setBMode} manual={bManual} setManual={setBManual}
                  captured={bCap} clearCap={() => setBCap(null)}
                  SC={activeConnected} connecting={activeConnecting}
                  scaleReading={activeScaleReading}
                  isTarget={target === "B"} activateTarget={() => setTarget("B")}
                  onCapture={() => { setTarget("B"); handleCaptureWeight(); }}
                  onManageScale={() => { setShowModal(false); setShowBLEModal(true); }}
                  pulse={pulse}
                />

                <Text style={[s.secTitle, { color: colors.error }]}>🚫 Rejected Tea</Text>
                <FieldInput label="Rejected Weight (kg)" icon="🗑️" value={rejKgStr} onChange={setRejKgStr} placeholder="0.0" numeric />

                <View style={s.sumCard}>
                  <Text style={s.sumTitle}>📋 Grading Summary</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.sm }}>
                    {[
                      { icon: "🅰️", lbl: "Grade A",  val: `${aKg.toFixed(2)} kg`, c: colors.success },
                      { icon: "🅱️", lbl: "Grade B",  val: `${bKg.toFixed(2)} kg`, c: colors.warning },
                      { icon: "🚫", lbl: "Rejected",  val: `${rKg.toFixed(2)} kg`, c: colors.error   },
                    ].map(x => (
                      <View key={x.lbl} style={[s.sumCell, { borderColor: x.c + "30", backgroundColor: x.c + "08" }]}>
                        <Text style={{ fontSize: 18, marginBottom: 4 }}>{x.icon}</Text>
                        <Text style={[s.sumCellVal, { color: x.c }]}>{x.val}</Text>
                        <Text style={s.sumCellLbl}>{x.lbl}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.sumFooter}>
                    <Text style={s.sumFootLbl}>Total Being Graded</Text>
                    <Text style={[s.sumFootVal, { color: stockOk ? colors.textPrimary : colors.error }]}>{total.toFixed(2)} kg</Text>
                  </View>
                  <View style={s.scaleAuditRow}>
                    <Text style={s.scaleAuditIcon}>{activeScaleType === "ble" ? "📡" : "🔵"}</Text>
                    <Text style={s.scaleAuditTxt}>
                      Weighing via {activeScaleType === "ble" ? "BLE Bluetooth" : "Classic Bluetooth"} — {scaleStatusLabel}
                    </Text>
                  </View>
                  <View style={s.noteBox}>
                    <Text style={s.noteTxt}>💡 No prices needed here — you'll set prices & choose a buyer in the Sales step</Text>
                  </View>
                </View>

                {!stockOk && total > 0 && (
                  <View style={s.warnCard}>
                    <Text style={{ fontSize: 24 }}>⚠️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.warnTitle}>Insufficient Stock</Text>
                      <Text style={s.warnTxt}>Reduce by {shortfall.toFixed(1)} kg</Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.saveBtn, (saving || (!stockOk && total > 0) || (!aKg && !bKg)) && s.saveBtnOff]}
                  onPress={handleSave}
                  disabled={saving || (!stockOk && total > 0) || (!aKg && !bKg)}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnTxt}>🏷️ Save Grading Record</Text>
                  }
                </TouchableOpacity>
                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
    </View>
  );
}

// ── WeighBlock ────────────────────────────────────────────────────────────────
function WeighBlock({ grade, label, accent, icon, mode, setMode, manual, setManual, captured, clearCap,
  SC, connecting, scaleReading, isTarget, activateTarget, onCapture, onManageScale, pulse }: any) {
  const w = mode === "manual" ? (parseFloat(manual) || 0) : (captured?.weight ?? 0);
  return (
    <View style={[wb.block, { borderColor: w > 0 ? accent + "60" : colors.border }]}>
      <View style={[wb.head, { backgroundColor: accent + "12" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <Text style={{ fontSize: 26 }}>{icon}</Text>
          <View>
            <Text style={[wb.headLbl, { color: accent }]}>{label}</Text>
            {w > 0 && <Text style={[wb.headW, { color: accent }]}>{w.toFixed(2)} kg</Text>}
          </View>
        </View>
        <View style={wb.modeRow}>
          {(["scale", "manual"] as const).map(m => (
            <TouchableOpacity key={m} style={[wb.modeBtn, mode === m && { backgroundColor: accent }]} onPress={() => setMode(m)}>
              <Text style={[wb.modeTxt, mode === m && { color: "#fff" }]}>{m === "scale" ? "📡 Scale" : "✏️ Manual"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mode === "scale" ? (
        <View style={wb.body}>
          {SC ? (
            <>
              {!isTarget ? (
                <TouchableOpacity
                  style={[wb.activate, { borderColor: accent, backgroundColor: accent + "10" }]}
                  onPress={activateTarget}
                >
                  <Text style={{ fontSize: 22, color: accent }}>⚖️</Text>
                  <Text style={[wb.activateTxt, { color: accent }]}>Tap to weigh Grade {grade} on scale</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <View style={[wb.readout, { borderColor: scaleReading?.isStable ? accent : colors.border }]}>
                    <Text style={wb.readoutLbl}>{scaleReading?.isStable ? "✅ STABLE" : "⏳ Stabilizing…"}</Text>
                    <Animated.View style={{ transform: [{ scale: isTarget && scaleReading?.isStable ? pulse : 1 }] }}>
                      <Text style={[wb.readoutVal, { color: scaleReading?.isStable ? accent : colors.textMuted }]}>
                        {scaleReading ? scaleReading.weight.toFixed(2) : "0.00"}
                      </Text>
                    </Animated.View>
                    <Text style={wb.readoutUnit}>{scaleReading?.unit ?? "kg"}</Text>
                  </View>
                  <TouchableOpacity
                    style={[wb.capBtn, { backgroundColor: scaleReading?.isStable ? accent : colors.border }]}
                    onPress={onCapture}
                    disabled={!scaleReading?.isStable}
                  >
                    <Text style={[wb.capTxt, { color: scaleReading?.isStable ? "#fff" : colors.textMuted }]}>
                      📌 {captured ? "Re-Capture" : `Capture Grade ${grade}`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              {captured && (
                <View style={[wb.lockedCard, { backgroundColor: accent + "12", borderColor: accent + "40" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <View style={[wb.lockedDot, { backgroundColor: accent }]} />
                    <View>
                      <Text style={wb.lockedLbl}>📌 Locked</Text>
                      <Text style={[wb.lockedVal, { color: accent }]}>{captured.weight.toFixed(2)} {captured.unit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={wb.clearBtn} onPress={clearCap}>
                    <Text style={wb.clearTxt}>Clear</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity style={wb.noScale} onPress={onManageScale}>
              <Text style={{ fontSize: 32, marginBottom: 6 }}>⚠️</Text>
              <Text style={wb.noScaleTxt}>{connecting ? "Connecting…" : "Scale not connected"}</Text>
              <Text style={wb.noScaleSub}>Tap to manage</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={wb.body}>
          <Text style={wb.manLbl}>Enter weight manually</Text>
          <View style={[wb.manInput, { borderColor: accent }]}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>⚖️</Text>
            <TextInput
              style={[wb.manTxt, { color: accent }]}
              value={manual}
              onChangeText={setManual}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            <Text style={wb.manSuffix}>kg</Text>
          </View>
          {parseFloat(manual) > 0 && (
            <View style={[wb.manConfirm, { backgroundColor: accent + "12" }]}>
              <Text style={[wb.manConfirmTxt, { color: accent }]}>✅ {parseFloat(manual).toFixed(2)} kg for Grade {grade}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── FieldInput ────────────────────────────────────────────────────────────────
function FieldInput({ label, icon, value, onChange, placeholder, numeric }: any) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLbl}>{label}</Text>
      <View style={s.fieldWrap}>
        <Text style={s.fieldIcon}>{icon}</Text>
        <TextInput
          style={s.fieldInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={numeric ? "decimal-pad" : "default"}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

// ── WeighBlock styles ─────────────────────────────────────────────────────────
const wb = StyleSheet.create({
  block:        { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, marginBottom: spacing.md, overflow: "hidden", ...shadows.md },
  head:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, paddingBottom: 12, gap: 10 },
  headLbl:      { fontSize: fonts.sizes.sm, fontWeight: "900" },
  headW:        { fontSize: fonts.sizes.xs, fontWeight: "700", marginTop: 2 },
  modeRow:      { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.full, padding: 3, gap: 3 },
  modeBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  modeTxt:      { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  body:         { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  activate:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: radius.lg, borderStyle: "dashed", paddingVertical: 14, marginBottom: spacing.sm },
  activateTxt:  { fontSize: fonts.sizes.sm, fontWeight: "700" },
  readout:      { alignItems: "center", backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 2, paddingVertical: spacing.md, marginBottom: spacing.sm },
  readoutLbl:   { fontSize: fonts.sizes.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  readoutVal:   { fontSize: 52, fontWeight: "900", letterSpacing: -1 },
  readoutUnit:  { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600", marginTop: -4 },
  capBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: radius.md, paddingVertical: 13, marginBottom: spacing.sm },
  capTxt:       { fontSize: fonts.sizes.sm, fontWeight: "800" },
  lockedCard:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1.5, padding: 12, marginBottom: spacing.sm },
  lockedDot:    { width: 10, height: 10, borderRadius: 5 },
  lockedLbl:    { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  lockedVal:    { fontSize: fonts.sizes.lg, fontWeight: "900" },
  clearBtn:     { backgroundColor: colors.errorLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  clearTxt:     { fontSize: 11, color: colors.error, fontWeight: "700" },
  noScale:      { alignItems: "center", paddingVertical: spacing.lg, backgroundColor: colors.background, borderRadius: radius.lg, marginBottom: spacing.sm },
  noScaleTxt:   { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textMuted },
  noScaleSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 4, textDecorationLine: "underline" },
  manLbl:       { fontSize: fonts.sizes.xs, fontWeight: "600", color: colors.textMuted, marginBottom: 8 },
  manInput:     { flexDirection: "row", alignItems: "center", borderWidth: 2.5, borderRadius: radius.lg, paddingHorizontal: 16, height: 60, backgroundColor: colors.background },
  manTxt:       { flex: 1, fontSize: 30, fontWeight: "900" },
  manSuffix:    { fontSize: fonts.sizes.md, color: colors.textMuted, fontWeight: "600" },
  manConfirm:   { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8 },
  manConfirmTxt:{ fontSize: fonts.sizes.xs, fontWeight: "700" },
});

// ── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.salesColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  hRow:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  back:   { backgroundColor: "rgba(255,255,255,0.2)", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  backTxt:{ fontSize: 20, color: "#fff", fontWeight: "700" },
  hTitle: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  hSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full },
  addBtnTxt: { color: colors.salesColor, fontWeight: "800", fontSize: fonts.sizes.sm },

  scalePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5 },
  scaleDot:  { width: 8, height: 8, borderRadius: 4 },
  scaleTxt:  { fontSize: 11, fontWeight: "800" },

  flowHint:    { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 10, marginBottom: spacing.sm },
  flowStep:    { alignItems: "center", flex: 1 },
  flowStepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", textAlign: "center", lineHeight: 26, fontSize: 12, fontWeight: "900", color: colors.salesColor, overflow: "hidden" },
  flowStepTxt: { fontSize: 10, color: "#fff", fontWeight: "700", marginTop: 3 },
  flowArrow:   { paddingHorizontal: spacing.sm },
  flowArrowTxt:{ fontSize: 18, color: "rgba(255,255,255,0.7)" },

  banner:        { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 12, marginBottom: spacing.sm },
  bannerIcon:    { fontSize: 24 },
  bannerLabel:   { fontSize: 10, color: "rgba(255,255,255,0.7)" },
  bannerVal:     { fontSize: fonts.sizes.sm, color: "#fff", fontWeight: "800" },
  bannerBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  bannerBadgeTxt:{ fontSize: 10, color: "#fff", fontWeight: "800" },

  pillRow:  { flexDirection: "row", gap: spacing.sm },
  pill:     { flex: 1, borderRadius: radius.md, padding: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  pillIcon: { fontSize: 18, marginBottom: 2 },
  pillVal:  { fontSize: fonts.sizes.md, color: "#fff", fontWeight: "900" },
  pillLbl:  { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 1 },

  tabRow:      { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, padding: 4, ...shadows.sm },
  tab:         { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  tabActive:   { backgroundColor: colors.salesColor },
  tabTxt:      { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textMuted },
  tabTxtActive:{ color: "#fff" },

  content: { padding: spacing.md },

  card:        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  cardTop:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardBatch:   { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  cardDate:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  statusTxt:   { fontSize: 11, fontWeight: "700" },
  gradeRow:    { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  gpill:       { flex: 1, borderRadius: radius.sm, padding: 8, alignItems: "center" },
  gpillIcon:   { fontSize: 14, marginBottom: 2 },
  gpillKg:     { fontSize: fonts.sizes.sm, fontWeight: "800" },
  gpillLbl:    { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  gpillAv:     { fontSize: 9, color: colors.textMuted, marginTop: 1, textAlign: "center" },
  sellBtn:     { backgroundColor: colors.salesColor + "15", borderRadius: radius.md, paddingVertical: 10, alignItems: "center", marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.salesColor + "40" },
  sellBtnTxt:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.salesColor },
  gradedBy:    { fontSize: 10, color: colors.textMuted, textAlign: "right" },

  empty:      { alignItems: "center", paddingTop: 80 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  reportCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.md },
  reportTitle:{ fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary, marginBottom: 4 },
  availCard:  { backgroundColor: colors.primaryPale, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.primary + "30" },
  availTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary, marginBottom: spacing.sm },
  availItem:  { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" },
  availKg:    { fontSize: fonts.sizes.xl, fontWeight: "900" },
  availLbl:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  qualBar:    { height: 16, borderRadius: 8, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  divider:    { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  rrow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  rlbl:       { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  rval:       { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },

  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  kav:     { maxHeight: "95%" },
  mCard:   { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.md, maxHeight: "100%" },
  mHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: spacing.md },
  mTitle:  { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  mSub:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  scPill:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1.5 },
  scDot:   { width: 7, height: 7, borderRadius: 4 },
  scTxt:   { fontSize: 10, fontWeight: "700" },

  stockCard:     { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1.5, padding: 14, marginBottom: spacing.md },
  stockCardTxt:  { fontSize: fonts.sizes.sm, fontWeight: "800" },
  stockCardSub:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  stockBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  stockBadgeTxt: { fontSize: 11, color: "#fff", fontWeight: "800" },

  scaleTypeToggle:    { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.md, padding: 3, gap: 3, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  scaleTypeBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: radius.sm },
  scaleTypeBtnActive: { backgroundColor: colors.salesColor },
  scaleTypeIcon:      { fontSize: 16 },
  scaleTypeText:      { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  scaleTypeTextActive:{ color: "#fff" },
  scaleTypeActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success, marginLeft: 2 },

  btEnableCard:  { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.primary + "50" },
  btEnableIcon:  { fontSize: 24 },
  btEnableTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary },
  btEnableSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  btEnableArrow: { fontSize: 18, color: colors.primary, fontWeight: "700" },
  btErrorCard:   { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  btErrorText:   { fontSize: fonts.sizes.xs, color: colors.error, fontWeight: "600", textAlign: "center" },

  secTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary, marginBottom: spacing.sm, marginTop: spacing.xs },

  field:     { marginBottom: 14 },
  fieldLbl:  { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  fieldWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  fieldIcon: { fontSize: 16, marginRight: 10 },
  fieldInput:{ flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },

  sumCard:    { backgroundColor: colors.primaryPale, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.primary + "30" },
  sumTitle:   { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.textPrimary, marginBottom: spacing.sm },
  sumCell:    { flex: 1, borderRadius: radius.md, borderWidth: 1.5, padding: 10, alignItems: "center" },
  sumCellVal: { fontSize: fonts.sizes.md, fontWeight: "900" },
  sumCellLbl: { fontSize: 10, color: colors.textMuted, marginTop: 2, fontWeight: "600" },
  sumFooter:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  sumFootLbl: { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600" },
  sumFootVal: { fontSize: fonts.sizes.md, fontWeight: "800" },

  scaleAuditRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, backgroundColor: colors.primary + "10", borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  scaleAuditIcon:{ fontSize: 14 },
  scaleAuditTxt: { fontSize: fonts.sizes.xs, color: colors.primary, fontWeight: "600", flex: 1 },

  noteBox:  { backgroundColor: colors.primary + "12", borderRadius: radius.md, padding: 12, marginTop: spacing.sm },
  noteTxt:  { fontSize: fonts.sizes.xs, color: colors.primary, fontWeight: "600", lineHeight: 18 },

  warnCard:  { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.error },
  warnTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.error },
  warnTxt:   { fontSize: fonts.sizes.xs, color: colors.error, marginTop: 2 },

  saveBtn:    { backgroundColor: colors.salesColor, borderRadius: radius.md, height: 56, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  saveBtnOff: { backgroundColor: colors.border },
  saveBtnTxt: { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});