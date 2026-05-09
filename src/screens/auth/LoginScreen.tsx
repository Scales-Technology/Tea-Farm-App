// ─── Login Screen ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert, StatusBar,
} from "react-native";
import { loginUser, registerOrganization } from "../../firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";

export default function LoginScreen({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Login state
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [farmName,      setFarmName]      = useState("");
  const [location,      setLocation]      = useState("");
  const [ownerName,     setOwnerName]     = useState("");
  const [phone,         setPhone]         = useState("");
  const [regEmail,      setRegEmail]      = useState("");
  const [regPassword,   setRegPassword]   = useState("");
  const [regConfirm,    setRegConfirm]    = useState("");
  const [regLoading,    setRegLoading]    = useState(false);
  const [showRegPass,   setShowRegPass]   = useState(false);

  // ── Login Handler ──────────────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      Alert.alert("Required", "Please enter email and password.");
      return;
    }
    setLoginLoading(true);
    try {
      const user = await loginUser(loginEmail, loginPassword);
      switch (user.role) {
        case "admin":                navigation.replace("Admin");      break;
        case "collector_supervisor": navigation.replace("Collector");  break;
        case "sales_supervisor":     navigation.replace("Sales");      break;
        case "main_supervisor":      navigation.replace("Supervisor"); break;
        default: Alert.alert("Error", "Unknown role. Contact admin.");
      }
    } catch (error: any) {
      let msg = "Login failed. Try again.";
      if (error.code === "auth/user-not-found")     msg = "No account with this email.";
      else if (error.code === "auth/wrong-password") msg = "Incorrect password.";
      else if (error.code === "auth/too-many-requests") msg = "Too many attempts. Try later.";
      else if (error.message) msg = error.message;
      Alert.alert("Login Failed / Imeshindwa", msg);
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Register Handler ───────────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!farmName.trim())    return Alert.alert("Required", "Farm name is required.");
    if (!location.trim())    return Alert.alert("Required", "Location is required.");
    if (!ownerName.trim())   return Alert.alert("Required", "Owner name is required.");
    if (!phone.trim())       return Alert.alert("Required", "Phone number is required.");
    if (!regEmail.trim())    return Alert.alert("Required", "Email is required.");
    if (regPassword.length < 6) return Alert.alert("Required", "Password must be at least 6 characters.");
    if (regPassword !== regConfirm) return Alert.alert("Error", "Passwords do not match.");

    setRegLoading(true);
    try {
      await registerOrganization(
        farmName, location, ownerName, phone, regEmail, regPassword
      );
      Alert.alert(
        "✅ Registration Successful!",
        "Your farm account has been created. You can now sign in.",
        [{ text: "Sign In", onPress: () => setActiveTab("login") }]
      );
      // Clear form
      setFarmName(""); setLocation(""); setOwnerName("");
      setPhone(""); setRegEmail(""); setRegPassword(""); setRegConfirm("");
    } catch (error: any) {
      let msg = "Registration failed. Try again.";
      if (error.code === "auth/email-already-in-use") msg = "This email is already registered.";
      else if (error.message) msg = error.message;
      Alert.alert("Registration Failed", msg);
    } finally {
      setRegLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryLight} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Header ── */}
        <View style={styles.header}>
          <View style={styles.logoRing}>
            <View style={styles.logoInner}>
              <Text style={styles.logoIcon}>🍃</Text>
            </View>
          </View>
          <Text style={styles.appName}>Tea Farm App</Text>
          <Text style={styles.tagline}>FARM MANAGEMENT SYSTEM</Text>
          <Text style={styles.tagline2}>Powered by BLE· Kenya 🇰🇪</Text>
        </View>

        {/* ── Tab Switcher ── */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "login" && styles.tabBtnActive]}
            onPress={() => setActiveTab("login")}
          >
            <Text style={[styles.tabBtnText, activeTab === "login" && styles.tabBtnTextActive]}>
              🔑 Sign In / Ingia
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "register" && styles.tabBtnActive]}
            onPress={() => setActiveTab("register")}
          >
            <Text style={[styles.tabBtnText, activeTab === "register" && styles.tabBtnTextActive]}>
              🏡 Register Farm
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Login Form ── */}
        {activeTab === "login" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back / Karibu Tena</Text>
            <Text style={styles.cardSubtitle}>Sign in to your farm account</Text>

            <Field
              label="Email Address / Barua Pepe"
              icon="✉️"
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <PasswordField
              label="Password / Nenosiri"
              value={loginPassword}
              onChangeText={setLoginPassword}
              show={showLoginPass}
              onToggle={() => setShowLoginPass(!showLoginPass)}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, loginLoading && styles.primaryBtnDisabled]}
              onPress={handleLogin}
              disabled={loginLoading}
              activeOpacity={0.85}
            >
              {loginLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Sign In / Ingia →</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setActiveTab("register")} style={styles.switchLink}>
              <Text style={styles.switchLinkText}>
                New farm? Register here / Shamba jipya? Jisajili hapa
              </Text>
            </TouchableOpacity>

            {/* Role badges */}
            <View style={styles.dividerRow}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>System Roles</Text>
              <View style={styles.divLine} />
            </View>
            <View style={styles.rolesGrid}>
              {[
                { icon: "👑", label: "Admin",      color: colors.adminColor,      bg: colors.adminLight },
                { icon: "🧺", label: "Collector",  color: colors.collectorColor,  bg: colors.collectorLight },
                { icon: "💼", label: "Sales",      color: colors.salesColor,      bg: colors.salesLight },
                { icon: "📊", label: "Supervisor", color: colors.supervisorColor, bg: colors.supervisorLight },
              ].map((r) => (
                <View key={r.label} style={[styles.rolePill, { backgroundColor: r.bg }]}>
                  <Text style={styles.rolePillIcon}>{r.icon}</Text>
                  <Text style={[styles.rolePillText, { color: r.color }]}>{r.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Register Form ── */}
        {activeTab === "register" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Register Your Farm</Text>
            <Text style={styles.cardSubtitle}>
              Create your organization account to get started
            </Text>

            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>🏡 Farm Information</Text>
            </View>

            <Field label="Farm Name / Jina la Shamba" icon="🌿" value={farmName}
              onChangeText={setFarmName} placeholder="e.g. Green Valley Tea Farm" />
            <Field label="Location / Mahali" icon="📍" value={location}
              onChangeText={setLocation} placeholder="e.g. Kericho, Kenya" />

            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>👤 Owner Information</Text>
            </View>

            <Field label="Full Name / Jina Kamili" icon="👤" value={ownerName}
              onChangeText={setOwnerName} placeholder="e.g. John Kamau" />
            <Field label="Phone Number / Nambari ya Simu" icon="📱" value={phone}
              onChangeText={setPhone} placeholder="+254700000000"
              keyboardType="phone-pad" />

            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>🔐 Login Credentials</Text>
            </View>

            <Field label="Email Address / Barua Pepe" icon="✉️" value={regEmail}
              onChangeText={setRegEmail} placeholder="your@email.com"
              keyboardType="email-address" autoCapitalize="none" />
            <PasswordField label="Password / Nenosiri (min. 6 characters)"
              value={regPassword} onChangeText={setRegPassword}
              show={showRegPass} onToggle={() => setShowRegPass(!showRegPass)} />
            <PasswordField label="Confirm Password / Thibitisha Nenosiri"
              value={regConfirm} onChangeText={setRegConfirm}
              show={showRegPass} onToggle={() => setShowRegPass(!showRegPass)} />

            <TouchableOpacity
              style={[styles.primaryBtn, regLoading && styles.primaryBtnDisabled]}
              onPress={handleRegister}
              disabled={regLoading}
              activeOpacity={0.85}
            >
              {regLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Create Farm Account →</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setActiveTab("login")} style={styles.switchLink}>
              <Text style={styles.switchLinkText}>
                Already registered? Sign in / Tayari umesajili? Ingia
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.footer}>Tea Farm App · © 2026</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Reusable Field Components ──────────────────────────────────────────────────

function Field({ label, icon, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Text style={styles.inputIcon}>{icon}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType || "default"}
          autoCapitalize={autoCapitalize || "words"}
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

function PasswordField({ label, value, onChangeText, show, onToggle }: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Text style={styles.inputIcon}>🔒</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggle} style={{ padding: 4 }}>
          <Text style={{ fontSize: 16 }}>{show ? "🙈" : "👁️"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll:    { flexGrow: 1, paddingBottom: 40 },

  // Header
  header: {
    alignItems:    "center",
    paddingTop:    48,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  logoRing: {
    width:           110,
    height:          110,
    borderRadius:    55,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    16,
    borderWidth:     2,
    borderColor:     "rgba(255,255,255,0.25)",
  },
  logoInner: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  logoIcon:  { fontSize: 40 },
  appName: {
    fontSize:      32,
    fontWeight:    "900",
    color:         "#fff",
    letterSpacing: 2,
  },
  tagline: {
    fontSize:      10,
    color:         "rgba(255,255,255,0.65)",
    marginTop:     4,
    letterSpacing: 3,
  },
  tagline2: {
    fontSize:  11,
    color:     "rgba(255,255,255,0.5)",
    marginTop: 6,
  },

  // Tab switcher
  tabContainer: {
    flexDirection:   "row",
    marginHorizontal: 16,
    marginBottom:    16,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius:    16,
    padding:         4,
  },
  tabBtn: {
    flex:            1,
    paddingVertical: 12,
    borderRadius:    12,
    alignItems:      "center",
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabBtnText: {
    fontSize:   13,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.7)",
  },
  tabBtnTextActive: { color: colors.primary },

  // Card
  card: {
    backgroundColor:  colors.surface,
    marginHorizontal: 16,
    borderRadius:     24,
    padding:          24,
    ...shadows.lg,
  },
  cardTitle: {
    fontSize:     22,
    fontWeight:   "800",
    color:        colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize:     13,
    color:        colors.textMuted,
    marginBottom: 20,
  },

  // Section label
  sectionLabel: {
    backgroundColor: colors.primaryPale,
    borderRadius:    8,
    paddingHorizontal: 12,
    paddingVertical:   8,
    marginBottom:    12,
    marginTop:       8,
  },
  sectionLabelText: {
    fontSize:   13,
    fontWeight: "700",
    color:      colors.primary,
  },

  // Fields
  fieldGroup:   { marginBottom: 14 },
  fieldLabel: {
    fontSize:     12,
    fontWeight:   "600",
    color:        colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection:     "row",
    alignItems:        "center",
    borderWidth:       1.5,
    borderColor:       colors.border,
    borderRadius:      12,
    backgroundColor:   colors.background,
    paddingHorizontal: 14,
    height:            50,
  },
  inputIcon: { fontSize: 16, marginRight: 10 },
  input: {
    flex:      1,
    fontSize:  15,
    color:     colors.textPrimary,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    14,
    height:          54,
    alignItems:      "center",
    justifyContent:  "center",
    marginTop:       8,
    ...shadows.md,
  },
  primaryBtnDisabled: { backgroundColor: colors.primaryPale },
  primaryBtnText: {
    fontSize:   16,
    fontWeight: "800",
    color:      "#fff",
    letterSpacing: 0.5,
  },

  // Switch link
  switchLink: {
    alignItems: "center",
    marginTop:  16,
    padding:    8,
  },
  switchLinkText: {
    fontSize:  12,
    color:     colors.primary,
    fontWeight: "600",
    textAlign: "center",
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems:    "center",
    marginTop:     20,
    marginBottom:  12,
    gap:           8,
  },
  divLine:  { flex: 1, height: 1, backgroundColor: colors.border },
  divText:  { fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  // Role pills
  rolesGrid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    gap:            8,
    justifyContent: "center",
  },
  rolePill: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
    gap:               6,
  },
  rolePillIcon: { fontSize: 13 },
  rolePillText: { fontSize: 11, fontWeight: "700" },

  // Footer
  footer: {
    textAlign:  "center",
    color:      "rgba(255,255,255,0.35)",
    fontSize:   11,
    marginTop:  24,
    letterSpacing: 0.5,
  },
});