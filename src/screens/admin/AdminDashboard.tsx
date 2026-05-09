// ─── Admin Dashboard — TeaFarm Pro ───────────────────────────────────────────
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where,
  getDocs, doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { logoutUser } from "../../firebase/auth";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const { width } = Dimensions.get("window");
const db   = getFirestore();
const auth = getAuth();

interface DashboardStats {
  totalEmployees:   number;
  totalFarmers:     number;
  totalPluckers:    number;
  totalCollectedKg: number;
  totalSoldKg:      number;
  totalRevenue:     number;
  totalExpenses:    number;
  pendingPayments:  number;
  todayCollection:  number;
  inStockKg:        number;
}

interface RecentActivity {
  id:        string;
  action:    string;
  actorName: string;
  module:    string;
  outcome:   string;
  createdAt: any;
}

export default function AdminDashboard({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [stats,      setStats]      = useState<DashboardStats | null>(null);
  const [recent,     setRecent]     = useState<RecentActivity[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName,    setOrgName]    = useState("My Farm");
  const [userName,   setUserName]   = useState("Admin");

  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // ── Direct doc fetch — no index needed ───────────────────────────────
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const userData       = userSnap.data()!;
      const organizationId = userData.organizationId || "";
      setUserName(userData.name || "Admin");
      if (!organizationId) return;

      const orgSnap = await getDoc(doc(db, "organizations", organizationId));
      if (orgSnap.exists()) setOrgName(orgSnap.data()!.farmName || "My Farm");

      // ── All queries use only ONE where clause — no index needed ──────────
      const [empSnap, farmerSnap, pluckerSnap, collSnap, salesSnap, expSnap, paySnap, auditSnap] =
        await Promise.all([
          getDocs(query(collection(db, "users"),       where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "farmers"),     where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "pluckers"),    where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "collections"), where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "sales"),       where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "expenses"),    where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "payments"),    where("organizationId", "==", organizationId))),
          getDocs(query(collection(db, "audit_logs"),  where("organizationId", "==", organizationId))),
        ]);

      const today = new Date().toISOString().split("T")[0];
      let totalCollectedKg = 0, todayCollection = 0;
      collSnap.docs.forEach(d => {
        const data = d.data();
        totalCollectedKg += data.weightKg || 0;
        if (data.date === today) todayCollection += data.weightKg || 0;
      });

      let totalSoldKg = 0, totalRevenue = 0;
      salesSnap.docs.forEach(d => {
        const data = d.data();
        totalSoldKg  += (data.gradeA_kg || 0) + (data.gradeB_kg || 0);
        totalRevenue += data.totalAmount || 0;
      });

      let totalExpenses = 0;
      expSnap.docs.forEach(d => { totalExpenses += d.data().amount || 0; });

      const pendingPayments = paySnap.docs.filter(d => d.data().status === "pending").length;
      const activeFarmers   = farmerSnap.docs.filter(d => d.data().isActive !== false).length;
      const activePluckers  = pluckerSnap.docs.filter(d => d.data().isActive !== false).length;

      setStats({
        totalEmployees:   empSnap.size,
        totalFarmers:     activeFarmers,
        totalPluckers:    activePluckers,
        totalCollectedKg: Math.round(totalCollectedKg * 10) / 10,
        totalSoldKg:      Math.round(totalSoldKg * 10) / 10,
        totalRevenue,
        totalExpenses,
        pendingPayments,
        todayCollection:  Math.round(todayCollection * 10) / 10,
        inStockKg:        Math.round((totalCollectedKg - totalSoldKg) * 10) / 10,
      });

      // ── Sort in JS — no orderBy needed ───────────────────────────────────
      const sortedAudit = auditSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RecentActivity))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        })
        .slice(0, 5);

      setRecent(sortedAudit);

    } catch (e: any) {
      console.log("Dashboard load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => { setRefreshing(true); loadData(); };

  const handleLogout = async () => {
    showLoader("Signing out...");
    try { await logoutUser(); navigation.replace("Login"); }
    finally { hideLoader(); }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  };

  if (loading) return <TeaLoader message="Loading Dashboard..." />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>{greeting()} 👋</Text>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerOrg}>🌿 {orgName}</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>👑 Admin</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>⎋</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.todayCard}>
          <View>
            <Text style={styles.todayLabel}>Today's Collection</Text>
            <Text style={styles.todayValue}>{stats?.todayCollection ?? 0} kg</Text>
          </View>
          <View style={styles.todayDivider} />
          <View>
            <Text style={styles.todayLabel}>In Stock</Text>
            <Text style={styles.todayValue}>{stats?.inStockKg ?? 0} kg</Text>
          </View>
          <View style={styles.todayDivider} />
          <View>
            <Text style={styles.todayLabel}>Pending Pay</Text>
            <Text style={[styles.todayValue, stats?.pendingPayments ? { color: colors.warning } : {}]}>
              {stats?.pendingPayments ?? 0}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <Text style={styles.sectionTitle}>📊 Overview</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="👥" label="Employees"   value={stats?.totalEmployees  ?? 0} color={colors.adminColor}     bg={colors.adminLight} />
          <StatCard icon="👨‍🌾" label="Farmers"     value={stats?.totalFarmers    ?? 0} color={colors.collectorColor} bg={colors.collectorLight} />
          <StatCard icon="🧺" label="Pluckers"    value={stats?.totalPluckers   ?? 0} color={colors.primary}        bg={colors.primaryPale} />
          <StatCard icon="⚖️" label="Total Coll." value={`${stats?.totalCollectedKg ?? 0}kg`} color={colors.accent} bg={colors.accentPale} />
          <StatCard icon="🏭" label="Total Sold"  value={`${stats?.totalSoldKg ?? 0}kg`}      color={colors.earth}  bg={colors.earthPale} />
          <StatCard icon="💰" label="Revenue"     value={`KSh ${(stats?.totalRevenue ?? 0).toLocaleString()}`}  color={colors.success}   bg={colors.successLight} />
          <StatCard icon="📉" label="Expenses"    value={`KSh ${(stats?.totalExpenses ?? 0).toLocaleString()}`} color={colors.error}     bg={colors.errorLight} />
          <StatCard icon="📦" label="In Stock"    value={`${stats?.inStockKg ?? 0}kg`}         color={colors.secondary} bg={colors.secondaryPale} />
        </View>

        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionCard icon="👥" label="Manage Employees"  color={colors.adminColor}     bg={colors.adminLight}     onPress={() => navigation.navigate("Employees")} />
          <ActionCard icon="👨‍🌾" label="Manage Farmers"    color={colors.collectorColor} bg={colors.collectorLight} onPress={() => navigation.navigate("Farmers")} />
          <ActionCard icon="📊" label="View Reports"      color={colors.primary}        bg={colors.primaryPale}    onPress={() => navigation.navigate("Reports")} />
          <ActionCard icon="💰" label="Expenses & Inputs" color={colors.salesColor}     bg={colors.salesLight}     onPress={() => navigation.navigate("Expenses")} />
          <ActionCard icon="🔍" label="Audit Trail"       color={colors.textMuted}      bg={colors.border}         onPress={() => navigation.navigate("Audit")} />
        </View>

        <Text style={styles.sectionTitle}>💼 Financial Summary</Text>
        <View style={styles.financeCard}>
          <FinanceRow label="Total Revenue"  value={`KSh ${(stats?.totalRevenue ?? 0).toLocaleString()}`}  color={colors.success} />
          <View style={styles.financeDivider} />
          <FinanceRow label="Total Expenses" value={`KSh ${(stats?.totalExpenses ?? 0).toLocaleString()}`} color={colors.error} />
          <View style={styles.financeDivider} />
          <FinanceRow
            label="Net Profit / Faida"
            value={`KSh ${((stats?.totalRevenue ?? 0) - (stats?.totalExpenses ?? 0)).toLocaleString()}`}
            color={(stats?.totalRevenue ?? 0) >= (stats?.totalExpenses ?? 0) ? colors.success : colors.error}
            bold
          />
        </View>

        <Text style={styles.sectionTitle}>🕐 Recent Activity</Text>
        {recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No activity yet</Text>
          </View>
        ) : (
          <View style={styles.activityCard}>
            {recent.map((item, idx) => (
              <View key={item.id}>
                <ActivityRow item={item} />
                {idx < recent.length - 1 && <View style={styles.activityDivider} />}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, label, color, bg, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.actionCard, { backgroundColor: bg }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIconWrap, { backgroundColor: color }]}>
        <Text style={styles.actionIcon}>{icon}</Text>
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FinanceRow({ label, value, color, bold }: any) {
  return (
    <View style={styles.financeRow}>
      <Text style={[styles.financeLabel, bold && { fontWeight: "800", fontSize: fonts.sizes.md }]}>{label}</Text>
      <Text style={[styles.financeValue, { color }, bold && { fontWeight: "800", fontSize: fonts.sizes.md }]}>{value}</Text>
    </View>
  );
}

function ActivityRow({ item }: { item: RecentActivity }) {
  const outcomeColor = item.outcome === "success" ? colors.success : item.outcome === "failure" ? colors.error : colors.warning;
  const moduleIcons: any = { employees: "👥", farmers: "👨‍🌾", pluckers: "🧺", collections: "⚖️", payments: "💳", sales: "💼", expenses: "📉", audit: "📋" };
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityDot, { backgroundColor: outcomeColor }]} />
      <View style={styles.activityContent}>
        <Text style={styles.activityAction}>{moduleIcons[item.module] || "📌"} {item.action}</Text>
        <Text style={styles.activityMeta}>by {item.actorName} · <Text style={{ color: outcomeColor }}>{item.outcome}</Text></Text>
      </View>
    </View>
  );
}

const CARD_WIDTH = (width - spacing.md * 2 - spacing.sm * 3) / 4;

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.background },
  header:         { backgroundColor: colors.primary, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  headerGreeting: { fontSize: fonts.sizes.sm, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  headerName:     { fontSize: fonts.sizes.xl, color: "#fff", fontWeight: "900", marginTop: 2 },
  headerOrg:      { fontSize: fonts.sizes.sm, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  headerActions:  { alignItems: "flex-end", gap: 8 },
  adminBadge:     { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  adminBadgeText: { color: "#fff", fontSize: fonts.sizes.xs, fontWeight: "700" },
  logoutBtn:      { backgroundColor: "rgba(255,255,255,0.15)", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  logoutText:     { fontSize: 18, color: "#fff" },
  todayCard:      { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  todayLabel:     { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 4 },
  todayValue:     { fontSize: fonts.sizes.lg, color: "#fff", fontWeight: "800", textAlign: "center" },
  todayDivider:   { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },
  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  sectionTitle:   { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },
  statsGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  statCard:       { width: CARD_WIDTH, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  statIcon:       { fontSize: 22, marginBottom: 4 },
  statValue:      { fontSize: fonts.sizes.sm, fontWeight: "800", textAlign: "center" },
  statLabel:      { fontSize: 10, color: colors.textMuted, textAlign: "center", marginTop: 2 },
  actionsGrid:    { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  actionCard:     { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm, minWidth: 60 },
  actionIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionIcon:     { fontSize: 22 },
  actionLabel:    { fontSize: 10, fontWeight: "700", textAlign: "center" },
  financeCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  financeRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  financeLabel:   { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  financeValue:   { fontSize: fonts.sizes.sm, fontWeight: "700" },
  financeDivider: { height: 1, backgroundColor: colors.divider },
  activityCard:   { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  activityRow:    { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  activityDot:    { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  activityContent:{ flex: 1 },
  activityAction: { fontSize: fonts.sizes.sm, color: colors.textPrimary, fontWeight: "600" },
  activityMeta:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  activityDivider:{ height: 1, backgroundColor: colors.divider, marginLeft: 18 },
  emptyCard:      { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.md, ...shadows.sm },
  emptyIcon:      { fontSize: 40, marginBottom: 8 },
  emptyText:      { fontSize: fonts.sizes.sm, color: colors.textMuted },
});