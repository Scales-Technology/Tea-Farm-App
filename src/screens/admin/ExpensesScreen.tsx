// ─── Expenses & Farm Inputs Screen — TeaFarm Pro ─────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  addDoc, serverTimestamp, doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import TeaLoader from "../../components/TeaLoader";

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");

type ActiveTab = "expenses" | "inputs";

const EXPENSE_CATEGORIES = [
  { label: "Wages / Mishahara",         icon: "👷", color: "#E8650A" },
  { label: "Transport / Usafiri",        icon: "🚛", color: "#0A7BE8" },
  { label: "Maintenance / Matengenezo", icon: "🔧", color: "#6B0AE8" },
  { label: "Utilities / Huduma",         icon: "💡", color: "#E8C40A" },
  { label: "Other / Nyingine",           icon: "📋", color: "#6B7280" },
];

const INPUT_CATEGORIES = [
  { label: "Fertilizer / Mbolea", icon: "🌱", color: "#16A34A" },
  { label: "Seedlings / Miche",   icon: "🌿", color: "#059669" },
  { label: "Tools / Zana",        icon: "🔨", color: "#92400E" },
  { label: "Pesticides / Dawa",   icon: "🧴", color: "#B91C1C" },
  { label: "Other / Nyingine",    icon: "📦", color: "#6B7280" },
];

const UNITS = ["kg", "litres", "bags", "pieces", "boxes", "bundles"];

interface Expense {
  id: string; description: string; category: string;
  amount: number; createdAt: any; createdBy: string; notes?: string;
}
interface FarmInput {
  id: string; itemName: string; category: string; quantity: number;
  unit: string; supplierName: string; cost: number;
  createdAt: any; createdBy: string; notes?: string;
}

export default function ExpensesScreen() {
  const [activeTab,  setActiveTab]  = useState<ActiveTab>("expenses");
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [inputs,     setInputs]     = useState<FarmInput[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");

  // Expense modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [expDesc,      setExpDesc]      = useState("");
  const [expCategory,  setExpCategory]  = useState(EXPENSE_CATEGORIES[0].label);
  const [expAmount,    setExpAmount]    = useState("");
  const [expNotes,     setExpNotes]     = useState("");
  const [savingExp,    setSavingExp]    = useState(false);

  // Input modal
  const [showInputModal, setShowInputModal] = useState(false);
  const [inpItem,        setInpItem]        = useState("");
  const [inpCategory,    setInpCategory]    = useState(INPUT_CATEGORIES[0].label);
  const [inpQuantity,    setInpQuantity]    = useState("");
  const [inpUnit,        setInpUnit]        = useState("kg");
  const [inpSupplier,    setInpSupplier]    = useState("");
  const [inpCost,        setInpCost]        = useState("");
  const [inpNotes,       setInpNotes]       = useState("");
  const [savingInp,      setSavingInp]      = useState(false);

  const loadData = useCallback(async () => {
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

      const [expSnap, inpSnap] = await Promise.all([
        getDocs(query(collection(db, "expenses"),    where("organizationId", "==", oid))),
        getDocs(query(collection(db, "farm_inputs"), where("organizationId", "==", oid))),
      ]);

      setExpenses(
        expSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Expense))
          .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0))
      );
      setInputs(
        inpSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FarmInput))
          .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0))
      );
    } catch (e: any) {
      console.log("Load expenses error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const handleRefresh = () => { setRefreshing(true); loadData(); };

  const handleAddExpense = async () => {
    if (!expDesc.trim())   return Alert.alert("Required", "Description is required.");
    if (!expAmount.trim()) return Alert.alert("Required", "Amount is required.");
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) return Alert.alert("Invalid", "Enter a valid amount.");

    setSavingExp(true);
    try {
      const ref = await addDoc(collection(db, "expenses"), {
        description:    expDesc.trim(),
        category:       expCategory,
        amount:         amt,
        notes:          expNotes.trim(),
        organizationId: orgIdRef.current,
        createdAt:      serverTimestamp(),
        createdBy:      actorNameRef.current,
        createdById:    actorIdRef.current,
      });

      await addDoc(collection(db, "audit_logs"), {
        actorId:        actorIdRef.current,
        actorName:      actorNameRef.current,
        actorRole:      "admin",
        action:         `Recorded expense: ${expDesc.trim()} — KSh ${amt.toLocaleString()}`,
        module:         "expenses",
        outcome:        "success",
        organizationId: orgIdRef.current,
        createdAt:      serverTimestamp(),
        referenceId:    ref.id,
      });

      setExpenses(prev => [{
        id: ref.id, description: expDesc.trim(), category: expCategory,
        amount: amt, notes: expNotes.trim(), createdAt: new Date(), createdBy: actorNameRef.current,
      }, ...prev]);

      Alert.alert("✅ Expense Recorded", `KSh ${amt.toLocaleString()} added successfully.`);
      setShowExpModal(false);
      setExpDesc(""); setExpAmount(""); setExpNotes("");
      setExpCategory(EXPENSE_CATEGORIES[0].label);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to record expense.");
    } finally { setSavingExp(false); }
  };

  const handleAddInput = async () => {
    if (!inpItem.trim())     return Alert.alert("Required", "Item name is required.");
    if (!inpQuantity.trim()) return Alert.alert("Required", "Quantity is required.");
    const qty  = parseFloat(inpQuantity);
    const cost = parseFloat(inpCost) || 0;
    if (isNaN(qty) || qty <= 0) return Alert.alert("Invalid", "Enter a valid quantity.");

    setSavingInp(true);
    try {
      const ref = await addDoc(collection(db, "farm_inputs"), {
        itemName:       inpItem.trim(),
        category:       inpCategory,
        quantity:       qty,
        unit:           inpUnit,
        supplierName:   inpSupplier.trim(),
        cost,
        notes:          inpNotes.trim(),
        organizationId: orgIdRef.current,
        createdAt:      serverTimestamp(),
        createdBy:      actorNameRef.current,
        createdById:    actorIdRef.current,
      });

      await addDoc(collection(db, "audit_logs"), {
        actorId:        actorIdRef.current,
        actorName:      actorNameRef.current,
        actorRole:      "admin",
        action:         `Recorded farm input: ${inpItem.trim()} — ${qty} ${inpUnit}`,
        module:         "farm_inputs",
        outcome:        "success",
        organizationId: orgIdRef.current,
        createdAt:      serverTimestamp(),
        referenceId:    ref.id,
      });

      setInputs(prev => [{
        id: ref.id, itemName: inpItem.trim(), category: inpCategory,
        quantity: qty, unit: inpUnit, supplierName: inpSupplier.trim(),
        cost, notes: inpNotes.trim(), createdAt: new Date(), createdBy: actorNameRef.current,
      }, ...prev]);

      Alert.alert("✅ Input Recorded", `${inpItem.trim()} recorded successfully.`);
      setShowInputModal(false);
      setInpItem(""); setInpQuantity(""); setInpUnit("kg");
      setInpSupplier(""); setInpCost(""); setInpNotes("");
      setInpCategory(INPUT_CATEGORIES[0].label);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to record farm input.");
    } finally { setSavingInp(false); }
  };

  const totalExpenses  = expenses.reduce((s, e) => s + e.amount, 0);
  const totalInputCost = inputs.reduce((s, i) => s + i.cost,     0);

  const expCatGroups: Record<string, number> = {};
  expenses.forEach(e => { expCatGroups[e.category] = (expCatGroups[e.category] || 0) + e.amount; });

  const formatDate = (ts: any): string => {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };

  const getCatConfig = (cat: string, isInput = false) => {
    const list = isInput ? INPUT_CATEGORIES : EXPENSE_CATEGORIES;
    return list.find(c => c.label === cat) || list[list.length - 1];
  };

  // ── TEALOADER replaces ActivityIndicator ─────────────────────────────────
  if (loading) return <TeaLoader message="Loading Expenses & Records..." subMessage="Admin" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.salesColor }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>💰 Expenses & Inputs</Text>
            <Text style={styles.headerSub}>Farm financial records & resources</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => activeTab === "expenses" ? setShowExpModal(true) : setShowInputModal(true)}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>KSh {totalExpenses.toLocaleString()}</Text>
            <Text style={styles.summaryLbl}>Total Expenses</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{inputs.length}</Text>
            <Text style={styles.summaryLbl}>Input Records</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>KSh {totalInputCost.toLocaleString()}</Text>
            <Text style={styles.summaryLbl}>Input Costs</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "expenses" && styles.tabBtnActive]}
            onPress={() => setActiveTab("expenses")}
          >
            <Text style={[styles.tabText, activeTab === "expenses" && styles.tabTextActive]}>
              📉 Expenses ({expenses.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "inputs" && styles.tabBtnActive]}
            onPress={() => setActiveTab("inputs")}
          >
            <Text style={[styles.tabText, activeTab === "inputs" && styles.tabTextActive]}>
              🌱 Farm Inputs ({inputs.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            colors={[colors.salesColor]} tintColor={colors.salesColor} />
        }
      >
        {/* ── EXPENSES TAB ── */}
        {activeTab === "expenses" && (
          <>
            {Object.keys(expCatGroups).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>📊 By Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                  {Object.entries(expCatGroups)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt]) => {
                      const cfg = getCatConfig(cat);
                      const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                      return (
                        <View key={cat} style={[styles.catCard, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
                          <Text style={styles.catIcon}>{cfg.icon}</Text>
                          <Text style={[styles.catAmt, { color: cfg.color }]}>KSh {amt.toLocaleString()}</Text>
                          <Text style={styles.catLabel}>{cat.split(" / ")[0]}</Text>
                          <Text style={[styles.catPct, { color: cfg.color }]}>{Math.round(pct)}%</Text>
                        </View>
                      );
                    })}
                </ScrollView>
              </>
            )}

            <Text style={styles.sectionTitle}>📋 All Expenses ({expenses.length})</Text>
            {expenses.length === 0 ? (
              <EmptyState icon="📉" text="No expenses recorded yet" sub="Tap '+ Add' to record an expense" />
            ) : (
              expenses.map(exp => {
                const cfg = getCatConfig(exp.category);
                return (
                  <View key={exp.id} style={styles.recordCard}>
                    <View style={[styles.recordIconWrap, { backgroundColor: cfg.color + "18" }]}>
                      <Text style={styles.recordIcon}>{cfg.icon}</Text>
                    </View>
                    <View style={styles.recordInfo}>
                      <Text style={styles.recordTitle}>{exp.description}</Text>
                      <Text style={[styles.recordCat, { color: cfg.color }]}>{exp.category.split(" / ")[0]}</Text>
                      <Text style={styles.recordMeta}>📅 {formatDate(exp.createdAt)} · by {exp.createdBy}</Text>
                      {exp.notes ? <Text style={styles.recordNotes}>💬 {exp.notes}</Text> : null}
                    </View>
                    <View style={styles.recordAmtWrap}>
                      <Text style={[styles.recordAmt, { color: colors.error }]}>KSh {exp.amount.toLocaleString()}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── FARM INPUTS TAB ── */}
        {activeTab === "inputs" && (
          <>
            <Text style={styles.sectionTitle}>🌱 Farm Input Records ({inputs.length})</Text>
            {inputs.length === 0 ? (
              <EmptyState icon="🌱" text="No farm inputs recorded yet" sub="Tap '+ Add' to record a farm input" />
            ) : (
              inputs.map(inp => {
                const cfg = getCatConfig(inp.category, true);
                return (
                  <View key={inp.id} style={styles.recordCard}>
                    <View style={[styles.recordIconWrap, { backgroundColor: cfg.color + "18" }]}>
                      <Text style={styles.recordIcon}>{cfg.icon}</Text>
                    </View>
                    <View style={styles.recordInfo}>
                      <Text style={styles.recordTitle}>{inp.itemName}</Text>
                      <Text style={[styles.recordCat, { color: cfg.color }]}>{inp.category.split(" / ")[0]}</Text>
                      <Text style={styles.recordMeta}>
                        ⚖️ {inp.quantity} {inp.unit}{inp.supplierName ? ` · 🏪 ${inp.supplierName}` : ""}
                      </Text>
                      <Text style={styles.recordMeta}>📅 {formatDate(inp.createdAt)} · by {inp.createdBy}</Text>
                      {inp.notes ? <Text style={styles.recordNotes}>💬 {inp.notes}</Text> : null}
                    </View>
                    <View style={styles.recordAmtWrap}>
                      {inp.cost > 0 && (
                        <Text style={[styles.recordAmt, { color: colors.salesColor }]}>KSh {inp.cost.toLocaleString()}</Text>
                      )}
                      <Text style={styles.recordQty}>{inp.quantity} {inp.unit}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Add Expense Modal ── */}
      <Modal visible={showExpModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📉 Record Expense</Text>
                <TouchableOpacity onPress={() => setShowExpModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Category / Aina</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat.label}
                      style={[styles.catOption, { borderColor: cat.color + "60" }, expCategory === cat.label && { backgroundColor: cat.color, borderColor: cat.color }]}
                      onPress={() => setExpCategory(cat.label)}
                    >
                      <Text style={styles.catOptionIcon}>{cat.icon}</Text>
                      <Text style={[styles.catOptionText, { color: expCategory === cat.label ? "#fff" : cat.color }]}>
                        {cat.label.split(" / ")[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <EField label="Description / Maelezo" icon="📝" value={expDesc}   onChangeText={setExpDesc}   placeholder="e.g. Driver wages for July" />
                <EField label="Amount (KSh) / Kiasi"  icon="💵" value={expAmount} onChangeText={setExpAmount} placeholder="e.g. 5000" keyboardType="numeric" />
                <EField label="Notes (optional)"       icon="💬" value={expNotes}  onChangeText={setExpNotes}  placeholder="Any additional details..." multiline />
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.error }, savingExp && { opacity: 0.6 }]}
                  onPress={handleAddExpense} disabled={savingExp} activeOpacity={0.85}
                >
                  {savingExp ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Record Expense →</Text>}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Add Farm Input Modal ── */}
      <Modal visible={showInputModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🌱 Record Farm Input</Text>
                <TouchableOpacity onPress={() => setShowInputModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Category / Aina</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {INPUT_CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat.label}
                      style={[styles.catOption, { borderColor: cat.color + "60" }, inpCategory === cat.label && { backgroundColor: cat.color, borderColor: cat.color }]}
                      onPress={() => setInpCategory(cat.label)}
                    >
                      <Text style={styles.catOptionIcon}>{cat.icon}</Text>
                      <Text style={[styles.catOptionText, { color: inpCategory === cat.label ? "#fff" : cat.color }]}>
                        {cat.label.split(" / ")[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <EField label="Item Name / Jina la Bidhaa"       icon="📦" value={inpItem}     onChangeText={setInpItem}     placeholder="e.g. DAP Fertilizer" />
                <EField label="Supplier Name / Muuzaji"          icon="🏪" value={inpSupplier} onChangeText={setInpSupplier} placeholder="e.g. Agri Supplies Ltd" />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <EField label="Quantity / Kiasi" icon="⚖️" value={inpQuantity} onChangeText={setInpQuantity} placeholder="e.g. 50" keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Unit / Kipimo</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {UNITS.map(u => (
                        <TouchableOpacity key={u}
                          style={[styles.unitBtn, inpUnit === u && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                          onPress={() => setInpUnit(u)}
                        >
                          <Text style={[styles.unitText, inpUnit === u && { color: "#fff" }]}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <EField label="Cost / Gharama (KSh) - Optional" icon="💵" value={inpCost}  onChangeText={setInpCost}  placeholder="e.g. 3500" keyboardType="numeric" />
                <EField label="Notes (optional)"                 icon="💬" value={inpNotes} onChangeText={setInpNotes} placeholder="Batch number, expiry, etc." multiline />
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.success }, savingInp && { opacity: 0.6 }]}
                  onPress={handleAddInput} disabled={savingInp} activeOpacity={0.85}
                >
                  {savingInp ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Record Input →</Text>}
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

function EField({ label, icon, value, onChangeText, placeholder, keyboardType, multiline }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, multiline && { height: 80, alignItems: "flex-start", paddingVertical: 10 }]}>
        <Text style={[styles.inputIcon, multiline && { marginTop: 2 }]}>{icon}</Text>
        <TextInput style={[styles.input, multiline && { flex: 1, textAlignVertical: "top" }]}
          value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={colors.textMuted} keyboardType={keyboardType || "default"}
          autoCapitalize="sentences" autoCorrect={false} multiline={multiline} />
      </View>
    </View>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{text}</Text>
      {sub && <Text style={styles.emptySub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  header:        { paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.xs, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, ...shadows.lg },
  headerRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle:   { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:     { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  addBtn:        { backgroundColor: "#fff", paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.full, ...shadows.md },
  addBtnText:    { color: colors.salesColor, fontWeight: "800", fontSize: fonts.sizes.sm },
  summaryBar:    { flexDirection: "row", justifyContent: "space-around", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  summaryItem:   { alignItems: "center", flex: 1 },
  summaryVal:    { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
  summaryLbl:    { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  summaryDivider:{ width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.25)" },
  tabRow:        { flexDirection: "row", gap: spacing.xs, marginBottom: 8 },
  tabBtn:        { flex: 1, paddingVertical: 9, borderRadius: radius.md, alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  tabBtnActive:  { backgroundColor: "#fff" },
  tabText:       { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  tabTextActive: { color: colors.salesColor },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  sectionTitle:  { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },
  catCard:       { alignItems: "center", padding: 12, borderRadius: radius.md, marginRight: 8, borderWidth: 1, minWidth: 80 },
  catIcon:       { fontSize: 24, marginBottom: 4 },
  catAmt:        { fontSize: 12, fontWeight: "800" },
  catLabel:      { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  catPct:        { fontSize: 10, fontWeight: "700", marginTop: 2 },
  recordCard:    { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.xs, flexDirection: "row", alignItems: "flex-start", ...shadows.sm },
  recordIconWrap:{ width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 12 },
  recordIcon:    { fontSize: 22 },
  recordInfo:    { flex: 1 },
  recordTitle:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  recordCat:     { fontSize: 11, fontWeight: "600", marginTop: 2 },
  recordMeta:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  recordNotes:   { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 3, fontStyle: "italic" },
  recordAmtWrap: { alignItems: "flex-end", marginLeft: 8 },
  recordAmt:     { fontSize: fonts.sizes.sm, fontWeight: "900" },
  recordQty:     { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  emptyState:    { alignItems: "center", paddingTop: 60, paddingBottom: 20 },
  emptyIcon:     { fontSize: 52, marginBottom: 12 },
  emptyTitle:    { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary },
  emptySub:      { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6 },
  modalOverlay:  { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalWrap:     { maxHeight: "94%" },
  modalCard:     { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "100%" },
  modalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:    { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:    { fontSize: 20, color: colors.textMuted, padding: 4 },
  catOption:     { alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, marginRight: 8, borderWidth: 1.5, backgroundColor: "transparent" },
  catOptionIcon: { fontSize: 20, marginBottom: 3 },
  catOptionText: { fontSize: 11, fontWeight: "700" },
  fieldGroup:    { marginBottom: 14 },
  fieldLabel:    { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputWrap:     { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  inputIcon:     { fontSize: 16, marginRight: 10 },
  input:         { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  unitBtn:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, marginRight: 6, borderWidth: 1.5, borderColor: colors.border },
  unitText:      { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  submitBtn:     { borderRadius: radius.md, height: 54, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  submitBtnText: { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});