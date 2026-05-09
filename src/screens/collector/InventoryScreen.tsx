// ─── Inventory Screen — TeaFarm Pro ──────────────────────────────────────────
// Shows tea collected from pluckers & farmers separately.
// Includes batch number, date, individual collection records, and totals.
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, RefreshControl, Dimensions, Modal,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import TeaLoader from "../../components/TeaLoader";

const db      = getFirestore();
const auth    = getAuth();
const { width } = Dimensions.get("window");

type ViewTab    = "pluckers" | "farmers" | "summary";
type DateFilter = "all" | "today" | "week" | "month";

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

interface PersonSummary {
  sourceId:   string;
  sourceName: string;
  sourceType: string;
  totalKg:    number;
  batchCount: number;
  records:    CollectionRecord[];
  lastDate:   string;
}

const formatDate = (dateStr: string, ts?: any): string => {
  try {
    const d = dateStr ? new Date(dateStr) : (ts?.toDate ? ts.toDate() : new Date());
    return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
};

const formatDateTime = (ts: any): string => {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    return d.toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
};

export default function InventoryScreen({ navigation }: any) {
  const [records,      setRecords]      = useState<CollectionRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<ViewTab>("summary");
  const [dateFilter,   setDateFilter]   = useState<DateFilter>("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [selectedRec,  setSelectedRec]  = useState<CollectionRecord | null>(null);
  const [showDetail,   setShowDetail]   = useState(false);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [orgName,      setOrgName]      = useState("My Farm");

  const orgIdRef = useRef("");

  const loadRecords = useCallback(async () => {
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

      // Single where only — no orderBy
      const snap = await getDocs(query(
        collection(db, "collections"),
        where("organizationId", "==", organizationId)
      ));

      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CollectionRecord))
        .sort((a, b) => {
          const aT = a.createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        });

      setRecords(sorted);
    } catch (e: any) {
      console.log("Inventory load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleRefresh = () => { setRefreshing(true); loadRecords(); };

  // ── Date filter ───────────────────────────────────────────────────────────
  const isInRange = (rec: CollectionRecord): boolean => {
    if (dateFilter === "all") return true;
    const today = new Date().toISOString().split("T")[0];
    if (dateFilter === "today") return rec.date === today;
    const recDate = rec.date ? new Date(rec.date) : rec.createdAt?.toDate?.() || new Date(0);
    if (dateFilter === "week") {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      return recDate >= weekAgo;
    }
    if (dateFilter === "month") {
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      return recDate >= monthAgo;
    }
    return true;
  };

  // ── Filtered records ──────────────────────────────────────────────────────
  const filtered = useMemo(() => records.filter(r => {
    const matchDate   = isInRange(r);
    const matchSearch = !searchQuery ||
      r.sourceName.toLowerCase().includes(searchQuery.toLowerCase())   ||
      r.batchNumber.toLowerCase().includes(searchQuery.toLowerCase())  ||
      (r.recordedBy || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchTab = activeTab === "summary"
      ? true
      : activeTab === "pluckers" ? r.sourceType === "plucker"
      : r.sourceType === "farmer";
    return matchDate && matchSearch && matchTab;
  }), [records, dateFilter, searchQuery, activeTab]);

  // ── Per-person summaries ──────────────────────────────────────────────────
  const personSummaries = useMemo((): PersonSummary[] => {
    const map: Record<string, PersonSummary> = {};
    filtered.forEach(r => {
      if (!map[r.sourceId]) {
        map[r.sourceId] = {
          sourceId: r.sourceId, sourceName: r.sourceName,
          sourceType: r.sourceType, totalKg: 0, batchCount: 0,
          records: [], lastDate: r.date,
        };
      }
      map[r.sourceId].totalKg    += r.weightKg || 0;
      map[r.sourceId].batchCount += 1;
      map[r.sourceId].records.push(r);
      if (r.date > map[r.sourceId].lastDate) map[r.sourceId].lastDate = r.date;
    });
    return Object.values(map)
      .map(p => ({ ...p, totalKg: Math.round(p.totalKg * 100) / 100 }))
      .sort((a, b) => b.totalKg - a.totalKg);
  }, [filtered]);

  // ── Overall stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pluckerRecs = filtered.filter(r => r.sourceType === "plucker");
    const farmerRecs  = filtered.filter(r => r.sourceType === "farmer");
    const totalPluckers = Math.round(pluckerRecs.reduce((s, r) => s + (r.weightKg || 0), 0) * 100) / 100;
    const totalFarmers  = Math.round(farmerRecs.reduce( (s, r) => s + (r.weightKg || 0), 0) * 100) / 100;
    const grandTotal    = Math.round((totalPluckers + totalFarmers) * 100) / 100;
    const uniquePluckers = new Set(pluckerRecs.map(r => r.sourceId)).size;
    const uniqueFarmers  = new Set(farmerRecs.map( r => r.sourceId)).size;
    return {
      totalPluckers, totalFarmers, grandTotal,
      pluckerBatches: pluckerRecs.length, farmerBatches: farmerRecs.length,
      uniquePluckers, uniqueFarmers,
      totalBatches: filtered.length,
    };
  }, [filtered]);

  // ── Max kg for progress bars ──────────────────────────────────────────────
  const maxPersonKg = useMemo(() =>
    Math.max(...personSummaries.map(p => p.totalKg), 1),
  [personSummaries]);

  if (loading) return <TeaLoader message="Loading Inventory..." subMessage="Collection Records" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.collectorColor} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>📦 Inventory Report</Text>
            <Text style={styles.headerSub}>🌿 {orgName}</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{stats.totalBatches} batches</Text>
          </View>
        </View>

        {/* KPI strip */}
        <View style={styles.kpiStrip}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.grandTotal} kg</Text>
            <Text style={styles.kpiLabel}>Grand Total</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.totalPluckers} kg</Text>
            <Text style={styles.kpiLabel}>Pluckers</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.totalFarmers} kg</Text>
            <Text style={styles.kpiLabel}>Farmers</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{stats.totalBatches}</Text>
            <Text style={styles.kpiLabel}>Batches</Text>
          </View>
        </View>

        {/* Date filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateFilters}>
          {([
            { key: "all",   label: "📅 All Time" },
            { key: "today", label: "🌅 Today" },
            { key: "week",  label: "📆 This Week" },
            { key: "month", label: "🗓 This Month" },
          ] as { key: DateFilter; label: string }[]).map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.datePill, dateFilter === f.key && styles.datePillActive]}
              onPress={() => setDateFilter(f.key)}
            >
              <Text style={[styles.datePillText, dateFilter === f.key && styles.datePillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        {([
          { key: "summary",  label: "📊 Summary",  count: stats.totalBatches },
          { key: "pluckers", label: "🧺 Pluckers", count: stats.pluckerBatches },
          { key: "farmers",  label: "👨‍🌾 Farmers",  count: stats.farmerBatches },
        ] as { key: ViewTab; label: string; count: number }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: activeTab === tab.key ? "#fff" : colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: activeTab === tab.key ? colors.collectorColor : colors.textMuted }]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, batch or recorder..."
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
        {filtered.length} record{filtered.length !== 1 ? "s" : ""} · {
          activeTab === "summary"  ? `${stats.uniquePluckers} pluckers, ${stats.uniqueFarmers} farmers` :
          activeTab === "pluckers" ? `${stats.uniquePluckers} pluckers` :
          `${stats.uniqueFarmers} farmers`
        }
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            colors={[colors.collectorColor]} tintColor={colors.collectorColor} />
        }
      >
        {/* ════════════════════════════════════
            SUMMARY TAB
        ════════════════════════════════════ */}
        {activeTab === "summary" && (
          <>
            {/* ── Source breakdown cards ── */}
            <View style={styles.breakdownRow}>
              {/* Pluckers card */}
              <View style={[styles.breakdownCard, { borderColor: colors.collectorColor }]}>
                <View style={[styles.breakdownIconWrap, { backgroundColor: colors.collectorLight }]}>
                  <Text style={styles.breakdownIcon}>🧺</Text>
                </View>
                <Text style={[styles.breakdownValue, { color: colors.collectorColor }]}>
                  {stats.totalPluckers} kg
                </Text>
                <Text style={styles.breakdownLabel}>Pluckers</Text>
                <Text style={styles.breakdownSub}>
                  {stats.uniquePluckers} plucker{stats.uniquePluckers !== 1 ? "s" : ""} · {stats.pluckerBatches} batch{stats.pluckerBatches !== 1 ? "es" : ""}
                </Text>
                <View style={styles.breakdownBar}>
                  <View style={[styles.breakdownBarFill, {
                    width: `${stats.grandTotal > 0 ? (stats.totalPluckers / stats.grandTotal) * 100 : 0}%`,
                    backgroundColor: colors.collectorColor,
                  }]} />
                </View>
                <Text style={[styles.breakdownPct, { color: colors.collectorColor }]}>
                  {stats.grandTotal > 0 ? Math.round((stats.totalPluckers / stats.grandTotal) * 100) : 0}% of total
                </Text>
              </View>

              {/* Farmers card */}
              <View style={[styles.breakdownCard, { borderColor: colors.primary }]}>
                <View style={[styles.breakdownIconWrap, { backgroundColor: colors.primaryPale }]}>
                  <Text style={styles.breakdownIcon}>👨‍🌾</Text>
                </View>
                <Text style={[styles.breakdownValue, { color: colors.primary }]}>
                  {stats.totalFarmers} kg
                </Text>
                <Text style={styles.breakdownLabel}>Farmers</Text>
                <Text style={styles.breakdownSub}>
                  {stats.uniqueFarmers} farmer{stats.uniqueFarmers !== 1 ? "s" : ""} · {stats.farmerBatches} batch{stats.farmerBatches !== 1 ? "es" : ""}
                </Text>
                <View style={styles.breakdownBar}>
                  <View style={[styles.breakdownBarFill, {
                    width: `${stats.grandTotal > 0 ? (stats.totalFarmers / stats.grandTotal) * 100 : 0}%`,
                    backgroundColor: colors.primary,
                  }]} />
                </View>
                <Text style={[styles.breakdownPct, { color: colors.primary }]}>
                  {stats.grandTotal > 0 ? Math.round((stats.totalFarmers / stats.grandTotal) * 100) : 0}% of total
                </Text>
              </View>
            </View>

            {/* ── Grand total hero ── */}
            <View style={styles.grandTotalHero}>
              <View style={styles.grandTotalHeroLeft}>
                <Text style={styles.grandTotalHeroLabel}>📦 Grand Total Collection</Text>
                <Text style={styles.grandTotalHeroValue}>{stats.grandTotal} kg</Text>
                <Text style={styles.grandTotalHeroSub}>
                  {stats.totalBatches} total batch{stats.totalBatches !== 1 ? "es" : ""} · {stats.uniquePluckers + stats.uniqueFarmers} people
                </Text>
              </View>
              <Text style={styles.grandTotalHeroIcon}>🌿</Text>
            </View>

            {/* ── Top collectors (both types combined) ── */}
            {personSummaries.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>🏆 Top Collectors</Text>
                <View style={styles.topCollectorsCard}>
                  {personSummaries.slice(0, 10).map((person, i) => (
                    <TouchableOpacity
                      key={person.sourceId}
                      style={styles.topCollectorRow}
                      onPress={() => {
                        setActiveTab(person.sourceType === "plucker" ? "pluckers" : "farmers");
                        setExpandedPerson(person.sourceId);
                      }}
                    >
                      <View style={[styles.rankBadge, { backgroundColor: i < 3 ? colors.collectorColor : colors.border }]}>
                        <Text style={[styles.rankText, { color: i < 3 ? "#fff" : colors.textMuted }]}>#{i + 1}</Text>
                      </View>
                      <View style={[styles.tcAvatar, {
                        backgroundColor: person.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale,
                      }]}>
                        <Text style={[styles.tcAvatarText, {
                          color: person.sourceType === "plucker" ? colors.collectorColor : colors.primary,
                        }]}>
                          {person.sourceName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.tcInfo}>
                        <Text style={styles.tcName}>{person.sourceName}</Text>
                        <View style={styles.tcMeta}>
                          <Text style={styles.tcType}>{person.sourceType === "plucker" ? "🧺" : "👨‍🌾"}</Text>
                          <Text style={styles.tcBatches}>{person.batchCount} batch{person.batchCount !== 1 ? "es" : ""}</Text>
                        </View>
                        {/* Progress bar */}
                        <View style={styles.tcBarTrack}>
                          <View style={[styles.tcBarFill, {
                            width: `${(person.totalKg / maxPersonKg) * 100}%`,
                            backgroundColor: person.sourceType === "plucker" ? colors.collectorColor : colors.primary,
                          }]} />
                        </View>
                      </View>
                      <Text style={[styles.tcKg, {
                        color: person.sourceType === "plucker" ? colors.collectorColor : colors.primary,
                      }]}>
                        {person.totalKg.toFixed(2)} kg
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {filtered.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>No records found</Text>
                <Text style={styles.emptySub}>Change the date filter or record a collection first</Text>
              </View>
            )}
          </>
        )}

        {/* ════════════════════════════════════
            PLUCKERS / FARMERS TAB
        ════════════════════════════════════ */}
        {(activeTab === "pluckers" || activeTab === "farmers") && (
          <>
            {/* Type total banner */}
            <View style={[styles.typeBanner, {
              backgroundColor: activeTab === "pluckers" ? colors.collectorLight : colors.primaryPale,
              borderColor:     activeTab === "pluckers" ? colors.collectorColor  : colors.primary,
            }]}>
              <Text style={styles.typeBannerIcon}>{activeTab === "pluckers" ? "🧺" : "👨‍🌾"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeBannerTitle, { color: activeTab === "pluckers" ? colors.collectorColor : colors.primary }]}>
                  {activeTab === "pluckers" ? "All Pluckers" : "All Farmers"} Collection
                </Text>
                <Text style={styles.typeBannerSub}>
                  {activeTab === "pluckers"
                    ? `${stats.uniquePluckers} pluckers · ${stats.pluckerBatches} batches`
                    : `${stats.uniqueFarmers} farmers · ${stats.farmerBatches} batches`
                  }
                </Text>
              </View>
              <Text style={[styles.typeBannerTotal, { color: activeTab === "pluckers" ? colors.collectorColor : colors.primary }]}>
                {activeTab === "pluckers" ? stats.totalPluckers : stats.totalFarmers} kg
              </Text>
            </View>

            {personSummaries.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>{activeTab === "pluckers" ? "🧺" : "👨‍🌾"}</Text>
                <Text style={styles.emptyTitle}>No {activeTab === "pluckers" ? "plucker" : "farmer"} records</Text>
                <Text style={styles.emptySub}>Records will appear here once collections are recorded</Text>
              </View>
            ) : (
              personSummaries.map((person, pi) => {
                const isExpanded = expandedPerson === person.sourceId;
                const accentColor = person.sourceType === "plucker" ? colors.collectorColor : colors.primary;
                const accentBg    = person.sourceType === "plucker" ? colors.collectorLight  : colors.primaryPale;

                // Sort person's records newest first
                const personRecs = [...person.records].sort((a, b) => {
                  const aT = a.createdAt?.toDate?.()?.getTime() || 0;
                  const bT = b.createdAt?.toDate?.()?.getTime() || 0;
                  return bT - aT;
                });

                return (
                  <View key={person.sourceId} style={styles.personCard}>
                    {/* ── Person header — tap to expand ── */}
                    <TouchableOpacity
                      style={styles.personHeader}
                      onPress={() => setExpandedPerson(isExpanded ? null : person.sourceId)}
                      activeOpacity={0.82}
                    >
                      <View style={[styles.personAvatar, { backgroundColor: accentBg }]}>
                        <Text style={[styles.personAvatarText, { color: accentColor }]}>
                          {person.sourceName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>{person.sourceName}</Text>
                        <Text style={styles.personMeta}>
                          {person.batchCount} batch{person.batchCount !== 1 ? "es" : ""} · Last: {formatDate(person.lastDate)}
                        </Text>
                        {/* Mini progress bar */}
                        <View style={styles.personBarTrack}>
                          <View style={[styles.personBarFill, {
                            width: `${(person.totalKg / maxPersonKg) * 100}%`,
                            backgroundColor: accentColor,
                          }]} />
                        </View>
                      </View>
                      <View style={styles.personRight}>
                        <Text style={[styles.personTotalKg, { color: accentColor }]}>
                          {person.totalKg.toFixed(2)}
                        </Text>
                        <Text style={styles.personTotalUnit}>kg</Text>
                        <Text style={styles.personExpandIcon}>{isExpanded ? "▲" : "▼"}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* ── Expanded: individual records ── */}
                    {isExpanded && (
                      <View style={styles.recordsContainer}>
                        {/* Records header */}
                        <View style={[styles.recordsHeader, { backgroundColor: accentBg }]}>
                          <Text style={[styles.recordsHeaderText, { color: accentColor }]}>
                            📋 {person.batchCount} Collection Record{person.batchCount !== 1 ? "s" : ""}
                          </Text>
                          <Text style={[styles.recordsHeaderTotal, { color: accentColor }]}>
                            Total: {person.totalKg.toFixed(2)} kg
                          </Text>
                        </View>

                        {personRecs.map((rec, ri) => (
                          <TouchableOpacity
                            key={rec.id}
                            style={[styles.recordRow, ri < personRecs.length - 1 && styles.recordRowBorder]}
                            onPress={() => { setSelectedRec(rec); setShowDetail(true); }}
                            activeOpacity={0.8}
                          >
                            {/* Left: batch & date */}
                            <View style={styles.recordLeft}>
                              <View style={[styles.recordDot, { backgroundColor: accentColor }]} />
                              <View>
                                <Text style={styles.recordBatch}>{rec.batchNumber}</Text>
                                <Text style={styles.recordDate}>
                                  📅 {formatDate(rec.date)} · 🕐 {formatDateTime(rec.createdAt)}
                                </Text>
                                <Text style={styles.recordBy}>Recorded by {rec.recordedBy || "—"}</Text>
                                {rec.notes ? <Text style={styles.recordNotes}>💬 {rec.notes}</Text> : null}
                              </View>
                            </View>

                            {/* Right: weight */}
                            <View style={styles.recordRight}>
                              <Text style={[styles.recordKg, { color: accentColor }]}>
                                {(rec.weightKg || 0).toFixed(2)}
                              </Text>
                              <Text style={styles.recordUnit}>{rec.unit || "kg"}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}

                        {/* Person subtotal */}
                        <View style={[styles.personSubtotal, { backgroundColor: accentColor }]}>
                          <Text style={styles.personSubtotalLabel}>
                            {person.sourceName} — Total ({person.batchCount} batch{person.batchCount !== 1 ? "es" : ""})
                          </Text>
                          <Text style={styles.personSubtotalValue}>
                            {person.totalKg.toFixed(2)} kg
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* ── Section total footer ── */}
            {personSummaries.length > 0 && (
              <View style={[styles.sectionTotalCard, {
                borderColor: activeTab === "pluckers" ? colors.collectorColor : colors.primary,
              }]}>
                <View style={styles.sectionTotalRow}>
                  <Text style={styles.sectionTotalIcon}>{activeTab === "pluckers" ? "🧺" : "👨‍🌾"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTotalLabel}>
                      Total from {activeTab === "pluckers" ? "Pluckers" : "Farmers"}
                    </Text>
                    <Text style={styles.sectionTotalSub}>
                      {activeTab === "pluckers"
                        ? `${stats.uniquePluckers} pluckers · ${stats.pluckerBatches} batches`
                        : `${stats.uniqueFarmers} farmers · ${stats.farmerBatches} batches`
                      }
                    </Text>
                  </View>
                  <Text style={[styles.sectionTotalValue, {
                    color: activeTab === "pluckers" ? colors.collectorColor : colors.primary,
                  }]}>
                    {activeTab === "pluckers" ? stats.totalPluckers : stats.totalFarmers} kg
                  </Text>
                </View>

                {/* Grand total */}
                <View style={[styles.grandTotalRow, {
                  borderTopColor: activeTab === "pluckers" ? colors.collectorColor + "40" : colors.primary + "40",
                }]}>
                  <Text style={styles.sectionTotalIcon}>🌿</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTotalLabel, { fontWeight: "900" }]}>Grand Total (All Sources)</Text>
                    <Text style={styles.sectionTotalSub}>Pluckers + Farmers combined</Text>
                  </View>
                  <Text style={styles.grandTotalValue}>{stats.grandTotal} kg</Text>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Record Detail Modal ── */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 Batch Detail</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedRec && (() => {
              const isP       = selectedRec.sourceType === "plucker";
              const accentColor = isP ? colors.collectorColor : colors.primary;
              const accentBg    = isP ? colors.collectorLight  : colors.primaryPale;
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Hero */}
                  <View style={[styles.detailHero, { backgroundColor: accentBg, borderColor: accentColor + "40" }]}>
                    <View style={[styles.detailHeroAvatar, { backgroundColor: accentColor }]}>
                      <Text style={styles.detailHeroAvatarText}>{selectedRec.sourceName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailHeroName, { color: accentColor }]}>{selectedRec.sourceName}</Text>
                      <Text style={styles.detailHeroType}>{isP ? "🧺 Plucker" : "👨‍🌾 Farmer"}</Text>
                    </View>
                    <View style={styles.detailHeroWeight}>
                      <Text style={[styles.detailHeroKg, { color: accentColor }]}>{(selectedRec.weightKg || 0).toFixed(2)}</Text>
                      <Text style={styles.detailHeroUnit}>{selectedRec.unit || "kg"}</Text>
                    </View>
                  </View>

                  {/* Detail grid */}
                  <View style={styles.detailGrid}>
                    <DetailCell icon="🔢" label="Batch Number" value={selectedRec.batchNumber} />
                    <DetailCell icon="📅" label="Date"         value={formatDate(selectedRec.date)} />
                    <DetailCell icon="🕐" label="Time"         value={formatDateTime(selectedRec.createdAt)} />
                    <DetailCell icon="👤" label="Recorded By"  value={selectedRec.recordedBy || "—"} />
                    <DetailCell icon="⚖️" label="Weight"       value={`${(selectedRec.weightKg || 0).toFixed(2)} ${selectedRec.unit || "kg"}`} />
                    <DetailCell icon={isP ? "🧺" : "👨‍🌾"} label="Type" value={isP ? "Plucker" : "Farmer"} />
                  </View>

                  {selectedRec.notes ? (
                    <View style={styles.detailNotesCard}>
                      <Text style={styles.detailNotesLabel}>📝 Notes</Text>
                      <Text style={styles.detailNotesValue}>{selectedRec.notes}</Text>
                    </View>
                  ) : null}

                  <View style={{ height: 24 }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailCellIcon}>{icon}</Text>
      <Text style={styles.detailCellLabel}>{label}</Text>
      <Text style={styles.detailCellValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },

  // Header
  header:          { backgroundColor: colors.collectorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  headerTitle:     { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:       { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  headerBadge:     { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  headerBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },

  kpiStrip:   { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, flexDirection: "row", paddingVertical: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  kpiItem:    { flex: 1, alignItems: "center" },
  kpiValue:   { fontSize: fonts.sizes.sm, color: "#fff", fontWeight: "900" },
  kpiLabel:   { fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  kpiDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.25)" },

  dateFilters:       { marginBottom: 4 },
  datePill:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 4, borderWidth: 1, borderColor: "transparent" },
  datePillActive:    { backgroundColor: "#fff" },
  datePillText:      { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  datePillTextActive:{ color: colors.collectorColor, fontWeight: "800" },

  // Tabs
  tabRow:          { flexDirection: "row", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, padding: 3, gap: 3, ...shadows.sm },
  tab:             { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: radius.sm },
  tabActive:       { backgroundColor: colors.collectorColor },
  tabText:         { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  tabTextActive:   { color: "#fff" },
  tabBadge:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  tabBadgeText:    { fontSize: 9, fontWeight: "800" },

  // Search
  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  resultCount: { fontSize: 11, color: colors.textMuted, marginHorizontal: spacing.md, marginTop: 6, marginBottom: 2, fontWeight: "600" },

  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitle:  { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },

  // Summary tab
  breakdownRow:       { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  breakdownCard:      { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", borderWidth: 1.5, ...shadows.md },
  breakdownIconWrap:  { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  breakdownIcon:      { fontSize: 26 },
  breakdownValue:     { fontSize: fonts.sizes.xl, fontWeight: "900" },
  breakdownLabel:     { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary, marginTop: 2 },
  breakdownSub:       { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: "center" },
  breakdownBar:       { width: "100%", height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden", marginTop: 10 },
  breakdownBarFill:   { height: 6, borderRadius: 3 },
  breakdownPct:       { fontSize: 11, fontWeight: "700", marginTop: 4 },

  grandTotalHero:      { backgroundColor: colors.collectorColor, borderRadius: radius.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center", marginBottom: spacing.md, ...shadows.lg },
  grandTotalHeroLeft:  { flex: 1 },
  grandTotalHeroLabel: { fontSize: fonts.sizes.sm, color: "rgba(255,255,255,0.8)", fontWeight: "600", marginBottom: 4 },
  grandTotalHeroValue: { fontSize: 36, color: "#fff", fontWeight: "900" },
  grandTotalHeroSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 4 },
  grandTotalHeroIcon:  { fontSize: 52 },

  topCollectorsCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.md, ...shadows.md },
  topCollectorRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rankBadge:          { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rankText:           { fontSize: 11, fontWeight: "900" },
  tcAvatar:           { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tcAvatarText:       { fontSize: fonts.sizes.md, fontWeight: "900" },
  tcInfo:             { flex: 1 },
  tcName:             { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  tcMeta:             { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  tcType:             { fontSize: 12 },
  tcBatches:          { fontSize: fonts.sizes.xs, color: colors.textMuted },
  tcBarTrack:         { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginTop: 4 },
  tcBarFill:          { height: 4, borderRadius: 2 },
  tcKg:               { fontSize: fonts.sizes.md, fontWeight: "900" },

  // Pluckers / Farmers tab
  typeBanner:       { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.sm },
  typeBannerIcon:   { fontSize: 32 },
  typeBannerTitle:  { fontSize: fonts.sizes.md, fontWeight: "900" },
  typeBannerSub:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  typeBannerTotal:  { fontSize: fonts.sizes.xl, fontWeight: "900" },

  personCard:         { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, overflow: "hidden", ...shadows.md },
  personHeader:       { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md },
  personAvatar:       { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  personAvatarText:   { fontSize: fonts.sizes.lg, fontWeight: "900" },
  personInfo:         { flex: 1 },
  personName:         { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  personMeta:         { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  personBarTrack:     { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  personBarFill:      { height: 4, borderRadius: 2 },
  personRight:        { alignItems: "flex-end" },
  personTotalKg:      { fontSize: fonts.sizes.xl, fontWeight: "900" },
  personTotalUnit:    { fontSize: 10, color: colors.textMuted },
  personExpandIcon:   { fontSize: 10, color: colors.textMuted, marginTop: 4 },

  recordsContainer:   { borderTopWidth: 1, borderTopColor: colors.divider },
  recordsHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 8 },
  recordsHeaderText:  { fontSize: 11, fontWeight: "800" },
  recordsHeaderTotal: { fontSize: 11, fontWeight: "900" },

  recordRow:        { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 12 },
  recordRowBorder:  { borderBottomWidth: 1, borderBottomColor: colors.divider },
  recordLeft:       { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  recordDot:        { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  recordBatch:      { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  recordDate:       { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  recordBy:         { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  recordNotes:      { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontStyle: "italic" },
  recordRight:      { alignItems: "flex-end", marginLeft: spacing.sm },
  recordKg:         { fontSize: fonts.sizes.lg, fontWeight: "900" },
  recordUnit:       { fontSize: 10, color: colors.textMuted },

  personSubtotal:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 10 },
  personSubtotalLabel: { fontSize: fonts.sizes.xs, fontWeight: "700", color: "#fff" },
  personSubtotalValue: { fontSize: fonts.sizes.md, fontWeight: "900", color: "#fff" },

  sectionTotalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginTop: spacing.sm, borderWidth: 2, ...shadows.lg },
  sectionTotalRow:  { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: spacing.md },
  sectionTotalIcon: { fontSize: 28 },
  sectionTotalLabel:{ fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  sectionTotalSub:  { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  sectionTotalValue:{ fontSize: fonts.sizes.xl, fontWeight: "900" },

  grandTotalRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: spacing.md, borderTopWidth: 1 },
  grandTotalValue: { fontSize: 28, fontWeight: "900", color: colors.collectorColor },

  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  detailModal:  { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "85%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:   { fontSize: 20, color: colors.textMuted, padding: 4 },

  detailHero:           { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1.5 },
  detailHeroAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  detailHeroAvatarText: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  detailHeroName:       { fontSize: fonts.sizes.lg, fontWeight: "900" },
  detailHeroType:       { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  detailHeroWeight:     { alignItems: "flex-end" },
  detailHeroKg:         { fontSize: 32, fontWeight: "900" },
  detailHeroUnit:       { fontSize: 12, color: colors.textMuted },

  detailGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  detailCell:      { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, width: (width - spacing.md * 2 - spacing.xs * 3) / 2, alignItems: "center" },
  detailCellIcon:  { fontSize: 20, marginBottom: 4 },
  detailCellLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  detailCellValue: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: 2, textAlign: "center" },

  detailNotesCard:  { backgroundColor: colors.primaryPale, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  detailNotesLabel: { fontSize: 11, fontWeight: "700", color: colors.primary, marginBottom: 4 },
  detailNotesValue: { fontSize: fonts.sizes.sm, color: colors.textPrimary, lineHeight: 20 },
});