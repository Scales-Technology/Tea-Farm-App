// ─── Sales Screen — TeaFarm Pro ──────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, RefreshControl,
  Dimensions, Modal, Alert,
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

type ViewMode   = "list" | "summary";
type DateFilter = "all" | "today" | "week" | "month" | "custom_month";

interface SaleRecord {
  id:            string;
  batchNumber:   string;
  gradeA_kg:     number;
  gradeB_kg:     number;
  rejected_kg:   number;
  priceA_per_kg: number;
  priceB_per_kg: number;
  totalAmount:   number;
  buyerName:     string;
  gradedBy:      string;
  date:          string;
  createdAt:     any;
}

interface BuyerSummary {
  buyerName:   string;
  totalKg:     number;
  gradeA_kg:   number;
  gradeB_kg:   number;
  totalAmount: number;
  salesCount:  number;
}

export default function SalesScreen({ navigation }: any) {
  const [sales,       setSales]       = useState<SaleRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [viewMode,    setViewMode]    = useState<ViewMode>("list");
  const [dateFilter,  setDateFilter]  = useState<DateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSale,    setSelectedSale]     = useState<SaleRecord | null>(null);
  const [showDetail,      setShowDetail]       = useState(false);
  const [orgName,         setOrgName]          = useState("My Farm");
  const [showMonthPicker, setShowMonthPicker]  = useState(false);
  const [selectedMonth,   setSelectedMonth]    = useState(""); // "YYYY-MM"

  const { showLoader, hideLoader } = useLoader();
  const orgIdRef = useRef("");

  const loadSales = useCallback(async () => {
    showLoader("Loading Sales Records...");
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const userData       = userSnap.data()!;
      const organizationId = userData.organizationId || "";
      orgIdRef.current     = organizationId;
      if (!organizationId) return;

      const orgSnap = await getDoc(doc(db, "organizations", organizationId));
      if (orgSnap.exists()) setOrgName(orgSnap.data()!.farmName || "My Farm");

      // Single where only — no orderBy needed
      const snap = await getDocs(query(
        collection(db, "sales"),
        where("organizationId", "==", organizationId)
      ));

      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SaleRecord))
        .sort((a, b) => {
          const aT = a.createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        });

      setSales(sorted);
    } catch (e: any) {
      console.log("Sales load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hideLoader();
    }
  }, []);

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleRefresh = () => { setRefreshing(true); loadSales(); };

  // ── All available months from sales data ─────────────────────────────────
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    sales.forEach(s => {
      const ts = s.createdAt?.toDate?.() || (s.date ? new Date(s.date) : null);
      if (ts) {
        const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
        monthSet.add(key);
      }
    });
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a)); // newest first
  }, [sales]);

  // ── Date filter helper ────────────────────────────────────────────────────
  const isInDateRange = (sale: SaleRecord): boolean => {
    if (dateFilter === "all") return true;
    const today    = new Date();
    const saleDate = sale.date
      ? new Date(sale.date)
      : sale.createdAt?.toDate?.() || new Date(0);

    if (dateFilter === "today") {
      return sale.date === today.toISOString().split("T")[0];
    }
    if (dateFilter === "week") {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return saleDate >= weekAgo;
    }
    if (dateFilter === "month") {
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      return saleDate >= monthAgo;
    }
    if (dateFilter === "custom_month" && selectedMonth) {
      const ts = sale.createdAt?.toDate?.() || (sale.date ? new Date(sale.date) : null);
      if (!ts) return false;
      const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    }
    return true;
  };

  // ── Filtered sales ────────────────────────────────────────────────────────
  const filtered = useMemo(() => sales.filter(s => {
    const matchDate   = isInDateRange(s);
    const matchSearch = !searchQuery ||
      s.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.buyerName.toLowerCase().includes(searchQuery.toLowerCase())   ||
      s.gradedBy.toLowerCase().includes(searchQuery.toLowerCase());
    return matchDate && matchSearch;
  }), [sales, dateFilter, searchQuery]);

  // ── Aggregate stats from filtered ─────────────────────────────────────────
  const stats = useMemo(() => {
    let totalRevenue = 0, totalGradeA = 0, totalGradeB = 0, totalRejected = 0;
    filtered.forEach(s => {
      totalRevenue  += s.totalAmount  || 0;
      totalGradeA   += s.gradeA_kg   || 0;
      totalGradeB   += s.gradeB_kg   || 0;
      totalRejected += s.rejected_kg || 0;
    });
    const totalSold = totalGradeA + totalGradeB;
    const avgPrice  = totalSold > 0 ? totalRevenue / totalSold : 0;
    return {
      totalRevenue,
      totalGradeA:   Math.round(totalGradeA   * 10) / 10,
      totalGradeB:   Math.round(totalGradeB   * 10) / 10,
      totalRejected: Math.round(totalRejected * 10) / 10,
      totalSold:     Math.round(totalSold     * 10) / 10,
      avgPrice:      Math.round(avgPrice      * 100) / 100,
      count:         filtered.length,
    };
  }, [filtered]);

  // ── Buyer summary for summary view ────────────────────────────────────────
  const buyerSummaries = useMemo((): BuyerSummary[] => {
    const map: Record<string, BuyerSummary> = {};
    filtered.forEach(s => {
      const key = s.buyerName || "Unknown";
      if (!map[key]) map[key] = { buyerName: key, totalKg: 0, gradeA_kg: 0, gradeB_kg: 0, totalAmount: 0, salesCount: 0 };
      map[key].gradeA_kg   += s.gradeA_kg   || 0;
      map[key].gradeB_kg   += s.gradeB_kg   || 0;
      map[key].totalKg     += (s.gradeA_kg || 0) + (s.gradeB_kg || 0);
      map[key].totalAmount += s.totalAmount || 0;
      map[key].salesCount  += 1;
    });
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filtered]);

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  const monthlyBreakdown = useMemo(() => {
    const map: Record<string, { revenue: number; kg: number; count: number }> = {};
    filtered.forEach(s => {
      const ts   = s.createdAt?.toDate?.() || (s.date ? new Date(s.date) : null);
      if (!ts) return;
      const key  = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { revenue: 0, kg: 0, count: 0 };
      map[key].revenue += s.totalAmount || 0;
      map[key].kg      += (s.gradeA_kg || 0) + (s.gradeB_kg || 0);
      map[key].count   += 1;
    });
    return Object.entries(map)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 6);
  }, [filtered]);

  const formatDate = (ts: any, dateStr?: string): string => {
    try {
      const d = dateStr ? new Date(dateStr) : (ts?.toDate ? ts.toDate() : new Date(ts));
      return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split("-");
    return new Date(parseInt(year), parseInt(month) - 1)
      .toLocaleString("default", { month: "short", year: "numeric" });
  };

  const formatMonthKey = (key: string) => formatMonthLabel(key);

  const maxMonthRevenue = Math.max(...monthlyBreakdown.map(m => m.revenue), 1);

  if (loading) return <TeaLoader message="Loading Sales Records..." subMessage="Sales Supervisor" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>📋 Sales Report</Text>
            <Text style={styles.headerSub}>🌿 {orgName}</Text>
          </View>
          {/* View mode toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
              onPress={() => setViewMode("list")}
            >
              <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>
                ☰
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === "summary" && styles.viewToggleBtnActive]}
              onPress={() => setViewMode("summary")}
            >
              <Text style={[styles.viewToggleText, viewMode === "summary" && styles.viewToggleTextActive]}>
                📊
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── KPI strip ── */}
        <View style={styles.kpiStrip}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>KSh {stats.totalRevenue.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Revenue</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.totalSold} kg</Text>
            <Text style={styles.kpiLabel}>Sold</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>KSh {stats.avgPrice.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Avg/kg</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.count}</Text>
            <Text style={styles.kpiLabel}>Sales</Text>
          </View>
        </View>

        {/* ── Date filter pills ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateFilters}>
          {([
            { key: "all",   label: "📅 All Time" },
            { key: "today", label: "🌅 Today" },
            { key: "week",  label: "📆 This Week" },
            { key: "month", label: "🗓 Last 30 Days" },
          ] as { key: DateFilter; label: string }[]).map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.datePill, dateFilter === f.key && styles.datePillActive]}
              onPress={() => {
                setDateFilter(f.key);
                setSelectedMonth("");
              }}
            >
              <Text style={[styles.datePillText, dateFilter === f.key && styles.datePillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Month picker pill */}
          <TouchableOpacity
            style={[
              styles.datePill,
              styles.monthPickerPill,
              dateFilter === "custom_month" && styles.datePillActive,
            ]}
            onPress={() => setShowMonthPicker(true)}
          >
            <Text style={[
              styles.datePillText,
              dateFilter === "custom_month" && styles.datePillTextActive,
            ]}>
              {dateFilter === "custom_month" && selectedMonth
                ? `📆 ${formatMonthKey(selectedMonth)}`
                : "📆 Pick Month"}
            </Text>
            <Text style={[
              styles.monthPickerArrow,
              dateFilter === "custom_month" && { color: colors.salesColor },
            ]}>▼</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search batch, buyer, graded by..."
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

      <Text style={styles.resultCount}>
        {filtered.length} record{filtered.length !== 1 ? "s" : ""} found
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.salesColor]}
            tintColor={colors.salesColor}
          />
        }
      >
        {/* ════════════════════════════════════
            LIST VIEW
        ════════════════════════════════════ */}
        {viewMode === "list" && (
          <>
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No sales found</Text>
                <Text style={styles.emptySub}>
                  {searchQuery || dateFilter !== "all"
                    ? "Try changing your search or date filter"
                    : "Record a grading batch to see it here"}
                </Text>
              </View>
            ) : (
              filtered.map((sale, idx) => {
                const totalKg   = (sale.gradeA_kg || 0) + (sale.gradeB_kg || 0);
                const aPercent  = totalKg > 0 ? Math.round(((sale.gradeA_kg || 0) / totalKg) * 100) : 0;
                const bPercent  = totalKg > 0 ? Math.round(((sale.gradeB_kg || 0) / totalKg) * 100) : 0;

                return (
                  <TouchableOpacity
                    key={sale.id}
                    style={styles.saleCard}
                    onPress={() => { setSelectedSale(sale); setShowDetail(true); }}
                    activeOpacity={0.85}
                  >
                    {/* Card header */}
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.batchBadge}>
                          <Text style={styles.batchBadgeText}>#{String(idx + 1).padStart(2, "0")}</Text>
                        </View>
                        <View>
                          <Text style={styles.batchNumber}>{sale.batchNumber || `Batch ${idx + 1}`}</Text>
                          <Text style={styles.cardDate}>{formatDate(sale.createdAt, sale.date)}</Text>
                        </View>
                      </View>
                      <View style={styles.cardHeaderRight}>
                        <Text style={styles.cardRevenue}>KSh {(sale.totalAmount || 0).toLocaleString()}</Text>
                        <Text style={styles.cardBuyer}>🏭 {sale.buyerName || "Factory"}</Text>
                      </View>
                    </View>

                    {/* Grade mini bar */}
                    <View style={styles.gradeBarWrap}>
                      <View style={styles.gradeBar}>
                        <View style={[styles.gradeSegA, { flex: Math.max(aPercent, 1) }]} />
                        <View style={[styles.gradeSegB, { flex: Math.max(bPercent, 1) }]} />
                        <View style={[styles.gradeSegR, { flex: Math.max(100 - aPercent - bPercent, 0) }]} />
                      </View>
                      <Text style={styles.totalKgLabel}>{totalKg.toFixed(1)} kg total</Text>
                    </View>

                    {/* Grade breakdown */}
                    <View style={styles.gradeChips}>
                      <GradeChip
                        icon="🅰️" label="Grade A"
                        kg={sale.gradeA_kg || 0}
                        price={sale.priceA_per_kg || 0}
                        color={colors.success} bg={colors.successLight}
                      />
                      <GradeChip
                        icon="🅱️" label="Grade B"
                        kg={sale.gradeB_kg || 0}
                        price={sale.priceB_per_kg || 0}
                        color={colors.warning} bg={colors.warningLight}
                      />
                      {(sale.rejected_kg || 0) > 0 && (
                        <GradeChip
                          icon="🚫" label="Rejected"
                          kg={sale.rejected_kg || 0}
                          price={0}
                          color={colors.error} bg={colors.errorLight}
                        />
                      )}
                    </View>

                    <Text style={styles.gradedByText}>Graded by {sale.gradedBy || "—"} · Tap for details</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {/* ════════════════════════════════════
            SUMMARY VIEW
        ════════════════════════════════════ */}
        {viewMode === "summary" && (
          <>
            {/* ── Grade breakdown cards ── */}
            <Text style={styles.sectionTitle}>📊 Grade Performance</Text>
            <View style={styles.gradePerformanceRow}>
              <View style={[styles.gradePerformanceCard, { backgroundColor: colors.successLight }]}>
                <Text style={styles.gpIcon}>🅰️</Text>
                <Text style={[styles.gpKg, { color: colors.success }]}>{stats.totalGradeA} kg</Text>
                <Text style={styles.gpLabel}>Grade A</Text>
                <Text style={[styles.gpPct, { color: colors.success }]}>
                  {stats.totalSold > 0 ? Math.round((stats.totalGradeA / stats.totalSold) * 100) : 0}%
                </Text>
              </View>
              <View style={[styles.gradePerformanceCard, { backgroundColor: colors.warningLight }]}>
                <Text style={styles.gpIcon}>🅱️</Text>
                <Text style={[styles.gpKg, { color: colors.warning }]}>{stats.totalGradeB} kg</Text>
                <Text style={styles.gpLabel}>Grade B</Text>
                <Text style={[styles.gpPct, { color: colors.warning }]}>
                  {stats.totalSold > 0 ? Math.round((stats.totalGradeB / stats.totalSold) * 100) : 0}%
                </Text>
              </View>
              <View style={[styles.gradePerformanceCard, { backgroundColor: colors.errorLight }]}>
                <Text style={styles.gpIcon}>🚫</Text>
                <Text style={[styles.gpKg, { color: colors.error }]}>{stats.totalRejected} kg</Text>
                <Text style={styles.gpLabel}>Rejected</Text>
                <Text style={[styles.gpPct, { color: colors.error }]}>
                  {(stats.totalSold + stats.totalRejected) > 0
                    ? Math.round((stats.totalRejected / (stats.totalSold + stats.totalRejected)) * 100)
                    : 0}%
                </Text>
              </View>
            </View>

            {/* ── Quality distribution bar ── */}
            <View style={styles.summaryQualityCard}>
              <Text style={styles.summaryCardTitle}>Quality Distribution</Text>
              {(() => {
                const total = stats.totalGradeA + stats.totalGradeB + stats.totalRejected;
                const aP = total > 0 ? (stats.totalGradeA / total) * 100 : 0;
                const bP = total > 0 ? (stats.totalGradeB / total) * 100 : 0;
                const rP = total > 0 ? (stats.totalRejected / total) * 100 : 0;
                return (
                  <>
                    <View style={styles.bigBar}>
                      <View style={[styles.bigBarA, { flex: Math.max(aP, 1) }]} />
                      <View style={[styles.bigBarB, { flex: Math.max(bP, 1) }]} />
                      <View style={[styles.bigBarR, { flex: Math.max(rP, 0) }]} />
                    </View>
                    <View style={styles.bigBarLegend}>
                      <LegendChip color={colors.success} label={`A: ${Math.round(aP)}%`} />
                      <LegendChip color={colors.warning} label={`B: ${Math.round(bP)}%`} />
                      <LegendChip color={colors.error}   label={`Rejected: ${Math.round(rP)}%`} />
                    </View>
                  </>
                );
              })()}
            </View>

            {/* ── Monthly revenue trend ── */}
            {monthlyBreakdown.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>📈 Monthly Revenue Trend</Text>
                <View style={styles.monthlyCard}>
                  {monthlyBreakdown.map((m, i) => {
                    const barPct = (m.revenue / maxMonthRevenue) * 100;
                    return (
                      <View key={m.month} style={styles.monthRow}>
                        <Text style={styles.monthLabel}>{formatMonthLabel(m.month)}</Text>
                        <View style={styles.monthBarTrack}>
                          <View style={[styles.monthBarFill, { width: `${barPct}%` }]} />
                        </View>
                        <View style={styles.monthStats}>
                          <Text style={styles.monthRevenue}>KSh {m.revenue.toLocaleString()}</Text>
                          <Text style={styles.monthKg}>{m.kg.toFixed(1)} kg · {m.count} sale{m.count !== 1 ? "s" : ""}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Buyer breakdown ── */}
            {buyerSummaries.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>🏭 Sales by Buyer / Factory</Text>
                <View style={styles.buyerCard}>
                  {buyerSummaries.map((b, i) => (
                    <View key={b.buyerName}>
                      <View style={styles.buyerRow}>
                        <View style={[styles.buyerRank, { backgroundColor: i < 3 ? colors.salesColor : colors.border }]}>
                          <Text style={[styles.buyerRankText, { color: i < 3 ? "#fff" : colors.textMuted }]}>
                            #{i + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.buyerName}>🏭 {b.buyerName}</Text>
                          <Text style={styles.buyerMeta}>
                            {b.salesCount} sale{b.salesCount !== 1 ? "s" : ""} · {b.totalKg.toFixed(1)} kg total
                          </Text>
                          <View style={styles.buyerGrades}>
                            <Text style={[styles.buyerGradeA]}>A: {b.gradeA_kg.toFixed(1)}kg</Text>
                            <Text style={[styles.buyerGradeB]}>B: {b.gradeB_kg.toFixed(1)}kg</Text>
                          </View>
                        </View>
                        <View style={styles.buyerAmountWrap}>
                          <Text style={styles.buyerAmount}>KSh {b.totalAmount.toLocaleString()}</Text>
                          <Text style={styles.buyerPct}>
                            {stats.totalRevenue > 0
                              ? `${Math.round((b.totalAmount / stats.totalRevenue) * 100)}% of total`
                              : "—"}
                          </Text>
                        </View>
                      </View>
                      {/* Revenue share bar */}
                      <View style={styles.buyerBarTrack}>
                        <View style={[styles.buyerBarFill, {
                          width: `${stats.totalRevenue > 0 ? (b.totalAmount / stats.totalRevenue) * 100 : 0}%`,
                        }]} />
                      </View>
                      {i < buyerSummaries.length - 1 && <View style={styles.buyerDivider} />}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Financial summary card ── */}
            <Text style={styles.sectionTitle}>💰 Financial Summary</Text>
            <View style={styles.financialCard}>
              <FinRow label="Total Revenue"    value={`KSh ${stats.totalRevenue.toLocaleString()}`}  color={colors.salesColor} bold />
              <View style={styles.finDivider} />
              <FinRow label="Grade A Revenue"  value={`KSh ${filtered.reduce((s, x) => s + (x.gradeA_kg || 0) * (x.priceA_per_kg || 0), 0).toLocaleString()}`} color={colors.success} />
              <FinRow label="Grade B Revenue"  value={`KSh ${filtered.reduce((s, x) => s + (x.gradeB_kg || 0) * (x.priceB_per_kg || 0), 0).toLocaleString()}`} color={colors.warning} />
              <View style={styles.finDivider} />
              <FinRow label="Total Sold"        value={`${stats.totalSold} kg`} />
              <FinRow label="Average Price/kg"  value={`KSh ${stats.avgPrice.toLocaleString()}`} />
              <FinRow label="Total Transactions" value={`${stats.count} sale${stats.count !== 1 ? "s" : ""}`} />
            </View>

            {filtered.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyTitle}>No data to summarize</Text>
                <Text style={styles.emptySub}>Change the date filter or record a sale first</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Month Picker Modal ── */}
      <Modal visible={showMonthPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.monthPickerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📆 Pick a Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {availableMonths.length === 0 ? (
              <View style={styles.monthEmptyState}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyTitle}>No months available</Text>
                <Text style={styles.emptySub}>Record sales to see monthly data here</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Clear selection option */}
                <TouchableOpacity
                  style={[
                    styles.monthOption,
                    dateFilter === "all" && styles.monthOptionActive,
                  ]}
                  onPress={() => {
                    setDateFilter("all");
                    setSelectedMonth("");
                    setShowMonthPicker(false);
                  }}
                >
                  <View style={styles.monthOptionLeft}>
                    <View style={[styles.monthOptionIcon, { backgroundColor: colors.primaryPale }]}>
                      <Text style={{ fontSize: 18 }}>📅</Text>
                    </View>
                    <View>
                      <Text style={[styles.monthOptionLabel, dateFilter === "all" && { color: colors.salesColor }]}>
                        All Time
                      </Text>
                      <Text style={styles.monthOptionSub}>Show all sales</Text>
                    </View>
                  </View>
                  {dateFilter === "all" && (
                    <View style={styles.monthSelectedTick}>
                      <Text style={{ fontSize: 16 }}>✅</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.monthDivider} />
                <Text style={styles.monthPickerSectionLabel}>Select a Month</Text>

                {availableMonths.map((monthKey, i) => {
                  const [year, month] = monthKey.split("-");
                  const d = new Date(parseInt(year), parseInt(month) - 1);
                  const monthName = d.toLocaleString("default", { month: "long" });
                  const yearLabel = d.getFullYear().toString();
                  const isSelected = dateFilter === "custom_month" && selectedMonth === monthKey;

                  // Count sales in this month
                  const salesInMonth = sales.filter(s => {
                    const ts = s.createdAt?.toDate?.() || (s.date ? new Date(s.date) : null);
                    if (!ts) return false;
                    const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
                    return key === monthKey;
                  });
                  const monthRevenue = salesInMonth.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
                  const monthKg      = salesInMonth.reduce((sum, s) => sum + (s.gradeA_kg || 0) + (s.gradeB_kg || 0), 0);

                  // Color based on month (cycles through palette)
                  const monthColors = [colors.salesColor, colors.success, colors.primary, colors.accent, colors.earth, colors.supervisorColor];
                  const mc = monthColors[i % monthColors.length];
                  const mcPale = mc + "20";

                  return (
                    <TouchableOpacity
                      key={monthKey}
                      style={[styles.monthOption, isSelected && styles.monthOptionActive]}
                      onPress={() => {
                        setSelectedMonth(monthKey);
                        setDateFilter("custom_month");
                        setShowMonthPicker(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.monthOptionLeft}>
                        <View style={[styles.monthOptionIcon, { backgroundColor: isSelected ? mc : mcPale }]}>
                          <Text style={{ fontSize: 16, color: isSelected ? "#fff" : mc, fontWeight: "900" }}>
                            {month}
                          </Text>
                        </View>
                        <View>
                          <Text style={[styles.monthOptionLabel, isSelected && { color: mc }]}>
                            {monthName} {yearLabel}
                          </Text>
                          <Text style={styles.monthOptionSub}>
                            {salesInMonth.length} sale{salesInMonth.length !== 1 ? "s" : ""} · {monthKg.toFixed(1)} kg
                          </Text>
                        </View>
                      </View>
                      <View style={styles.monthOptionRight}>
                        <Text style={[styles.monthOptionRevenue, { color: isSelected ? mc : colors.textSecondary }]}>
                          KSh {monthRevenue.toLocaleString()}
                        </Text>
                        {isSelected && (
                          <View style={styles.monthSelectedTick}>
                            <Text style={{ fontSize: 14 }}>✅</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Sale Detail Modal ── */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 Sale Detail</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedSale && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Batch hero */}
                <View style={styles.detailHero}>
                  <View style={styles.detailHeroLeft}>
                    <Text style={styles.detailBatch}>{selectedSale.batchNumber || "Batch"}</Text>
                    <Text style={styles.detailDate}>{formatDate(selectedSale.createdAt, selectedSale.date)}</Text>
                    <Text style={styles.detailBuyer}>🏭 {selectedSale.buyerName || "Factory"}</Text>
                  </View>
                  <View style={styles.detailHeroRight}>
                    <Text style={styles.detailRevenue}>KSh {(selectedSale.totalAmount || 0).toLocaleString()}</Text>
                    <Text style={styles.detailRevenueLabel}>Total Revenue</Text>
                  </View>
                </View>

                {/* Grade details */}
                <Text style={styles.detailSectionTitle}>📊 Grade Breakdown</Text>
                <View style={styles.detailGradeGrid}>
                  <DetailGradeCard
                    icon="🅰️" label="Grade A" color={colors.success} bg={colors.successLight}
                    kg={selectedSale.gradeA_kg || 0}
                    price={selectedSale.priceA_per_kg || 0}
                    subtotal={(selectedSale.gradeA_kg || 0) * (selectedSale.priceA_per_kg || 0)}
                  />
                  <DetailGradeCard
                    icon="🅱️" label="Grade B" color={colors.warning} bg={colors.warningLight}
                    kg={selectedSale.gradeB_kg || 0}
                    price={selectedSale.priceB_per_kg || 0}
                    subtotal={(selectedSale.gradeB_kg || 0) * (selectedSale.priceB_per_kg || 0)}
                  />
                  <DetailGradeCard
                    icon="🚫" label="Rejected" color={colors.error} bg={colors.errorLight}
                    kg={selectedSale.rejected_kg || 0}
                    price={0}
                    subtotal={0}
                  />
                </View>

                {/* Quality bar */}
                {(() => {
                  const total = (selectedSale.gradeA_kg || 0) + (selectedSale.gradeB_kg || 0);
                  const aP = total > 0 ? ((selectedSale.gradeA_kg || 0) / total) * 100 : 0;
                  const bP = total > 0 ? ((selectedSale.gradeB_kg || 0) / total) * 100 : 0;
                  return (
                    <View style={styles.detailBar}>
                      <View style={[styles.detailBarA, { flex: Math.max(aP, 1) }]} />
                      <View style={[styles.detailBarB, { flex: Math.max(bP, 1) }]} />
                    </View>
                  );
                })()}

                {/* Metadata */}
                <Text style={styles.detailSectionTitle}>ℹ️ Transaction Info</Text>
                <View style={styles.detailInfoGrid}>
                  <InfoCell icon="👤" label="Graded By"    value={selectedSale.gradedBy || "—"} />
                  <InfoCell icon="📅" label="Date"         value={formatDate(selectedSale.createdAt, selectedSale.date)} />
                  <InfoCell icon="🏭" label="Buyer"        value={selectedSale.buyerName || "—"} />
                  <InfoCell icon="⚖️" label="Total Sold"   value={`${((selectedSale.gradeA_kg || 0) + (selectedSale.gradeB_kg || 0)).toFixed(1)} kg`} />
                </View>

                {/* Revenue summary */}
                <View style={styles.detailRevenueSummary}>
                  <View style={styles.detailRevenueRow}>
                    <Text style={styles.detailRevenueRowLabel}>Grade A Revenue</Text>
                    <Text style={[styles.detailRevenueRowValue, { color: colors.success }]}>
                      KSh {((selectedSale.gradeA_kg || 0) * (selectedSale.priceA_per_kg || 0)).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.detailRevenueRow}>
                    <Text style={styles.detailRevenueRowLabel}>Grade B Revenue</Text>
                    <Text style={[styles.detailRevenueRowValue, { color: colors.warning }]}>
                      KSh {((selectedSale.gradeB_kg || 0) * (selectedSale.priceB_per_kg || 0)).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.detailRevenueRow, { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4, paddingTop: 12 }]}>
                    <Text style={[styles.detailRevenueRowLabel, { fontWeight: "900", fontSize: fonts.sizes.md }]}>Total Revenue</Text>
                    <Text style={[styles.detailRevenueRowValue, { color: colors.salesColor, fontSize: fonts.sizes.lg, fontWeight: "900" }]}>
                      KSh {(selectedSale.totalAmount || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradeChip({ icon, label, kg, price, color, bg }: any) {
  return (
    <View style={[styles.gradeChip, { backgroundColor: bg }]}>
      <Text style={styles.gradeChipIcon}>{icon}</Text>
      <Text style={[styles.gradeChipKg, { color }]}>{kg.toFixed(1)} kg</Text>
      <Text style={styles.gradeChipLabel}>{label}</Text>
      {price > 0 && <Text style={styles.gradeChipPrice}>KSh {price}/kg</Text>}
    </View>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendChip}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendChipText}>{label}</Text>
    </View>
  );
}

function FinRow({ label, value, color, bold }: any) {
  return (
    <View style={styles.finRow}>
      <Text style={[styles.finLabel, bold && { fontWeight: "800" }]}>{label}</Text>
      <Text style={[styles.finValue, color ? { color } : {}, bold && { fontWeight: "900" }]}>{value}</Text>
    </View>
  );
}

function DetailGradeCard({ icon, label, kg, price, subtotal, color, bg }: any) {
  return (
    <View style={[styles.detailGradeCard, { backgroundColor: bg }]}>
      <Text style={styles.dgcIcon}>{icon}</Text>
      <Text style={[styles.dgcKg, { color }]}>{kg.toFixed(1)} kg</Text>
      <Text style={styles.dgcLabel}>{label}</Text>
      {price > 0 ? (
        <>
          <Text style={styles.dgcPrice}>KSh {price}/kg</Text>
          <Text style={[styles.dgcSubtotal, { color }]}>= KSh {subtotal.toLocaleString()}</Text>
        </>
      ) : (
        <Text style={styles.dgcPrice}>No value</Text>
      )}
    </View>
  );
}

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoCellIcon}>{icon}</Text>
      <Text style={styles.infoCellLabel}>{label}</Text>
      <Text style={styles.infoCellValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  // Header
  header:      { backgroundColor: colors.salesColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  backBtn:     { backgroundColor: "rgba(255,255,255,0.2)", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  backIcon:    { fontSize: 20, color: "#fff", fontWeight: "700" },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  viewToggle:           { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 3, gap: 3 },
  viewToggleBtn:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  viewToggleBtnActive:  { backgroundColor: "#fff" },
  viewToggleText:       { fontSize: 16, color: "rgba(255,255,255,0.7)" },
  viewToggleTextActive: { color: colors.salesColor },

  kpiStrip:    { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, flexDirection: "row", paddingVertical: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  kpiItem:     { flex: 1, alignItems: "center" },
  kpiValue:    { fontSize: fonts.sizes.sm, color: "#fff", fontWeight: "900" },
  kpiLabel:    { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  kpiDivider:  { width: 1, backgroundColor: "rgba(255,255,255,0.25)" },

  dateFilters:       { marginBottom: 6 },
  datePill:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 6, borderWidth: 1, borderColor: "transparent" },
  datePillActive:    { backgroundColor: "#fff" },
  datePillText:      { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  datePillTextActive:{ color: colors.salesColor, fontWeight: "800" },

  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  resultCount: { fontSize: 11, color: colors.textMuted, marginHorizontal: spacing.md, marginTop: 6, marginBottom: 2, fontWeight: "600" },

  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitle:  { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },

  // Sale card
  saleCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  cardHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardHeaderLeft:{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  batchBadge:    { backgroundColor: colors.salesColor, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  batchBadgeText:{ fontSize: 11, color: "#fff", fontWeight: "900" },
  batchNumber:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  cardDate:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  cardHeaderRight:{ alignItems: "flex-end" },
  cardRevenue:   { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.salesColor },
  cardBuyer:     { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },

  gradeBarWrap:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  gradeBar:      { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, flexDirection: "row", overflow: "hidden" },
  gradeSegA:     { backgroundColor: colors.success },
  gradeSegB:     { backgroundColor: colors.warning },
  gradeSegR:     { backgroundColor: colors.error },
  totalKgLabel:  { fontSize: 10, color: colors.textMuted, fontWeight: "600" },

  gradeChips:    { flexDirection: "row", gap: spacing.xs, marginBottom: 8 },
  gradeChip:     { flex: 1, borderRadius: radius.sm, padding: 8, alignItems: "center" },
  gradeChipIcon: { fontSize: 14, marginBottom: 2 },
  gradeChipKg:   { fontSize: 12, fontWeight: "800" },
  gradeChipLabel:{ fontSize: 9, color: colors.textMuted, marginTop: 1 },
  gradeChipPrice:{ fontSize: 9, color: colors.textMuted },
  gradedByText:  { fontSize: 10, color: colors.textMuted, textAlign: "right" },

  // Summary view
  gradePerformanceRow:  { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  gradePerformanceCard: { flex: 1, borderRadius: radius.lg, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  gpIcon:   { fontSize: 22, marginBottom: 4 },
  gpKg:     { fontSize: fonts.sizes.md, fontWeight: "900" },
  gpLabel:  { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  gpPct:    { fontSize: 12, fontWeight: "700", marginTop: 4 },

  summaryQualityCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  summaryCardTitle:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  bigBar:       { height: 20, borderRadius: 10, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  bigBarA:      { backgroundColor: colors.success },
  bigBarB:      { backgroundColor: colors.warning },
  bigBarR:      { backgroundColor: colors.error },
  bigBarLegend: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  legendChip:   { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:    { width: 10, height: 10, borderRadius: 5 },
  legendChipText:{ fontSize: fonts.sizes.xs, color: colors.textSecondary, fontWeight: "600" },

  monthlyCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  monthRow:      { marginBottom: 14 },
  monthLabel:    { fontSize: 12, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  monthBarTrack: { height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden", marginBottom: 4 },
  monthBarFill:  { height: 10, backgroundColor: colors.salesColor, borderRadius: 5 },
  monthStats:    { flexDirection: "row", justifyContent: "space-between" },
  monthRevenue:  { fontSize: 12, fontWeight: "800", color: colors.salesColor },
  monthKg:       { fontSize: 11, color: colors.textMuted },

  buyerCard:     { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  buyerRow:      { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  buyerRank:     { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buyerRankText: { fontSize: 11, fontWeight: "900" },
  buyerName:     { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  buyerMeta:     { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  buyerGrades:   { flexDirection: "row", gap: 8, marginTop: 4 },
  buyerGradeA:   { fontSize: 11, fontWeight: "700", color: colors.success },
  buyerGradeB:   { fontSize: 11, fontWeight: "700", color: colors.warning },
  buyerAmountWrap:{ alignItems: "flex-end" },
  buyerAmount:   { fontSize: fonts.sizes.sm, fontWeight: "900", color: colors.salesColor },
  buyerPct:      { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  buyerBarTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  buyerBarFill:  { height: 4, backgroundColor: colors.salesColor, borderRadius: 2 },
  buyerDivider:  { height: 1, backgroundColor: colors.divider },

  financialCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  finRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  finLabel:      { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  finValue:      { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  finDivider:    { height: 1, backgroundColor: colors.divider },

  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  detailModal:  { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "90%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:   { fontSize: 20, color: colors.textMuted, padding: 4 },

  detailHero:          { backgroundColor: colors.salesLight, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  detailHeroLeft:      { flex: 1 },
  detailBatch:         { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.salesColor },
  detailDate:          { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  detailBuyer:         { fontSize: fonts.sizes.sm, color: colors.textSecondary, marginTop: 4, fontWeight: "600" },
  detailHeroRight:     { alignItems: "flex-end" },
  detailRevenue:       { fontSize: 24, fontWeight: "900", color: colors.salesColor },
  detailRevenueLabel:  { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  detailSectionTitle:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.salesColor, marginBottom: spacing.sm, marginTop: spacing.sm },
  detailGradeGrid:     { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  detailGradeCard:     { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center" },
  dgcIcon:             { fontSize: 20, marginBottom: 4 },
  dgcKg:               { fontSize: fonts.sizes.md, fontWeight: "900" },
  dgcLabel:            { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  dgcPrice:            { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  dgcSubtotal:         { fontSize: 11, fontWeight: "800", marginTop: 4 },
  detailBar:           { height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden", marginBottom: spacing.md },
  detailBarA:          { backgroundColor: colors.success },
  detailBarB:          { backgroundColor: colors.warning },
  detailInfoGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  infoCell:            { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, width: (width - spacing.md * 2 - spacing.xs * 3) / 2, alignItems: "center" },
  infoCellIcon:        { fontSize: 20, marginBottom: 4 },
  infoCellLabel:       { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  infoCellValue:       { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: 2, textAlign: "center" },
  detailRevenueSummary: { backgroundColor: colors.salesLight, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  detailRevenueRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  detailRevenueRowLabel:{ fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  detailRevenueRowValue:{ fontSize: fonts.sizes.sm, fontWeight: "800" },

  // ── Month picker pill ──
  monthPickerPill:  { flexDirection: "row", alignItems: "center", gap: 4 },
  monthPickerArrow: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginLeft: 2 },

  // ── Month picker modal ──
  monthPickerModal:        { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "80%" },
  monthPickerSectionLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.xs, textTransform: "uppercase" },
  monthDivider:            { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },

  monthOption:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: spacing.sm, borderRadius: radius.md, marginBottom: 4 },
  monthOptionActive:{ backgroundColor: colors.salesLight, borderWidth: 1.5, borderColor: colors.salesColor + "40" },
  monthOptionLeft:  { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  monthOptionIcon:  { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  monthOptionLabel: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  monthOptionSub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  monthOptionRight: { alignItems: "flex-end", gap: 4 },
  monthOptionRevenue:{ fontSize: fonts.sizes.sm, fontWeight: "700" },
  monthSelectedTick: { marginLeft: 8 },

  monthEmptyState: { alignItems: "center", paddingVertical: 40 },
});