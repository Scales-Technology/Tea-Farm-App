// ─── Farmers View Screen — Collector Side ────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
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

type PaymentMethod   = "cash" | "bank" | "mpesa" | string;
type PaymentDuration = "daily" | "weekly" | "monthly" | string;

interface Farmer {
  id:              string;
  name:            string;
  idNumber:        string;
  phone:           string;
  location:        string;
  paymentMethod:   PaymentMethod;
  paymentDuration: PaymentDuration;
  paymentDetails:  string;
  organizationId:  string;
  isActive:        boolean;
  totalKgCollected?: number;
  totalAmountPaid?:  number;
  createdAt:       any;
}

const METHOD_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  cash:  { icon: "💵", color: colors.success,    bg: colors.successLight },
  Cash:  { icon: "💵", color: colors.success,    bg: colors.successLight },
  bank:  { icon: "🏦", color: colors.salesColor, bg: colors.salesLight },
  Bank:  { icon: "🏦", color: colors.salesColor, bg: colors.salesLight },
  mpesa: { icon: "📱", color: colors.primary,    bg: colors.primaryPale },
  Mpesa: { icon: "📱", color: colors.primary,    bg: colors.primaryPale },
};

const DURATION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  daily:   { label: "Daily",   color: colors.primary,    bg: colors.primaryPale },
  Daily:   { label: "Daily",   color: colors.primary,    bg: colors.primaryPale },
  weekly:  { label: "Weekly",  color: colors.accent,     bg: colors.accentPale },
  Weekly:  { label: "Weekly",  color: colors.accent,     bg: colors.accentPale },
  monthly: { label: "Monthly", color: colors.adminColor, bg: colors.adminLight },
  Monthly: { label: "Monthly", color: colors.adminColor, bg: colors.adminLight },
};

const getMethodConfig = (method: string) =>
  METHOD_CONFIG[method] || { icon: "💳", color: colors.textSecondary, bg: colors.border };

const getDurationConfig = (duration: string) =>
  DURATION_CONFIG[duration] || { label: duration, color: colors.textSecondary, bg: colors.border };

export default function FarmersViewScreen({ navigation }: any) {
  const [farmers,       setFarmers]       = useState<Farmer[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [selectedFarmer,setSelectedFarmer]= useState<Farmer | null>(null);
  const [showDetail,    setShowDetail]    = useState(false);
  const [filterMethod,  setFilterMethod]  = useState<string>("all");

  const orgIdRef = useRef("");

  const loadFarmers = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // ── FIX 1: Direct doc fetch — no where("__name__") ───────────────
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const oid = userSnap.data()!.organizationId || "";
      orgIdRef.current = oid;
      if (!oid) return;

      // ── FIX 2: Single where only — no orderBy, no second where ───────
      const snap = await getDocs(query(
        collection(db, "farmers"),
        where("organizationId", "==", oid)
      ));

      // ── FIX 3: Filter active and sort client-side ─────────────────────
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Farmer))
        .filter(f => f.isActive !== false)          // only active farmers
        .sort((a, b) => a.name.localeCompare(b.name)); // sort A-Z by name

      setFarmers(all);

    } catch (e: any) {
      console.log("Load farmers error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadFarmers(); }, [loadFarmers]);

  const handleRefresh = () => { setRefreshing(true); loadFarmers(); };

  const filtered = farmers.filter(f => {
    const matchSearch = !searchQuery ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase())     ||
      (f.idNumber  || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.location  || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchMethod = filterMethod === "all" ||
      f.paymentMethod?.toLowerCase() === filterMethod.toLowerCase();
    return matchSearch && matchMethod;
  });

  const handleCollect = (farmer: Farmer) => {
    setShowDetail(false);
    navigation.navigate("Collection", {
      sourceType: "farmer",
      sourceId:   farmer.id,
      sourceName: farmer.name,
    });
  };

  if (loading) return <TeaLoader message="Loading Farmers..." subMessage="Registered by Admin" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>👨‍🌾 Farmers</Text>
            <Text style={styles.headerSub}>
              {farmers.length} registered · {filtered.length} shown
            </Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>Admin Registered</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>{farmers.length}</Text>
            <Text style={styles.stripLabel}>Total</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>
              {farmers.filter(f => f.paymentMethod?.toLowerCase() === "mpesa").length}
            </Text>
            <Text style={styles.stripLabel}>Mpesa</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>
              {farmers.filter(f => f.paymentMethod?.toLowerCase() === "bank").length}
            </Text>
            <Text style={styles.stripLabel}>Bank</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>
              {farmers.filter(f => f.paymentMethod?.toLowerCase() === "cash").length}
            </Text>
            <Text style={styles.stripLabel}>Cash</Text>
          </View>
        </View>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(["all", "cash", "mpesa", "bank"] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.filterPill, filterMethod === m && styles.filterPillActive]}
              onPress={() => setFilterMethod(m)}
            >
              <Text style={[styles.filterPillText, filterMethod === m && styles.filterPillTextActive]}>
                {m === "all" ? "🔵 All" : m === "cash" ? "💵 Cash" : m === "mpesa" ? "📱 Mpesa" : "🏦 Bank"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ID or location..."
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

      {/* ── Farmer List ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👨‍🌾</Text>
            <Text style={styles.emptyTitle}>No farmers found</Text>
            <Text style={styles.emptySub}>
              {farmers.length === 0
                ? "Admin has not registered any farmers yet"
                : "Try adjusting your search or filter"
              }
            </Text>
          </View>
        ) : (
          filtered.map(farmer => {
            const mc = getMethodConfig(farmer.paymentMethod);
            const dc = getDurationConfig(farmer.paymentDuration);
            return (
              <TouchableOpacity
                key={farmer.id}
                style={styles.farmerCard}
                onPress={() => { setSelectedFarmer(farmer); setShowDetail(true); }}
                activeOpacity={0.85}
              >
                <View style={[styles.accentBar, { backgroundColor: mc.color }]} />
                <View style={[styles.avatar, { backgroundColor: mc.bg }]}>
                  <Text style={[styles.avatarText, { color: mc.color }]}>
                    {farmer.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.farmerInfo}>
                  <Text style={styles.farmerName}>{farmer.name}</Text>
                  <Text style={styles.farmerId}>🪪 {farmer.idNumber}</Text>
                  <Text style={styles.farmerLocation}>📍 {farmer.location || "—"}</Text>
                  <View style={styles.farmerTags}>
                    <View style={[styles.tag, { backgroundColor: mc.bg }]}>
                      <Text style={[styles.tagText, { color: mc.color }]}>
                        {mc.icon} {farmer.paymentMethod}
                      </Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: dc.bg }]}>
                      <Text style={[styles.tagText, { color: dc.color }]}>{dc.label}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.collectBtn}
                  onPress={() => handleCollect(farmer)}
                >
                  <Text style={styles.collectBtnIcon}>⚖️</Text>
                  <Text style={styles.collectBtnText}>Collect</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Farmer Detail Modal ── */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👨‍🌾 Farmer Details</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedFarmer && (() => {
              const mc = getMethodConfig(selectedFarmer.paymentMethod);
              const dc = getDurationConfig(selectedFarmer.paymentDuration);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[styles.modalBanner, { backgroundColor: mc.bg }]}>
                    <View style={[styles.modalAvatar, { backgroundColor: mc.color }]}>
                      <Text style={styles.modalAvatarText}>
                        {selectedFarmer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.modalName}>{selectedFarmer.name}</Text>
                    <Text style={styles.modalId}>🪪 ID: {selectedFarmer.idNumber}</Text>
                  </View>

                  <View style={styles.detailGrid}>
                    <DetailCell icon="📱" label="Phone"            value={selectedFarmer.phone || "—"} />
                    <DetailCell icon="📍" label="Location"         value={selectedFarmer.location || "—"} />
                    <DetailCell icon={mc.icon} label="Payment Method"   value={selectedFarmer.paymentMethod} />
                    <DetailCell icon="📅"      label="Payment Duration" value={dc.label} />
                    <DetailCell icon="🔢"      label="Payment Details"  value={selectedFarmer.paymentDetails || "—"} />
                    <DetailCell icon="⚖️"      label="Total Collected"  value={`${selectedFarmer.totalKgCollected ?? 0} kg`} />
                  </View>

                  <TouchableOpacity
                    style={styles.modalCollectBtn}
                    onPress={() => handleCollect(selectedFarmer)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalCollectBtnText}>⚖️ Record Tea Collection</Text>
                  </TouchableOpacity>

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
      <Text style={styles.detailCellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header:          { backgroundColor: colors.primary, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerTop:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle:     { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:       { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerBadge:     { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  headerBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },

  statsStrip:   { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, paddingVertical: 10, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  stripItem:    { flex: 1, alignItems: "center" },
  stripValue:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: "#fff" },
  stripLabel:   { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  stripDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },

  filterRow:            { marginBottom: 4 },
  filterPill:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: "transparent" },
  filterPillActive:     { backgroundColor: "#fff" },
  filterPillText:       { fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  filterPillTextActive: { color: colors.primary, fontWeight: "700" },

  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },

  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },

  farmerCard:  { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", overflow: "hidden", ...shadows.md },
  accentBar:   { width: 4, alignSelf: "stretch" },
  avatar:      { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginHorizontal: 12 },
  avatarText:  { fontSize: fonts.sizes.lg, fontWeight: "900" },
  farmerInfo:  { flex: 1, paddingVertical: spacing.sm },
  farmerName:  { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  farmerId:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  farmerLocation: { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 1 },
  farmerTags:  { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  tag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  tagText:     { fontSize: 10, fontWeight: "700" },

  collectBtn:     { alignItems: "center", paddingHorizontal: spacing.sm, paddingRight: spacing.md },
  collectBtnIcon: { fontSize: 22 },
  collectBtnText: { fontSize: 10, color: colors.primary, fontWeight: "700", marginTop: 2 },

  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "88%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:   { fontSize: 20, color: colors.textMuted, padding: 4 },

  modalBanner:     { borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", marginBottom: spacing.md },
  modalAvatar:     { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  modalAvatarText: { fontSize: 32, fontWeight: "900", color: "#fff" },
  modalName:       { fontSize: fonts.sizes.xl, fontWeight: "900", color: colors.textPrimary },
  modalId:         { fontSize: fonts.sizes.sm, color: colors.textSecondary, marginTop: 4 },

  detailGrid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  detailCell:      { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, width: (width - spacing.md * 2 - spacing.sm * 3) / 2, alignItems: "center" },
  detailCellIcon:  { fontSize: 22, marginBottom: 4 },
  detailCellLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  detailCellValue: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: 2, textAlign: "center" },

  modalCollectBtn:     { backgroundColor: colors.primary, borderRadius: radius.md, height: 54, alignItems: "center", justifyContent: "center", ...shadows.md },
  modalCollectBtnText: { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});