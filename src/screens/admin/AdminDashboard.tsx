// ─── Admin Dashboard ──────────────────────────────────────────────────────────
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../../theme";
export default function AdminDashboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>👑 Admin Dashboard</Text>
      <Text style={styles.sub}>Coming next...</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  text: { fontSize: fonts.sizes.xxl, fontWeight: "800", color: colors.primary },
  sub:  { fontSize: fonts.sizes.md, color: colors.textMuted, marginTop: 8 },
});