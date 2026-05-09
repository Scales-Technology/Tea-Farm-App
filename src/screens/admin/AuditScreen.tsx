// ─── Audit Trail Screen — TeaFarm Pro ────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, StatusBar, RefreshControl,
  Dimensions, Modal,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");
const PAGE_SIZE = 30;

type OutcomeFilter = "all" | "success" | "failure" | "pending";
type ModuleFilter  = "all" | "employees" | "farmers" | "pluckers" | "collections" | "payments" | "sales" | "expenses" | "farm_inputs";

const MODULE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  employees:   { icon: "👥", color: colors.adminColor,     bg: colors.adminLight },
  farmers:     { icon: "👨‍🌾", color: colors.collectorColor, bg: colors.collectorLight },
  pluckers:    { icon: "🧺", color: colors.primary,        bg: colors.primaryPale },
  collections: { icon: "⚖️", color: colors.accent,         bg: colors.accentPale },
  payments:    { icon: "💳", color: colors.salesColor,     bg: colors.salesLight },
  sales:       { icon: "💼", color: colors.earth,          bg: colors.earthPale },
  expenses:    { icon: "📉", color: colors.error,          bg: colors.errorLight },
  farm_inputs: { icon: "🌱", color: colors.success,        bg: colors.successLight },
  audit:       { icon: "🔍", color: colors.textMuted,      bg: colors.border },
};

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  admin:                { label: "Admin",      color: colors.adminColor,      bg: colors.adminLight },
  collector_supervisor: { label: "Collector",  color: colors.collectorColor,  bg: colors.collectorLight },
  sales_supervisor:     { label: "Sales",      color: colors.salesColor,      bg: colors.salesLight },
  main_supervisor:      { label: "Supervisor", color: colors.supervisorColor, bg: colors.supervisorLight },
};

interface AuditLog {
  id: string; actorId: string; actorName: string; actorRole: string;
  action: string; module: string; outcome: string; organizationId: string;
  referenceId?: string; createdAt: any;
}

const OUTCOME_FILTERS: { key: OutcomeFilter; label: string; icon: string }[] = [
  { key: "all",     label: "All",     icon: "🔵" },
  { key: "success", label: "Success", icon: "✅" },
  { key: "failure", label: "Failed",  icon: "❌" },
  { key: "pending", label: "Pending", icon: "⏳" },
];

const MODULE_FILTERS: { key: ModuleFilter; label: string }[] = [
  { key: "all",         label: "All Modules" },
  { key: "employees",   label: "👥 Employees" },
  { key: "farmers",     label: "👨‍🌾 Farmers" },
  { key: "pluckers",    label: "🧺 Pluckers" },
  { key: "collections", label: "⚖️ Collections" },
  { key: "payments",    label: "💳 Payments" },
  { key: "sales",       label: "💼 Sales" },
  { key: "expenses",    label: "📉 Expenses" },
  { key: "farm_inputs", label: "🌱 Farm Inputs" },
];

export default function AuditScreen() {
  const { showLoader, hideLoader } = useLoader();
  const [allLogs,       setAllLogs]       = useState<AuditLog[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [page,          setPage]          = useState(1);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [moduleFilter,  setModuleFilter]  = useState<ModuleFilter>("all");
  const [selectedLog,   setSelectedLog]   = useState<AuditLog | null>(null);
  const [showDetail,    setShowDetail]    = useState(false);
  const orgIdRef = useRef("");

  const loadLogs = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current = oid;
      if (!oid) return;
      const snap = await getDocs(query(
        collection(db, "audit_logs"),
        where("organizationId", "==", oid)
      ));
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as AuditLog))
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
      setAllLogs(sorted);
      setPage(1);
    } catch (e: any) {
      console.log("Audit load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hideLoader();
    }
  }, []);

  useEffect(() => {
    showLoader("Loading Audit Trail...");
    loadLogs();
  }, [loadLogs]);

  const handleRefresh = () => { setRefreshing(true); loadLogs(); };

  const stats = useMemo(() => ({
    total:   allLogs.length,
    success: allLogs.filter(l => l.outcome === "success").length,
    failure: allLogs.filter(l => l.outcome === "failure").length,
    pending: allLogs.filter(l => l.outcome !== "success" && l.outcome !== "failure").length,
  }), [allLogs]);

  const filtered = useMemo(() => allLogs.filter(log => {
    const matchOutcome = outcomeFilter === "all" || log.outcome === outcomeFilter;
    const matchModule  = moduleFilter  === "all" || log.module  === moduleFilter;
    const matchSearch  = !searchQuery  ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase())    ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.module.toLowerCase().includes(searchQuery.toLowerCase());
    return matchOutcome && matchModule && matchSearch;
  }), [allLogs, outcomeFilter, moduleFilter, searchQuery]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore   = paginated.length < filtered.length;
  const handleLoadMore = () => { if (hasMore) setPage(p => p + 1); };
  useEffect(() => { setPage(1); }, [outcomeFilter, moduleFilter, searchQuery]);

  const formatDateTime = (ts: any): string => {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString("en-KE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };
  const formatDateOnly = (ts: any): string => {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };
  const formatTimeAgo = (ts: any): string => {
    try {
      const d    = ts?.toDate ? ts.toDate() : new Date(ts);
      const diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 60)    return `${diff}s ago`;
      if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch { return "—"; }
  };

  const getModuleConfig = (mod: string)  => MODULE_CONFIG[mod]  || MODULE_CONFIG["audit"];
  const getRoleConfig   = (role: string) => ROLE_CONFIG[role]   || ROLE_CONFIG["admin"];
  const outcomeColor    = (out: string)  => out === "success" ? colors.success : out === "failure" ? colors.error : colors.warning;
  const outcomeIcon     = (out: string)  => out === "success" ? "✅" : out === "failure" ? "❌" : "⏳";

  if (loading) return <TeaLoader message="Loading Audit Trail..." subMessage="Admin" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.adminColor} />

      <View style={[styles.header, { backgroundColor: colors.adminColor }]}>
        <Text style={styles.headerTitle}>🔍 Audit Trail</Text>
        <Text style={styles.headerSub}>Full system operation history</Text>
        <View style={styles.statsRow}>
          {[
            { label: "Total",   value: stats.total,   color: "#fff" },
            { label: "Success", value: stats.success, color: colors.successLight },
            { label: "Failed",  value: stats.failure, color: "#fca5a5" },
            { label: "Pending", value: stats.pending, color: "#fde68a" },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.statsDivider} />}
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {OUTCOME_FILTERS.map(f => (
            <TouchableOpacity key={f.key}
              style={[styles.filterPill, outcomeFilter === f.key && styles.filterPillActive]}
              onPress={() => setOutcomeFilter(f.key)}>
              <Text style={[styles.filterText, outcomeFilter === f.key && { color: colors.adminColor, fontWeight: "800" }]}>
                {f.icon} {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.controlsWrap}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput style={styles.searchInput} placeholder="Search action, actor, module..."
            placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modulePills}>
          {MODULE_FILTERS.map(m => (
            <TouchableOpacity key={m.key}
              style={[styles.modulePill, moduleFilter === m.key && styles.modulePillActive]}
              onPress={() => setModuleFilter(m.key)}>
              <Text style={[styles.modulePillText, moduleFilter === m.key && { color: colors.adminColor, fontWeight: "700" }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.resultCount}>Showing {paginated.length} of {filtered.length} records</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.adminColor]} tintColor={colors.adminColor} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) handleLoadMore();
        }}
        scrollEventThrottle={400}>
        {paginated.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No audit logs found</Text>
            <Text style={styles.emptySub}>Operations will appear here as they happen</Text>
          </View>
        ) : (
          <>
            {paginated.map((log, idx) => {
              const mc           = getModuleConfig(log.module);
              const currentDate  = formatDateOnly(log.createdAt);
              const previousDate = idx > 0 ? formatDateOnly(paginated[idx - 1].createdAt) : null;
              const showSeparator = currentDate !== previousDate;
              return (
                <View key={log.id}>
                  {showSeparator && (
                    <View style={styles.dateSeparator}>
                      <View style={styles.dateLine} />
                      <Text style={styles.dateText}>{currentDate}</Text>
                      <View style={styles.dateLine} />
                    </View>
                  )}
                  <TouchableOpacity style={styles.logCard}
                    onPress={() => { setSelectedLog(log); setShowDetail(true); }} activeOpacity={0.85}>
                    <View style={[styles.outcomeBar, { backgroundColor: outcomeColor(log.outcome) }]} />
                    <View style={[styles.moduleIcon, { backgroundColor: mc.bg }]}>
                      <Text style={{ fontSize: 18 }}>{mc.icon}</Text>
                    </View>
                    <View style={styles.logContent}>
                      <Text style={styles.logAction} numberOfLines={2}>{log.action}</Text>
                      <View style={styles.logMeta}>
                        <View style={[styles.actorBadge, { backgroundColor: getRoleConfig(log.actorRole).bg }]}>
                          <Text style={[styles.actorText, { color: getRoleConfig(log.actorRole).color }]}>
                            {getRoleConfig(log.actorRole).label}
                          </Text>
                        </View>
                        <Text style={styles.logActor}>{log.actorName}</Text>
                        <Text style={styles.logTime}>· {formatTimeAgo(log.createdAt)}</Text>
                      </View>
                    </View>
                    <View style={[styles.outcomeBadge, { backgroundColor: outcomeColor(log.outcome) + "20" }]}>
                      <Text style={{ fontSize: 14 }}>{outcomeIcon(log.outcome)}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
            {hasMore && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load more ({filtered.length - paginated.length} remaining)</Text>
              </TouchableOpacity>
            )}
            {!hasMore && allLogs.length > 0 && (
              <Text style={styles.endText}>— End of audit trail —</Text>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔍 Operation Detail</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedLog && (() => {
              const mc = getModuleConfig(selectedLog.module);
              const rc = getRoleConfig(selectedLog.actorRole);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[styles.outcomeBanner, { backgroundColor: outcomeColor(selectedLog.outcome) + "20", borderColor: outcomeColor(selectedLog.outcome) + "40" }]}>
                    <Text style={{ fontSize: 32 }}>{outcomeIcon(selectedLog.outcome)}</Text>
                    <View>
                      <Text style={[styles.outcomeBannerLabel, { color: outcomeColor(selectedLog.outcome) }]}>{selectedLog.outcome.toUpperCase()}</Text>
                      <Text style={styles.outcomeBannerTime}>{formatDateTime(selectedLog.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>📋 Action Performed</Text>
                    <View style={[styles.actionBox, { backgroundColor: mc.bg }]}>
                      <Text style={{ fontSize: 20, marginBottom: 6 }}>{mc.icon}</Text>
                      <Text style={styles.actionText}>{selectedLog.action}</Text>
                    </View>
                  </View>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>👤 Performed By</Text>
                    <View style={styles.actorCard}>
                      <View style={[styles.actorAvatar, { backgroundColor: rc.bg }]}>
                        <Text style={[styles.actorAvatarText, { color: rc.color }]}>{selectedLog.actorName.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={styles.actorName}>{selectedLog.actorName}</Text>
                        <View style={[styles.actorRoleBadge, { backgroundColor: rc.bg }]}>
                          <Text style={[styles.actorRoleText, { color: rc.color }]}>{rc.label}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>ℹ️ Details</Text>
                    <View style={styles.detailGrid}>
                      <DetailCell label="Module"  value={selectedLog.module}  icon={mc.icon} />
                      <DetailCell label="Outcome" value={selectedLog.outcome} icon={outcomeIcon(selectedLog.outcome)} />
                      <DetailCell label="Date"    value={formatDateOnly(selectedLog.createdAt)} icon="📅" />
                      <DetailCell label="Time"    value={formatDateTime(selectedLog.createdAt).split(",")[1]?.trim() || "—"} icon="🕐" />
                      {selectedLog.referenceId && (
                        <DetailCell label="Reference ID" value={selectedLog.referenceId.substring(0, 12) + "..."} icon="🔗" />
                      )}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailCell({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailCellIcon}>{icon}</Text>
      <Text style={styles.detailCellLabel}>{label}</Text>
      <Text style={styles.detailCellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  header:        { paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.xs, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerTitle:   { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:     { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2, marginBottom: spacing.sm },
  statsRow:      { flexDirection: "row", justifyContent: "space-around", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  statItem:      { alignItems: "center", flex: 1 },
  statValue:     { fontSize: fonts.sizes.lg, fontWeight: "900" },
  statLabel:     { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  statsDivider:  { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },
  filterRow:     { marginBottom: 8 },
  filterPill:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 6, borderWidth: 1, borderColor: "transparent" },
  filterPillActive: { backgroundColor: "#fff" },
  filterText:    { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  controlsWrap:  { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  searchWrap:    { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, height: 46, marginBottom: spacing.xs, ...shadows.sm },
  searchIcon:    { fontSize: 16, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  modulePills:   { marginBottom: spacing.xs },
  modulePill:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, marginRight: 6, marginBottom: 4, ...shadows.sm },
  modulePillActive: { backgroundColor: colors.adminLight, borderWidth: 1.5, borderColor: colors.adminColor },
  modulePillText:{ fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  resultCount:   { fontSize: 11, color: colors.textMuted, paddingHorizontal: spacing.md, marginBottom: 4, fontWeight: "600" },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.md },
  dateSeparator: { flexDirection: "row", alignItems: "center", marginVertical: 10 },
  dateLine:      { flex: 1, height: 1, backgroundColor: colors.divider },
  dateText:      { fontSize: 11, color: colors.textMuted, fontWeight: "700", marginHorizontal: 10 },
  logCard:       { backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 6, flexDirection: "row", alignItems: "center", overflow: "hidden", ...shadows.sm },
  outcomeBar:    { width: 4, alignSelf: "stretch" },
  moduleIcon:    { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", marginHorizontal: 10 },
  logContent:    { flex: 1, paddingVertical: 10 },
  logAction:     { fontSize: 13, fontWeight: "700", color: colors.textPrimary, lineHeight: 18 },
  logMeta:       { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4, flexWrap: "wrap" },
  actorBadge:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  actorText:     { fontSize: 9, fontWeight: "800" },
  logActor:      { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  logTime:       { fontSize: 10, color: colors.textMuted },
  outcomeBadge:  { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 10 },
  loadMoreBtn:   { alignItems: "center", paddingVertical: 14, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  loadMoreText:  { fontSize: fonts.sizes.sm, color: colors.adminColor, fontWeight: "700" },
  endText:       { textAlign: "center", fontSize: fonts.sizes.xs, color: colors.textMuted, paddingVertical: 16, fontStyle: "italic" },
  emptyState:    { alignItems: "center", paddingTop: 80 },
  emptyIcon:     { fontSize: 64, marginBottom: 12 },
  emptyTitle:    { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:      { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6 },
  modalOverlay:  { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  detailModal:   { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "88%", minHeight: "50%" },
  modalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:    { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:    { fontSize: 20, color: colors.textMuted, padding: 4 },
  outcomeBanner: { flexDirection: "row", alignItems: "center", gap: 16, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md },
  outcomeBannerLabel: { fontSize: fonts.sizes.lg, fontWeight: "900" },
  outcomeBannerTime:  { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  detailSection:      { marginBottom: spacing.md },
  detailSectionTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.adminColor, marginBottom: spacing.sm },
  actionBox:     { borderRadius: radius.md, padding: spacing.md },
  actionText:    { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary, lineHeight: 22 },
  actorCard:     { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm },
  actorAvatar:   { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actorAvatarText: { fontSize: fonts.sizes.lg, fontWeight: "900" },
  actorName:     { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: 4 },
  actorRoleBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, alignSelf: "flex-start" },
  actorRoleText: { fontSize: 11, fontWeight: "700" },
  detailGrid:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  detailCell:    { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, width: (width - spacing.md * 2 - spacing.xs * 3) / 2, alignItems: "center" },
  detailCellIcon:  { fontSize: 20, marginBottom: 4 },
  detailCellLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  detailCellValue: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: 2, textAlign: "center" },
});