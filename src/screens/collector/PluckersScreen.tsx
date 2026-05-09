// ─── Pluckers Screen — TeaFarm Pro ───────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, Modal, StatusBar,
  KeyboardAvoidingView, Platform, RefreshControl, Dimensions,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs,
  doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { COLLECTIONS } from "../../firebase/auth";
import TeaLoader from "../../components/TeaLoader";
import { useLoader } from "../../context/LoaderContext";
import { offlineSave } from "../../utils/offlineSave";   // ← same as NewSaleScreen
import NetInfo       from "@react-native-community/netinfo"; // ← same as NewSaleScreen

const db        = getFirestore();
const auth      = getAuth();
const { width } = Dimensions.get("window");

type PaymentMethod   = "cash" | "bank" | "mpesa";
type PaymentDuration = "daily" | "weekly" | "monthly";
type ActiveTab       = "all" | "present" | "absent";

interface Plucker {
  id:              string;
  name:            string;
  idNumber:        string;
  phone:           string;
  pluckZone:       string;
  farmName:        string;
  location:        string;
  paymentMethod:   PaymentMethod;
  paymentDuration: PaymentDuration;
  paymentDetails:  string;
  isActive:        boolean;
  organizationId:  string;
  createdAt:       any;
}

const METHOD_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  cash:  { icon: "💵", color: colors.success,    bg: colors.successLight },
  bank:  { icon: "🏦", color: colors.info,       bg: colors.infoLight },
  mpesa: { icon: "📱", color: colors.salesColor, bg: colors.salesLight },
};

const getMethodConfig = (method?: string) => {
  const key = (method || "cash").toLowerCase().trim();
  return METHOD_CONFIG[key] || METHOD_CONFIG.cash;
};

const DURATION_LABELS: Record<PaymentDuration, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly",
};

export default function PluckersScreen({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [pluckers,        setPluckers]        = useState<Plucker[]>([]);
  const [attendedIds,     setAttendedIds]     = useState<Set<string>>(new Set());
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [activeTab,       setActiveTab]       = useState<ActiveTab>("all");
  const [searchQuery,     setSearchQuery]     = useState("");
  const [showRegModal,    setShowRegModal]    = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPlucker, setSelectedPlucker] = useState<Plucker | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [todayCount,      setTodayCount]      = useState(0);
  const [isOffline,       setIsOffline]       = useState(false); // ← NEW

  // Form state
  const [fName,     setFName]     = useState("");
  const [fId,       setFId]       = useState("");
  const [fPhone,    setFPhone]    = useState("");
  const [fZone,     setFZone]     = useState("");
  const [fFarm,     setFFarm]     = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fMethod,   setFMethod]   = useState<PaymentMethod>("mpesa");
  const [fDuration, setFDuration] = useState<PaymentDuration>("daily");
  const [fDetails,  setFDetails]  = useState("");

  const orgIdRef     = useRef("");
  const actorNameRef = useRef("");
  const actorIdRef   = useRef("");
  const today        = new Date().toISOString().split("T")[0];

  // ── Load pluckers + today's attendance ────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) return;
      const me  = userSnap.data()!;
      const oid = me.organizationId || "";
      orgIdRef.current     = oid;
      actorNameRef.current = me.name || "Collector";
      actorIdRef.current   = uid;

      const [pluckerSnap, attendSnap] = await Promise.all([
        getDocs(query(collection(db, "pluckers"),   where("organizationId", "==", oid))),
        getDocs(query(collection(db, "attendance"), where("organizationId", "==", oid))),
      ]);

      const pluckerList = pluckerSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Plucker))
        .filter(p => p.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Filter today's attendance in JS — no composite index needed
      const todayAttend = attendSnap.docs.filter(d => d.data().date === today);
      const attendedSet = new Set<string>(todayAttend.map(d => d.data().pluckerId as string));

      setPluckers(pluckerList);
      setAttendedIds(attendedSet);
      setTodayCount(todayAttend.length);
    } catch (e: any) {
      console.log("Pluckers load error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useEffect(() => { loadData(); }, [loadData]);
  const handleRefresh = () => { setRefreshing(true); loadData(); };

  // ── Register plucker — offline-first ─────────────────────────────────────
  const handleRegister = async () => {
    if (!fName.trim())     return Alert.alert("Required", "Name is required.");
    if (!fId.trim())       return Alert.alert("Required", "ID number is required.");
    if (!fPhone.trim())    return Alert.alert("Required", "Phone number is required.");
    if (!fZone.trim())     return Alert.alert("Required", "Pluck zone is required.");
    if (!fFarm.trim())     return Alert.alert("Required", "Farm name is required.");
    if (!fLocation.trim()) return Alert.alert("Required", "Location is required.");
    if (!fDetails.trim())  return Alert.alert("Required", "Payment details are required.");

    setSaving(true);
    showLoader("Registering plucker...");
    try {
      // ── Check connectivity ──────────────────────────────────────────────
      const network = await NetInfo.fetch();
      const online  = !!network.isConnected && !!network.isInternetReachable;
      setIsOffline(!online);

      const pluckerData = {
        name:             fName.trim(),
        idNumber:         fId.trim(),
        phone:            fPhone.trim(),
        pluckZone:        fZone.trim(),
        farmName:         fFarm.trim(),
        location:         fLocation.trim(),
        paymentMethod:    fMethod,
        paymentDuration:  fDuration,
        paymentDetails:   fDetails.trim(),
        isActive:         true,
        organizationId:   orgIdRef.current,
        totalKgCollected: 0,
        totalAmountPaid:  0,
      };

      // ── offlineSave: Firestore when online, queue when offline ──────────
      const result = await offlineSave("pluckers", pluckerData);

      // Audit log — also offline-safe
      await offlineSave(COLLECTIONS.AUDIT_LOGS, {
        actorId:        actorIdRef.current,
        actorName:      actorNameRef.current,
        actorRole:      "collector_supervisor",
        action:         `Registered plucker: ${fName.trim()}`,
        module:         "pluckers",
        outcome:        "success",
        organizationId: orgIdRef.current,
        referenceId:    result.id || fId.trim(),
      });

      setShowRegModal(false);
      resetForm();

      if (!online) {
        Alert.alert(
          "📴 Registration Queued Offline",
          `${fName.trim()} has been saved on your device and will sync when you reconnect.`,
          [{ text: "OK", onPress: () => loadData() }]
        );
      } else {
        Alert.alert(
          "✅ Registered",
          `${fName.trim()} has been registered successfully.`,
          [{ text: "OK", onPress: () => loadData() }]
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to register plucker.");
    } finally {
      setSaving(false);
      hideLoader();
    }
  };

  // ── Mark attendance — offline-first ──────────────────────────────────────
  const handleMarkAttendance = async (plucker: Plucker) => {
    if (attendedIds.has(plucker.id)) {
      Alert.alert("Already Marked", `${plucker.name} is already marked present today.`);
      return;
    }
    showLoader("Recording attendance...");
    try {
      // ── Check connectivity ──────────────────────────────────────────────
      const network = await NetInfo.fetch();
      const online  = !!network.isConnected && !!network.isInternetReachable;
      setIsOffline(!online);

      const now         = new Date();
      const arrivalTime = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });

      const attendanceData = {
        pluckerId:      plucker.id,
        pluckerName:    plucker.name,
        date:           today,
        arrivalTime,
        organizationId: orgIdRef.current,
        recordedBy:     actorNameRef.current,
      };

      // ── offlineSave: Firestore when online, queue when offline ──────────
      await offlineSave("attendance", attendanceData);

      // Optimistically update UI regardless of online status
      setAttendedIds(prev => new Set([...prev, plucker.id]));
      setTodayCount(prev => prev + 1);

      if (!online) {
        Alert.alert(
          "📴 Attendance Queued Offline",
          `${plucker.name} marked present at ${arrivalTime}.\n\nThis will sync when you reconnect.\nYou can now record their tea collection.`
        );
      } else {
        Alert.alert(
          "✅ Attendance Recorded",
          `${plucker.name} marked present at ${arrivalTime}.\n\nYou can now record their tea collection.`
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to record attendance.");
    } finally {
      hideLoader();
    }
  };

  // ── KEY FIX: Block collection if not attended ─────────────────────────────
  const handleCollect = (plucker: Plucker) => {
    if (!attendedIds.has(plucker.id)) {
      Alert.alert(
        "⛔ Attendance Required",
        `${plucker.name} has not been marked present today.\n\nPlease mark their arrival time first before recording tea collection.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "✅ Mark Arrival Now",
            onPress: () => handleMarkAttendance(plucker),
          },
        ]
      );
      return;
    }
    setShowDetailModal(false);
    navigation.navigate("Collection", {
      sourceType: "plucker",
      sourceId:   plucker.id,
      sourceName: plucker.name,
    });
  };

  const resetForm = () => {
    setFName(""); setFId(""); setFPhone(""); setFZone("");
    setFFarm(""); setFLocation(""); setFDetails("");
    setFMethod("mpesa"); setFDuration("daily");
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = pluckers.filter(p => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.idNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.pluckZone || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchTab =
      activeTab === "all"     ? true :
      activeTab === "present" ? attendedIds.has(p.id) :
      !attendedIds.has(p.id);
    return matchSearch && matchTab;
  });

  if (loading) return <TeaLoader message="Loading Pluckers..." subMessage="Collector Supervisor" />;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.collectorColor} />

      {/* ══ HEADER ══ */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>🧺 Pluckers</Text>
            <Text style={styles.headerSub}>
              {pluckers.length} registered · {todayCount} present today
            </Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowRegModal(true)}>
            <Text style={styles.addBtnText}>+ Register</Text>
          </TouchableOpacity>
        </View>

        {/* Offline banner — same pattern as NewSaleScreen */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>📴 Offline — changes will sync when reconnected</Text>
          </View>
        )}

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>{pluckers.length}</Text>
            <Text style={styles.stripLabel}>Total</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#86efac" }]}>{todayCount}</Text>
            <Text style={styles.stripLabel}>Present</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripValue, { color: "#fca5a5" }]}>{pluckers.length - todayCount}</Text>
            <Text style={styles.stripLabel}>Absent</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={styles.stripValue}>
              {pluckers.length > 0 ? Math.round((todayCount / pluckers.length) * 100) : 0}%
            </Text>
            <Text style={styles.stripLabel}>Turnout</Text>
          </View>
        </View>

        {/* Attendance progress bar */}
        <View style={styles.attendanceBar}>
          <View style={[styles.attendanceFill, {
            width: pluckers.length > 0
              ? `${Math.round((todayCount / pluckers.length) * 100)}%` as any
              : "0%",
          }]} />
        </View>

        {/* ── IMPORTANT NOTICE ── */}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            ⚠️ Pluckers must be marked present before tea collection can be recorded
          </Text>
        </View>

        {/* Tab filters */}
        <View style={styles.tabRow}>
          {(["all", "present", "absent"] as ActiveTab[]).map(tab => (
            <TouchableOpacity key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "all"     ? `All (${pluckers.length})` :
                 tab === "present" ? `✅ Present (${todayCount})` :
                 `⭕ Absent (${pluckers.length - todayCount})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput}
          placeholder="Search by name, ID or zone..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Plucker List ── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
          colors={[colors.collectorColor]} tintColor={colors.collectorColor} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>{activeTab === "present" ? "✅" : activeTab === "absent" ? "🎉" : "🧺"}</Text>
            <Text style={styles.emptyTitle}>
              {activeTab === "present" ? "No pluckers present yet" :
               activeTab === "absent"  ? "All pluckers are present!" :
               "No pluckers registered yet"}
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === "all"     ? "Tap '+ Register' to add the first plucker" :
               activeTab === "present" ? "Mark pluckers as they arrive" :
               "Great turnout today! 🎉"}
            </Text>
          </View>
        ) : (
          filtered.map(plucker => {
            const mc        = getMethodConfig(plucker.paymentMethod);
            const isPresent = attendedIds.has(plucker.id);
            return (
              <TouchableOpacity key={plucker.id}
                style={[styles.pluckerCard, isPresent && styles.pluckerCardPresent]}
                onPress={() => { setSelectedPlucker(plucker); setShowDetailModal(true); }}
                activeOpacity={0.85}
              >
                <View style={[styles.accentBar, { backgroundColor: isPresent ? colors.success : colors.border }]} />

                <View style={[styles.avatar, { backgroundColor: isPresent ? colors.successLight : colors.collectorLight }]}>
                  <Text style={[styles.avatarText, { color: isPresent ? colors.success : colors.collectorColor }]}>
                    {plucker.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.pluckerInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.pluckerName}>{plucker.name}</Text>
                    {isPresent
                      ? <View style={styles.presentBadge}><Text style={styles.presentBadgeText}>✅ Present</Text></View>
                      : <View style={styles.absentBadge}><Text style={styles.absentBadgeText}>⭕ Absent</Text></View>
                    }
                  </View>
                  <Text style={styles.pluckerMeta}>🪪 {plucker.idNumber} · 📱 {plucker.phone}</Text>
                  <Text style={styles.pluckerZone}>🌿 {plucker.pluckZone} · 🏡 {plucker.farmName}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: mc.bg }]}>
                      <Text style={[styles.tagText, { color: mc.color }]}>{mc.icon} {plucker.paymentMethod}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: colors.primaryPale }]}>
                      <Text style={[styles.tagText, { color: colors.primary }]}>{DURATION_LABELS[plucker.paymentDuration]}</Text>
                    </View>
                  </View>
                </View>

                {/* Right side action */}
                <View style={styles.cardRight}>
                  {!isPresent ? (
                    <TouchableOpacity style={styles.markBtn}
                      onPress={() => handleMarkAttendance(plucker)}>
                      <Text style={styles.markBtnIcon}>✅</Text>
                      <Text style={styles.markBtnText}>Mark</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.collectBtn}
                      onPress={() => handleCollect(plucker)}>
                      <Text style={styles.collectBtnIcon}>⚖️</Text>
                      <Text style={styles.collectBtnText}>Collect</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ══ DETAIL MODAL ══ */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🧺 Plucker Details</Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPlucker && (() => {
              const mc        = getMethodConfig(selectedPlucker.paymentMethod);
              const isPresent = attendedIds.has(selectedPlucker.id);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Status banner */}
                  <View style={[styles.detailBanner, {
                    backgroundColor: isPresent ? colors.successLight : colors.errorLight,
                    borderWidth: 1.5,
                    borderColor: isPresent ? colors.success : colors.error,
                  }]}>
                    <View style={[styles.detailAvatar, {
                      backgroundColor: isPresent ? colors.success : colors.collectorColor
                    }]}>
                      <Text style={styles.detailAvatarText}>
                        {selectedPlucker.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.detailName}>{selectedPlucker.name}</Text>
                    <Text style={[styles.detailStatus, {
                      color: isPresent ? colors.success : colors.error
                    }]}>
                      {isPresent
                        ? "✅ Present Today — Collection Allowed"
                        : "⛔ Not Yet Arrived — Mark Attendance First"}
                    </Text>
                  </View>

                  {/* Warning box if not present */}
                  {!isPresent && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningIcon}>⚠️</Text>
                      <Text style={styles.warningText}>
                        You must mark {selectedPlucker.name}'s arrival before recording their tea collection.
                        This ensures accurate daily attendance and collection records.
                      </Text>
                    </View>
                  )}

                  {/* Detail grid */}
                  <View style={styles.detailGrid}>
                    <DetailCell icon="🪪" label="ID Number"   value={selectedPlucker.idNumber} />
                    <DetailCell icon="📱" label="Phone"       value={selectedPlucker.phone} />
                    <DetailCell icon="🌿" label="Pluck Zone"  value={selectedPlucker.pluckZone} />
                    <DetailCell icon="🏡" label="Farm Name"   value={selectedPlucker.farmName} />
                    <DetailCell icon="📍" label="Location"    value={selectedPlucker.location} />
                    <DetailCell icon={mc.icon} label="Payment" value={`${selectedPlucker.paymentMethod} · ${DURATION_LABELS[selectedPlucker.paymentDuration]}`} />
                    <DetailCell icon="🔢" label="Pay Details" value={selectedPlucker.paymentDetails || "—"} />
                  </View>

                  {/* Action buttons */}
                  <View style={styles.detailActions}>
                    {!isPresent ? (
                      <>
                        {/* Primary action — mark attendance */}
                        <TouchableOpacity style={styles.detailMarkBtn}
                          onPress={() => {
                            setShowDetailModal(false);
                            handleMarkAttendance(selectedPlucker);
                          }}>
                          <Text style={styles.detailMarkBtnText}>
                            ✅ Mark Arrival — Record Attendance Now
                          </Text>
                        </TouchableOpacity>
                        {/* Disabled collect button */}
                        <View style={styles.detailCollectBtnDisabled}>
                          <Text style={styles.detailCollectBtnDisabledText}>
                            ⛔ Tea Collection Locked — Mark Arrival First
                          </Text>
                        </View>
                      </>
                    ) : (
                      <>
                        {/* Collect button — only shown when present */}
                        <TouchableOpacity style={styles.detailCollectBtn}
                          onPress={() => handleCollect(selectedPlucker)}>
                          <Text style={styles.detailCollectBtnText}>
                            ⚖️ Record Tea Collection
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.alreadyPresentNote}>
                          <Text style={styles.alreadyPresentNoteText}>
                            ✅ Attendance already recorded for today
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={{ height: 24 }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ══ REGISTER MODAL ══ */}
      <Modal visible={showRegModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.regModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>➕ Register Plucker</Text>
                <TouchableOpacity onPress={() => { setShowRegModal(false); resetForm(); }}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <SectionLabel title="👤 Personal Information" />
                <Field label="Full Name / Jina Kamili"            icon="👤" value={fName}     onChangeText={setFName}     placeholder="e.g. Peter Kamau" />
                <Field label="ID Number / Nambari ya Kitambulisho" icon="🪪" value={fId}       onChangeText={setFId}       placeholder="e.g. 12345678" keyboardType="numeric" />
                <Field label="Phone / Simu"                        icon="📱" value={fPhone}    onChangeText={setFPhone}    placeholder="+254700000000" keyboardType="phone-pad" />

                <SectionLabel title="🌿 Farm Information" />
                <Field label="Pluck Zone / Eneo la Kuchuma"  icon="🌿" value={fZone}     onChangeText={setFZone}     placeholder="e.g. Zone A" />
                <Field label="Farm Name / Jina la Shamba"    icon="🏡" value={fFarm}     onChangeText={setFFarm}     placeholder="e.g. Green Valley Farm" />
                <Field label="Location / Mahali"             icon="📍" value={fLocation} onChangeText={setFLocation} placeholder="e.g. Kericho" />

                <SectionLabel title="💰 Payment Information" />

                <Text style={styles.fieldLabel}>Payment Method / Njia ya Malipo</Text>
                <View style={styles.optionRow}>
                  {(["cash", "mpesa", "bank"] as PaymentMethod[]).map(m => {
                    const mc = getMethodConfig(m);
                    return (
                      <TouchableOpacity key={m}
                        style={[styles.optionBtn, fMethod === m && { backgroundColor: mc.bg, borderColor: mc.color, borderWidth: 2 }]}
                        onPress={() => setFMethod(m)}
                      >
                        <Text style={styles.optionIcon}>{mc.icon}</Text>
                        <Text style={[styles.optionText, fMethod === m && { color: mc.color, fontWeight: "800" }]}>
                          {m.charAt(0).toUpperCase() + m.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Payment Style / Mtindo wa Malipo</Text>
                <View style={styles.optionRow}>
                  {(["daily", "weekly", "monthly"] as PaymentDuration[]).map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.optionBtn, fDuration === d && { backgroundColor: colors.primaryPale, borderColor: colors.primary, borderWidth: 2 }]}
                      onPress={() => setFDuration(d)}
                    >
                      <Text style={[styles.optionText, fDuration === d && { color: colors.primary, fontWeight: "800" }]}>
                        {DURATION_LABELS[d]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Field
                  label={fMethod === "mpesa" ? "Mpesa Number" : fMethod === "bank" ? "Bank Account Number" : "Cash Recipient Name"}
                  icon={getMethodConfig(fMethod).icon}
                  value={fDetails}
                  onChangeText={setFDetails}
                  placeholder={fMethod === "mpesa" ? "e.g. 0712345678" : fMethod === "bank" ? "e.g. 1234567890" : "e.g. Peter Kamau"}
                  keyboardType={fMethod === "bank" ? "numeric" : "default"}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                  onPress={handleRegister} disabled={saving} activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitBtnText}>✅ Register Plucker</Text>
                  }
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

// ── Sub Components ────────────────────────────────────────────────────────────

function Field({ label, icon, value, onChangeText, placeholder, keyboardType }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.inputIcon}>{icon}</Text>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType || "default"} autoCorrect={false} />
      </View>
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelWrap}>
      <Text style={styles.sectionLabelText}>{title}</Text>
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.collectorColor, paddingTop: 48, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadows.lg },
  headerTop:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: "900", color: "#fff" },
  headerSub:   { fontSize: fonts.sizes.xs, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn:      { backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full, ...shadows.sm },
  addBtnText:  { color: "#fff", fontWeight: "800", fontSize: fonts.sizes.sm },

  // ── Offline banner (matches NewSaleScreen style) ──
  offlineBanner:     { backgroundColor: "rgba(124,58,237,0.2)", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(124,58,237,0.4)" },
  offlineBannerText: { fontSize: fonts.sizes.xs, color: "#fff", fontWeight: "700", textAlign: "center" },

  statsStrip:   { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, paddingVertical: 10, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  stripItem:    { flex: 1, alignItems: "center" },
  stripValue:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: "#fff" },
  stripLabel:   { fontSize: 9, color: "rgba(255,255,255,0.65)", marginTop: 2 },
  stripDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  attendanceBar: { height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginBottom: spacing.sm, overflow: "hidden" },
  attendanceFill:{ height: "100%", backgroundColor: colors.secondary, borderRadius: 2 },
  noticeBox:   { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, marginBottom: spacing.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  noticeText:  { fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: "600", textAlign: "center" },
  tabRow:      { flexDirection: "row", gap: spacing.xs },
  tab:         { flex: 1, paddingVertical: 7, borderRadius: radius.full, alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  tabActive:   { backgroundColor: "#fff" },
  tabText:     { fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  tabTextActive:{ color: colors.collectorColor, fontWeight: "800" },
  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: 14, height: 46, ...shadows.sm },
  searchIcon:  { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.md },
  pluckerCard:        { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", overflow: "hidden", ...shadows.md },
  pluckerCardPresent: { borderWidth: 1.5, borderColor: colors.success + "60" },
  accentBar:   { width: 4, alignSelf: "stretch" },
  avatar:      { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginHorizontal: 10 },
  avatarText:  { fontSize: fonts.sizes.lg, fontWeight: "900" },
  pluckerInfo: { flex: 1, paddingVertical: 10 },
  nameRow:     { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 },
  pluckerName: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.textPrimary },
  presentBadge:    { backgroundColor: colors.successLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  presentBadgeText:{ fontSize: 10, color: colors.success, fontWeight: "700" },
  absentBadge:     { backgroundColor: colors.border, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  absentBadgeText: { fontSize: 10, color: colors.textMuted, fontWeight: "700" },
  pluckerMeta: { fontSize: fonts.sizes.xs, color: colors.textMuted, marginTop: 1 },
  pluckerZone: { fontSize: fonts.sizes.xs, color: colors.textSecondary, marginTop: 1 },
  tagRow:      { flexDirection: "row", gap: 6, marginTop: 5 },
  tag:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  tagText:     { fontSize: 10, fontWeight: "700" },
  cardRight:   { paddingHorizontal: spacing.sm },
  markBtn:     { alignItems: "center", backgroundColor: colors.successLight, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  markBtnIcon: { fontSize: 18 },
  markBtnText: { fontSize: 9, color: colors.success, fontWeight: "800", marginTop: 2 },
  collectBtn:  { alignItems: "center", backgroundColor: colors.primaryPale, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  collectBtnIcon: { fontSize: 18 },
  collectBtnText: { fontSize: 9, color: colors.primary, fontWeight: "800", marginTop: 2 },
  emptyState: { alignItems: "center", paddingTop: 80 },
  emptyIcon:  { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: fonts.sizes.lg, fontWeight: "800", color: colors.textPrimary },
  emptySub:   { fontSize: fonts.sizes.sm, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalWrap:    { maxHeight: "95%" },
  detailModal:  { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "88%" },
  regModal:     { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.md, maxHeight: "100%" },
  modalHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle:   { fontSize: fonts.sizes.lg, fontWeight: "900", color: colors.textPrimary },
  modalClose:   { fontSize: 20, color: colors.textMuted, padding: 4 },
  detailBanner:     { borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", marginBottom: spacing.md },
  detailAvatar:     { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  detailAvatarText: { fontSize: 32, fontWeight: "900", color: "#fff" },
  detailName:       { fontSize: fonts.sizes.xl, fontWeight: "900", color: colors.textPrimary, marginBottom: 4 },
  detailStatus:     { fontSize: fonts.sizes.sm, fontWeight: "700", textAlign: "center" },
  warningBox:    { backgroundColor: "#FFF8E1", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1.5, borderColor: colors.warning },
  warningIcon:   { fontSize: 20 },
  warningText:   { flex: 1, fontSize: fonts.sizes.xs, color: colors.warning, fontWeight: "600", lineHeight: 18 },
  detailGrid:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  detailCell:    { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, width: (width - spacing.md * 2 - spacing.sm * 3) / 2, alignItems: "center" },
  detailCellIcon:  { fontSize: 22, marginBottom: 4 },
  detailCellLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  detailCellValue: { fontSize: 12, fontWeight: "800", color: colors.textPrimary, marginTop: 2, textAlign: "center" },
  detailActions:       { gap: spacing.sm },
  detailMarkBtn:       { backgroundColor: colors.success, borderRadius: radius.md, height: 52, alignItems: "center", justifyContent: "center", ...shadows.md },
  detailMarkBtnText:   { fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
  detailCollectBtn:    { backgroundColor: colors.primary, borderRadius: radius.md, height: 52, alignItems: "center", justifyContent: "center", ...shadows.md },
  detailCollectBtnText:{ fontSize: fonts.sizes.sm, fontWeight: "800", color: "#fff" },
  detailCollectBtnDisabled:    { backgroundColor: colors.errorLight, borderRadius: radius.md, height: 52, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.error + "40" },
  detailCollectBtnDisabledText:{ fontSize: fonts.sizes.sm, fontWeight: "700", color: colors.error },
  alreadyPresentNote:     { backgroundColor: colors.successLight, borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: colors.success + "40" },
  alreadyPresentNoteText: { fontSize: fonts.sizes.xs, color: colors.success, fontWeight: "700" },
  sectionLabelWrap: { backgroundColor: colors.collectorLight, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, marginBottom: spacing.sm, marginTop: spacing.sm },
  sectionLabelText: { fontSize: fonts.sizes.sm, fontWeight: "800", color: colors.collectorColor },
  optionRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  optionBtn: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: "center", backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
  optionIcon:{ fontSize: 20, marginBottom: 4 },
  optionText:{ fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginBottom: 6 },
  inputWrap:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: 14, height: 50 },
  inputIcon:  { fontSize: 16, marginRight: 10 },
  input:      { flex: 1, fontSize: fonts.sizes.sm, color: colors.textPrimary },
  submitBtn:         { backgroundColor: colors.collectorColor, borderRadius: radius.md, height: 54, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, ...shadows.md },
  submitBtnDisabled: { backgroundColor: colors.collectorLight },
  submitBtnText:     { fontSize: fonts.sizes.md, fontWeight: "800", color: "#fff" },
});