// ─── Employees Screen — TeaFarm Pro ──────────────────────────────────────────
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
import { createEmployeeAccount, toggleEmployeeAccess, COLLECTIONS } from "../../firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { UserRole } from "../../types";
import TeaLoader from "../../components/TeaLoader";
import { useLoader } from "../../context/LoaderContext";

const db   = getFirestore();
const auth = getAuth();
const { width } = Dimensions.get("window");

const ROLES: { role: UserRole; label: string; icon: string; color: string; bg: string; desc: string }[] = [
  { role: "admin",                label: "Admin",                icon: "👑", color: colors.adminColor,     bg: colors.adminLight,     desc: "Full system access. Can manage all operations." },
  { role: "collector_supervisor", label: "Collector Supervisor", icon: "🧺", color: colors.collectorColor, bg: colors.collectorLight, desc: "Manages pluckers, records tea collection & payments." },
  { role: "sales_supervisor",     label: "Sales Supervisor",     icon: "💼", color: colors.salesColor,     bg: colors.salesLight,     desc: "Handles grading, weighing & selling to factories." },
  { role: "main_supervisor",      label: "Main Supervisor",      icon: "📊", color: colors.supervisorColor,bg: colors.supervisorLight,desc: "Read-only access to all reports." },
];

interface Employee {
  id:             string;
  name:           string;
  email:          string;
  role:           UserRole;
  phone:          string;
  isActive:       boolean;
  isDeactivated?: boolean;
  createdAt:      any;
}

export default function EmployeesScreen() {
  const { showLoader, hideLoader } = useLoader();
  const [employees,    setEmployees]   = useState<Employee[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [refreshing,   setRefreshing]  = useState(false);
  const [showModal,    setShowModal]   = useState(false);
  const [filterRole,   setFilterRole]  = useState<UserRole | "all">("all");
  const [searchQuery,  setSearchQuery] = useState("");
  const [formName,     setFormName]    = useState("");
  const [formEmail,    setFormEmail]   = useState("");
  const [formPhone,    setFormPhone]   = useState("");
  const [formPassword, setFormPassword]= useState("");
  const [formRole,     setFormRole]    = useState<UserRole>("collector_supervisor");
  const [showPass,     setShowPass]    = useState(false);
  const [saving,       setSaving]      = useState(false);

  const orgIdRef    = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef  = useRef("");

  // ── Load employees ─────────────────────────────────────────────────────────
  const loadEmployees = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // ── FIX: Direct doc fetch instead of where("__name__") ───────────────
      const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";

      orgIdRef.current    = oid;
      actorNameRef.current = me.name || "Admin";
      actorIdRef.current  = uid;

      if (!oid) return;

      // ── FIX: No orderBy — sort in JS instead ─────────────────────────────
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.USERS), where("organizationId", "==", oid))
      );

      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Employee))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });

      setEmployees(sorted);
    } catch (e: any) {
      console.log("Load employees error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleRefresh = () => { setRefreshing(true); loadEmployees(); };

  // ── Create employee ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formName.trim())        return Alert.alert("Required", "Full name is required.");
    if (!formEmail.trim())       return Alert.alert("Required", "Email is required.");
    if (!formPhone.trim())       return Alert.alert("Required", "Phone is required.");
    if (formPassword.length < 6) return Alert.alert("Required", "Password must be at least 6 characters.");

    setSaving(true);
    showLoader("Creating employee account...");
    try {
      await createEmployeeAccount(
        formName.trim(), formEmail.trim(), formPassword,
        formRole, formPhone.trim(),
        orgIdRef.current, actorNameRef.current, actorIdRef.current,
      );
      setShowModal(false);
      resetForm();
      Alert.alert("✅ Success", `${formName.trim()} account created successfully.`);
      await loadEmployees();
    } catch (e: any) {
      let msg = "Failed to create account.";
      if (e.code === "auth/email-already-in-use") msg = "This email is already registered.";
      else if (e.message) msg = e.message;
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
      hideLoader();
    }
  };

  // ── Restrict / Enable ──────────────────────────────────────────────────────
  const handleToggleAccess = (emp: Employee) => {
    if (emp.isDeactivated) {
      Alert.alert("Deactivated", "This account is permanently deactivated and cannot be changed.");
      return;
    }
    Alert.alert(
      emp.isActive ? "⚠️ Restrict Account" : "✅ Enable Account",
      emp.isActive
        ? `Restricting ${emp.name} will temporarily block their login. You can re-enable anytime.`
        : `This will restore ${emp.name}'s login access.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: emp.isActive ? "Restrict" : "Enable",
          style: emp.isActive ? "destructive" : "default",
          onPress: async () => {
            showLoader(emp.isActive ? "Restricting account..." : "Enabling account...");
            try {
              await toggleEmployeeAccess(emp.id, !emp.isActive, orgIdRef.current, actorNameRef.current, actorIdRef.current);
              setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isActive: !emp.isActive } : e));
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to update access.");
              await loadEmployees();
            } finally { hideLoader(); }
          },
        },
      ]
    );
  };

  // ── Deactivate permanently ─────────────────────────────────────────────────
  const handleDeactivate = (emp: Employee) => {
    if (emp.isDeactivated) {
      Alert.alert("Already Deactivated", `${emp.name}'s account is already permanently deactivated.`);
      return;
    }
    Alert.alert(
      "🚫 Permanently Deactivate",
      `This will permanently remove ${emp.name} from the active roster.\n\nThis action CANNOT be undone. Are you sure?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            showLoader("Deactivating account...");
            try {
              await updateDoc(doc(db, COLLECTIONS.USERS, emp.id), {
                isActive: false, isDeactivated: true,
                deactivatedAt: serverTimestamp(), deactivatedBy: actorNameRef.current,
              });
              await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
                actorId: actorIdRef.current, actorName: actorNameRef.current,
                actorRole: "admin",
                action: `Permanently deactivated employee: ${emp.name} (${emp.role})`,
                module: "employees", outcome: "success",
                organizationId: orgIdRef.current, createdAt: serverTimestamp(),
              });
              setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isActive: false, isDeactivated: true } : e));
              Alert.alert("✅ Done", `${emp.name} has been permanently deactivated.`);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to deactivate.");
              await loadEmployees();
            } finally { hideLoader(); }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone("");
    setFormPassword(""); setFormRole("collector_supervisor"); setShowPass(false);
  };

  const filtered = employees.filter(e => {
    const matchRole   = filterRole === "all" || e.role === filterRole;
    const matchSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchRole && matchSearch;
  });

  const getRoleConfig    = (role: UserRole) => ROLES.find(r => r.role === role) || ROLES[0];
  const countByRole      = (role: UserRole) => employees.filter(e => e.role === role).length;
  const activeCount      = employees.filter(e => e.isActive && !e.isDeactivated).length;
  const restrictedCount  = employees.filter(e => !e.isActive && !e.isDeactivated).length;
  const deactivatedCount = employees.filter(e => e.isDeactivated).length;

  if (loading) return <TeaLoader message="Loading Employees..." />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>👥 Employees</Text>
            <Text style={styles.headerSub}>
              {activeCount} active · {restrictedCount} restricted · {deactivatedCount} deactivated
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleSummary}>
          <TouchableOpacity
            style={[styles.rolePill, filterRole === "all" && styles.rolePillActive]}
            onPress={() => setFilterRole("all")}
          >
            <Text style={[styles.rolePillText, filterRole === "all" && styles.rolePillTextActive]}>
              All ({employees.length})
            </Text>
          </TouchableOpacity>
          {ROLES.map(r => (
            <TouchableOpacity key={r.role}
              style={[styles.rolePill, filterRole === r.role && styles.rolePillActive]}
              onPress={() => setFilterRole(r.role)}
            >
              <Text style={{ fontSize: 13 }}>{r.icon}</Text>
              <Text style={[styles.rolePillText, filterRole === r.role && { color: r.color, fontWeight: "700" }]}>
                {r.label.split(" ")[0]} ({countByRole(r.role)})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Search by name or email..."
          placeholderTextColor={colors.textMuted} value={searchQuery}
          onChangeText={setSearchQuery} autoCapitalize="none" />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Employee List ── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>No employees found</Text>
            <Text style={styles.emptySub}>Tap "+ Add" to create the first account</Text>
          </View>
        ) : (
          filtered.map(emp => {
            const rc            = getRoleConfig(emp.role);
            const isDeactivated = emp.isDeactivated === true;
            return (
              <View key={emp.id} style={[
                styles.empCard,
                isDeactivated                   && styles.empCardDeactivated,
                !emp.isActive && !isDeactivated && styles.empCardRestricted,
              ]}>
                <View style={styles.empTop}>
                  <View style={[styles.empAvatar, { backgroundColor: isDeactivated ? colors.earthPale : rc.bg }]}>
                    <Text style={[styles.empAvatarText, isDeactivated && { color: colors.textMuted }]}>
                      {emp.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.empInfo}>
                    <View style={styles.empNameRow}>
                      <Text style={[styles.empName, isDeactivated && { color: colors.textMuted }]}>{emp.name}</Text>
                      {isDeactivated            && <View style={styles.deactivatedBadge}><Text style={styles.deactivatedText}>🚫 Deactivated</Text></View>}
                      {!emp.isActive && !isDeactivated && <View style={styles.restrictedBadge}><Text style={styles.restrictedText}>🔒 Restricted</Text></View>}
                      {emp.isActive  && !isDeactivated && <View style={styles.activeBadge}><Text style={styles.activeText}>✅ Active</Text></View>}
                    </View>
                    <Text style={styles.empEmail}>{emp.email}</Text>
                    <Text style={styles.empPhone}>📱 {emp.phone}</Text>
                  </View>
                </View>

                <View style={[styles.roleRowWrap, { backgroundColor: rc.bg + "99" }]}>
                  <Text style={styles.roleBadgeIcon}>{rc.icon}</Text>
                  <Text style={[styles.roleBadgeText, { color: rc.color }]}>{rc.label}</Text>
                </View>

                {!isDeactivated ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: emp.isActive ? colors.warningLight : colors.successLight, flex: 1 }]}
                      onPress={() => handleToggleAccess(emp)}
                    >
                      <Text style={[styles.actionBtnText, { color: emp.isActive ? colors.warning : colors.success }]}>
                        {emp.isActive ? "🔒 Restrict" : "✅ Enable"}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.actionDivider} />
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.errorLight, flex: 1 }]}
                      onPress={() => handleDeactivate(emp)}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>🚫 Deactivate</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.deactivatedNote}>
                    <Text style={styles.deactivatedNoteText}>Permanently removed from active roster</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Create Employee Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>➕ Create Employee Account</Text>
                <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalSectionTitle}>👤 Select Role</Text>
                <View style={styles.roleGrid}>
                  {ROLES.map(r => (
                    <TouchableOpacity key={r.role}
                      style={[styles.roleOption, { backgroundColor: r.bg }, formRole === r.role && { borderWidth: 2, borderColor: r.color }]}
                      onPress={() => setFormRole(r.role)}
                    >
                      <Text style={styles.roleOptionIcon}>{r.icon}</Text>
                      <Text style={[styles.roleOptionLabel, { color: r.color }]}>{r.label}</Text>
                      <Text style={styles.roleOptionDesc}>{r.desc}</Text>
                      {formRole === r.role && <View style={[styles.roleSelectedDot, { backgroundColor: r.color }]} />}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalSectionTitle}>📋 Personal Information</Text>
                <FormField label="Full Name / Jina Kamili" icon="👤" value={formName} onChangeText={setFormName} placeholder="e.g. Jane Wanjiku" />
                <FormField label="Phone Number / Simu" icon="📱" value={formPhone} onChangeText={setFormPhone} placeholder="+254700000000" keyboardType="phone-pad" />

                <Text style={styles.modalSectionTitle}>🔐 Login Credentials</Text>
                <FormField label="Email Address / Barua Pepe" icon="✉️" value={formEmail} onChangeText={setFormEmail}
                  placeholder="employee@email.com" keyboardType="email-address" autoCapitalize="none" />
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Password / Nenosiri</Text>
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputIcon}>🔒</Text>
                    <TextInput style={styles.input} value={formPassword} onChangeText={setFormPassword}
                      placeholder="Min. 6 characters" placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showPass} autoCapitalize="none" />
                    <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 4 }}>
                      <Text style={{ fontSize: 16 }}>{showPass ? "🙈" : "👁️"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                  onPress={handleCreate} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Create Account →</Text>}
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

function FormField({ label, icon, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.inputIcon}>{icon}</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={colors.textMuted} keyboardType={keyboardType || "default"}
          autoCapitalize={autoCapitalize || "words"} autoCorrect={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  header:        { backgroundColor: colors.primary, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle:   { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:     { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  addBtn:        { backgroundColor: colors.secondary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.full, ...shadows.md },
  addBtnText:    { color: "#fff", fontWeight: "800", fontSize: fonts.sizes.sm },
  roleSummary:        { marginBottom: 4 },
  rolePill:           { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.15)", marginRight: 8, borderWidth: 1, borderColor: "transparent", marginBottom: 8 },
  rolePillActive:     { backgroundColor: "#fff" },
  rolePillText:       { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  rolePillTextActive: { color: colors.primary },
  searchWrap:    { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:    { fontSize: 16, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  empCard:            { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.md },
  empCardRestricted:  { borderLeftWidth: 4, borderLeftColor: colors.warning },
  empCardDeactivated: { borderLeftWidth: 4, borderLeftColor: colors.error, opacity: 0.65 },
  empTop:        { flexDirection: "row", marginBottom: spacing.sm },
  empAvatar:     { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  empAvatarText: { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.primary },
  empInfo:       { flex: 1 },
  empNameRow:    { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 },
  empName:       { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  activeBadge:      { backgroundColor: colors.successLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  activeText:       { fontSize: 10, color: colors.success, fontWeight: "700" },
  restrictedBadge:  { backgroundColor: colors.warningLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  restrictedText:   { fontSize: 10, color: colors.warning, fontWeight: "700" },
  deactivatedBadge: { backgroundColor: colors.errorLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  deactivatedText:  { fontSize: 10, color: colors.error, fontWeight: "700" },
  empEmail:      { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  empPhone:      { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 1 },
  roleRowWrap:   { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, marginBottom: spacing.sm },
  roleBadgeIcon: { fontSize: 14 },
  roleBadgeText: { fontSize: 12, fontWeight: "700" },
  actionsRow:    { flexDirection: "row", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  actionBtn:     { paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
  actionDivider: { width: 1, backgroundColor: colors.border },
  deactivatedNote:     { backgroundColor: colors.errorLight, borderRadius: radius.sm, paddingVertical: 8, alignItems: "center" },
  deactivatedNoteText: { fontSize: 11, color: colors.error, fontWeight: "600" },
  emptyState:    { alignItems: "center", paddingTop: 80 },
  emptyIcon:     { fontSize: 64, marginBottom: 12 },
  emptyTitle:    { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:      { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6 },
  modalOverlay:  { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalWrap:     { maxHeight: "92%" },
  modalCard:     { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "100%" },
  modalHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:        { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:        { fontSize: 20, color: colors.textMuted, padding: 4 },
  modalSectionTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary, marginBottom: spacing.sm, marginTop: spacing.sm },
  roleGrid:        { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  roleOption:      { width: (width - spacing.md * 2 - spacing.sm * 3) / 2, borderRadius: radius.md, padding: spacing.sm, position: "relative" },
  roleOptionIcon:  { fontSize: 24, marginBottom: 4 },
  roleOptionLabel: { fontSize: fonts.sizes.sm, fontWeight: "800", marginBottom: 4 },
  roleOptionDesc:  { fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  roleSelectedDot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: 5 },
  fieldGroup:    { marginBottom: 14 },
  fieldLabel:    { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputWrap:     { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  inputIcon:     { fontSize: 16, marginRight: 10 },
  input:         { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  submitBtn:         { backgroundColor: colors.primary, borderRadius: radius.md, height: 54, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  submitBtnDisabled: { backgroundColor: colors.primaryPale },
  submitBtnText:     { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});