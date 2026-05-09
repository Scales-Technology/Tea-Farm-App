// ─── New Sale Screen — TeaFarm Pro ────────────────────────────────────────────
// STEP 3 of flow: Sell graded stock to a factory.
// Seller chooses: Grade A only / Grade B only / Both together.
// Each transaction can go to different factories at different prices/times.
// Receives: gradingId, availableA, availableB, batchNumber via navigation params.
import React, { useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
} from "react-native";
import {
  getFirestore, doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth }  from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { COLLECTIONS } from "../../firebase/auth";
import { useLoader } from "../../context/LoaderContext";
import { offlineSave } from "../../utils/offlineSave";
import NetInfo       from "@react-native-community/netinfo";

const db   = getFirestore();
const auth = getAuth();

type SellMode = "both" | "A_only" | "B_only";

export default function NewSaleScreen({ navigation, route }: any) {
  const { gradingId, availableA, availableB, batchNumber } = route.params;
  const { showLoader, hideLoader } = useLoader();

  const [sellMode,    setSellMode]    = useState<SellMode>("both");
  const [aKgStr,      setAKgStr]      = useState(availableA > 0 ? String(availableA) : "");
  const [bKgStr,      setBKgStr]      = useState(availableB > 0 ? String(availableB) : "");
  const [priceA,      setPriceA]      = useState("");
  const [priceB,      setPriceB]      = useState("");
  const [buyerName,   setBuyerName]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isOffline,   setIsOffline]   = useState(false);

  const orgId   = useRef(""); const actor = useRef(""); const actorId = useRef("");

  // ── Computed values ────────────────────────────────────────────────────────
  const aKg  = sellMode === "B_only" ? 0 : (parseFloat(aKgStr) || 0);
  const bKg  = sellMode === "A_only" ? 0 : (parseFloat(bKgStr) || 0);
  const pA   = parseFloat(priceA) || 0;
  const pB   = parseFloat(priceB) || 0;
  const revA = aKg * pA;
  const revB = bKg * pB;
  const totalRev = revA + revB;
  const totalKg  = aKg + bKg;

  const aOver = aKg > availableA;
  const bOver = bKg > availableB;
  const hasError = aOver || bOver;

  const canSave = buyerName.trim().length > 0 && totalKg > 0 && !hasError &&
    (sellMode === "B_only" || (aKg > 0 && pA > 0)) &&
    (sellMode === "A_only" || (bKg > 0 && pB > 0));

  const loadActor = async () => {
    if (orgId.current) return;
    const uid = auth.currentUser?.uid; if (!uid) return;
    const uSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (!uSnap.exists()) return;
    const u = uSnap.data()!;
    orgId.current   = u.organizationId || "";
    actor.current   = u.name || "Sales Supervisor";
    actorId.current = uid;
  };

  // ── Save — offline-first ───────────────────────────────────────────────────
  const handleSave = async () => {
    setShowConfirm(false);
    await loadActor();
    if (!orgId.current) return Alert.alert("Error", "Organization not found.");

    setSaving(true);
    showLoader("Recording sale...");
    try {
      // ── Check connectivity ────────────────────────────────────────────
      const network = await NetInfo.fetch();
      const online  = !!network.isConnected && !!network.isInternetReachable;
      setIsOffline(!online);

      const today = new Date().toISOString().split("T")[0];

      const saleData = {
        gradingId,
        batchNumber:    batchNumber || "",
        gradeA_kg:      aKg,
        gradeB_kg:      bKg,
        priceA_per_kg:  pA,
        priceB_per_kg:  pB,
        totalAmount:    totalRev,
        buyerName:      buyerName.trim(),
        sellMode,
        notes:          notes.trim(),
        soldBy:         actor.current,
        date:           today,
        organizationId: orgId.current,
      };

      // ── offlineSave: Firestore when online, queue when offline ────────
      const result = await offlineSave(COLLECTIONS.SALES, saleData);

      // Audit log — also offline-safe
      await offlineSave(COLLECTIONS.AUDIT_LOGS, {
        actorId:        actorId.current,
        actorName:      actor.current,
        actorRole:      "sales_supervisor",
        action:         `Sale from ${batchNumber}: A=${aKg}kg B=${bKg}kg → ${buyerName} KSh${totalRev}`,
        module:         "sales",
        outcome:        "success",
        organizationId: orgId.current,
        referenceId:    result.id || batchNumber,
      });

      if (!online) {
        // Offline — queued, will sync automatically on reconnect
        Alert.alert(
          "📴 Sale Queued Offline",
          `${totalKg.toFixed(1)} kg sale to ${buyerName} saved on your device.\n\nKSh ${totalRev.toLocaleString()} will be recorded when you reconnect.`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        // Online — saved to Firestore immediately
        Alert.alert(
          "✅ Sale Recorded!",
          `${totalKg.toFixed(1)} kg sold to ${buyerName}\nRevenue: KSh ${totalRev.toLocaleString()}`,
          [{ text: "Done", onPress: () => navigation.goBack() }]
        );
      }

    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save sale.");
    } finally {
      setSaving(false);
      hideLoader();
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={s.hRow}>
          <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.hTitle}>💰 Record Sale</Text>
            <Text style={s.hSub}>Batch: {batchNumber}</Text>
          </View>
        </View>

        {/* Flow hint */}
        <View style={s.flowHint}>
          <View style={[s.fStep, { opacity: 0.5 }]}>
            <Text style={s.fNum}>1</Text><Text style={s.fLbl}>Grade Tea</Text>
          </View>
          <Text style={s.fArrow}>→</Text>
          <View style={s.fStep}>
            <Text style={s.fNum}>2</Text><Text style={s.fLbl}>Sell to Factory</Text>
          </View>
        </View>

        {/* Offline banner */}
        {isOffline && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineBannerText}>📴 Offline — sale will sync when reconnected</Text>
          </View>
        )}

        {/* Available stock pills */}
        <View style={s.availRow}>
          <View style={[s.availPill, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Text style={s.availPillIcon}>🅰️</Text>
            <Text style={s.availPillVal}>{availableA.toFixed(1)} kg</Text>
            <Text style={s.availPillLbl}>Grade A available</Text>
          </View>
          <View style={[s.availPill, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Text style={s.availPillIcon}>🅱️</Text>
            <Text style={s.availPillVal}>{availableB.toFixed(1)} kg</Text>
            <Text style={s.availPillLbl}>Grade B available</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── SELL MODE ── */}
        <Text style={s.secTitle}>📦 What are you selling?</Text>
        <View style={s.modeGrid}>
          {([
            { key: "both",   icon: "🅰️🅱️", title: "Grade A + B",  sub: "Sell both grades together to one buyer" },
            { key: "A_only", icon: "🅰️",   title: "Grade A Only", sub: "Sell only Grade A, keep B for later" },
            { key: "B_only", icon: "🅱️",   title: "Grade B Only", sub: "Sell only Grade B, keep A for later" },
          ] as { key: SellMode; icon: string; title: string; sub: string }[]).map(m => (
            <TouchableOpacity key={m.key}
              style={[s.modeCard, sellMode === m.key && s.modeCardActive]}
              onPress={() => setSellMode(m.key)} activeOpacity={0.8}>
              <Text style={s.modeCardIcon}>{m.icon}</Text>
              <Text style={[s.modeCardTitle, sellMode === m.key && { color: colors.salesColor }]}>{m.title}</Text>
              <Text style={s.modeCardSub}>{m.sub}</Text>
              {sellMode === m.key && (
                <View style={s.modeCheck}><Text style={{ fontSize: 14 }}>✅</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── BUYER ── */}
        <Text style={s.secTitle}>🏭 Buyer / Factory</Text>
        <View style={s.fieldWrap}>
          <Text style={s.fieldIcon}>🏭</Text>
          <TextInput style={s.fieldInput} value={buyerName} onChangeText={setBuyerName}
            placeholder="e.g. Kipchoge Tea Factory" placeholderTextColor={colors.textMuted}
            autoCapitalize="words" />
        </View>

        {/* ── GRADE A ── */}
        {sellMode !== "B_only" && (
          <View style={[s.gradeSection, { borderColor: colors.success + "60" }]}>
            <View style={[s.gradeSectionHeader, { backgroundColor: colors.success + "12" }]}>
              <Text style={s.gradeSectionIcon}>🅰️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.gradeSectionTitle, { color: colors.success }]}>Grade A — Premium</Text>
                <Text style={s.gradeSectionAvail}>{availableA.toFixed(1)} kg available</Text>
              </View>
              {aKg > 0 && pA > 0 && (
                <View style={[s.gradeSectionRevBadge, { backgroundColor: colors.success }]}>
                  <Text style={s.gradeSectionRevTxt}>KSh {revA.toLocaleString()}</Text>
                </View>
              )}
            </View>
            <View style={s.gradeSectionBody}>
              <View style={s.gradeSectionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Weight (kg)</Text>
                  <View style={[s.inputBox, aOver && { borderColor: colors.error }]}>
                    <Text style={s.inputPfx}>⚖️</Text>
                    <TextInput style={s.inputTxt} value={aKgStr} onChangeText={setAKgStr}
                      placeholder={`max ${availableA.toFixed(1)}`} placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad" />
                    <Text style={s.inputSfx}>kg</Text>
                  </View>
                  {aOver && <Text style={s.overErr}>⚠️ Max {availableA.toFixed(1)} kg</Text>}
                </View>
                <View style={{ width: spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Price per kg (KSh)</Text>
                  <View style={s.inputBox}>
                    <Text style={s.inputPfx}>💰</Text>
                    <TextInput style={s.inputTxt} value={priceA} onChangeText={setPriceA}
                      placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>
              {aKg > 0 && pA > 0 && (
                <View style={[s.subTotal, { backgroundColor: colors.success + "12" }]}>
                  <Text style={[s.subTotalTxt, { color: colors.success }]}>
                    Grade A: {aKg.toFixed(1)} kg × KSh {pA}/kg = KSh {revA.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── GRADE B ── */}
        {sellMode !== "A_only" && (
          <View style={[s.gradeSection, { borderColor: colors.warning + "60" }]}>
            <View style={[s.gradeSectionHeader, { backgroundColor: colors.warning + "12" }]}>
              <Text style={s.gradeSectionIcon}>🅱️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.gradeSectionTitle, { color: colors.warning }]}>Grade B — Standard</Text>
                <Text style={s.gradeSectionAvail}>{availableB.toFixed(1)} kg available</Text>
              </View>
              {bKg > 0 && pB > 0 && (
                <View style={[s.gradeSectionRevBadge, { backgroundColor: colors.warning }]}>
                  <Text style={s.gradeSectionRevTxt}>KSh {revB.toLocaleString()}</Text>
                </View>
              )}
            </View>
            <View style={s.gradeSectionBody}>
              <View style={s.gradeSectionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Weight (kg)</Text>
                  <View style={[s.inputBox, bOver && { borderColor: colors.error }]}>
                    <Text style={s.inputPfx}>⚖️</Text>
                    <TextInput style={s.inputTxt} value={bKgStr} onChangeText={setBKgStr}
                      placeholder={`max ${availableB.toFixed(1)}`} placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad" />
                    <Text style={s.inputSfx}>kg</Text>
                  </View>
                  {bOver && <Text style={s.overErr}>⚠️ Max {availableB.toFixed(1)} kg</Text>}
                </View>
                <View style={{ width: spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Price per kg (KSh)</Text>
                  <View style={s.inputBox}>
                    <Text style={s.inputPfx}>💰</Text>
                    <TextInput style={s.inputTxt} value={priceB} onChangeText={setPriceB}
                      placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" />
                  </View>
                </View>
              </View>
              {bKg > 0 && pB > 0 && (
                <View style={[s.subTotal, { backgroundColor: colors.warning + "12" }]}>
                  <Text style={[s.subTotalTxt, { color: colors.warning }]}>
                    Grade B: {bKg.toFixed(1)} kg × KSh {pB}/kg = KSh {revB.toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── NOTES ── */}
        <Text style={s.secTitle}>📝 Notes (optional)</Text>
        <View style={[s.inputBox, { height: 50 }]}>
          <Text style={s.inputPfx}>📝</Text>
          <TextInput style={s.inputTxt} value={notes} onChangeText={setNotes}
            placeholder="Any notes about this sale..." placeholderTextColor={colors.textMuted} />
        </View>

        {/* ── GRAND TOTAL CARD ── */}
        <View style={s.totalCard}>
          <Text style={s.totalCardTitle}>📋 Sale Summary</Text>
          <View style={s.totalCardGrid}>
            {sellMode !== "B_only" && (
              <View style={[s.totalCell, { backgroundColor: colors.success + "10", borderColor: colors.success + "30" }]}>
                <Text style={s.totalCellIcon}>🅰️</Text>
                <Text style={[s.totalCellKg, { color: colors.success }]}>{aKg.toFixed(1)} kg</Text>
                <Text style={s.totalCellLbl}>Grade A</Text>
                <Text style={s.totalCellRev}>{pA > 0 ? `KSh ${revA.toLocaleString()}` : "—"}</Text>
              </View>
            )}
            {sellMode !== "A_only" && (
              <View style={[s.totalCell, { backgroundColor: colors.warning + "10", borderColor: colors.warning + "30" }]}>
                <Text style={s.totalCellIcon}>🅱️</Text>
                <Text style={[s.totalCellKg, { color: colors.warning }]}>{bKg.toFixed(1)} kg</Text>
                <Text style={s.totalCellLbl}>Grade B</Text>
                <Text style={s.totalCellRev}>{pB > 0 ? `KSh ${revB.toLocaleString()}` : "—"}</Text>
              </View>
            )}
            <View style={[s.totalCell, { backgroundColor: colors.salesColor + "10", borderColor: colors.salesColor + "30" }]}>
              <Text style={s.totalCellIcon}>💰</Text>
              <Text style={[s.totalCellKg, { color: colors.salesColor }]}>{totalKg.toFixed(1)} kg</Text>
              <Text style={s.totalCellLbl}>Total</Text>
              <Text style={[s.totalCellRev, { color: colors.salesColor, fontWeight: "900" }]}>
                {totalRev > 0 ? `KSh ${totalRev.toLocaleString()}` : "—"}
              </Text>
            </View>
          </View>

          {buyerName.trim().length > 0 && (
            <View style={s.totalBuyerRow}>
              <Text style={s.totalBuyerIcon}>🏭</Text>
              <Text style={s.totalBuyerTxt}>{buyerName}</Text>
            </View>
          )}

          <View style={s.totalRevBanner}>
            <Text style={s.totalRevLabel}>💰 Total Revenue</Text>
            <Text style={s.totalRevValue}>KSh {totalRev.toLocaleString()}</Text>
          </View>
        </View>

        {/* ── PARTIAL SALE INFO ── */}
        {(sellMode === "A_only" || sellMode === "B_only") && (
          <View style={s.partialInfo}>
            <Text style={s.partialInfoIcon}>💡</Text>
            <Text style={s.partialInfoTxt}>
              {sellMode === "A_only"
                ? `Grade B (${availableB.toFixed(1)} kg) stays available — you can sell it later to the same or a different buyer.`
                : `Grade A (${availableA.toFixed(1)} kg) stays available — you can sell it later to the same or a different buyer.`
              }
            </Text>
          </View>
        )}

        {/* ── SAVE BUTTON ── */}
        <TouchableOpacity
          style={[s.saveBtn, (!canSave || saving) && s.saveBtnOff]}
          onPress={() => setShowConfirm(true)}
          disabled={!canSave || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnTxt}>
                {canSave
                  ? `✅ Record Sale — KSh ${totalRev.toLocaleString()}`
                  : "Fill in all required fields"}
              </Text>
          }
        </TouchableOpacity>
        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── CONFIRM MODAL ── */}
      <Modal visible={showConfirm} animationType="fade" transparent>
        <View style={s.confirmOverlay}>
          <View style={s.confirmCard}>
            <Text style={s.confirmEmoji}>💰</Text>
            <Text style={s.confirmTitle}>Confirm Sale</Text>
            <Text style={s.confirmSub}>Selling {totalKg.toFixed(1)} kg to</Text>
            <Text style={s.confirmBuyer}>{buyerName}</Text>

            <View style={s.confirmDetails}>
              {sellMode !== "B_only" && aKg > 0 && (
                <View style={s.confirmRow}>
                  <Text style={s.confirmRowLbl}>🅰️ Grade A</Text>
                  <Text style={[s.confirmRowVal, { color: colors.success }]}>{aKg.toFixed(1)} kg → KSh {revA.toLocaleString()}</Text>
                </View>
              )}
              {sellMode !== "A_only" && bKg > 0 && (
                <View style={s.confirmRow}>
                  <Text style={s.confirmRowLbl}>🅱️ Grade B</Text>
                  <Text style={[s.confirmRowVal, { color: colors.warning }]}>{bKg.toFixed(1)} kg → KSh {revB.toLocaleString()}</Text>
                </View>
              )}
              <View style={[s.confirmRow, { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 8, paddingTop: 12 }]}>
                <Text style={[s.confirmRowLbl, { fontWeight: "900" }]}>Total Revenue</Text>
                <Text style={[s.confirmRowVal, { color: colors.salesColor, fontSize: fonts.sizes.lg, fontWeight: "900" }]}>
                  KSh {totalRev.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={s.confirmActions}>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setShowConfirm(false)}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmOk} onPress={handleSave}>
                <Text style={s.confirmOkTxt}>✅ Confirm Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  header:  { backgroundColor: colors.salesColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  hRow:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  back:    { backgroundColor: "rgba(255,255,255,0.2)", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  backTxt: { fontSize: 20, color: "#fff", fontWeight: "700" },
  hTitle:  { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  hSub:    { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },

  flowHint: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.md, padding: 10, marginBottom: spacing.sm },
  fStep:    { alignItems: "center", flex: 1 },
  fNum:     { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", textAlign: "center", lineHeight: 26, fontSize: 12, fontWeight: "900", color: colors.salesColor, overflow: "hidden" },
  fLbl:     { fontSize: 10, color: "#fff", fontWeight: "700", marginTop: 3 },
  fArrow:   { paddingHorizontal: spacing.sm, fontSize: 18, color: "rgba(255,255,255,0.7)" },

  // ── Offline banner ──
  offlineBanner:     { backgroundColor: "rgba(124,58,237,0.2)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(124,58,237,0.4)" },
  offlineBannerText: { fontSize: fonts.sizes.xs, color: "#fff", fontWeight: "700", textAlign: "center" },

  availRow:      { flexDirection: "row", gap: spacing.sm },
  availPill:     { flex: 1, borderRadius: radius.md, padding: 10, alignItems: "center" },
  availPillIcon: { fontSize: 18, marginBottom: 2 },
  availPillVal:  { fontSize: fonts.sizes.md, color: "#fff", fontWeight: "900" },
  availPillLbl:  { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 1 },

  content:  { padding: spacing.md },
  secTitle: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.primary, marginBottom: spacing.sm, marginTop: spacing.sm },

  modeGrid:        { gap: spacing.sm, marginBottom: spacing.md },
  modeCard:        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, borderColor: colors.border, ...shadows.sm },
  modeCardActive:  { borderColor: colors.salesColor, backgroundColor: colors.salesColor + "08" },
  modeCardIcon:    { fontSize: 24, marginBottom: 6 },
  modeCardTitle:   { fontSize: fonts.sizes.md, fontWeight: "800", color: colors.textPrimary, marginBottom: 2 },
  modeCardSub:     { fontSize: fonts.sizes.xs, color: colors.textMuted },
  modeCheck:       { position: "absolute", top: spacing.sm, right: spacing.sm },

  fieldWrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 14, height: 52, marginBottom: spacing.md, ...shadows.sm },
  fieldIcon:  { fontSize: 18, marginRight: 10 },
  fieldInput: { flex: 1, fontSize: fonts.sizes.md, color: colors.textPrimary, fontWeight: "600" },

  gradeSection:          { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, marginBottom: spacing.md, overflow: "hidden", ...shadows.md },
  gradeSectionHeader:    { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: 12 },
  gradeSectionIcon:      { fontSize: 28 },
  gradeSectionTitle:     { fontSize: fonts.sizes.md, fontWeight: "900" },
  gradeSectionAvail:     { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2 },
  gradeSectionRevBadge:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full },
  gradeSectionRevTxt:    { fontSize: fonts.sizes.xs, color: "#fff", fontWeight: "800" },
  gradeSectionBody:      { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  gradeSectionRow:       { flexDirection: "row", marginBottom: spacing.sm },

  inputLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputBox:   { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 12, height: 50 },
  inputPfx:   { fontSize: 16, marginRight: 8 },
  inputTxt:   { flex: 1, fontSize: fonts.sizes.md, color: colors.textPrimary, fontWeight: "700" },
  inputSfx:   { fontSize: fonts.sizes.sm, color: colors.textMuted, fontWeight: "600" },
  overErr:    { fontSize: fonts.sizes.xs, color: colors.error, fontWeight: "700", marginTop: 4 },
  subTotal:   { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 7, marginTop: 4 },
  subTotalTxt:{ fontSize: fonts.sizes.xs, fontWeight: "700" },

  totalCard:       { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.salesColor + "30", ...shadows.lg },
  totalCardTitle:  { fontSize: fonts.sizes.md, fontWeight: "900", color: colors.textPrimary, marginBottom: spacing.sm },
  totalCardGrid:   { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  totalCell:       { flex: 1, borderRadius: radius.md, borderWidth: 1.5, padding: 10, alignItems: "center" },
  totalCellIcon:   { fontSize: 20, marginBottom: 4 },
  totalCellKg:     { fontSize: fonts.sizes.md, fontWeight: "900" },
  totalCellLbl:    { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  totalCellRev:    { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 2, fontWeight: "700", textAlign: "center" },
  totalBuyerRow:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: radius.md, padding: 10, marginBottom: spacing.sm },
  totalBuyerIcon:  { fontSize: 18 },
  totalBuyerTxt:   { fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textPrimary },
  totalRevBanner:  { backgroundColor: colors.salesColor, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalRevLabel:   { fontSize: fonts.sizes.sm, color: "rgba(255,255,255,0.85)", fontWeight: "700" },
  totalRevValue:   { fontSize: fonts.sizes.xl, color: "#fff", fontWeight: "900" },

  partialInfo:     { backgroundColor: colors.primary + "12", borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  partialInfoIcon: { fontSize: 20 },
  partialInfoTxt:  { flex: 1, fontSize: fonts.sizes.xs, color: colors.primary, fontWeight: "600", lineHeight: 18 },

  saveBtn:    { backgroundColor: colors.salesColor, borderRadius: radius.lg, height: 58, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, ...shadows.lg },
  saveBtnOff: { backgroundColor: colors.border },
  saveBtnTxt: { fontSize: fonts.sizes.md, fontWeight: "900", color: "#fff", paddingHorizontal: spacing.sm, textAlign: "center" },

  confirmOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  confirmCard:     { backgroundColor: colors.surface, borderRadius: 28, padding: spacing.xl, alignItems: "center", width: "85%", ...shadows.lg },
  confirmEmoji:    { fontSize: 56, marginBottom: 8 },
  confirmTitle:    { fontSize: fonts.sizes.xl, fontWeight: "900", color: colors.textPrimary, marginBottom: 4 },
  confirmSub:      { fontSize: fonts.sizes.sm, color: colors.textMuted },
  confirmBuyer:    { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.salesColor, marginBottom: spacing.md },
  confirmDetails:  { width: "100%", backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  confirmRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  confirmRowLbl:   { fontSize: fonts.sizes.sm, color: colors.textSecondary, fontWeight: "600" },
  confirmRowVal:   { fontSize: fonts.sizes.sm, fontWeight: "700" },
  confirmActions:  { flexDirection: "row", gap: spacing.sm, width: "100%" },
  confirmCancel:   { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.border },
  confirmCancelTxt:{ fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.textMuted },
  confirmOk:       { flex: 1.5, backgroundColor: colors.salesColor, borderRadius: radius.md, height: 48, alignItems: "center", justifyContent: "center" },
  confirmOkTxt:    { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
});