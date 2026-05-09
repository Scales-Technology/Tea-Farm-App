// ─── Supervisor Dashboard — TeaFarm Pro ──────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, Dimensions, Alert, Modal,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { logoutUser } from "../../firebase/auth";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");

type ReportTab  = "overview" | "collection" | "sales" | "inventory" | "financial" | "attendance";
type DateFilter = "daily" | "weekly" | "monthly" | "custom_month";

interface AllData {
  collections: any[];
  sales:       any[];
  expenses:    any[];
  pluckers:    any[];
  farmers:     any[];
  attendance:  any[];
}

const TAB_CONFIG: { key: ReportTab; label: string; icon: string; color: string }[] = [
  { key: "overview",   label: "Overview",   icon: "📊", color: colors.supervisorColor },
  { key: "collection", label: "Collection", icon: "⚖️", color: colors.collectorColor },
  { key: "sales",      label: "Sales",      icon: "💼", color: colors.salesColor },
  { key: "inventory",  label: "Inventory",  icon: "📦", color: colors.accent },
  { key: "financial",  label: "Financial",  icon: "💰", color: colors.success },
  { key: "attendance", label: "Attendance", icon: "📅", color: colors.adminColor },
];

// Generate last 12 months + current month
const generateMonths = (): { label: string; year: number; month: number }[] => {
  const months = [];
  const now    = new Date();
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleDateString("en-KE", { month: "long", year: "numeric" }),
      year:  d.getFullYear(),
      month: d.getMonth(), // 0-indexed
    });
  }
  return months;
};

const MONTHS = generateMonths();

export default function SupervisorDashboard({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [data,             setData]             = useState<AllData | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activeTab,        setActiveTab]        = useState<ReportTab>("overview");
  const [dateFilter,       setDateFilter]       = useState<DateFilter>("monthly");
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0); // index in MONTHS array
  const [showMonthPicker,  setShowMonthPicker]  = useState(false);
  const [userName,         setUserName]         = useState("Supervisor");
  const [orgName,          setOrgName]          = useState("My Farm");

  const orgIdRef = useRef("");

  // ── Date range helper ─────────────────────────────────────────────────────
  const getDateRange = (): { from: Date; to: Date; label: string } => {
    const now = new Date();
    if (dateFilter === "daily") {
      const from = new Date(now); from.setHours(0, 0, 0, 0);
      const to   = new Date(now); to.setHours(23, 59, 59, 999);
      return { from, to, label: "Today" };
    }
    if (dateFilter === "weekly") {
      const from = new Date(now); from.setDate(now.getDate() - 7); from.setHours(0, 0, 0, 0);
      return { from, to: new Date(now), label: "Last 7 Days" };
    }
    if (dateFilter === "custom_month") {
      const m    = MONTHS[selectedMonthIdx];
      const from = new Date(m.year, m.month, 1);
      const to   = new Date(m.year, m.month + 1, 0, 23, 59, 59);
      return { from, to, label: m.label };
    }
    // default: this month
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { from, to, label: "This Month" };
  };

  const isInRange = (ts: any, dateStr?: string): boolean => {
    const { from, to } = getDateRange();
    try {
      const d = dateStr
        ? new Date(dateStr + "T00:00:00")
        : ts?.toDate ? ts.toDate() : new Date(ts);
      return d >= from && d <= to;
    } catch { return false; }
  };

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current = oid;
      setUserName(me.name || "Supervisor");

      const orgSnap = await getDoc(doc(db, "organizations", oid));
      if (orgSnap.exists()) setOrgName(orgSnap.data()!.farmName || "My Farm");

      const [collSnap, salesSnap, expSnap, pluckerSnap, farmerSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, "collections"), where("organizationId", "==", oid))),
        getDocs(query(collection(db, "sales"),       where("organizationId", "==", oid))),
        getDocs(query(collection(db, "expenses"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "pluckers"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "farmers"),     where("organizationId", "==", oid))),
        getDocs(query(collection(db, "attendance"),  where("organizationId", "==", oid))),
      ]);

      setData({
        collections: collSnap.docs.map(d  => ({ id: d.id,  ...d.data() })),
        sales:       salesSnap.docs.map(d => ({ id: d.id,  ...d.data() })),
        expenses:    expSnap.docs.map(d   => ({ id: d.id,  ...d.data() })),
        pluckers:    pluckerSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        farmers:     farmerSnap.docs.map(d  => ({ id: d.id, ...d.data() })),
        attendance:  attSnap.docs.map(d   => ({ id: d.id,  ...d.data() })),
      });
    } catch (e: any) { console.log("Supervisor load error:", e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  const handleRefresh = () => { setRefreshing(true); loadAll(); };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        showLoader("Signing out..."); try { await logoutUser(); navigation.replace("Login"); } finally { hideLoader(); }
      }},
    ]);
  };

  // ── Current range label ───────────────────────────────────────────────────
  const rangeLabel = getDateRange().label;

  // ── Filtered slices ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!data) return null;
    return {
      collections: data.collections.filter(r => isInRange(r.createdAt, r.date)),
      sales:       data.sales.filter(r       => isInRange(r.createdAt, r.date)),
      expenses:    data.expenses.filter(r    => isInRange(r.createdAt)),
      attendance:  data.attendance.filter(r  => isInRange(r.createdAt, r.date)),
    };
  }, [data, dateFilter, selectedMonthIdx]);

  // ── Computed metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!data || !filtered) return null;
    const pluckerColl    = filtered.collections.filter(r => r.sourceType === "plucker");
    const farmerColl     = filtered.collections.filter(r => r.sourceType === "farmer");
    const totalPluckerKg = pluckerColl.reduce((s: number, r: any) => s + (r.weightKg || 0), 0);
    const totalFarmerKg  = farmerColl.reduce( (s: number, r: any) => s + (r.weightKg || 0), 0);
    const totalCollKg    = totalPluckerKg + totalFarmerKg;
    let totalGradeA = 0, totalGradeB = 0, totalRevenue = 0;
    filtered.sales.forEach((s: any) => { totalGradeA += s.gradeA_kg || 0; totalGradeB += s.gradeB_kg || 0; totalRevenue += s.totalAmount || 0; });
    const totalSoldKg   = totalGradeA + totalGradeB;
    const totalExpenses = filtered.expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const netProfit     = totalRevenue - totalExpenses;
    const allCollKg     = data.collections.reduce((s: number, r: any) => s + (r.weightKg || 0), 0);
    const allSoldKg     = data.sales.reduce((s: number, r: any) => s + (r.gradeA_kg || 0) + (r.gradeB_kg || 0), 0);
    const inStockKg     = Math.max(0, allCollKg - allSoldKg);
    const uniquePluckerAtt = new Set(filtered.attendance.map((a: any) => a.pluckerId)).size;
    const activePluckers   = data.pluckers.filter((p: any) => p.isActive !== false).length;
    const activeFarmers    = data.farmers.filter( (f: any) => f.isActive !== false).length;

    const pluckerMap: Record<string, any> = {};
    pluckerColl.forEach((r: any) => {
      if (!pluckerMap[r.sourceId]) pluckerMap[r.sourceId] = { name: r.sourceName, totalKg: 0, batches: 0 };
      pluckerMap[r.sourceId].totalKg += r.weightKg || 0;
      pluckerMap[r.sourceId].batches += 1;
    });
    const topPluckers = Object.values(pluckerMap).sort((a: any, b: any) => b.totalKg - a.totalKg).slice(0, 5);

    const farmerMap: Record<string, any> = {};
    farmerColl.forEach((r: any) => {
      if (!farmerMap[r.sourceId]) farmerMap[r.sourceId] = { name: r.sourceName, totalKg: 0, batches: 0 };
      farmerMap[r.sourceId].totalKg += r.weightKg || 0;
      farmerMap[r.sourceId].batches += 1;
    });
    const topFarmers = Object.values(farmerMap).sort((a: any, b: any) => b.totalKg - a.totalKg).slice(0, 5);

    const buyerMap: Record<string, any> = {};
    filtered.sales.forEach((s: any) => {
      const key = s.buyerName || "Unknown";
      if (!buyerMap[key]) buyerMap[key] = { name: key, totalKg: 0, totalAmount: 0 };
      buyerMap[key].totalKg += (s.gradeA_kg || 0) + (s.gradeB_kg || 0);
      buyerMap[key].totalAmount += s.totalAmount || 0;
    });
    const topBuyers = Object.values(buyerMap).sort((a: any, b: any) => b.totalAmount - a.totalAmount);

    const catMap: Record<string, number> = {};
    filtered.expenses.forEach((e: any) => { const cat = e.category?.split(" / ")[0] || "Other"; catMap[cat] = (catMap[cat] || 0) + (e.amount || 0); });
    const expenseBreakdown = Object.entries(catMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt);

    return {
      totalCollKg:    Math.round(totalCollKg    * 10) / 10,
      totalPluckerKg: Math.round(totalPluckerKg * 10) / 10,
      totalFarmerKg:  Math.round(totalFarmerKg  * 10) / 10,
      totalSoldKg:    Math.round(totalSoldKg    * 10) / 10,
      totalGradeA:    Math.round(totalGradeA    * 10) / 10,
      totalGradeB:    Math.round(totalGradeB    * 10) / 10,
      totalRevenue, totalExpenses, netProfit,
      inStockKg:      Math.round(inStockKg * 10) / 10,
      salesCount:     filtered.sales.length,
      collBatches:    filtered.collections.length,
      uniquePluckerAtt, activePluckers, activeFarmers,
      topPluckers, topFarmers, topBuyers, expenseBreakdown,
      allCollKg: Math.round(allCollKg * 10) / 10,
      allSoldKg: Math.round(allSoldKg * 10) / 10,
    };
  }, [data, filtered]);

  const fmt = (n: number) => Math.round(n).toLocaleString();

  if (loading) return <TeaLoader message="Loading Reports..." subMessage="Main Supervisor" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.supervisorColor} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerGreeting}>
              {new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening"} 👋
            </Text>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerOrg}>🌿 {orgName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>📊 Supervisor</Text></View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutIcon}>⎋</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date filter row */}
        <View style={styles.dateFilterRow}>
          {(["daily", "weekly", "monthly"] as DateFilter[]).map(f => (
            <TouchableOpacity key={f}
              style={[styles.dateFilterBtn, dateFilter === f && styles.dateFilterBtnActive]}
              onPress={() => setDateFilter(f)}
            >
              <Text style={[styles.dateFilterText, dateFilter === f && styles.dateFilterTextActive]}>
                {f === "daily" ? "Today" : f === "weekly" ? "Week" : "Month"}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Month picker button */}
          <TouchableOpacity
            style={[styles.dateFilterBtn, styles.monthPickerBtn, dateFilter === "custom_month" && styles.dateFilterBtnActive]}
            onPress={() => setShowMonthPicker(true)}
          >
            <Text style={[styles.dateFilterText, dateFilter === "custom_month" && styles.dateFilterTextActive]}>
              📅 {dateFilter === "custom_month" ? MONTHS[selectedMonthIdx].label.split(" ")[0] : "Pick Month"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Active period label */}
        <View style={styles.periodBadge}>
          <Text style={styles.periodBadgeText}>📆 Showing: {rangeLabel}</Text>
        </View>

        {/* KPI strip */}
        {metrics && (
          <View style={styles.kpiStrip}>
            <KPIItem label="Collected"  value={`${metrics.totalCollKg}kg`} />
            <View style={styles.kpiDivider} />
            <KPIItem label="Revenue"    value={`KSh${fmt(metrics.totalRevenue)}`} />
            <View style={styles.kpiDivider} />
            <KPIItem label="Net P&L"    value={`KSh${fmt(metrics.netProfit)}`} highlight={metrics.netProfit >= 0} />
            <View style={styles.kpiDivider} />
            <KPIItem label="In Stock"   value={`${metrics.inStockKg}kg`} />
          </View>
        )}
      </View>

      {/* ── Tab bar ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TAB_CONFIG.map(tab => (
          <TouchableOpacity key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && { backgroundColor: tab.color }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && { color: "#fff", fontWeight: "800" }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.readOnlyBanner}>
        <Text style={styles.readOnlyText}>👁 Read-Only · {rangeLabel}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.supervisorColor]} tintColor={colors.supervisorColor} />}
      >
        {metrics ? (
          <>
            {/* ════ OVERVIEW ════ */}
            {activeTab === "overview" && (
              <>
                <SectionTitle icon="📊" title="Farm Overview" sub={rangeLabel} color={colors.supervisorColor} />
                <View style={styles.overviewGrid}>
                  <OverviewCard icon="⚖️"  label="Total Collected"  value={`${metrics.totalCollKg} kg`}          color={colors.collectorColor} bg={colors.collectorLight} />
                  <OverviewCard icon="💼"  label="Total Sold"        value={`${metrics.totalSoldKg} kg`}          color={colors.salesColor}     bg={colors.salesLight} />
                  <OverviewCard icon="📦"  label="In Stock"          value={`${metrics.inStockKg} kg`}            color={colors.accent}         bg={colors.accentPale} />
                  <OverviewCard icon="💰"  label="Revenue"           value={`KSh ${fmt(metrics.totalRevenue)}`}   color={colors.success}        bg={colors.successLight} />
                  <OverviewCard icon="📉"  label="Expenses"          value={`KSh ${fmt(metrics.totalExpenses)}`}  color={colors.error}          bg={colors.errorLight} />
                  <OverviewCard icon={metrics.netProfit >= 0 ? "📈" : "📉"} label="Net Profit"
                    value={`KSh ${fmt(Math.abs(metrics.netProfit))}`}
                    color={metrics.netProfit >= 0 ? colors.success : colors.error}
                    bg={metrics.netProfit >= 0 ? colors.successLight : colors.errorLight} />
                  <OverviewCard icon="🧺"  label="Active Pluckers"   value={String(metrics.activePluckers)}       color={colors.primary}        bg={colors.primaryPale} />
                  <OverviewCard icon="👨‍🌾" label="Active Farmers"    value={String(metrics.activeFarmers)}        color={colors.collectorColor} bg={colors.collectorLight} />
                </View>
                {metrics.topPluckers.length > 0 && (
                  <><SectionTitle icon="🧺" title="Top Pluckers" sub={rangeLabel} color={colors.collectorColor} />
                  <View style={styles.rankCard}>
                    {metrics.topPluckers.map((p: any, i: number) => (
                      <RankRow key={p.name} rank={i+1} name={p.name} value={`${Math.round(p.totalKg*10)/10} kg`} sub={`${p.batches} batches`} color={colors.collectorColor} maxVal={metrics.topPluckers[0]?.totalKg||1} val={p.totalKg} />
                    ))}
                  </View></>
                )}
                {metrics.topFarmers.length > 0 && (
                  <><SectionTitle icon="👨‍🌾" title="Top Farmers" sub={rangeLabel} color={colors.primary} />
                  <View style={styles.rankCard}>
                    {metrics.topFarmers.map((f: any, i: number) => (
                      <RankRow key={f.name} rank={i+1} name={f.name} value={`${Math.round(f.totalKg*10)/10} kg`} sub={`${f.batches} batches`} color={colors.primary} maxVal={metrics.topFarmers[0]?.totalKg||1} val={f.totalKg} />
                    ))}
                  </View></>
                )}
              </>
            )}

            {/* ════ COLLECTION ════ */}
            {activeTab === "collection" && (
              <>
                <SectionTitle icon="⚖️" title="Collection Report" sub={rangeLabel} color={colors.collectorColor} />
                <View style={styles.statRow}>
                  <StatCard icon="📦" label="Total"         value={`${metrics.totalCollKg} kg`}     color={colors.collectorColor} bg={colors.collectorLight} />
                  <StatCard icon="🧺" label="Pluckers"      value={`${metrics.totalPluckerKg} kg`}  color={colors.primary}        bg={colors.primaryPale} />
                  <StatCard icon="👨‍🌾" label="Farmers"      value={`${metrics.totalFarmerKg} kg`}   color={colors.accent}         bg={colors.accentPale} />
                  <StatCard icon="📋" label="Batches"       value={String(metrics.collBatches)}      color={colors.earth}          bg={colors.earthPale} />
                </View>
                <View style={styles.reportCard}>
                  <Text style={styles.reportCardTitle}>Source Distribution</Text>
                  <View style={styles.distBar}>
                    <View style={[styles.distSegA, { flex: Math.max(metrics.totalPluckerKg,1) }]} />
                    <View style={[styles.distSegB, { flex: Math.max(metrics.totalFarmerKg, 1) }]} />
                  </View>
                  <View style={styles.distLegend}>
                    <LegendDot color={colors.collectorColor} label={`🧺 Pluckers — ${metrics.totalCollKg>0?Math.round((metrics.totalPluckerKg/metrics.totalCollKg)*100):0}%`} />
                    <LegendDot color={colors.primary}        label={`👨‍🌾 Farmers — ${metrics.totalCollKg>0?Math.round((metrics.totalFarmerKg/metrics.totalCollKg)*100):0}%`} />
                  </View>
                </View>
                {metrics.topPluckers.length === 0 ? <EmptyCard text="No plucker records in this period" /> : (
                  <><SectionTitle icon="🏆" title="Top Pluckers" sub={rangeLabel} color={colors.collectorColor} />
                  <View style={styles.rankCard}>
                    {metrics.topPluckers.map((p: any, i: number) => (
                      <RankRow key={p.name} rank={i+1} name={p.name} value={`${Math.round(p.totalKg*10)/10} kg`} sub={`${p.batches} batches`} color={colors.collectorColor} maxVal={metrics.topPluckers[0]?.totalKg||1} val={p.totalKg} />
                    ))}
                  </View></>
                )}
                {metrics.topFarmers.length === 0 ? <EmptyCard text="No farmer records in this period" /> : (
                  <><SectionTitle icon="🌾" title="Top Farmers" sub={rangeLabel} color={colors.primary} />
                  <View style={styles.rankCard}>
                    {metrics.topFarmers.map((f: any, i: number) => (
                      <RankRow key={f.name} rank={i+1} name={f.name} value={`${Math.round(f.totalKg*10)/10} kg`} sub={`${f.batches} batches`} color={colors.primary} maxVal={metrics.topFarmers[0]?.totalKg||1} val={f.totalKg} />
                    ))}
                  </View></>
                )}
              </>
            )}

            {/* ════ SALES ════ */}
            {activeTab === "sales" && (
              <>
                <SectionTitle icon="💼" title="Sales Report" sub={rangeLabel} color={colors.salesColor} />
                <View style={styles.statRow}>
                  <StatCard icon="💰" label="Revenue"  value={`KSh ${fmt(metrics.totalRevenue)}`} color={colors.salesColor} bg={colors.salesLight} />
                  <StatCard icon="⚖️" label="Sold"     value={`${metrics.totalSoldKg} kg`}        color={colors.success}    bg={colors.successLight} />
                  <StatCard icon="🅰️" label="Grade A"  value={`${metrics.totalGradeA} kg`}        color={colors.success}    bg={colors.successLight} />
                  <StatCard icon="🅱️" label="Grade B"  value={`${metrics.totalGradeB} kg`}        color={colors.warning}    bg={colors.warningLight} />
                </View>
                <View style={styles.reportCard}>
                  <Text style={styles.reportCardTitle}>Grade Distribution</Text>
                  <View style={styles.distBar}>
                    <View style={[styles.distSegA, { flex: Math.max(metrics.totalGradeA,1), backgroundColor: colors.success }]} />
                    <View style={[styles.distSegB, { flex: Math.max(metrics.totalGradeB,1), backgroundColor: colors.warning }]} />
                  </View>
                  <View style={styles.distLegend}>
                    <LegendDot color={colors.success} label={`🅰️ Grade A — ${metrics.totalSoldKg>0?Math.round((metrics.totalGradeA/metrics.totalSoldKg)*100):0}%`} />
                    <LegendDot color={colors.warning} label={`🅱️ Grade B — ${metrics.totalSoldKg>0?Math.round((metrics.totalGradeB/metrics.totalSoldKg)*100):0}%`} />
                  </View>
                </View>
                {metrics.topBuyers.length > 0 && (
                  <><SectionTitle icon="🏭" title="Sales by Factory / Buyer" sub={rangeLabel} color={colors.salesColor} />
                  <View style={styles.rankCard}>
                    {metrics.topBuyers.map((b: any, i: number) => (
                      <RankRow key={b.name} rank={i+1} name={b.name} value={`KSh ${fmt(Math.round(b.totalAmount))}`} sub={`${Math.round(b.totalKg*10)/10} kg sold`} color={colors.salesColor} maxVal={metrics.topBuyers[0]?.totalAmount||1} val={b.totalAmount} />
                    ))}
                  </View></>
                )}
                {metrics.salesCount === 0 && <EmptyCard text="No sales in this period" />}
              </>
            )}

            {/* ════ INVENTORY ════ */}
            {activeTab === "inventory" && (
              <>
                <SectionTitle icon="📦" title="Inventory Report" sub="All Time Stock" color={colors.accent} />
                <View style={[styles.inventoryHero, { backgroundColor: colors.accent }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inventoryHeroLabel}>Current Stock</Text>
                    <Text style={styles.inventoryHeroValue}>{metrics.inStockKg} kg</Text>
                    <Text style={styles.inventoryHeroSub}>Available for grading & sale</Text>
                  </View>
                  <Text style={{ fontSize: 52 }}>📦</Text>
                </View>
                <View style={styles.statRow}>
                  <StatCard icon="📥" label="Collected" value={`${metrics.allCollKg} kg`}  color={colors.primary}    bg={colors.primaryPale} />
                  <StatCard icon="🏭" label="Sold"      value={`${metrics.allSoldKg} kg`}  color={colors.salesColor} bg={colors.salesLight} />
                  <StatCard icon="📦" label="In Stock"  value={`${metrics.inStockKg} kg`}  color={metrics.inStockKg>0?colors.accent:colors.error} bg={metrics.inStockKg>0?colors.accentPale:colors.errorLight} />
                  <StatCard icon="📊" label="Sold Rate" value={`${metrics.allCollKg>0?Math.round((metrics.allSoldKg/metrics.allCollKg)*100):0}%`} color={colors.success} bg={colors.successLight} />
                </View>
                <View style={styles.reportCard}>
                  <Text style={styles.reportCardTitle}>Stock Status</Text>
                  {(() => {
                    const soldPct  = metrics.allCollKg>0?Math.round((metrics.allSoldKg/metrics.allCollKg)*100):0;
                    const stockPct = Math.max(0,100-soldPct);
                    return (<>
                      <View style={styles.distBar}>
                        <View style={[styles.distSegA, { flex: Math.max(soldPct,1),  backgroundColor: colors.salesColor }]} />
                        <View style={[styles.distSegB, { flex: Math.max(stockPct,1), backgroundColor: colors.accent }]} />
                      </View>
                      <View style={styles.distLegend}>
                        <LegendDot color={colors.salesColor} label={`Sold — ${soldPct}%`} />
                        <LegendDot color={colors.accent}     label={`In Stock — ${stockPct}%`} />
                      </View>
                    </>);
                  })()}
                </View>
              </>
            )}

            {/* ════ FINANCIAL ════ */}
            {activeTab === "financial" && (
              <>
                <SectionTitle icon="💰" title="Financial Report" sub={rangeLabel} color={colors.success} />
                <View style={[styles.financialHero, { backgroundColor: metrics.netProfit>=0?colors.successLight:colors.errorLight, borderColor: metrics.netProfit>=0?colors.success:colors.error }]}>
                  <Text style={styles.financialHeroLabel}>{metrics.netProfit>=0?"💰 Net Profit / Faida":"📉 Net Loss / Hasara"}</Text>
                  <Text style={[styles.financialHeroValue, { color: metrics.netProfit>=0?colors.success:colors.error }]}>KSh {fmt(Math.abs(metrics.netProfit))}</Text>
                  <Text style={styles.financialHeroSub}>Revenue: KSh {fmt(metrics.totalRevenue)} · Expenses: KSh {fmt(metrics.totalExpenses)}</Text>
                </View>
                <View style={styles.statRow}>
                  <StatCard icon="💵" label="Revenue"  value={`KSh ${fmt(metrics.totalRevenue)}`}  color={colors.success}    bg={colors.successLight} />
                  <StatCard icon="📉" label="Expenses" value={`KSh ${fmt(metrics.totalExpenses)}`} color={colors.error}      bg={colors.errorLight} />
                  <StatCard icon="📊" label="Margin"   value={`${metrics.totalRevenue>0?Math.round((metrics.netProfit/metrics.totalRevenue)*100):0}%`} color={colors.salesColor} bg={colors.salesLight} />
                  <StatCard icon="🏷️" label="Sales"    value={String(metrics.salesCount)} color={colors.primary} bg={colors.primaryPale} />
                </View>
                {metrics.expenseBreakdown.length > 0 && (
                  <><SectionTitle icon="📉" title="Expense Breakdown" sub={rangeLabel} color={colors.error} />
                  <View style={styles.rankCard}>
                    {metrics.expenseBreakdown.map((e: any, i: number) => (
                      <RankRow key={e.cat} rank={i+1} name={e.cat} value={`KSh ${fmt(Math.round(e.amt))}`} sub={`${metrics.totalExpenses>0?Math.round((e.amt/metrics.totalExpenses)*100):0}% of expenses`} color={colors.error} maxVal={metrics.expenseBreakdown[0]?.amt||1} val={e.amt} />
                    ))}
                  </View></>
                )}
                {filtered?.expenses.length===0 && <EmptyCard text="No expenses in this period" />}
              </>
            )}

            {/* ════ ATTENDANCE — DETAILED ════ */}
            {activeTab === "attendance" && (
              <>
                <SectionTitle icon="📅" title="Attendance Report" sub={rangeLabel} color={colors.adminColor} />
                <View style={styles.statRow}>
                  <StatCard icon="🧺" label="Pluckers"   value={String(metrics.activePluckers)}      color={colors.collectorColor} bg={colors.collectorLight} />
                  <StatCard icon="✅" label="Present"    value={String(metrics.uniquePluckerAtt)}    color={colors.success}        bg={colors.successLight} />
                  <StatCard icon="📋" label="Records"    value={String(filtered?.attendance.length || 0)} color={colors.adminColor} bg={colors.adminLight} />
                  <StatCard icon="📊" label="Rate"       value={`${metrics.activePluckers>0?Math.round((metrics.uniquePluckerAtt/metrics.activePluckers)*100):0}%`} color={colors.salesColor} bg={colors.salesLight} />
                </View>

                {/* ── Detailed attendance log grouped by date ── */}
                {(() => {
                  if (!filtered?.attendance.length) return <EmptyCard text="No attendance records in this period" />;

                  // Group by date
                  const byDate: Record<string, any[]> = {};
                  filtered.attendance.forEach((a: any) => {
                    const d = a.date || "Unknown";
                    if (!byDate[d]) byDate[d] = [];
                    byDate[d].push(a);
                  });

                  // Sort dates descending
                  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

                  return (
                    <>
                      <SectionTitle icon="📋" title="Daily Attendance Log" sub={`${filtered.attendance.length} records`} color={colors.adminColor} />
                      {sortedDates.map(date => {
                        const records = byDate[date].sort((a: any, b: any) => (a.arrivalTime || "").localeCompare(b.arrivalTime || ""));
                        const formattedDate = (() => {
                          try { return new Date(date + "T00:00:00").toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
                          catch { return date; }
                        })();
                        return (
                          <View key={date} style={styles.attendanceDayCard}>
                            {/* Day header */}
                            <View style={styles.attendanceDayHeader}>
                              <View style={styles.attendanceDayLeft}>
                                <Text style={styles.attendanceDayDate}>{formattedDate}</Text>
                                <View style={styles.attendanceDayBadge}>
                                  <Text style={styles.attendanceDayBadgeText}>{records.length} present</Text>
                                </View>
                              </View>
                              <Text style={styles.attendanceDayIcon}>📅</Text>
                            </View>

                            {/* Individual records */}
                            {records.map((rec: any, idx: number) => (
                              <View key={rec.id || idx}>
                                <View style={styles.attendanceDetailRow}>
                                  {/* Avatar */}
                                  <View style={styles.attAvatar}>
                                    <Text style={styles.attAvatarText}>
                                      {(rec.pluckerName || rec.name || "?").charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                  {/* Info */}
                                  <View style={styles.attInfo}>
                                    <Text style={styles.attName}>{rec.pluckerName || rec.name || "Unknown Plucker"}</Text>
                                    <Text style={styles.attMeta}>
                                      Recorded by {rec.recordedBy || "Collector"}
                                    </Text>
                                  </View>
                                  {/* Time */}
                                  <View style={styles.attTimeWrap}>
                                    <Text style={styles.attTimeLabel}>Arrived</Text>
                                    <Text style={styles.attTime}>{rec.arrivalTime || "—"}</Text>
                                  </View>
                                  {/* Present badge */}
                                  <View style={styles.attPresentBadge}>
                                    <Text style={styles.attPresentText}>✅</Text>
                                  </View>
                                </View>
                                {idx < records.length - 1 && <View style={styles.attDivider} />}
                              </View>
                            ))}
                          </View>
                        );
                      })}

                      {/* Summary by plucker */}
                      <SectionTitle icon="🏆" title="Attendance Summary by Plucker" sub={rangeLabel} color={colors.adminColor} />
                      {(() => {
                        const plMap: Record<string, { name: string; count: number; dates: string[] }> = {};
                        filtered.attendance.forEach((a: any) => {
                          const key = a.pluckerId || a.id;
                          if (!plMap[key]) plMap[key] = { name: a.pluckerName || "Unknown", count: 0, dates: [] };
                          plMap[key].count += 1;
                          if (a.date) plMap[key].dates.push(a.date);
                        });
                        const list = Object.values(plMap).sort((a, b) => b.count - a.count);
                        const maxCount = list[0]?.count || 1;
                        return (
                          <View style={styles.rankCard}>
                            {list.map((p, i) => (
                              <RankRow key={p.name} rank={i+1} name={p.name}
                                value={`${p.count} day${p.count!==1?"s":""}`}
                                sub={`Last: ${p.dates.sort().slice(-1)[0] || "—"}`}
                                color={colors.adminColor} maxVal={maxCount} val={p.count}
                              />
                            ))}
                          </View>
                        );
                      })()}
                    </>
                  );
                })()}
              </>
            )}
          </>
        ) : <EmptyCard text="No data available. Pull to refresh." />}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ══ MONTH PICKER MODAL ══════════════════════════════════════════════ */}
      <Modal visible={showMonthPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.monthPickerCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 Select Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.monthPickerSub}>Last 12 months available</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MONTHS.map((m, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.monthOption, selectedMonthIdx === idx && dateFilter === "custom_month" && styles.monthOptionActive]}
                  onPress={() => {
                    setSelectedMonthIdx(idx);
                    setDateFilter("custom_month");
                    setShowMonthPicker(false);
                  }}
                >
                  <Text style={styles.monthOptionIcon}>{idx === 0 ? "📅" : "🗓️"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.monthOptionLabel, selectedMonthIdx === idx && dateFilter === "custom_month" && { color: colors.supervisorColor, fontWeight: "800" }]}>
                      {m.label}
                    </Text>
                    {idx === 0 && <Text style={styles.monthOptionSub}>Current month</Text>}
                  </View>
                  {selectedMonthIdx === idx && dateFilter === "custom_month" && (
                    <View style={styles.monthSelectedDot} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPIItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.kpiItem}>
      <Text style={[styles.kpiValue, highlight === false && { color: "#fca5a5" }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ icon, title, sub, color }: any) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={[styles.sectionTitleText, { color }]}>{icon} {title}</Text>
      <View style={[styles.sectionTitleBadge, { backgroundColor: color + "20" }]}>
        <Text style={[styles.sectionTitleBadgeText, { color }]}>{sub}</Text>
      </View>
    </View>
  );
}

function OverviewCard({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.overviewCard, { backgroundColor: bg }]}>
      <Text style={styles.overviewCardIcon}>{icon}</Text>
      <Text style={[styles.overviewCardValue, { color }]}>{value}</Text>
      <Text style={styles.overviewCardLabel}>{label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Text style={styles.statCardIcon}>{icon}</Text>
      <Text style={[styles.statCardValue, { color }]}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

function RankRow({ rank, name, value, sub, color, maxVal, val }: any) {
  return (
    <View style={styles.rankRow}>
      <View style={[styles.rankNum, { backgroundColor: rank<=3?color:colors.border }]}>
        <Text style={[styles.rankNumText, { color: rank<=3?"#fff":colors.textMuted }]}>#{rank}</Text>
      </View>
      <View style={styles.rankInfo}>
        <Text style={styles.rankName}>{name}</Text>
        <Text style={styles.rankSub}>{sub}</Text>
        <View style={styles.rankBarTrack}>
          <View style={[styles.rankBarFill, { width: `${(val/maxVal)*100}%`, backgroundColor: color }]} />
        </View>
      </View>
      <Text style={[styles.rankValue, { color }]}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: any) {
  return (
    <View style={styles.legendDotWrap}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendDotLabel}>{label}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyCardIcon}>📋</Text>
      <Text style={styles.emptyCardText}>{text}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD_W = (width - spacing.md * 2 - spacing.xs * 3) / 4;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header:         { backgroundColor: colors.supervisorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  headerGreeting: { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", fontWeight: "500" },
  headerName:     { fontSize: fonts.sizes.xl, color: "#fff", fontWeight: "900", marginTop: 2 },
  headerOrg:      { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  headerRight:    { alignItems: "flex-end", gap: 8 },
  roleBadge:      { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  roleBadgeText:  { color: "#fff", fontSize: fonts.sizes.xs, fontWeight: "700" },
  logoutBtn:      { backgroundColor: "rgba(255,255,255,0.15)", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  logoutIcon:     { fontSize: 18, color: "#fff" },
  dateFilterRow:        { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.xs },
  dateFilterBtn:        { flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  monthPickerBtn:       { flex: 1.4 },
  dateFilterBtnActive:  { backgroundColor: "#fff" },
  dateFilterText:       { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  dateFilterTextActive: { color: colors.supervisorColor, fontWeight: "900" },
  periodBadge:     { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start", marginBottom: spacing.sm },
  periodBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  kpiStrip:   { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, flexDirection: "row", paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  kpiItem:    { flex: 1, alignItems: "center" },
  kpiValue:   { fontSize: 12, color: "#fff", fontWeight: "900" },
  kpiLabel:   { fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  kpiDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  tabBar:        { backgroundColor: colors.surface, maxHeight: 52, ...shadows.sm },
  tabBarContent: { paddingHorizontal: spacing.md, paddingVertical: 6, gap: spacing.xs, alignItems: "center" },
  tabBtn:        { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.background },
  tabIcon:       { fontSize: 14 },
  tabLabel:      { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  readOnlyBanner: { backgroundColor: colors.supervisorLight, paddingHorizontal: spacing.md, paddingVertical: 6, alignItems: "center" },
  readOnlyText:   { fontSize: 11, color: colors.supervisorColor, fontWeight: "700" },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitleWrap:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionTitleText:      { fontSize: fonts.sizes.md, fontWeight: "900" },
  sectionTitleBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  sectionTitleBadgeText: { fontSize: 10, fontWeight: "700" },
  overviewGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  overviewCard:      { width: CARD_W, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  overviewCardIcon:  { fontSize: 22, marginBottom: 4 },
  overviewCardValue: { fontSize: 11, fontWeight: "900", textAlign: "center" },
  overviewCardLabel: { fontSize: 9, color: colors.textMuted, textAlign: "center", marginTop: 2 },
  statRow:       { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  statCard:      { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  statCardIcon:  { fontSize: 18, marginBottom: 3 },
  statCardValue: { fontSize: 10, fontWeight: "900", textAlign: "center" },
  statCardLabel: { fontSize: 8, color: colors.textMuted, textAlign: "center", marginTop: 1 },
  reportCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  reportCardTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  distBar:         { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden", marginBottom: 8 },
  distSegA:        { backgroundColor: colors.collectorColor },
  distSegB:        { backgroundColor: colors.primary },
  distLegend:      { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  legendDotWrap:   { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:       { width: 10, height: 10, borderRadius: 5 },
  legendDotLabel:  { fontSize: fonts.sizes.xs, color: colors.textSecondary, fontWeight: "600" },
  rankCard:        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.sm },
  rankRow:         { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rankNum:         { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rankNumText:     { fontSize: 11, fontWeight: "900" },
  rankInfo:        { flex: 1 },
  rankName:        { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  rankSub:         { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  rankBarTrack:    { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginTop: 5 },
  rankBarFill:     { height: 4, borderRadius: 2 },
  rankValue:       { fontSize: fonts.sizes.sm, fontWeight: "900" },
  inventoryHero:      { borderRadius: radius.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center", marginBottom: spacing.sm, ...shadows.lg },
  inventoryHeroLabel: { fontSize: fonts.sizes.sm, color: "rgba(255,255,255,0.8)", fontWeight: "600", marginBottom: 4 },
  inventoryHeroValue: { fontSize: 36, color: "#fff", fontWeight: "900" },
  inventoryHeroSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  financialHero:      { borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", marginBottom: spacing.sm, borderWidth: 1.5, ...shadows.sm },
  financialHeroLabel: { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  financialHeroValue: { fontSize: 36, fontWeight: "900" },
  financialHeroSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  // ── Detailed attendance ──
  attendanceDayCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, overflow: "hidden", ...shadows.md },
  attendanceDayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, backgroundColor: colors.adminLight },
  attendanceDayLeft:   { flex: 1 },
  attendanceDayDate:   { fontSize: fonts.sizes.sm, fontWeight: "900", color: colors.adminColor },
  attendanceDayBadge:  { backgroundColor: colors.adminColor, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, alignSelf: "flex-start", marginTop: 4 },
  attendanceDayBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  attendanceDayIcon:   { fontSize: 24 },
  attendanceDetailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: spacing.md },
  attAvatar:           { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.collectorLight, alignItems: "center", justifyContent: "center", marginRight: 10 },
  attAvatarText:       { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.collectorColor },
  attInfo:             { flex: 1 },
  attName:             { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  attMeta:             { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  attTimeWrap:         { alignItems: "flex-end", marginRight: 8 },
  attTimeLabel:        { fontSize: 9, color: colors.textMuted },
  attTime:             { fontSize: fonts.sizes.sm, fontWeight: "900", color: colors.adminColor },
  attPresentBadge:     { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.successLight, alignItems: "center", justifyContent: "center" },
  attPresentText:      { fontSize: 14 },
  attDivider:          { height: 1, backgroundColor: colors.divider, marginHorizontal: spacing.md },

  emptyCard:     { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.sm },
  emptyCardIcon: { fontSize: 40, marginBottom: 8 },
  emptyCardText: { fontSize: fonts.sizes.sm, color: colors.textMuted, textAlign: "center" },

  // Month picker modal
  modalOverlay:    { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  monthPickerCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "70%" },
  modalHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalTitle:      { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:      { fontSize: 20, color: colors.textMuted, padding: 4 },
  monthPickerSub:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginBottom: spacing.md },
  monthOption:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  monthOptionActive:{ backgroundColor: colors.supervisorLight, borderRadius: radius.md },
  monthOptionIcon: { fontSize: 20 },
  monthOptionLabel:{ fontSize: fonts.sizes.md, fontWeight: "600", color: colors.textPrimary },
  monthOptionSub:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  monthSelectedDot:{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.supervisorColor },
});