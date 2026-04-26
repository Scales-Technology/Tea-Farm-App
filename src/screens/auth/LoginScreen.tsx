// ─── Login Screen ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert, StatusBar,
} from "react-native";
import { loginUser } from "../../firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { getRoleDisplayName } from "../../utils/format";

export default function LoginScreen() {
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError]     = useState("");
  const [passError, setPassError]       = useState("");

  const validate = (): boolean => {
    let valid = true;
    setEmailError("");
    setPassError("");
    if (!email.trim()) {
      setEmailError("Email is required / Barua pepe inahitajika");
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Enter a valid email / Ingiza barua pepe sahihi");
      valid = false;
    }
    if (!password) {
      setPassError("Password is required / Nenosiri linahitajika");
      valid = false;
    } else if (password.length < 6) {
      setPassError("At least 6 characters / Angalau herufi 6");
      valid = false;
    }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await loginUser(email, password);
      // Navigation handled by Navigation/index.tsx via auth state listener
    } catch (error: any) {
      let message = "Login failed. Please try again. / Imeshindwa. Jaribu tena.";
      if (error.code === "auth/user-not-found") message = "No account found with this email.";
      else if (error.code === "auth/wrong-password") message = "Incorrect password. / Nenosiri si sahihi.";
      else if (error.code === "auth/too-many-requests") message = "Too many attempts. Try later. / Majaribio mengi. Jaribu baadaye.";
      else if (error.message) message = error.message;
      Alert.alert("Login Failed / Imeshindwa", message);
    } finally {
      setLoading(false);
    }
  };

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
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🍃</Text>
          </View>
          <Text style={styles.appName}>TeaFarm Pro</Text>
          <Text style={styles.tagline}>FARM MANAGEMENT SYSTEM</Text>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Karibu · Welcome</Text>
            <View style={styles.dividerLine} />
          </View>
        </View>

        {/* ── Form Card ── */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Sign In / Ingia</Text>
          <Text style={styles.formSubtitle}>
            Enter your credentials to access the system
          </Text>

          {/* Email Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address / Barua Pepe</Text>
            <View style={[styles.inputWrapper, emailError ? styles.inputError : null]}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); setEmailError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password / Nenosiri</Text>
            <View style={[styles.inputWrapper, passError ? styles.inputError : null]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(t) => { setPassword(t); setPassError(""); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>
            {passError ? <Text style={styles.errorText}>{passError}</Text> : null}
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.textLight} size="small" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In / Ingia</Text>
            )}
          </TouchableOpacity>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              🔐 Your access is determined by your assigned role.{"\n"}
              Contact your administrator if you cannot sign in.
            </Text>
          </View>
        </View>

        {/* ── Role Badges ── */}
        <View style={styles.rolesSection}>
          <Text style={styles.rolesTitle}>System Roles / Majukumu ya Mfumo</Text>
          <View style={styles.rolesGrid}>
            {[
              { role: "admin",                icon: "👑", color: colors.adminColor,      bg: colors.adminLight },
              { role: "collector_supervisor", icon: "🧺", color: colors.collectorColor,  bg: colors.collectorLight },
              { role: "sales_supervisor",     icon: "💼", color: colors.salesColor,      bg: colors.salesLight },
              { role: "main_supervisor",      icon: "📊", color: colors.supervisorColor, bg: colors.supervisorLight },
            ].map((item) => (
              <View key={item.role} style={[styles.roleBadge, { backgroundColor: item.bg }]}>
                <Text style={styles.roleBadgeIcon}>{item.icon}</Text>
                <Text style={[styles.roleBadgeText, { color: item.color }]}>
                  {getRoleDisplayName(item.role)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          TeaFarm Pro v1.0 · BLE Scale Integrated · Kenya 🇰🇪
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll:    { flexGrow: 1, paddingBottom: spacing.xxl },

  // Header
  header: {
    alignItems:        "center",
    paddingTop:        spacing.xxl + 16,
    paddingBottom:     spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  logoContainer: {
    width:           96,
    height:          96,
    borderRadius:    48,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    spacing.md,
    borderWidth:     2,
    borderColor:     "rgba(255,255,255,0.3)",
  },
  logoIcon: { fontSize: 48 },
  appName: {
    fontSize:      fonts.sizes.xxxl,
    fontWeight:    "900",
    color:         colors.textLight,
    letterSpacing: 2,
  },
  tagline: {
    fontSize:      fonts.sizes.xs,
    color:         "rgba(255,255,255,0.7)",
    marginTop:     spacing.xs,
    letterSpacing: 3,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems:    "center",
    marginTop:     spacing.lg,
    gap:           spacing.sm,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dividerText: {
    color:         "rgba(255,255,255,0.6)",
    fontSize:      fonts.sizes.xs,
    letterSpacing: 1,
  },

  // Form card
  formCard: {
    backgroundColor:  colors.surface,
    marginHorizontal: spacing.md,
    borderRadius:     radius.xl,
    padding:          spacing.lg,
    ...shadows.lg,
  },
  formTitle: {
    fontSize:     fonts.sizes.xxl,
    fontWeight:   "800",
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  formSubtitle: {
    fontSize:     fonts.sizes.sm,
    color:        colors.textMuted,
    marginBottom: spacing.lg,
  },

  // Fields
  fieldGroup:  { marginBottom: spacing.md },
  label: {
    fontSize:     fonts.sizes.sm,
    fontWeight:   "600",
    color:        colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection:     "row",
    alignItems:        "center",
    borderWidth:       1.5,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    backgroundColor:   colors.background,
    paddingHorizontal: spacing.md,
    height:            52,
  },
  inputError: { borderColor: colors.error },
  inputIcon:  { fontSize: 16, marginRight: spacing.sm },
  input: {
    flex:      1,
    fontSize:  fonts.sizes.md,
    color:     colors.textPrimary,
  },
  eyeBtn:    { padding: spacing.xs },
  eyeIcon:   { fontSize: 16 },
  errorText: {
    fontSize:   fonts.sizes.xs,
    color:      colors.error,
    marginTop:  spacing.xs,
    marginLeft: spacing.xs,
  },

  // Login button
  loginBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    height:          54,
    alignItems:      "center",
    justifyContent:  "center",
    marginTop:       spacing.sm,
    ...shadows.md,
  },
  loginBtnDisabled: { backgroundColor: colors.primaryPale },
  loginBtnText: {
    fontSize:      fonts.sizes.lg,
    fontWeight:    "800",
    color:         colors.textLight,
    letterSpacing: 0.5,
  },

  // Info box
  infoBox: {
    marginTop:       spacing.md,
    padding:         spacing.md,
    backgroundColor: colors.successLight,
    borderRadius:    radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoText: {
    fontSize:  fonts.sizes.xs,
    color:     colors.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },

  // Roles
  rolesSection: {
    marginTop:        spacing.lg,
    marginHorizontal: spacing.md,
  },
  rolesTitle: {
    fontSize:     fonts.sizes.sm,
    color:        "rgba(255,255,255,0.7)",
    textAlign:    "center",
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  rolesGrid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    gap:            spacing.sm,
    justifyContent: "center",
  },
  roleBadge: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.full,
    gap:               spacing.xs,
  },
  roleBadgeIcon: { fontSize: 14 },
  roleBadgeText: { fontSize: fonts.sizes.xs, fontWeight: "700" },

  // Footer
  footer: {
    textAlign:     "center",
    color:         "rgba(255,255,255,0.4)",
    fontSize:      fonts.sizes.xs,
    marginTop:     spacing.xl,
    letterSpacing: 0.5,
  },
});