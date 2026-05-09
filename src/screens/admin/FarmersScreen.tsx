// ─── Farmers Screen — TeaFarm Pro ────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where,
  getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");

const PAYMENT_METHODS   = ["Cash", "Bank", "Mpesa"];
const PAYMENT_DURATIONS = ["Daily", "Weekly", "Monthly"];

interface Farmer {
  id: string; name: string; idNumber: string; phone: string;
  paymentMethod: string; paymentDuration: string; paymentDetails: string;
  location: string; farmName: string; isActive: boolean;
  totalKgCollected?: number; createdAt: any; organizationId: string;
}

export default function FarmersScreen({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [farmers,         setFarmers]         = useState<Farmer[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [selectedFarmer,  setSelectedFarmer]  = useState<Farmer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [filterMethod,    setFilterMethod]    = useState("All");
  const [saving,          setSaving]          = useState(false);

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");

  const [formName,            setFormName]            = useState("");
  const [formIdNumber,        setFormIdNumber]        = useState("");
  const [formPhone,           setFormPhone]           = useState("");
  const [formFarmName,        setFormFarmName]        = useState("");
  const [formLocation,        setFormLocation]        = useState("");
  const [formPaymentMethod,   setFormPaymentMethod]   = useState("Mpesa");
  const [formPaymentDuration, setFormPaymentDuration] = useState("Monthly");
  const [formPaymentDetails,  setFormPaymentDetails]  = useState("");

  const loadFarmers = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current     = oid;
      actorNameRef.current = me.name || "Admin";
      actorIdRef.current   = uid;
      if (!oid) return;
      const [farmersSnap, collSnap] = await Promise.all([
        getDocs(query(collection(db, "farmers"),     where("organizationId", "==", oid))),
        getDocs(query(collection(db, "collections"), where("organizationId", "==", oid))),
      ]);
      const kgMap: Record<string, number> = {};
      collSnap.docs.forEach(d => {
        const data = d.data();
        if (data.sourceType === "farmer" && data.sourceId)
          kgMap[data.sourceId] = (kgMap[data.sourceId] || 0) + (data.weightKg || 0);
      });
      const sorted = farmersSnap.docs
        .map(d => ({ id: d.id, ...d.data(), totalKgCollected: Math.round((kgMap[d.id] || 0) * 10) / 10 } as Farmer))
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
      setFarmers(sorted);
    } catch (e: any) {
      console.log("Load farmers error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hideLoader();
    }
  }, []);

  useEffect(() => {
    showLoader("Loading Farmers...");
    loadFarmers();
  }, [loadFarmers]);

  const handleRefresh = () => { setRefreshing(true); loadFarmers(); };

  const resetForm = () => {
    setFormName(""); setFormIdNumber(""); setFormPhone("");
    setFormFarmName(""); setFormLocation(""); setFormPaymentMethod("Mpesa");
    setFormPaymentDuration("Monthly"); setFormPaymentDetails("");
  };

  const handleCreate = async () => {
    if (!formName.trim())           return Alert.alert("Required", "Farmer name is required.");
    if (!formIdNumber.trim())       return Alert.alert("Required", "ID Number is required.");
    if (!formPhone.trim())          return Alert.alert("Required", "Phone number is required.");
    if (!formFarmName.trim())       return Alert.alert("Required", "Farm name is required.");
    if (!formPaymentDetails.trim()) return Alert.alert("Required", "Payment details are required.");
    setSaving(true);
    showLoader("Registering farmer...");
    try {
      const ref = await addDoc(collection(db, "farmers"), {
        name: formName.trim(), idNumber: formIdNumber.trim(), phone: formPhone.trim(),
        farmName: formFarmName.trim(), location: formLocation.trim(),
        paymentMethod: formPaymentMethod, paymentDuration: formPaymentDuration,
        paymentDetails: formPaymentDetails.trim(), isActive: true,
        organizationId: orgIdRef.current, createdAt: serverTimestamp(),
        createdBy: actorNameRef.current, createdById: actorIdRef.current,
      });
      await addDoc(collection(db, "audit_logs"), {
        actorId: actorIdRef.current, actorName: actorNameRef.current, actorRole: "admin",
        action: `Registered new farmer: ${formName.trim()}`,
        module: "farmers", outcome: "success", organizationId: orgIdRef.current,
        createdAt: serverTimestamp(), referenceId: ref.id,
      });
      setFarmers(prev => [{
        id: ref.id, name: formName.trim(), idNumber: formIdNumber.trim(), phone: formPhone.trim(),
        farmName: formFarmName.trim(), location: formLocation.trim(), paymentMethod: formPaymentMethod,
        paymentDuration: formPaymentDuration, paymentDetails: formPaymentDetails.trim(),
        isActive: true, organizationId: orgIdRef.current, totalKgCollected: 0, createdAt: new Date(),
      }, ...prev]);
      Alert.alert("✅ Farmer Registered", `${formName.trim()} has been registered successfully.`);
      setShowModal(false); resetForm();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to register farmer.");
    } finally { setSaving(false); hideLoader(); }
  };

  const handleToggleActive = (farmer: Farmer) => {
    Alert.alert(
      farmer.isActive ? "⚠️ Deactivate Farmer" : "✅ Activate Farmer",
      farmer.isActive
        ? `Deactivating ${farmer.name} will stop them from appearing in collection records.`
        : `This will re-activate ${farmer.name}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: farmer.isActive ? "Deactivate" : "Activate",
          style: farmer.isActive ? "destructive" : "default",
          onPress: async () => {
            showLoader(farmer.isActive ? "Deactivating..." : "Activating...");
            try {
              await updateDoc(doc(db, "farmers", farmer.id), {
                isActive: !farmer.isActive, updatedAt: serverTimestamp(), updatedBy: actorNameRef.current,
              });
              await addDoc(collection(db, "audit_logs"), {
                actorId: actorIdRef.current, actorName: actorNameRef.current, actorRole: "admin",
                action: `${farmer.isActive ? "Deactivated" : "Activated"} farmer: ${farmer.name}`,
                module: "farmers", outcome: "success", organizationId: orgIdRef.current,
                createdAt: serverTimestamp(), referenceId: farmer.id,
              });
              setFarmers(prev => prev.map(f => f.id === farmer.id ? { ...f, isActive: !farmer.isActive } : f));
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to update farmer.");
              loadFarmers();
            } finally { hideLoader(); }
          },
        },
      ]
    );
  };

  const filtered = farmers.filter(f => {
    const matchSearch =
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.farmName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.idNumber.includes(searchQuery);
    const matchFilter = filterMethod === "All" || f.paymentMethod === filterMethod;
    return matchSearch && matchFilter;
  });

  const activeCount   = farmers.filter(f => f.isActive).length;
  const inactiveCount = farmers.filter(f => !f.isActive).length;
  const totalKg       = farmers.reduce((s, f) => s + (f.totalKgCollected || 0), 0);

  const methodColor: Record<string, string> = { Mpesa: colors.primary, Bank: colors.salesColor, Cash: colors.accent };
  const methodBg:    Record<string, string> = { Mpesa: colors.primaryPale, Bank: colors.salesLight, Cash: colors.accentPale };

  if (loading) return <TeaLoader message="Loading Farmers..." subMessage="Admin" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.collectorColor} />
      <View style={[styles.header, { backgroundColor: colors.collectorColor }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>👨‍🌾 Farmers</Text>
            <Text style={styles.headerSub}>{activeCount} active · {inactiveCount} inactive · {Math.round(totalKg * 10) / 10} kg total</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.addBtnText}>+ Register</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statPill}><Text style={styles.statPillValue}>{farmers.length}</Text><Text style={styles.statPillLabel}>Total</Text></View>
          <View style={styles.statPillDivider} />
          <View style={styles.statPill}><Text style={styles.statPillValue}>{activeCount}</Text><Text style={styles.statPillLabel}>Active</Text></View>
          <View style={styles.statPillDivider} />
          <View style={styles.statPill}><Text style={styles.statPillValue}>{Math.round(totalKg)} kg</Text><Text style={styles.statPillLabel}>Collected</Text></View>
          <View style={styles.statPillDivider} />
          <View style={styles.statPill}><Text style={styles.statPillValue}>{farmers.filter(f => f.paymentMethod === "Mpesa").length}</Text><Text style={styles.statPillLabel}>Mpesa</Text></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {["All", ...PAYMENT_METHODS].map(m => (
            <TouchableOpacity key={m} style={[styles.filterPill, filterMethod === m && styles.filterPillActive]} onPress={() => setFilterMethod(m)}>
              <Text style={[styles.filterPillText, filterMethod === m && styles.filterPillTextActive]}>
                {m === "Mpesa" ? "📱" : m === "Bank" ? "🏦" : m === "Cash" ? "💵" : "🔵"} {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Search by name, farm or ID..."
          placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
        {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery("")}><Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text></TouchableOpacity>}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.collectorColor]} tintColor={colors.collectorColor} />}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👨‍🌾</Text>
            <Text style={styles.emptyTitle}>No farmers found</Text>
            <Text style={styles.emptySub}>Tap "+ Register" to add a farmer</Text>
          </View>
        ) : filtered.map(farmer => (
          <TouchableOpacity key={farmer.id}
            style={[styles.farmerCard, !farmer.isActive && styles.farmerCardInactive]}
            onPress={() => { setSelectedFarmer(farmer); setShowDetailModal(true); }} activeOpacity={0.88}>
            <View style={styles.cardTop}>
              <View style={[styles.farmerAvatar, { backgroundColor: farmer.isActive ? colors.collectorLight : colors.earthPale }]}>
                <Text style={styles.farmerAvatarText}>{farmer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <View style={styles.cardNameRow}>
                  <Text style={[styles.farmerName, !farmer.isActive && { color: colors.textMuted }]}>{farmer.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: farmer.isActive ? colors.successLight : colors.earthPale }]}>
                    <Text style={[styles.statusText, { color: farmer.isActive ? colors.success : colors.textMuted }]}>
                      {farmer.isActive ? "✅ Active" : "⏸ Inactive"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>🌾 {farmer.farmName} · 📍 {farmer.location || "N/A"}</Text>
                <Text style={styles.cardSub}>🪪 ID: {farmer.idNumber} · 📱 {farmer.phone}</Text>
              </View>
            </View>
            <View style={styles.cardStatsRow}>
              <View style={[styles.cardStat, { backgroundColor: colors.primaryPale }]}>
                <Text style={[styles.cardStatValue, { color: colors.primary }]}>{farmer.totalKgCollected || 0} kg</Text>
                <Text style={styles.cardStatLabel}>Collected</Text>
              </View>
              <View style={[styles.cardStat, { backgroundColor: methodBg[farmer.paymentMethod] || colors.accentPale }]}>
                <Text style={[styles.cardStatValue, { color: methodColor[farmer.paymentMethod] || colors.accent }]}>
                  {farmer.paymentMethod === "Mpesa" ? "📱" : farmer.paymentMethod === "Bank" ? "🏦" : "💵"} {farmer.paymentMethod}
                </Text>
                <Text style={styles.cardStatLabel}>Payment</Text>
              </View>
              <View style={[styles.cardStat, { backgroundColor: colors.supervisorLight }]}>
                <Text style={[styles.cardStatValue, { color: colors.supervisorColor }]}>{farmer.paymentDuration}</Text>
                <Text style={styles.cardStatLabel}>Schedule</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={[styles.cardActionBtn, { backgroundColor: farmer.isActive ? colors.errorLight : colors.successLight }]}
                onPress={() => handleToggleActive(farmer)}>
                <Text style={[styles.cardActionText, { color: farmer.isActive ? colors.error : colors.success }]}>
                  {farmer.isActive ? "⏸ Deactivate" : "▶️ Activate"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cardActionBtn, { backgroundColor: colors.collectorLight, flex: 1 }]}
                onPress={() => { setSelectedFarmer(farmer); setShowDetailModal(true); }}>
                <Text style={[styles.cardActionText, { color: colors.collectorColor }]}>👁 View Details</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👨‍🌾 Farmer Profile</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>
            {selectedFarmer && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailAvatarRow}>
                  <View style={[styles.detailAvatar, { backgroundColor: colors.collectorLight }]}>
                    <Text style={styles.detailAvatarText}>{selectedFarmer.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.detailName}>{selectedFarmer.name}</Text>
                    <Text style={styles.detailSub}>🌾 {selectedFarmer.farmName}</Text>
                  </View>
                </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📋 Personal Info</Text>
                  <DetailRow icon="🪪" label="ID Number" value={selectedFarmer.idNumber} />
                  <DetailRow icon="📱" label="Phone"     value={selectedFarmer.phone} />
                  <DetailRow icon="📍" label="Location"  value={selectedFarmer.location || "Not set"} />
                  <DetailRow icon="🌾" label="Farm Name" value={selectedFarmer.farmName} />
                </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>💳 Payment Info</Text>
                  <DetailRow icon={selectedFarmer.paymentMethod === "Mpesa" ? "📱" : selectedFarmer.paymentMethod === "Bank" ? "🏦" : "💵"}
                    label="Method" value={selectedFarmer.paymentMethod} />
                  <DetailRow icon="📅" label="Schedule" value={selectedFarmer.paymentDuration} />
                  <DetailRow icon="🔢" label="Details"  value={selectedFarmer.paymentDetails} />
                </View>
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>📊 Collection Stats</Text>
                  <View style={[styles.bigStatCard, { backgroundColor: colors.collectorLight }]}>
                    <Text style={[styles.bigStatValue, { color: colors.collectorColor }]}>{selectedFarmer.totalKgCollected || 0} kg</Text>
                    <Text style={styles.bigStatLabel}>Total Tea Collected</Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Register Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>➕ Register Farmer</Text>
                <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>📋 Personal Information</Text>
                <FField label="Full Name / Jina Kamili" icon="👤" value={formName}     onChangeText={setFormName}     placeholder="e.g. Kamau Njoroge" />
                <FField label="National ID Number"       icon="🪪" value={formIdNumber} onChangeText={setFormIdNumber} placeholder="e.g. 12345678" keyboardType="numeric" />
                <FField label="Phone / Simu"             icon="📱" value={formPhone}    onChangeText={setFormPhone}    placeholder="+254700000000" keyboardType="phone-pad" />
                <FField label="Farm Name"                icon="🌾" value={formFarmName} onChangeText={setFormFarmName} placeholder="e.g. Green Valley Farm" />
                <FField label="Location / Mahali"        icon="📍" value={formLocation} onChangeText={setFormLocation} placeholder="e.g. Kiambu" />
                <Text style={styles.sectionTitle}>💳 Payment Information</Text>
                <Text style={styles.fieldLabel}>Payment Method / Malipo</Text>
                <View style={styles.optionRow}>
                  {PAYMENT_METHODS.map(m => (
                    <TouchableOpacity key={m}
                      style={[styles.optionBtn, formPaymentMethod === m && { backgroundColor: methodColor[m], borderColor: methodColor[m] }]}
                      onPress={() => setFormPaymentMethod(m)}>
                      <Text style={[styles.optionText, formPaymentMethod === m && { color: "#fff" }]}>
                        {m === "Mpesa" ? "📱" : m === "Bank" ? "🏦" : "💵"} {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Payment Duration / Muda</Text>
                <View style={styles.optionRow}>
                  {PAYMENT_DURATIONS.map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.optionBtn, formPaymentDuration === d && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setFormPaymentDuration(d)}>
                      <Text style={[styles.optionText, formPaymentDuration === d && { color: "#fff" }]}>
                        {d === "Daily" ? "📆" : d === "Weekly" ? "🗓" : "📅"} {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FField
                  label={formPaymentMethod === "Mpesa" ? "Mpesa Number" : formPaymentMethod === "Bank" ? "Bank Account Number" : "Cash Recipient Name"}
                  icon={formPaymentMethod === "Mpesa" ? "📱" : formPaymentMethod === "Bank" ? "🏦" : "💵"}
                  value={formPaymentDetails} onChangeText={setFormPaymentDetails}
                  placeholder={formPaymentMethod === "Mpesa" ? "e.g. 0712345678" : formPaymentMethod === "Bank" ? "e.g. 1234567890" : "e.g. Kamau Njoroge"}
                  keyboardType={formPaymentMethod !== "Cash" ? "numeric" : "default"}
                />
                <TouchableOpacity style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                  onPress={handleCreate} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Register Farmer →</Text>}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

function FField({ label, icon, value, onChangeText, placeholder, keyboardType }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.inputIcon}>{icon}</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={colors.textMuted} keyboardType={keyboardType || "default"} autoCapitalize="words" autoCorrect={false} />
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={styles.detailRowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: colors.background },
  header:           { paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle:      { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:        { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  addBtn:           { backgroundColor: colors.secondary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.full, ...shadows.md },
  addBtnText:       { color: "#fff", fontWeight: "800", fontSize: fonts.sizes.sm },
  statsRow:         { flexDirection: "row", justifyContent: "space-around", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  statPill:         { alignItems: "center", flex: 1 },
  statPillValue:    { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
  statPillLabel:    { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  statPillDivider:  { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.25)" },
  filterPill:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: "transparent" },
  filterPillActive:     { backgroundColor: "#fff" },
  filterPillText:       { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.9)", fontWeight: "600" },
  filterPillTextActive: { color: colors.collectorColor, fontWeight: "700" },
  searchWrap:       { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:       { fontSize: 16, marginRight: 8 },
  searchInput:      { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  scroll:           { flex: 1 },
  scrollContent:    { padding: spacing.md },
  farmerCard:         { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  farmerCardInactive: { opacity: 0.7, borderLeftWidth: 3, borderLeftColor: colors.textMuted },
  cardTop:          { flexDirection: "row", marginBottom: spacing.sm },
  farmerAvatar:     { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginRight: 12 },
  farmerAvatarText: { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.collectorColor },
  cardInfo:         { flex: 1 },
  cardNameRow:      { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 },
  farmerName:       { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  statusBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  statusText:       { fontSize: 10, fontWeight: "700" },
  cardSub:          { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  cardStatsRow:     { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.sm },
  cardStat:         { flex: 1, borderRadius: radius.sm, padding: 8, alignItems: "center" },
  cardStatValue:    { fontSize: 12, fontWeight: "800", textAlign: "center" },
  cardStatLabel:    { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  cardActions:      { flexDirection: "row", gap: spacing.xs },
  cardActionBtn:    { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: "center" },
  cardActionText:   { fontSize: 12, fontWeight: "700" },
  emptyState:       { alignItems: "center", paddingTop: 80 },
  emptyIcon:        { fontSize: 64, marginBottom: 12 },
  emptyTitle:       { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:         { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6 },
  modalOverlay:     { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalWrap:        { maxHeight: "94%" },
  modalCard:        { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "100%" },
  modalHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:       { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:       { fontSize: 20, color: colors.textMuted, padding: 4 },
  detailModal:      { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "85%", marginTop: "auto" },
  detailAvatarRow:  { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailAvatar:     { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  detailAvatarText: { fontSize: 28, fontWeight: "900", color: colors.collectorColor },
  detailName:       { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  detailSub:        { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 2 },
  detailSection:     { marginBottom: spacing.md },
  detailSectionTitle:{ fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.collectorColor, marginBottom: spacing.sm },
  detailRow:         { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailRowIcon:     { fontSize: 18, marginRight: 12, marginTop: 1 },
  detailRowLabel:    { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  detailRowValue:    { fontSize: fonts.sizes.sm, color: colors.textPrimary, fontWeight: "700", marginTop: 2 },
  bigStatCard:       { borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  bigStatValue:      { fontSize: 32, fontWeight: "900" },
  bigStatLabel:      { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 4 },
  sectionTitle:      { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary, marginBottom: spacing.sm, marginTop: spacing.sm },
  fieldGroup:        { marginBottom: 14 },
  fieldLabel:        { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputWrap:         { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  inputIcon:         { fontSize: 16, marginRight: 10 },
  input:             { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  optionRow:         { flexDirection: "row", gap: spacing.xs },
  optionBtn:         { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  optionText:        { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  submitBtn:         { backgroundColor: colors.collectorColor, borderRadius: radius.md, height: 54, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  submitBtnDisabled: { backgroundColor: colors.collectorLight },
  submitBtnText:     { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});