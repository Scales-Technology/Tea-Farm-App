// ─── Payments Screen — TeaFarm Pro ───────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc, serverTimestamp,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { COLLECTIONS } from "../../firebase/auth";
import TeaLoader from "../../components/TeaLoader";
import { useLoader } from "../../context/LoaderContext";
import { offlineSave } from "../../utils/offlineSave";

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");

type PaymentMethod = "cash" | "mpesa" | "bank";
type ActiveTab     = "pending" | "paid";
type SourceType    = "plucker" | "farmer";

interface PaymentRecord {
  id:             string;
  sourceType:     SourceType;
  sourceId:       string;
  sourceName:     string;
  totalKg:        number;
  pricePerKg:     number;
  totalAmount:    number;
  method:         PaymentMethod;
  status:         "pending" | "paid";
  processedBy:    string;
  organizationId: string;
  date:           string;
  createdAt:      any;
  collectionIds?: string[];
}

interface PayableSource {
  id:                  string;
  name:                string;
  sourceType:          SourceType;
  unpaidKg:            number;
  totalKg:             number;
  paidKg:              number;
  phone:               string;
  paymentMethod:       string;
  paymentDetails:      string;
  unpaidCollectionIds: string[];
}

// ─── Safe method config lookup ────────────────────────────────────────────────
const METHOD_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  cash:  { icon: "💵", color: colors.success,    bg: colors.successLight, label: "Cash" },
  mpesa: { icon: "📱", color: colors.salesColor, bg: colors.salesLight,   label: "Mpesa" },
  bank:  { icon: "🏦", color: colors.info,       bg: colors.infoLight,    label: "Bank" },
};

const getMethodConfig = (method?: string) => {
  const key = (method || "cash").toLowerCase().trim();
  return METHOD_CONFIG[key] || METHOD_CONFIG.cash;
};

export default function PaymentsScreen({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [activeTab,      setActiveTab]      = useState<ActiveTab>("pending");
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [payableSources, setPayableSources] = useState<PayableSource[]>([]);
  const [showPayModal,   setShowPayModal]   = useState(false);
  const [selectedSource, setSelectedSource] = useState<PayableSource | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [pricePerKg,     setPricePerKg]     = useState("");
  const [payMethod,      setPayMethod]      = useState<PaymentMethod>("mpesa");
  const [filterType,     setFilterType]     = useState<SourceType | "all">("all");
  const [totalPaid,      setTotalPaid]      = useState(0);
  const [paidCount,      setPaidCount]      = useState(0);

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current     = oid;
      actorNameRef.current = me.name || "Collector";
      actorIdRef.current   = uid;

      const [pluckerSnap, farmerSnap, collSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, "pluckers"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "farmers"),     where("organizationId", "==", oid))),
        getDocs(query(collection(db, "collections"), where("organizationId", "==", oid))),
        getDocs(query(collection(db, "payments"),    where("organizationId", "==", oid))),
      ]);

      // Build payment records — sorted in JS
      const records = paySnap.docs
        .map(d => ({ id: d.id, ...d.data() } as PaymentRecord))
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
      setPaymentRecords(records);

      // Stats
      let tPaid = 0, pCount = 0;
      records.forEach(r => {
        if (r.status === "paid") { tPaid += r.totalAmount; pCount++; }
      });
      setTotalPaid(tPaid);
      setPaidCount(pCount);

      // Track paid collection IDs
      const paidCollectionIds = new Set<string>();
      records.filter(r => r.status === "paid").forEach(r => {
        (r.collectionIds || []).forEach(id => paidCollectionIds.add(id));
      });

      // Build kg maps
      const totalKgMap:  Record<string, number>   = {};
      const unpaidKgMap: Record<string, number>   = {};
      const unpaidIdsMap:Record<string, string[]> = {};

      collSnap.docs.forEach(d => {
        const data = d.data();
        const key  = `${data.sourceType}_${data.sourceId}`;
        const kg   = data.weightKg || 0;
        totalKgMap[key] = (totalKgMap[key] || 0) + kg;
        if (!paidCollectionIds.has(d.id)) {
          unpaidKgMap[key] = (unpaidKgMap[key] || 0) + kg;
          if (!unpaidIdsMap[key]) unpaidIdsMap[key] = [];
          unpaidIdsMap[key].push(d.id);
        }
      });

      // Build payable sources
      const sources: PayableSource[] = [];

      pluckerSnap.docs.forEach(d => {
        const data     = d.data();
        const key      = `plucker_${d.id}`;
        const totalKg  = Math.round((totalKgMap[key]  || 0) * 10) / 10;
        const unpaidKg = Math.round((unpaidKgMap[key] || 0) * 10) / 10;
        if (unpaidKg > 0) {
          sources.push({
            id: d.id, name: data.name, sourceType: "plucker",
            unpaidKg, totalKg,
            paidKg:              Math.round((totalKg - unpaidKg) * 10) / 10,
            phone:               data.phone || "",
            paymentMethod:       (data.paymentMethod || "cash").toLowerCase(),
            paymentDetails:      data.paymentDetails || "",
            unpaidCollectionIds: unpaidIdsMap[key] || [],
          });
        }
      });

      farmerSnap.docs.forEach(d => {
        const data     = d.data();
        const key      = `farmer_${d.id}`;
        const totalKg  = Math.round((totalKgMap[key]  || 0) * 10) / 10;
        const unpaidKg = Math.round((unpaidKgMap[key] || 0) * 10) / 10;
        if (unpaidKg > 0) {
          sources.push({
            id: d.id, name: data.name, sourceType: "farmer",
            unpaidKg, totalKg,
            paidKg:              Math.round((totalKg - unpaidKg) * 10) / 10,
            phone:               data.phone || "",
            paymentMethod:       (data.paymentMethod || "cash").toLowerCase(),
            paymentDetails:      data.paymentDetails || "",
            unpaidCollectionIds: unpaidIdsMap[key] || [],
          });
        }
      });

      sources.sort((a, b) => b.unpaidKg - a.unpaidKg);
      setPayableSources(sources);
    } catch (e: any) {
      console.log("Payments load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const handleRefresh = () => { setRefreshing(true); loadData(); };

  const openPayModal = (source: PayableSource) => {
    setSelectedSource(source);
    const m = (source.paymentMethod || "mpesa").toLowerCase() as PaymentMethod;
    setPayMethod(["cash","mpesa","bank"].includes(m) ? m : "mpesa");
    setPricePerKg("");
    setShowPayModal(true);
  };

  const computedTotal = selectedSource && pricePerKg
    ? Math.round(selectedSource.unpaidKg * (parseFloat(pricePerKg) || 0) * 100) / 100
    : 0;

  // ── Process payment ────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedSource) return;
    if (!pricePerKg || parseFloat(pricePerKg) <= 0)
      return Alert.alert("Required", "Enter price per kg.");
    const total = computedTotal;
    if (total <= 0) return Alert.alert("Error", "Total must be greater than 0.");

    const mc = getMethodConfig(payMethod);
    Alert.alert(
      "✅ Confirm Payment",
      `Pay ${selectedSource.name}\n\nUnpaid Kg: ${selectedSource.unpaidKg} kg\nPrice/kg: KSh ${pricePerKg}\nTotal: KSh ${total.toLocaleString()}\nMethod: ${mc.label}\n\nConfirm?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Pay",
          onPress: async () => {
            setSaving(true);
            showLoader("Processing payment...");
            try {
              const today = new Date().toISOString().split("T")[0];

              // ── Save payment record (offline-first) ──────────────────────
              const paymentResult = await offlineSave("payments", {
                sourceType:     selectedSource.sourceType,
                sourceId:       selectedSource.id,
                sourceName:     selectedSource.name,
                totalKg:        selectedSource.unpaidKg,
                pricePerKg:     parseFloat(pricePerKg),
                totalAmount:    total,
                method:         payMethod,
                status:         "paid",
                processedBy:    actorNameRef.current,
                organizationId: orgIdRef.current,
                date:           today,
                collectionIds:  selectedSource.unpaidCollectionIds,
                paidAt:         serverTimestamp(),
              });

              // ── Save audit log (offline-first) ───────────────────────────
              await offlineSave(COLLECTIONS.AUDIT_LOGS, {
                actorId:        actorIdRef.current,
                actorName:      actorNameRef.current,
                actorRole:      "collector_supervisor",
                action:         `Paid ${selectedSource.sourceType}: ${selectedSource.name} — ${selectedSource.unpaidKg}kg × KSh${pricePerKg} = KSh${total.toLocaleString()} via ${mc.label}`,
                module:         "payments",
                outcome:        "success",
                organizationId: orgIdRef.current,
              });

              // ── Show result alert based on connectivity ──────────────────
              if (!paymentResult.savedOnline) {
                Alert.alert(
                  "📴 Saved Offline",
                  "No internet connection. This payment has been saved to your device and will automatically sync to the cloud when you reconnect.",
                  [{ text: "OK" }]
                );
              } else {
                Alert.alert(
                  "✅ Payment Processed",
                  `${selectedSource.name} paid KSh ${total.toLocaleString()} for ${selectedSource.unpaidKg} kg via ${mc.label}.`
                );
              }

              setShowPayModal(false);
              await loadData();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to process payment.");
            } finally {
              setSaving(false);
              hideLoader();
            }
          },
        },
      ]
    );
  };

  const filteredRecords = paymentRecords.filter(r => {
    const matchTab  = r.status === activeTab;
    const matchType = filterType === "all" || r.sourceType === filterType;
    return matchTab && matchType;
  });

  const filteredSources = payableSources.filter(s =>
    filterType === "all" || s.sourceType === filterType
  );

  if (loading) return <TeaLoader message="Loading Payments..." subMessage="Collector Supervisor" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>💳 Payments</Text>
            <Text style={styles.headerSub}>Process & track plucker/farmer payments</Text>
          </View>
        </View>

        <View style={styles.statsStrip}>
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#fde68a" }]}>{payableSources.length}</Text>
            <Text style={styles.stripLabel}>Unpaid</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#fca5a5" }]}>
              {payableSources.reduce((s, p) => s + p.unpaidKg, 0).toFixed(1)} kg
            </Text>
            <Text style={styles.stripLabel}>Unpaid Kg</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#6ee7b7" }]}>{paidCount}</Text>
            <Text style={styles.stripLabel}>Paid</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#a5f3fc" }]}>KSh {totalPaid.toLocaleString()}</Text>
            <Text style={styles.stripLabel}>Paid Out</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(["all", "plucker", "farmer"] as const).map(f => (
            <TouchableOpacity key={f}
              style={[styles.filterPill, filterType === f && styles.filterPillActive]}
              onPress={() => setFilterType(f)}
            >
              <Text style={[styles.filterPillText, filterType === f && styles.filterPillTextActive]}>
                {f === "all" ? "All" : f === "plucker" ? "🧺 Pluckers" : "👨‍🌾 Farmers"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, activeTab === "pending" && styles.tabActive]} onPress={() => setActiveTab("pending")}>
            <Text style={[styles.tabText, activeTab === "pending" && styles.tabTextActive]}>
              ⏳ Unpaid ({filteredSources.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === "paid" && styles.tabActive]} onPress={() => setActiveTab("paid")}>
            <Text style={[styles.tabText, activeTab === "paid" && styles.tabTextActive]}>
              ✅ Paid ({paidCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
          colors={[colors.salesColor]} tintColor={colors.salesColor} />}
      >
        {/* ── UNPAID TAB ── */}
        {activeTab === "pending" && (
          filteredSources.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>All payments up to date!</Text>
              <Text style={styles.emptySub}>No unpaid collections found</Text>
            </View>
          ) : filteredSources.map(source => {
            const mc = getMethodConfig(source.paymentMethod);
            return (
              <View key={`${source.sourceType}_${source.id}`} style={styles.sourceCard}>
                <View style={[styles.accentBar, { backgroundColor: colors.warning }]} />
                <View style={[styles.avatar, {
                  backgroundColor: source.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale
                }]}>
                  <Text style={[styles.avatarText, {
                    color: source.sourceType === "plucker" ? colors.collectorColor : colors.primary
                  }]}>
                    {source.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.sourceInfo}>
                  <View style={styles.sourceNameRow}>
                    <Text style={styles.sourceName}>{source.name}</Text>
                    <View style={[styles.typeBadge, {
                      backgroundColor: source.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale
                    }]}>
                      <Text style={[styles.typeBadgeText, {
                        color: source.sourceType === "plucker" ? colors.collectorColor : colors.primary
                      }]}>
                        {source.sourceType === "plucker" ? "🧺" : "👨‍🌾"} {source.sourceType}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.kgBreakdown}>
                    <View style={styles.kgBreakdownItem}>
                      <Text style={styles.kgBreakdownValue}>{source.unpaidKg} kg</Text>
                      <Text style={styles.kgBreakdownLabel}>Unpaid</Text>
                    </View>
                    <View style={styles.kgBreakdownDivider} />
                    <View style={styles.kgBreakdownItem}>
                      <Text style={[styles.kgBreakdownValue, { color: colors.success }]}>{source.paidKg} kg</Text>
                      <Text style={styles.kgBreakdownLabel}>Paid</Text>
                    </View>
                    <View style={styles.kgBreakdownDivider} />
                    <View style={styles.kgBreakdownItem}>
                      <Text style={styles.kgBreakdownValue}>{source.totalKg} kg</Text>
                      <Text style={styles.kgBreakdownLabel}>Total</Text>
                    </View>
                  </View>
                  <View style={[styles.methodTag, { backgroundColor: mc.bg }]}>
                    <Text style={[styles.methodTagText, { color: mc.color }]}>
                      {mc.icon} {mc.label} · {source.paymentDetails || source.phone}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.payNowBtn} onPress={() => openPayModal(source)}>
                  <Text style={styles.payNowIcon}>💳</Text>
                  <Text style={styles.payNowText}>Pay Now</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* ── PAID TAB ── */}
        {activeTab === "paid" && (
          filteredRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💳</Text>
              <Text style={styles.emptyTitle}>No paid records yet</Text>
              <Text style={styles.emptySub}>Processed payments will appear here</Text>
            </View>
          ) : filteredRecords.map(record => {
            const mc = getMethodConfig(record.method);
            return (
              <View key={record.id} style={styles.recordCard}>
                <View style={[styles.accentBar, { backgroundColor: colors.success }]} />
                <View style={[styles.avatar, {
                  backgroundColor: record.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale
                }]}>
                  <Text style={[styles.avatarText, {
                    color: record.sourceType === "plucker" ? colors.collectorColor : colors.primary
                  }]}>
                    {record.sourceName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.sourceInfo}>
                  <View style={styles.sourceNameRow}>
                    <Text style={styles.sourceName}>{record.sourceName}</Text>
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidBadgeText}>✅ Paid</Text>
                    </View>
                  </View>
                  <Text style={styles.kgLabel}>{record.totalKg} kg · KSh {record.pricePerKg}/kg</Text>
                  <Text style={styles.recordDate}>📅 {record.date} · by {record.processedBy}</Text>
                  <View style={[styles.methodTag, { backgroundColor: mc.bg }]}>
                    <Text style={[styles.methodTagText, { color: mc.color }]}>{mc.icon} {mc.label}</Text>
                  </View>
                </View>
                <View style={styles.recordAmountWrap}>
                  <Text style={styles.recordAmountLabel}>KSh</Text>
                  <Text style={styles.recordAmountValue}>{record.totalAmount.toLocaleString()}</Text>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Pay Modal ── */}
      <Modal visible={showPayModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>💳 Process Payment</Text>
                <TouchableOpacity onPress={() => setShowPayModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {selectedSource && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Banner */}
                  <View style={[styles.sourceBanner, {
                    backgroundColor: selectedSource.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale
                  }]}>
                    <View style={[styles.bannerAvatar, {
                      backgroundColor: selectedSource.sourceType === "plucker" ? colors.collectorColor : colors.primary
                    }]}>
                      <Text style={styles.bannerAvatarText}>{selectedSource.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.bannerName}>{selectedSource.name}</Text>
                      <Text style={styles.bannerSub}>
                        {selectedSource.sourceType === "plucker" ? "🧺 Plucker" : "👨‍🌾 Farmer"} · 📱 {selectedSource.phone}
                      </Text>
                    </View>
                  </View>

                  {/* KG Summary */}
                  <View style={styles.kgSummaryCard}>
                    <View style={styles.kgSummaryItem}>
                      <Text style={styles.kgSummaryIcon}>⚖️</Text>
                      <Text style={[styles.kgSummaryValue, { color: colors.warning }]}>{selectedSource.unpaidKg}</Text>
                      <Text style={styles.kgSummaryLabel}>Unpaid kg</Text>
                    </View>
                    <View style={styles.kgSummaryDivider} />
                    <View style={styles.kgSummaryItem}>
                      <Text style={styles.kgSummaryIcon}>✅</Text>
                      <Text style={[styles.kgSummaryValue, { color: colors.success }]}>{selectedSource.paidKg}</Text>
                      <Text style={styles.kgSummaryLabel}>Paid kg</Text>
                    </View>
                    <View style={styles.kgSummaryDivider} />
                    <View style={styles.kgSummaryItem}>
                      <Text style={styles.kgSummaryIcon}>📊</Text>
                      <Text style={styles.kgSummaryValue}>{selectedSource.totalKg}</Text>
                      <Text style={styles.kgSummaryLabel}>Total kg</Text>
                    </View>
                  </View>

                  {/* Price per kg */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>
                      {selectedSource.sourceType === "plucker"
                        ? "Labour Rate per kg (KSh) — what you pay the plucker"
                        : "Buying Price per kg (KSh) — price you buy from farmer"}
                    </Text>
                    <View style={styles.inputWrap}>
                      <Text style={styles.inputIcon}>💰</Text>
                      <TextInput style={styles.input} value={pricePerKg} onChangeText={setPricePerKg}
                        placeholder={selectedSource.sourceType === "plucker" ? "e.g. 25.00 per kg labour" : "e.g. 65.00 per kg buying price"}
                        placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
                      <Text style={styles.inputUnit}>/kg</Text>
                    </View>
                  </View>

                  {/* Live total */}
                  {pricePerKg && parseFloat(pricePerKg) > 0 && (
                    <View style={styles.totalCard}>
                      <Text style={styles.totalFormula}>
                        {selectedSource.unpaidKg} kg × KSh {pricePerKg}/kg
                      </Text>
                      <Text style={styles.totalResult}>= KSh {computedTotal.toLocaleString()}</Text>
                      <Text style={styles.totalNote}>
                        {selectedSource.sourceType === "plucker"
                          ? "💡 Labour payment to plucker"
                          : "💡 Tea buying payment to farmer"}
                      </Text>
                    </View>
                  )}

                  {/* Method */}
                  <Text style={styles.fieldLabel}>Payment Method / Njia ya Malipo</Text>
                  <View style={styles.methodRow}>
                    {(["cash", "mpesa", "bank"] as PaymentMethod[]).map(m => {
                      const mc = getMethodConfig(m);
                      return (
                        <TouchableOpacity key={m}
                          style={[styles.methodBtn, payMethod === m && { backgroundColor: mc.bg, borderColor: mc.color, borderWidth: 2 }]}
                          onPress={() => setPayMethod(m)}
                        >
                          <Text style={styles.methodBtnIcon}>{mc.icon}</Text>
                          <Text style={[styles.methodBtnText, payMethod === m && { color: mc.color, fontWeight: "800" }]}>
                            {mc.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {selectedSource.paymentDetails ? (
                    <View style={[styles.payDetailsCard, { backgroundColor: getMethodConfig(payMethod).bg }]}>
                      <Text style={[styles.payDetailsText, { color: getMethodConfig(payMethod).color }]}>
                        {getMethodConfig(payMethod).icon} Pay to: {selectedSource.paymentDetails}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.submitBtn, (saving || computedTotal <= 0) && styles.submitBtnDisabled]}
                    onPress={handlePay} disabled={saving || computedTotal <= 0} activeOpacity={0.85}
                  >
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.submitBtnText}>
                          ✅ Pay KSh {computedTotal > 0 ? computedTotal.toLocaleString() : "—"} for {selectedSource.unpaidKg} kg
                        </Text>
                    }
                  </TouchableOpacity>
                  <View style={{ height: 24 }} />
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.salesColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle:  { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:    { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  statsStrip:   { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, paddingVertical: 10, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  stripItem:    { flex: 1, alignItems: "center" },
  stripValue:   { fontSize: fonts.sizes.sm, fontWeight: "900", color: "#fff" },
  stripLabel:   { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  stripDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  filterRow:         { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  filterPill:        { flex: 1, paddingVertical: 6, borderRadius: radius.full, alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  filterPillActive:  { backgroundColor: "#fff" },
  filterPillText:    { fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  filterPillTextActive: { color: colors.salesColor, fontWeight: "800" },
  tabRow:        { flexDirection: "row", gap: spacing.xs },
  tab:           { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  tabActive:     { backgroundColor: "#fff" },
  tabText:       { fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  tabTextActive: { color: colors.salesColor, fontWeight: "800" },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sourceCard: { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", overflow: "hidden", ...shadows.md },
  recordCard: { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", overflow: "hidden", ...shadows.sm },
  accentBar:    { width: 4, alignSelf: "stretch" },
  avatar:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginHorizontal: 10 },
  avatarText:   { fontSize: fonts.sizes.lg, fontWeight: "900" },
  sourceInfo:   { flex: 1, paddingVertical: 10 },
  sourceNameRow:{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  sourceName:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  typeBadge:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  typeBadgeText:{ fontSize: 10, fontWeight: "700" },
  paidBadge:    { backgroundColor: colors.successLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  paidBadgeText:{ fontSize: 10, color: colors.success, fontWeight: "700" },
  kgBreakdown:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 6 },
  kgBreakdownItem:   { flex: 1, alignItems: "center" },
  kgBreakdownValue:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.warning },
  kgBreakdownLabel:  { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  kgBreakdownDivider:{ width: 1, height: 24, backgroundColor: colors.border, marginHorizontal: 4 },
  kgLabel:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: 2 },
  methodTag:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: "flex-start", marginTop: 4 },
  methodTagText:{ fontSize: 10, fontWeight: "700" },
  recordDate:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  recordAmountWrap: { alignItems: "flex-end", paddingHorizontal: spacing.sm },
  recordAmountLabel:{ fontSize: 10, color: colors.textMuted },
  recordAmountValue:{ fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.success },
  payNowBtn:  { alignItems: "center", backgroundColor: colors.salesColor, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginRight: spacing.sm },
  payNowIcon: { fontSize: 18 },
  payNowText: { fontSize: 10, color: "#fff", fontWeight: "800", marginTop: 2 },
  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalWrap:    { maxHeight: "92%" },
  modalCard:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "100%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:   { fontSize: 20, color: colors.textMuted, padding: 4 },
  sourceBanner:     { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  bannerAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  bannerAvatarText: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  bannerName:       { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  bannerSub:        { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  kgSummaryCard:    { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.lg, marginBottom: spacing.md, overflow: "hidden" },
  kgSummaryItem:    { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  kgSummaryIcon:    { fontSize: 20, marginBottom: 4 },
  kgSummaryValue:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  kgSummaryLabel:   { fontSize: 9, color: colors.textMuted, marginTop: 2 },
  kgSummaryDivider: { width: 1, backgroundColor: colors.border },
  totalCard:    { backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, alignItems: "center" },
  totalFormula: { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  totalResult:  { fontSize: fonts.sizes.xl, fontWeight: "900", color: colors.primary, marginTop: 4 },
  totalNote:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 4 },
  methodRow:    { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  methodBtn:    { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
  methodBtnIcon:{ fontSize: 22, marginBottom: 4 },
  methodBtnText:{ fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  payDetailsCard: { borderRadius: radius.md, padding: 12, marginBottom: spacing.md },
  payDetailsText: { fontSize: fonts.sizes.sm, fontWeight: "700" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputWrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  inputIcon:  { fontSize: 16, marginRight: 10 },
  input:      { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  inputUnit:  { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600" },
  submitBtn:         { backgroundColor: colors.salesColor, borderRadius: radius.md, height: 56, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  submitBtnDisabled: { backgroundColor: colors.salesLight },
  submitBtnText:     { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});