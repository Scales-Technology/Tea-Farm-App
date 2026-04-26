import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../../theme";
export default function SalesDashboard() {
  return (
    <View style={styles.c}>
      <Text style={styles.t}>💼 Sales Dashboard</Text>
      <Text style={styles.s}>Coming next...</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  t: { fontSize: fonts.sizes.xxl, fontWeight: "800", color: colors.salesColor },
  s: { fontSize: fonts.sizes.md, color: colors.textMuted, marginTop: 8 },
});