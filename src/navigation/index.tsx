// ─── Main Navigation ──────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { onAuthStateChanged, getCurrentUserProfile } from "../firebase/auth";
import { User } from "../types";
import { colors } from "../theme";

// Screens
import LoginScreen from "../screens/auth/LoginScreen";
import AdminNavigator from "./AdminNavigator";
import CollectorNavigator from "./CollectorNavigator";
import SalesNavigator from "./SalesNavigator";
import SupervisorDashboard from "../screens/supervisor/SupervisorDashboard";

const Stack = createNativeStackNavigator();

export default function Navigation() {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser: any) => {
      if (firebaseUser) {
        try {
          const profile = await getCurrentUserProfile();
          setUser(profile);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.role === "admin" ? (
          <Stack.Screen name="Admin" component={AdminNavigator} />
        ) : user.role === "collector_supervisor" ? (
          <Stack.Screen name="Collector" component={CollectorNavigator} />
        ) : user.role === "sales_supervisor" ? (
          <Stack.Screen name="Sales" component={SalesNavigator} />
        ) : (
          <Stack.Screen name="Supervisor" component={SupervisorDashboard} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex:            1,
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: colors.background,
  },
});