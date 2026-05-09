// ─── Collector Dashboard — TeaFarm Pro ───────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, RefreshControl, Dimensions, Animated,
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

const db   = getFirestore();
const auth = getAuth();
const { width } = Dimensions.get("window");
const BTN_WIDTH = (width - spacing.md * 2 - spacing.sm * 2) / 3;

interface CollectorStats {
  totalPluckers:    number;
  activePluckers:   number;
  totalFarmers:     number;
  todayCollections: number;
  todayWeightKg:    number;
  weekWeightKg:     number;
  totalWeightKg:    number;
  pendingPayments:  number;
  pendingAmountKsh: number;
}

interface RecentCollection {
  id:          string;
  sourceName:  string;
  sourceType:  string;
  weightKg:    number;
  batchNumber: string;
  date:        string;
  createdAt:   any;
}

interface AttendanceToday {
  id:          string;
  pluckerName: string;
  arrivalTime: string;
}

export default function CollectorDashboard({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [stats,      setStats]      = useState<CollectorStats | null>(null);
  const [recent,     setRecent]     = useState<RecentCollection[]>([]);
  const [attendance, setAttendance] = useState<AttendanceToday[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName,   setUserName]   = useState("Collector");
  const [orgName,    setOrgName]    = useState("Farm");

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  };

  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // ── FIX 1: Direct doc fetch — no index needed ─────────────────────────
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      setUserName(me.name || "Collector");
      const oid = me.organizationId || "";
      if (!oid) return;

      // ── FIX 2: Direct org fetch ───────────────────────────────────────────
      const orgSnap = await getDoc(doc(db, "organizations", oid));
      if (orgSnap.exists()) setOrgName(orgSnap.data()!.farmName || "Farm");

      const today   = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // ── FIX 3: All queries use single where — no composite index needed ───
      const [pluckerSnap, farmerSnap, collSnap, paySnap, attendSnap] = await Promise.all([
        getDocs(query(collection(db, "pluckers"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "farmers"),     where("organizationId", "==", oid))),
        getDocs(query(collection(db, "collections"), where("organizationId", "==", oid))),
        getDocs(query(collection(db, "payments"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "attendance"),  where("organizationId", "==", oid))),
      ]);

      const today_str = today;
      let todayWeightKg = 0, weekWeightKg = 0, totalWeightKg = 0;
      let todayCollections = 0, pendingAmountKsh = 0;

      collSnap.docs.forEach(d => {
        const data = d.data();
        totalWeightKg += data.weightKg || 0;
        if (data.date === today_str) { todayWeightKg += data.weightKg || 0; todayCollections++; }
        if (data.date >= weekAgo)    weekWeightKg += data.weightKg || 0;
      });

      // Filter pending payments in JS
      paySnap.docs
        .filter(d => d.data().status === "pending")
        .forEach(d => { pendingAmountKsh += d.data().amount || 0; });

      const pendingPayments = paySnap.docs.filter(d => d.data().status === "pending").length;

      // Filter active farmers in JS
      const activeFarmers = farmerSnap.docs.filter(d => d.data().isActive !== false).length;

      setStats({
        totalPluckers:    pluckerSnap.size,
        activePluckers:   pluckerSnap.docs.filter(d => d.data().isActive !== false).length,
        totalFarmers:     activeFarmers,
        todayCollections,
        todayWeightKg:    Math.round(todayWeightKg * 10) / 10,
        weekWeightKg:     Math.round(weekWeightKg * 10) / 10,
        totalWeightKg:    Math.round(totalWeightKg * 10) / 10,
        pendingPayments,
        pendingAmountKsh: Math.round(pendingAmountKsh),
      });

      // ── FIX 4: Filter today's attendance in JS — no compound query ────────
      const todayAttendance = attendSnap.docs
        .filter(d => d.data().date === today_str)
        .map(d => ({
          id:          d.id,
          pluckerName: d.data().pluckerName,
          arrivalTime: d.data().arrivalTime,
        }));
      setAttendance(todayAttendance);

      // ── FIX 5: Sort collections in JS — no orderBy needed ─────────────────
      const recentColl = collSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RecentCollection))
        .sort((a, b) => {
          const aT = a.createdAt?.toDate?.()?.getTime() || 0;
          const bT = b.createdAt?.toDate?.()?.getTime() || 0;
          return bT - aT;
        })
        .slice(0, 5);
      setRecent(recentColl);

    } catch (e: any) {
      console.log("Collector dashboard error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      animateIn();
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
    if (h < 12) return "Habari za asubuhi ☀️";
    if (h < 17) return "Habari za mchana 🌤️";
    return "Habari za jioni 🌙";
  };

  if (loading) return <TeaLoader message="Loading your dashboard..." subMessage="Collector Supervisor" />;

  const fillPercent = stats && stats.totalWeightKg > 0
    ? Math.min((stats.todayWeightKg / Math.max(stats.totalWeightKg / 30, 1)) * 100, 100)
    : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.collectorColor} />

      {/* ══ HERO HEADER ══════════════════════════════════════════════════════ */}
      <View style={styles.hero}>
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />

        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroGreeting}>{greeting()}</Text>
            <Text style={styles.heroName}>{userName}</Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>🧺 Collector Supervisor</Text>
            </View>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.orgBadge}>
              <Text style={styles.orgBadgeIcon}>🌿</Text>
              <Text style={styles.orgBadgeText}>{orgName}</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutIcon}>⎋</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's hero stat */}
        <View style={styles.heroStat}>
          <View style={styles.heroStatLeft}>
            <Text style={styles.heroStatLabel}>Today's Collection</Text>
            <Text style={styles.heroStatValue}>{stats?.todayWeightKg ?? 0}</Text>
            <Text style={styles.heroStatUnit}>kilograms collected</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${fillPercent}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>
              {stats?.todayCollections ?? 0} batches · {stats?.activePluckers ?? 0} pluckers active
            </Text>
          </View>
          <View style={styles.heroStatRight}>
            <View style={styles.heroCircleStat}>
              <Text style={styles.heroCircleStatNum}>{stats?.todayCollections ?? 0}</Text>
              <Text style={styles.heroCircleStatLabel}>Batches</Text>
            </View>
          </View>
        </View>

        {/* Pills */}
        <View style={styles.pillsRow}>
          <View style={styles.pill}>
            <Text style={styles.pillValue}>{stats?.weekWeightKg ?? 0} kg</Text>
            <Text style={styles.pillLabel}>This Week</Text>
          </View>
          <View style={[styles.pill, styles.pillDivider]} />
          <View style={styles.pill}>
            <Text style={styles.pillValue}>{stats?.totalWeightKg ?? 0} kg</Text>
            <Text style={styles.pillLabel}>All Time</Text>
          </View>
          <View style={[styles.pill, styles.pillDivider]} />
          <View style={styles.pill}>
            <Text style={[styles.pillValue, stats?.pendingPayments ? { color: "#fbbf24" } : {}]}>
              {stats?.pendingPayments ?? 0}
            </Text>
            <Text style={styles.pillLabel}>Pending Pay</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            colors={[colors.collectorColor]} tintColor={colors.collectorColor} />
        }
      >
        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionBtn icon="🧺" label="Pluckers"  sub="Register & manage" color={colors.collectorColor} bg={colors.collectorLight} onPress={() => navigation.navigate("Pluckers")} />
          <ActionBtn icon="👨‍🌾" label="Farmers"   sub="View & collect"    color={colors.primary}        bg={colors.primaryPale}    onPress={() => navigation.navigate("Farmers")} />
          <ActionBtn icon="⚖️" label="Collection" sub="Record tea weight"  color={colors.accent}         bg={colors.accentPale}     onPress={() => navigation.navigate("Collection")} />
          <ActionBtn icon="💳" label="Payments"   sub="Process & proof"   color={colors.salesColor}     bg={colors.salesLight}     onPress={() => navigation.navigate("Payments")} />
          <ActionBtn icon="📦" label="Inventory"  sub="Stock overview"    color={colors.earth}          bg={colors.earthPale}      onPress={() => navigation.navigate("Inventory")} />
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>📊 Overview</Text>
        <View style={styles.statsRow}>
          <StatPill icon="🧺" label="Pluckers" value={stats?.totalPluckers ?? 0}   color={colors.collectorColor} bg={colors.collectorLight} />
          <StatPill icon="✅" label="Active"   value={stats?.activePluckers ?? 0}  color={colors.success}        bg={colors.successLight} />
          <StatPill icon="👨‍🌾" label="Farmers"  value={stats?.totalFarmers ?? 0}    color={colors.primary}        bg={colors.primaryPale} />
          <StatPill icon="⏳" label="Pending"  value={stats?.pendingPayments ?? 0} color={colors.warning}        bg={colors.warningLight} />
        </View>

        {/* Today's Attendance */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👁️ Today's Attendance</Text>
          <Text style={styles.sectionCount}>{attendance.length} arrived</Text>
        </View>
        {attendance.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🕐</Text>
            <Text style={styles.emptyTitle}>No attendance yet today</Text>
            <Text style={styles.emptySub}>Mark pluckers as they arrive in the Pluckers screen</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {attendance.slice(0, 5).map((a, idx) => (
              <View key={a.id}>
                <View style={styles.attendanceRow}>
                  <View style={styles.attendanceAvatar}>
                    <Text style={styles.attendanceAvatarText}>{a.pluckerName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.attendanceInfo}>
                    <Text style={styles.attendanceName}>{a.pluckerName}</Text>
                    <Text style={styles.attendanceTime}>🕐 Arrived at {a.arrivalTime}</Text>
                  </View>
                  <View style={styles.presentBadge}>
                    <Text style={styles.presentBadgeText}>✅ Present</Text>
                  </View>
                </View>
                {idx < Math.min(attendance.length, 5) - 1 && <View style={styles.divider} />}
              </View>
            ))}
            {attendance.length > 5 && (
              <TouchableOpacity style={styles.viewMoreBtn} onPress={() => navigation.navigate("Pluckers")}>
                <Text style={styles.viewMoreText}>View all {attendance.length} pluckers →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recent Collections */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⚖️ Recent Collections</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Collection")}>
            <Text style={styles.sectionLink}>View all →</Text>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>⚖️</Text>
            <Text style={styles.emptyTitle}>No collections recorded yet</Text>
            <Text style={styles.emptySub}>Start by selecting a plucker or farmer</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {recent.map((c, idx) => (
              <View key={c.id}>
                <View style={styles.collectionRow}>
                  <View style={[styles.collectionTypeIcon, {
                    backgroundColor: c.sourceType === "plucker" ? colors.collectorLight : colors.primaryPale,
                  }]}>
                    <Text style={{ fontSize: 18 }}>{c.sourceType === "plucker" ? "🧺" : "👨‍🌾"}</Text>
                  </View>
                  <View style={styles.collectionInfo}>
                    <Text style={styles.collectionName}>{c.sourceName}</Text>
                    <Text style={styles.collectionMeta}>Batch: {c.batchNumber} · {c.date}</Text>
                  </View>
                  <View style={styles.collectionWeight}>
                    <Text style={styles.collectionWeightNum}>{c.weightKg}</Text>
                    <Text style={styles.collectionWeightUnit}>kg</Text>
                  </View>
                </View>
                {idx < recent.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}

        {/* Pending Payments Alert */}
        {(stats?.pendingPayments ?? 0) > 0 && (
          <TouchableOpacity style={styles.alertCard} onPress={() => navigation.navigate("Payments")} activeOpacity={0.85}>
            <View style={styles.alertLeft}>
              <Text style={styles.alertIcon}>⚠️</Text>
              <View>
                <Text style={styles.alertTitle}>{stats?.pendingPayments} Pending Payments</Text>
                <Text style={styles.alertSub}>KSh {(stats?.pendingAmountKsh ?? 0).toLocaleString()} awaiting processing</Text>
              </View>
            </View>
            <Text style={styles.alertArrow}>→</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function ActionBtn({ icon, label, sub, color, bg, onPress }: any) {
  const scale   = useRef(new Animated.Value(1)).current;
  const press   = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
  const release = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }], width: BTN_WIDTH }}>
      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: bg }]}
        onPress={onPress} onPressIn={press} onPressOut={release} activeOpacity={1}>
        <View style={[styles.actionBtnIcon, { backgroundColor: color }]}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </View>
        <Text style={[styles.actionBtnLabel, { color }]} numberOfLines={1}>{label}</Text>
        <Text style={styles.actionBtnSub} numberOfLines={2}>{sub}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StatPill({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <Text style={styles.statPillIcon}>{icon}</Text>
      <Text style={[styles.statPillValue, { color }]}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.collectorColor, paddingTop: 52, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden", ...shadows.lg },
  heroCircle1: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.05)", top: -60, right: -60 },
  heroCircle2: { position: "absolute", width: 140, height: 140, borderRadius: 70,  backgroundColor: "rgba(255,255,255,0.06)", bottom: -40, left: -20 },
  heroTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  heroGreeting: { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  heroName:     { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  roleTag:      { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginTop: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  roleTagText:  { fontSize: 11, color: "#fff", fontWeight: "700" },
  heroRight:    { alignItems: "flex-end", gap: 8 },
  orgBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  orgBadgeIcon: { fontSize: 14 },
  orgBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  logoutBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  logoutIcon:   { fontSize: 18, color: "#fff" },
  heroStat:           { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  heroStatLeft:       { flex: 1 },
  heroStatLabel:      { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginBottom: 4 },
  heroStatValue:      { fontSize: 52, fontWeight: "900", color: "#fff", lineHeight: 56 },
  heroStatUnit:       { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.6)", marginBottom: 10 },
  progressTrack:      { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, marginBottom: 6, overflow: "hidden" },
  progressFill:       { height: "100%", backgroundColor: colors.secondary, borderRadius: 3 },
  progressLabel:      { fontSize: 10, color: "rgba(255,255,255,0.6)" },
  heroStatRight:      { alignItems: "center", marginLeft: spacing.md },
  heroCircleStat:     { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.25)" },
  heroCircleStatNum:  { fontSize: fonts.sizes.xxl, fontWeight: "900", color: "#fff" },
  heroCircleStatLabel:{ fontSize: 9, color: "rgba(255,255,255,0.7)", textAlign: "center" },
  pillsRow:    { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.lg, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  pill:        { flex: 1, alignItems: "center" },
  pillDivider: { flex: 0, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  pillValue:   { fontSize: fonts.sizes.md, fontWeight: "900", color: "#fff" },
  pillLabel:   { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitle:  { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sectionCount:  { fontSize: fonts.sizes.xs, color: colors.collectorColor, fontWeight: "700" },
  sectionLink:   { fontSize: fonts.sizes.xs, color: colors.collectorColor, fontWeight: "700" },
  actionsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  actionBtn:      { borderRadius: radius.lg, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  actionBtnIcon:  { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionBtnLabel: { fontSize: fonts.sizes.sm, fontWeight: "800", textAlign: "center" },
  actionBtnSub:   { fontSize: 9, color: colors.textMuted, textAlign: "center", marginTop: 2 },
  statsRow:      { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  statPill:      { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", ...shadows.sm },
  statPillIcon:  { fontSize: 18, marginBottom: 4 },
  statPillValue: { fontSize: fonts.sizes.sm, fontWeight: "900" },
  statPillLabel: { fontSize: 9, color: colors.textMuted, textAlign: "center", marginTop: 2 },
  listCard:            { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadows.md },
  attendanceRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  attendanceAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.collectorLight, alignItems: "center", justifyContent: "center", marginRight: 12 },
  attendanceAvatarText:{ fontSize: fonts.sizes.md, fontWeight: "900", color: colors.collectorColor },
  attendanceInfo:      { flex: 1 },
  attendanceName:      { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  attendanceTime:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  presentBadge:        { backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  presentBadgeText:    { fontSize: 10, color: colors.success, fontWeight: "700" },
  viewMoreBtn:         { paddingTop: spacing.sm, alignItems: "center" },
  viewMoreText:        { fontSize: fonts.sizes.sm, color: colors.collectorColor, fontWeight: "700" },
  collectionRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  collectionTypeIcon:  { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 12 },
  collectionInfo:      { flex: 1 },
  collectionName:      { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  collectionMeta:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  collectionWeight:    { alignItems: "flex-end" },
  collectionWeightNum: { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.primary },
  collectionWeightUnit:{ fontSize: 10, color: colors.textMuted },
  alertCard:  { backgroundColor: "#FFF8E1", borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.warning, ...shadows.sm },
  alertLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  alertIcon:  { fontSize: 28 },
  alertTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.warning },
  alertSub:   { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  alertArrow: { fontSize: 20, color: colors.warning, fontWeight: "800" },
  emptyCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", marginBottom: spacing.md, ...shadows.sm },
  emptyIcon:  { fontSize: 48, marginBottom: 10 },
  emptyTitle: { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  divider:    { height: 1, backgroundColor: colors.divider },
});