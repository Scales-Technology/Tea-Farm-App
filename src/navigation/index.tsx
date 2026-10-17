// ─── Main Navigation ──────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { NavigationContainer }        from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, StyleSheet }           from "react-native";
import { onAuthStateChanged, getCurrentUserProfile } from "../firebase/auth";
import { User }    from "../types";
import { colors }  from "../theme";
import TeaLoader   from "../components/TeaLoader";
import { useNetworkSync } from "../hooks/useNetworkSync";

import OnboardingScreen    from "../screens/auth/OnboardingScreen";
import LoginScreen         from "../screens/auth/LoginScreen";
import AdminNavigator      from "./AdminNavigator";
import CollectorNavigator  from "./CollectorNavigator";
import SalesNavigator      from "./SalesNavigator";
import SupervisorDashboard from "../screens/supervisor/SupervisorDashboard";

const Stack = createNativeStackNavigator();

export default function Navigation() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useNetworkSync();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser: any) => {
      if (firebaseUser) {
        try {
          const profile = await getCurrentUserProfile();
          setUser(profile);
        } catch { setUser(null); }
      } else { setUser(null); }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <TeaLoader message="TeaFarm Pro" subMessage="Loading your farm..." />
      </View>
    );
  }

  // ── Decide initial route ──────────────────────────────────────────────────
  // Logged-in user  → straight to their home screen (skip onboarding)
  // Not logged in   → always show Onboarding first, every launch
  const initialRoute = user ? getHomeScreen(user.role) : "Onboarding";

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: "fade" }}
      >
        {/* ── Onboarding — shown every launch when not logged in ── */}
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />

        {/* ── Auth ── */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* ── Role home screens ── */}
        <Stack.Screen name="Admin"      component={AdminNavigator} />
        <Stack.Screen name="Collector"  component={CollectorNavigator} />
        <Stack.Screen name="Sales"      component={SalesNavigator} />
        <Stack.Screen name="Supervisor" component={SupervisorDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function getHomeScreen(role: string): string {
  switch (role) {
    case "admin":                return "Admin";
    case "collector_supervisor": return "Collector";
    case "sales_supervisor":     return "Sales";
    case "main_supervisor":      return "Supervisor";
    default:                     return "Login";
  }
}

const styles = StyleSheet.create({
  loading: {
    flex:            1,
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: colors.background,
  },
});