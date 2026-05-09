// ─── Reports Screen — TeaFarm Pro ────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const db      = getFirestore();
const auth    = getAuth();
const { width } = Dimensions.get("window");

type ReportTab = "pluckers" | "farmers" | "inventory" | "financial" | "attendance";

interface PluckerReport {
  id:             string;
  name:           string;
  totalKg:        number;
  pricePerKg:     number;
  totalOwed:      number;
  totalPaid:      number;
  pendingAmount:  number;
  paymentStatus:  "paid" | "partial" | "pending";
  attendanceDays: number;
  paymentMethod:  string;
}

interface FarmerReport {
  id:            string;
  name:          string;
  farmName:      string;
  totalKg:       number;
  pricePerKg:    number;
  totalOwed:     number;
  totalPaid:     number;
  pendingAmount: number;
  paymentStatus: "paid" | "partial" | "pending";
  paymentMethod: string;
}

interface InventoryReport {
  totalCollected: number;
  totalSold:      number;
  inStock:        number;
  gradeA:         number;
  gradeB:         number;
  gradeARev:      number;
  gradeBRev:      number;
  totalRejected:  number;
}

interface FinancialReport {
  totalRevenue:     number;
  totalExpenses:    number;
  netProfit:        number;
  expenseBreakdown: { category: string; amount: number }[];
  monthlySales:     { month: string; amount: number }[];
}

interface AttendanceDay {
  date:    string;
  records: { pluckerId: string; pluckerName: string; time: string }[];
}

const TABS: { key: ReportTab; label: string; icon: string; color: string }[] = [
  { key: "pluckers",   label: "Pluckers",   icon: "🧺", color: colors.primary },
  { key: "farmers",    label: "Farmers",    icon: "👨‍🌾", color: colors.collectorColor },
  { key: "inventory",  label: "Inventory",  icon: "📦", color: colors.salesColor },
  { key: "financial",  label: "Financial",  icon: "💰", color: colors.success },
  { key: "attendance", label: "Attendance", icon: "📅", color: colors.supervisorColor },
];

const statusColor = (s: string) =>
  s === "paid" ? colors.success : s === "partial" ? colors.warning : colors.error;

const statusLabel = (s: string) =>
  s === "paid" ? "✅ Fully Paid" : s === "partial" ? "⚠️ Partial" : "❌ Unpaid";

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString("en-KE", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return dateStr || "—"; }
};

const formatTime = (ts: any, fallback?: string): string => {
  if (fallback) return fallback;
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
};

export default function ReportsScreen() {
  const [activeTab,       setActiveTab]       = useState<ReportTab>("pluckers");
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [pluckerReports,  setPluckerReports]  = useState<PluckerReport[]>([]);
  const [farmerReports,   setFarmerReports]   = useState<FarmerReport[]>([]);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [attendanceDays,  setAttendanceDays]  = useState<AttendanceDay[]>([]);
  const [expandedDay,     setExpandedDay]     = useState<string | null>(null);

  const { showLoader, hideLoader } = useLoader();
  const orgIdRef = useRef("");

  const loadAllReports = useCallback(async () => {
    showLoader("Generating Reports...");
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current = oid;
      if (!oid) return;

      // Single where only — no orderBy on any query
      const [
        pluckersSnap, farmersSnap, collectionsSnap,
        salesSnap, paymentsSnap, expensesSnap, attendanceSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, "pluckers"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "farmers"),     where("organizationId", "==", oid))),
        getDocs(query(collection(db, "collections"), where("organizationId", "==", oid))),
        getDocs(query(collection(db, "sales"),       where("organizationId", "==", oid))),
        getDocs(query(collection(db, "payments"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "expenses"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "attendance"),  where("organizationId", "==", oid))),
      ]);

      // ─────────────────────────────────────────────────────────────────────
      // PAYMENT MAPS — using correct fields: sourceType / sourceId
      // PaymentsScreen saves: { sourceType, sourceId, sourceName,
      //   pricePerKg, totalAmount, status: "paid", collectionIds }
      // ─────────────────────────────────────────────────────────────────────
      const paidAmountMap:   Record<string, number> = {}; // sourceId → total paid KSh
      const pricePerKgMap:   Record<string, number> = {}; // sourceId → price/kg
      const paidCollIds      = new Set<string>();          // paid collection IDs

      paymentsSnap.docs.forEach(d => {
        const data = d.data();
        const sid  = data.sourceId;
        if (!sid) return;

        if (data.status === "paid") {
          paidAmountMap[sid] = (paidAmountMap[sid] || 0) + (data.totalAmount || 0);
          // Store most recent pricePerKg for this person
          if (data.pricePerKg) pricePerKgMap[sid] = data.pricePerKg;
          // Mark collection IDs as paid
          (data.collectionIds || []).forEach((id: string) => paidCollIds.add(id));
        }
      });

      // ─────────────────────────────────────────────────────────────────────
      // COLLECTION MAPS — total kg per person
      // ─────────────────────────────────────────────────────────────────────
      const pluckerKgMap:  Record<string, number> = {};
      const farmerKgMap:   Record<string, number> = {};
      const unpaidKgMap:   Record<string, number> = {}; // sourceId → unpaid kg

      collectionsSnap.docs.forEach(d => {
        const data = d.data();
        const sid  = data.sourceId;
        const kg   = data.weightKg || 0;
        if (!sid) return;

        if (data.sourceType === "plucker") {
          pluckerKgMap[sid] = (pluckerKgMap[sid] || 0) + kg;
          if (!paidCollIds.has(d.id)) {
            unpaidKgMap[sid] = (unpaidKgMap[sid] || 0) + kg;
          }
        } else if (data.sourceType === "farmer") {
          farmerKgMap[sid] = (farmerKgMap[sid] || 0) + kg;
          if (!paidCollIds.has(d.id)) {
            unpaidKgMap[sid] = (unpaidKgMap[sid] || 0) + kg;
          }
        }
      });

      // ─────────────────────────────────────────────────────────────────────
      // ATTENDANCE MAP
      // ─────────────────────────────────────────────────────────────────────
      const pluckerAttMap: Record<string, number> = {};
      attendanceSnap.docs.forEach(d => {
        const data = d.data();
        const pid  = data.pluckerId || data.sourceId;
        if (pid) pluckerAttMap[pid] = (pluckerAttMap[pid] || 0) + 1;
      });

      // ─────────────────────────────────────────────────────────────────────
      // BUILD PLUCKER REPORTS
      // ─────────────────────────────────────────────────────────────────────
      const pluckerList: PluckerReport[] = pluckersSnap.docs
        .map(d => {
          const data       = d.data();
          const sid        = d.id;
          const totalKg    = Math.round((pluckerKgMap[sid]  || 0) * 100) / 100;
          const pricePerKg = pricePerKgMap[sid] || data.pricePerKg || data.ratePerKg || 0;
          const totalPaid  = Math.round((paidAmountMap[sid] || 0) * 100) / 100;
          // unpaid kg × price = pending amount
          const unpaidKg   = Math.round((unpaidKgMap[sid]   || 0) * 100) / 100;
          const pending    = Math.round(unpaidKg * pricePerKg * 100) / 100;
          // totalOwed = what the plucker should receive for ALL kg
          const totalOwed  = Math.round(totalKg * pricePerKg * 100) / 100;

          const paymentStatus: PluckerReport["paymentStatus"] =
            totalPaid > 0 && pending === 0 ? "paid" :
            totalPaid > 0                  ? "partial" : "pending";

          return {
            id:             sid,
            name:           data.name,
            totalKg,
            pricePerKg,
            totalOwed,
            totalPaid,
            pendingAmount:  pending,
            paymentStatus,
            attendanceDays: pluckerAttMap[sid] || 0,
            paymentMethod:  data.paymentMethod || data.paymentType || "Cash",
          };
        })
        .sort((a, b) => b.totalKg - a.totalKg);

      setPluckerReports(pluckerList);

      // ─────────────────────────────────────────────────────────────────────
      // BUILD FARMER REPORTS
      // ─────────────────────────────────────────────────────────────────────
      const farmerList: FarmerReport[] = farmersSnap.docs
        .map(d => {
          const data       = d.data();
          const sid        = d.id;
          const totalKg    = Math.round((farmerKgMap[sid]   || 0) * 100) / 100;
          const pricePerKg = pricePerKgMap[sid] || data.pricePerKg || data.ratePerKg || 0;
          const totalPaid  = Math.round((paidAmountMap[sid] || 0) * 100) / 100;
          const unpaidKg   = Math.round((unpaidKgMap[sid]   || 0) * 100) / 100;
          const pending    = Math.round(unpaidKg * pricePerKg * 100) / 100;
          const totalOwed  = Math.round(totalKg * pricePerKg * 100) / 100;

          const paymentStatus: FarmerReport["paymentStatus"] =
            totalPaid > 0 && pending === 0 ? "paid" :
            totalPaid > 0                  ? "partial" : "pending";

          return {
            id:            sid,
            name:          data.name,
            farmName:      data.farmName || "—",
            totalKg,
            pricePerKg,
            totalOwed,
            totalPaid,
            pendingAmount: pending,
            paymentStatus,
            paymentMethod: data.paymentMethod || "Cash",
          };
        })
        .sort((a, b) => b.totalKg - a.totalKg);

      setFarmerReports(farmerList);

      // ─────────────────────────────────────────────────────────────────────
      // INVENTORY REPORT — inStock can be negative, never clamp
      // ─────────────────────────────────────────────────────────────────────
      let totalCollected = 0;
      collectionsSnap.docs.forEach(d => { totalCollected += d.data().weightKg || 0; });

      let gradeA = 0, gradeB = 0, gradeARev = 0, gradeBRev = 0,
          totalSold = 0, totalRejected = 0;

      salesSnap.docs.forEach(d => {
        const data = d.data();
        gradeA        += data.gradeA_kg   || 0;
        gradeB        += data.gradeB_kg   || 0;
        totalRejected += data.rejected_kg || 0;
        gradeARev     += data.gradeA_total != null
          ? data.gradeA_total
          : (data.gradeA_kg || 0) * (data.priceA_per_kg || 0);
        gradeBRev     += data.gradeB_total != null
          ? data.gradeB_total
          : (data.gradeB_kg || 0) * (data.priceB_per_kg || 0);
        totalSold     += (data.gradeA_kg || 0) + (data.gradeB_kg || 0);
      });

      setInventoryReport({
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalSold:      Math.round(totalSold      * 100) / 100,
        inStock:        Math.round((totalCollected - totalSold) * 100) / 100, // NOT clamped
        gradeA:         Math.round(gradeA         * 100) / 100,
        gradeB:         Math.round(gradeB         * 100) / 100,
        gradeARev:      Math.round(gradeARev      * 100) / 100,
        gradeBRev:      Math.round(gradeBRev      * 100) / 100,
        totalRejected:  Math.round(totalRejected  * 100) / 100,
      });

      // ─────────────────────────────────────────────────────────────────────
      // FINANCIAL REPORT
      // ─────────────────────────────────────────────────────────────────────
      const totalRevenue = gradeARev + gradeBRev;
      let totalExpenses  = 0;
      const categoryMap: Record<string, number> = {};

      expensesSnap.docs
        .map(d => d.data())
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0))
        .forEach(data => {
          totalExpenses += data.amount || 0;
          const cat = (data.category || "Other").split(" / ")[0];
          categoryMap[cat] = (categoryMap[cat] || 0) + (data.amount || 0);
        });

      const expenseBreakdown = Object.entries(categoryMap)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

      const monthMap: Record<string, number> = {};
      salesSnap.docs.forEach(d => {
        const data = d.data();
        if (data.createdAt?.toDate) {
          const date = data.createdAt.toDate();
          const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          monthMap[key] = (monthMap[key] || 0) + (data.totalAmount || 0);
        }
      });
      const monthlySales = Object.entries(monthMap)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6);

      setFinancialReport({
        totalRevenue, totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        expenseBreakdown, monthlySales,
      });

      // ─────────────────────────────────────────────────────────────────────
      // ATTENDANCE REPORT — grouped by date, individual times
      // ─────────────────────────────────────────────────────────────────────
      const dayMap: Record<string, { pluckerId: string; pluckerName: string; time: string }[]> = {};

      attendanceSnap.docs
        .map(d => d.data())
        .forEach(data => {
          const date  = data.date
            || data.createdAt?.toDate?.()?.toISOString()?.split("T")[0]
            || "Unknown";
          const time  = data.attendanceTime || data.checkInTime || formatTime(data.createdAt);
          const name  = data.pluckerName || data.name || "Unknown";
          const pid   = data.pluckerId || data.sourceId || name;
          if (!dayMap[date]) dayMap[date] = [];
          if (!dayMap[date].find(r => r.pluckerId === pid)) {
            dayMap[date].push({ pluckerId: pid, pluckerName: name, time });
          }
        });

      const days: AttendanceDay[] = Object.entries(dayMap)
        .map(([date, records]) => ({
          date,
          records: records.sort((a, b) => a.pluckerName.localeCompare(b.pluckerName)),
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      setAttendanceDays(days);

    } catch (e: any) {
      console.log("Reports load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hideLoader();
    }
  }, []);

  useEffect(() => { loadAllReports(); }, [loadAllReports]);
  const handleRefresh = () => { setRefreshing(true); loadAllReports(); };
  const tabConfig = TABS.find(t => t.key === activeTab)!;

  if (loading) return <TeaLoader message="Generating Reports..." subMessage="Admin Analytics" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={tabConfig.color} />

      <View style={[styles.header, { backgroundColor: tabConfig.color }]}>
        <Text style={styles.headerTitle}>📊 Reports</Text>
        <Text style={styles.headerSub}>Comprehensive farm analytics & data</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, activeTab === tab.key && { color: tab.color, fontWeight: "800" }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            colors={[tabConfig.color]} tintColor={tabConfig.color} />
        }
      >
        {activeTab === "pluckers"   && <PluckersReport   data={pluckerReports} />}
        {activeTab === "farmers"    && <FarmersReport    data={farmerReports} />}
        {activeTab === "inventory"  && inventoryReport  && <InventoryReportView  data={inventoryReport} />}
        {activeTab === "financial"  && financialReport  && <FinancialReportView  data={financialReport} />}
        {activeTab === "attendance" && (
          <AttendanceReportView
            days={attendanceDays}
            expandedDay={expandedDay}
            setExpandedDay={setExpandedDay}
          />
        )}
        {activeTab === "inventory"  && !inventoryReport && <EmptyState icon="📦" text="No inventory data available" />}
        {activeTab === "financial"  && !financialReport && <EmptyState icon="💰" text="No financial data available" />}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── PLUCKERS REPORT ─────────────────────────────────────────────────────────
function PluckersReport({ data }: { data: PluckerReport[] }) {
  const totalKg      = data.reduce((s, d) => s + d.totalKg,       0);
  const totalOwed    = data.reduce((s, d) => s + d.totalOwed,     0);
  const totalPaid    = data.reduce((s, d) => s + d.totalPaid,     0);
  const totalPending = data.reduce((s, d) => s + d.pendingAmount, 0);
  const maxKg        = Math.max(...data.map(d => d.totalKg), 1);
  const paidCount    = data.filter(d => d.paymentStatus === "paid").length;
  const partialCount = data.filter(d => d.paymentStatus === "partial").length;
  const unpaidCount  = data.filter(d => d.paymentStatus === "pending").length;

  return (
    <>
      <View style={styles.summaryGrid}>
        <SummaryCard icon="🧺" label="Pluckers"   value={String(data.length)}                              color={colors.primary}    bg={colors.primaryPale} />
        <SummaryCard icon="⚖️" label="Collected"  value={`${Math.round(totalKg * 10) / 10} kg`}           color={colors.accent}     bg={colors.accentPale} />
        <SummaryCard icon="💰" label="Total Owed" value={`KSh ${Math.round(totalOwed).toLocaleString()}`} color={colors.salesColor} bg={colors.salesLight} />
        <SummaryCard icon="✅" label="Paid Out"   value={`KSh ${Math.round(totalPaid).toLocaleString()}`} color={colors.success}    bg={colors.successLight} />
        <SummaryCard icon="⏳" label="Pending"    value={`KSh ${Math.round(totalPending).toLocaleString()}`} color={colors.warning} bg={colors.warningLight} />
        <SummaryCard icon="📅" label="Att. Days"  value={`${data.reduce((s, d) => s + d.attendanceDays, 0)}`} color={colors.primary} bg={colors.primaryPale} />
      </View>

      {/* Payment status summary */}
      <View style={styles.statusRow}>
        <View style={[styles.statusCard, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.statusValue, { color: colors.success }]}>{paidCount}</Text>
          <Text style={styles.statusLabel}>✅ Fully Paid</Text>
        </View>
        <View style={[styles.statusCard, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.statusValue, { color: colors.warning }]}>{partialCount}</Text>
          <Text style={styles.statusLabel}>⚠️ Partial</Text>
        </View>
        <View style={[styles.statusCard, { backgroundColor: colors.errorLight }]}>
          <Text style={[styles.statusValue, { color: colors.error }]}>{unpaidCount}</Text>
          <Text style={styles.statusLabel}>❌ Unpaid</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>🧺 Individual Plucker Records</Text>
      {data.length === 0 ? <EmptyState icon="🧺" text="No plucker data available" /> : (
        data.map((p, i) => (
          <View key={p.id} style={[styles.reportCard, { borderLeftColor: statusColor(p.paymentStatus), borderLeftWidth: 4 }]}>
            {/* Name & attendance */}
            <View style={styles.cardTopRow}>
              <View style={[styles.rankBadge, { backgroundColor: i < 3 ? colors.primary : colors.border }]}>
                <Text style={[styles.rankText, { color: i < 3 ? "#fff" : colors.textMuted }]}>#{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportName}>{p.name}</Text>
                <Text style={styles.reportSub}>📅 {p.attendanceDays} day{p.attendanceDays !== 1 ? "s" : ""} · 💳 {p.paymentMethod}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(p.paymentStatus) + "20", borderColor: statusColor(p.paymentStatus) }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor(p.paymentStatus) }]}>
                  {statusLabel(p.paymentStatus)}
                </Text>
              </View>
            </View>

            {/* Price details */}
            <View style={styles.priceRow}>
              <PriceCell label="Collected"  value={`${p.totalKg} kg`}                                  color={colors.accent} />
              <PriceCell label="Rate / kg"  value={p.pricePerKg > 0 ? `KSh ${p.pricePerKg}` : "—"}   color={colors.salesColor} />
              <PriceCell label="Total Owed" value={`KSh ${Math.round(p.totalOwed).toLocaleString()}`} color={colors.primary} />
            </View>

            {/* Payment breakdown */}
            <View style={styles.payBreakRow}>
              <PayBreak label="Paid"    value={`KSh ${Math.round(p.totalPaid).toLocaleString()}`}     color={colors.success} />
              <View style={styles.payBreakDiv} />
              <PayBreak label="Pending" value={`KSh ${Math.round(p.pendingAmount).toLocaleString()}`} color={p.pendingAmount > 0 ? colors.warning : colors.textMuted} />
              <View style={styles.payBreakDiv} />
              <PayBreak label="Balance"
                value={`KSh ${Math.max(0, Math.round(p.totalOwed - p.totalPaid)).toLocaleString()}`}
                color={p.totalOwed - p.totalPaid > 0 ? colors.error : colors.success}
              />
            </View>

            <View style={styles.progressWrap}>
              <View style={[styles.progressBar, { width: `${Math.min(100, (p.totalKg / maxKg) * 100)}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>
        ))
      )}
    </>
  );
}

// ─── FARMERS REPORT ───────────────────────────────────────────────────────────
function FarmersReport({ data }: { data: FarmerReport[] }) {
  const totalKg      = data.reduce((s, d) => s + d.totalKg,       0);
  const totalOwed    = data.reduce((s, d) => s + d.totalOwed,     0);
  const totalPaid    = data.reduce((s, d) => s + d.totalPaid,     0);
  const totalPending = data.reduce((s, d) => s + d.pendingAmount, 0);
  const maxKg        = Math.max(...data.map(d => d.totalKg), 1);
  const paidCount    = data.filter(d => d.paymentStatus === "paid").length;
  const partialCount = data.filter(d => d.paymentStatus === "partial").length;
  const unpaidCount  = data.filter(d => d.paymentStatus === "pending").length;

  return (
    <>
      <View style={styles.summaryGrid}>
        <SummaryCard icon="👨‍🌾" label="Farmers"    value={String(data.length)}                              color={colors.collectorColor} bg={colors.collectorLight} />
        <SummaryCard icon="⚖️"  label="Collected"  value={`${Math.round(totalKg * 10) / 10} kg`}           color={colors.accent}         bg={colors.accentPale} />
        <SummaryCard icon="💰"  label="Total Owed" value={`KSh ${Math.round(totalOwed).toLocaleString()}`} color={colors.salesColor}     bg={colors.salesLight} />
        <SummaryCard icon="✅"  label="Paid Out"   value={`KSh ${Math.round(totalPaid).toLocaleString()}`} color={colors.success}        bg={colors.successLight} />
        <SummaryCard icon="⏳"  label="Pending"    value={`KSh ${Math.round(totalPending).toLocaleString()}`} color={colors.warning}     bg={colors.warningLight} />
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusCard, { backgroundColor: colors.successLight }]}>
          <Text style={[styles.statusValue, { color: colors.success }]}>{paidCount}</Text>
          <Text style={styles.statusLabel}>✅ Fully Paid</Text>
        </View>
        <View style={[styles.statusCard, { backgroundColor: colors.warningLight }]}>
          <Text style={[styles.statusValue, { color: colors.warning }]}>{partialCount}</Text>
          <Text style={styles.statusLabel}>⚠️ Partial</Text>
        </View>
        <View style={[styles.statusCard, { backgroundColor: colors.errorLight }]}>
          <Text style={[styles.statusValue, { color: colors.error }]}>{unpaidCount}</Text>
          <Text style={styles.statusLabel}>❌ Unpaid</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>👨‍🌾 Individual Farmer Records</Text>
      {data.length === 0 ? <EmptyState icon="👨‍🌾" text="No farmer data available" /> : (
        data.map((f, i) => (
          <View key={f.id} style={[styles.reportCard, { borderLeftColor: statusColor(f.paymentStatus), borderLeftWidth: 4 }]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.rankBadge, { backgroundColor: i < 3 ? colors.collectorColor : colors.border }]}>
                <Text style={[styles.rankText, { color: i < 3 ? "#fff" : colors.textMuted }]}>#{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportName}>{f.name}</Text>
                <Text style={styles.reportSub}>🌾 {f.farmName} · 💳 {f.paymentMethod}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(f.paymentStatus) + "20", borderColor: statusColor(f.paymentStatus) }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor(f.paymentStatus) }]}>
                  {statusLabel(f.paymentStatus)}
                </Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <PriceCell label="Collected"     value={`${f.totalKg} kg`}                                  color={colors.accent} />
              <PriceCell label="Buying / kg"   value={f.pricePerKg > 0 ? `KSh ${f.pricePerKg}` : "—"}   color={colors.salesColor} />
              <PriceCell label="Total Owed"    value={`KSh ${Math.round(f.totalOwed).toLocaleString()}`} color={colors.collectorColor} />
            </View>

            <View style={styles.payBreakRow}>
              <PayBreak label="Paid"    value={`KSh ${Math.round(f.totalPaid).toLocaleString()}`}     color={colors.success} />
              <View style={styles.payBreakDiv} />
              <PayBreak label="Pending" value={`KSh ${Math.round(f.pendingAmount).toLocaleString()}`} color={f.pendingAmount > 0 ? colors.warning : colors.textMuted} />
              <View style={styles.payBreakDiv} />
              <PayBreak label="Balance"
                value={`KSh ${Math.max(0, Math.round(f.totalOwed - f.totalPaid)).toLocaleString()}`}
                color={f.totalOwed - f.totalPaid > 0 ? colors.error : colors.success}
              />
            </View>

            <View style={styles.progressWrap}>
              <View style={[styles.progressBar, { width: `${Math.min(100, (f.totalKg / maxKg) * 100)}%`, backgroundColor: colors.collectorColor }]} />
            </View>
          </View>
        ))
      )}
    </>
  );
}

// ─── INVENTORY REPORT ─────────────────────────────────────────────────────────
function InventoryReportView({ data }: { data: InventoryReport }) {
  const soldPct     = data.totalCollected > 0 ? (data.totalSold / data.totalCollected) * 100 : 0;
  const totalGraded = data.gradeA + data.gradeB;
  const isOverSold  = data.inStock < 0;

  return (
    <>
      <View style={styles.summaryGrid}>
        <SummaryCard icon="📥" label="Collected" value={`${data.totalCollected} kg`} color={colors.primary}    bg={colors.primaryPale} />
        <SummaryCard icon="🏭" label="Sold"      value={`${data.totalSold} kg`}      color={colors.salesColor} bg={colors.salesLight} />
        <SummaryCard icon="📦" label="In Stock"
          value={`${data.inStock} kg`}
          color={isOverSold ? colors.error : data.inStock === 0 ? colors.warning : colors.accent}
          bg={isOverSold ? colors.errorLight : data.inStock === 0 ? colors.warningLight : colors.accentPale}
        />
        <SummaryCard icon="📊" label="Sold Rate" value={`${Math.round(soldPct)}%`}  color={colors.success}   bg={colors.successLight} />
        <SummaryCard icon="🚫" label="Rejected"  value={`${data.totalRejected} kg`} color={colors.error}     bg={colors.errorLight} />
      </View>

      {isOverSold && (
        <View style={styles.oversoldCard}>
          <Text style={styles.oversoldIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.oversoldTitle}>Stock Discrepancy</Text>
            <Text style={styles.oversoldText}>
              {Math.abs(data.inStock).toFixed(2)} kg more was sold than collected. Check for missing collection records.
            </Text>
          </View>
        </View>
      )}

      {/* Stock flow bar */}
      <View style={styles.stockFlowCard}>
        <Text style={styles.stockFlowTitle}>📊 Stock Flow</Text>
        <View style={styles.stockFlowBar}>
          <View style={[styles.stockFlowSold,  { flex: Math.max(data.totalSold,  0.1) }]} />
          <View style={[styles.stockFlowStock, { flex: Math.max(Math.abs(data.inStock), 0.1) }]} />
        </View>
        <View style={styles.stockFlowLegend}>
          <View style={styles.stockFlowItem}>
            <View style={[styles.stockDot, { backgroundColor: colors.salesColor }]} />
            <Text style={styles.stockFlowText}>Sold: {data.totalSold} kg ({Math.round(soldPct)}%)</Text>
          </View>
          <View style={styles.stockFlowItem}>
            <View style={[styles.stockDot, { backgroundColor: isOverSold ? colors.error : colors.accent }]} />
            <Text style={styles.stockFlowText}>
              {isOverSold ? "Deficit" : "Stock"}: {data.inStock} kg
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>🏷️ Grade Breakdown</Text>
      <View style={styles.gradeCard}>
        {[
          { icon: "🌟", label: "Grade A — Premium", kg: data.gradeA, rev: data.gradeARev, color: colors.success, bg: colors.successLight },
          { icon: "⭐", label: "Grade B — Standard", kg: data.gradeB, rev: data.gradeBRev, color: colors.warning, bg: colors.warningLight },
        ].map((g, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.gradeDivider} />}
            <View style={styles.gradeRow}>
              <View style={[styles.gradeIcon, { backgroundColor: g.bg }]}>
                <Text style={{ fontSize: 22 }}>{g.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gradeName}>{g.label}</Text>
                <View style={styles.gradeBarWrap}>
                  <View style={[styles.gradeBarFill, {
                    width: `${totalGraded > 0 ? (g.kg / totalGraded) * 100 : 0}%`,
                    backgroundColor: g.color,
                  }]} />
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.gradeKg, { color: g.color }]}>{g.kg} kg</Text>
                <Text style={styles.gradeRev}>KSh {g.rev.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        ))}
        {data.totalRejected > 0 && (
          <>
            <View style={styles.gradeDivider} />
            <View style={styles.gradeRow}>
              <View style={[styles.gradeIcon, { backgroundColor: colors.errorLight }]}>
                <Text style={{ fontSize: 22 }}>🚫</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gradeName}>Rejected Tea</Text>
              </View>
              <Text style={[styles.gradeKg, { color: colors.error }]}>{data.totalRejected} kg</Text>
            </View>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>📊 Stock Overview</Text>
      <View style={styles.stockCard}>
        <StockRow label="Total Collected" value={`${data.totalCollected} kg`} icon="📥" color={colors.primary} />
        <StockRow label="Sold to Factory" value={`${data.totalSold} kg`}      icon="🏭" color={colors.salesColor} />
        {data.totalRejected > 0 && <StockRow label="Rejected" value={`${data.totalRejected} kg`} icon="🚫" color={colors.error} />}
        <View style={styles.stockDivider} />
        <StockRow
          label={isOverSold ? "Stock Deficit ⚠️" : "Current Stock"}
          value={`${data.inStock} kg`}
          icon="📦"
          color={isOverSold ? colors.error : data.inStock === 0 ? colors.warning : colors.success}
          bold
        />
      </View>
    </>
  );
}

// ─── FINANCIAL REPORT ─────────────────────────────────────────────────────────
function FinancialReportView({ data }: { data: FinancialReport }) {
  const isProfit = data.netProfit >= 0;
  return (
    <>
      <View style={[styles.plCard, { backgroundColor: isProfit ? colors.successLight : colors.errorLight }]}>
        <Text style={styles.plLabel}>{isProfit ? "💰 Net Profit / Faida" : "📉 Net Loss / Hasara"}</Text>
        <Text style={[styles.plValue, { color: isProfit ? colors.success : colors.error }]}>
          KSh {Math.abs(data.netProfit).toLocaleString()}
        </Text>
        <Text style={styles.plSub}>
          Revenue: KSh {data.totalRevenue.toLocaleString()} · Expenses: KSh {data.totalExpenses.toLocaleString()}
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard icon="💵" label="Revenue"  value={`KSh ${data.totalRevenue.toLocaleString()}`}          color={colors.success}   bg={colors.successLight} />
        <SummaryCard icon="📉" label="Expenses" value={`KSh ${data.totalExpenses.toLocaleString()}`}         color={colors.error}     bg={colors.errorLight} />
        <SummaryCard icon={isProfit ? "📈" : "📉"} label="Net P&L"
          value={`KSh ${Math.abs(data.netProfit).toLocaleString()}`}
          color={isProfit ? colors.success : colors.error}
          bg={isProfit ? colors.successLight : colors.errorLight}
        />
        <SummaryCard icon="📊" label="Margin"
          value={data.totalRevenue > 0 ? `${Math.round((data.netProfit / data.totalRevenue) * 100)}%` : "0%"}
          color={colors.salesColor} bg={colors.salesLight}
        />
      </View>

      {data.expenseBreakdown.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>📉 Expense Breakdown</Text>
          <View style={styles.reportCard}>
            {data.expenseBreakdown.map((exp, i) => (
              <View key={i}>
                <View style={styles.expRow}>
                  <Text style={styles.expCat}>{exp.category}</Text>
                  <Text style={[styles.expAmt, { color: colors.error }]}>KSh {exp.amount.toLocaleString()}</Text>
                </View>
                <View style={styles.progressWrap}>
                  <View style={[styles.progressBar, {
                    width: `${data.totalExpenses > 0 ? (exp.amount / data.totalExpenses) * 100 : 0}%`,
                    backgroundColor: colors.error, opacity: 0.6,
                  }]} />
                </View>
                {i < data.expenseBreakdown.length - 1 && <View style={styles.stockDivider} />}
              </View>
            ))}
          </View>
        </>
      )}

      {data.monthlySales.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>📈 Monthly Revenue (Last 6 Months)</Text>
          <View style={styles.reportCard}>
            {data.monthlySales.map((m, i) => {
              const maxAmt = Math.max(...data.monthlySales.map(s => s.amount), 1);
              const [year, month] = m.month.split("-");
              const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("default", { month: "short" });
              return (
                <View key={i} style={styles.monthRow}>
                  <Text style={styles.monthLabel}>{monthName} {year}</Text>
                  <View style={styles.monthBarWrap}>
                    <View style={[styles.monthBar, { width: `${(m.amount / maxAmt) * 100}%`, backgroundColor: colors.success }]} />
                  </View>
                  <Text style={[styles.monthAmt, { color: colors.success }]}>KSh {m.amount.toLocaleString()}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </>
  );
}

// ─── ATTENDANCE REPORT ────────────────────────────────────────────────────────
function AttendanceReportView({ days, expandedDay, setExpandedDay }: {
  days: AttendanceDay[];
  expandedDay: string | null;
  setExpandedDay: (d: string | null) => void;
}) {
  const totalRecords   = days.reduce((s, d) => s + d.records.length, 0);
  const uniquePluckers = new Set(days.flatMap(d => d.records.map(r => r.pluckerId))).size;
  const avgPerDay      = days.length > 0 ? Math.round(totalRecords / days.length) : 0;

  return (
    <>
      <View style={styles.summaryGrid}>
        <SummaryCard icon="📅" label="Days Recorded"   value={String(days.length)}    color={colors.supervisorColor} bg={colors.supervisorLight} />
        <SummaryCard icon="🧺" label="Unique Pluckers" value={String(uniquePluckers)} color={colors.primary}         bg={colors.primaryPale} />
        <SummaryCard icon="📋" label="Total Records"   value={String(totalRecords)}   color={colors.accent}          bg={colors.accentPale} />
        <SummaryCard icon="👥" label="Avg / Day"       value={String(avgPerDay)}      color={colors.collectorColor}  bg={colors.collectorLight} />
      </View>

      <Text style={styles.sectionTitle}>📅 Daily Attendance — Tap day to expand</Text>
      {days.length === 0 ? <EmptyState icon="📅" text="No attendance records found" /> : (
        days.map(day => {
          const isExpanded = expandedDay === day.date;
          return (
            <View key={day.date} style={styles.attDayCard}>
              <TouchableOpacity
                style={styles.attDayHeader}
                onPress={() => setExpandedDay(isExpanded ? null : day.date)}
                activeOpacity={0.82}
              >
                <View style={[styles.attDayIconWrap, { backgroundColor: colors.supervisorLight }]}>
                  <Text style={{ fontSize: 20 }}>📅</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.attDayDate}>{formatDate(day.date)}</Text>
                  <Text style={styles.attDayCount}>{day.records.length} plucker{day.records.length !== 1 ? "s" : ""} present</Text>
                </View>
                <View style={[styles.attDayBadge, { backgroundColor: colors.supervisorColor }]}>
                  <Text style={styles.attDayBadgeText}>{day.records.length}</Text>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.attRecordsWrap}>
                  <View style={[styles.attTableHeader, { backgroundColor: colors.supervisorLight }]}>
                    <Text style={[styles.attTableCell, { flex: 2, color: colors.supervisorColor }]}>Plucker Name</Text>
                    <Text style={[styles.attTableCell, { flex: 1, textAlign: "right", color: colors.supervisorColor }]}>Time In</Text>
                  </View>
                  {day.records.map((rec, ri) => (
                    <View key={`${rec.pluckerId}-${ri}`} style={[styles.attRecordRow, ri % 2 === 0 && styles.attRecordRowAlt]}>
                      <View style={styles.attRecordLeft}>
                        <View style={[styles.attAvatar, { backgroundColor: colors.collectorLight }]}>
                          <Text style={[styles.attAvatarText, { color: colors.collectorColor }]}>
                            {(rec.pluckerName || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.attRecordName}>{rec.pluckerName}</Text>
                      </View>
                      <View style={styles.attTimeBadge}>
                        <Text style={styles.attTimeText}>🕐 {rec.time}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={[styles.attFooter, { backgroundColor: colors.supervisorLight }]}>
                    <Text style={[styles.attFooterText, { color: colors.supervisorColor }]}>
                      {day.records.length} plucker{day.records.length !== 1 ? "s" : ""} on {formatDate(day.date)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: bg }]}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function PriceCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.priceCell}>
      <Text style={[styles.priceCellValue, { color }]}>{value}</Text>
      <Text style={styles.priceCellLabel}>{label}</Text>
    </View>
  );
}

function PayBreak({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.payBreakItem}>
      <Text style={styles.payBreakLabel}>{label}</Text>
      <Text style={[styles.payBreakValue, { color }]}>{value}</Text>
    </View>
  );
}

function StockRow({ label, value, icon, color, bold }: any) {
  return (
    <View style={styles.stockRow}>
      <Text style={styles.stockIcon}>{icon}</Text>
      <Text style={[styles.stockLabel, bold && { fontWeight: "800", fontSize: fonts.sizes.md }]}>{label}</Text>
      <Text style={[styles.stockValue, { color }, bold && { fontWeight: "900", fontSize: fonts.sizes.md }]}>{value}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CARD_W = (width - spacing.md * 2 - spacing.xs * 3) / 2;

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },

  header:      { paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.xs, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2, marginBottom: spacing.sm },
  tabBar:       { marginBottom: 4 },
  tabBtn:       { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 8 },
  tabBtnActive: { backgroundColor: "#fff" },
  tabIcon:      { fontSize: 16 },
  tabLabel:     { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },

  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitle:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.sm },

  summaryGrid:  { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  summaryCard:  { width: CARD_W, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  summaryIcon:  { fontSize: 22, marginBottom: 4 },
  summaryValue: { fontSize: fonts.sizes.sm, fontWeight: "800", textAlign: "center" },
  summaryLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 2 },

  // Payment status summary
  statusRow:   { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  statusCard:  { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  statusValue: { fontSize: fonts.sizes.xl, fontWeight: "900" },
  statusLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: "center" },

  reportCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },

  cardTopRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  rankBadge:   { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  rankText:    { fontSize: 12, fontWeight: "800" },
  reportName:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  reportSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  statusBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  statusBadgeText: { fontSize: 9, fontWeight: "800" },

  // Price row
  priceRow:       { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  priceCell:      { flex: 1, alignItems: "center", paddingVertical: 4 },
  priceCellValue: { fontSize: fonts.sizes.sm, fontWeight: "900" },
  priceCellLabel: { fontSize: 9, color: colors.textMuted, marginTop: 2 },

  // Payment breakdown
  payBreakRow:  { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  payBreakItem: { flex: 1, alignItems: "center" },
  payBreakLabel:{ fontSize: 9, color: colors.textMuted, fontWeight: "600" },
  payBreakValue:{ fontSize: 12, fontWeight: "800", marginTop: 2 },
  payBreakDiv:  { width: 1, backgroundColor: colors.divider },

  progressWrap: { height: 5, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  progressBar:  { height: 5, borderRadius: 4 },

  // Inventory
  oversoldCard:  { backgroundColor: colors.errorLight, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.error },
  oversoldIcon:  { fontSize: 24 },
  oversoldTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.error },
  oversoldText:  { fontSize: fonts.sizes.xs, color: colors.error, marginTop: 2, lineHeight: 18 },

  stockFlowCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  stockFlowTitle:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  stockFlowBar:     { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  stockFlowSold:    { backgroundColor: colors.salesColor },
  stockFlowStock:   { backgroundColor: colors.accent },
  stockFlowLegend:  { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  stockFlowItem:    { flexDirection: "row", alignItems: "center", gap: 6 },
  stockDot:         { width: 10, height: 10, borderRadius: 5 },
  stockFlowText:    { fontSize: fonts.sizes.xs, color: colors.textSecondary, fontWeight: "600" },

  gradeCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  gradeRow:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  gradeIcon:   { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  gradeName:   { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  gradeBarWrap:{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden", width: "90%" },
  gradeBarFill:{ height: 6, borderRadius: 3 },
  gradeKg:     { fontSize: fonts.sizes.md, fontWeight: "800" },
  gradeRev:    { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  gradeDivider:{ height: 1, backgroundColor: colors.divider, marginVertical: 4 },

  stockCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  stockRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  stockIcon:    { fontSize: 20, marginRight: 12 },
  stockLabel:   { flex: 1, fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  stockValue:   { fontSize: fonts.sizes.sm, fontWeight: "700" },
  stockDivider: { height: 1, backgroundColor: colors.divider },

  // Financial
  plCard:  { borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", marginBottom: spacing.sm, ...shadows.sm },
  plLabel: { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  plValue: { fontSize: 36, fontWeight: "900" },
  plSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  expRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  expCat: { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  expAmt: { fontSize: fonts.sizes.sm, fontWeight: "800" },

  monthRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  monthLabel:   { fontSize: 11, color: colors.textMuted, width: 56 },
  monthBarWrap: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  monthBar:     { height: 8, borderRadius: 4 },
  monthAmt:     { fontSize: 11, fontWeight: "700", minWidth: 70, textAlign: "right" },

  // Attendance
  attDayCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, overflow: "hidden", ...shadows.md },
  attDayHeader:  { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md },
  attDayIconWrap:{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  attDayDate:    { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  attDayCount:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  attDayBadge:   { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  attDayBadgeText:{ fontSize: fonts.sizes.sm, fontWeight: "900", color: "#fff" },
  expandIcon:    { fontSize: 11, color: colors.textMuted, marginLeft: 4 },

  attRecordsWrap:   { borderTopWidth: 1, borderTopColor: colors.divider },
  attTableHeader:   { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: 8 },
  attTableCell:     { fontSize: 11, fontWeight: "800" },
  attRecordRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 10 },
  attRecordRowAlt:  { backgroundColor: colors.background },
  attRecordLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  attAvatar:        { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  attAvatarText:    { fontSize: 14, fontWeight: "900" },
  attRecordName:    { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  attTimeBadge:     { backgroundColor: colors.primaryPale, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  attTimeText:      { fontSize: 11, color: colors.primary, fontWeight: "700" },
  attFooter:        { paddingHorizontal: spacing.md, paddingVertical: 8 },
  attFooterText:    { fontSize: 11, fontWeight: "700", textAlign: "center" },

  emptyState: { alignItems: "center", paddingTop: 60, paddingBottom: 20 },
  emptyIcon:  { fontSize: 48, marginBottom: 10 },
  emptyText:  { fontSize: fonts.sizes.sm, color: colors.textMuted },
});