// ─── Main Navigation ──────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { NavigationContainer }        from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, StyleSheet }           from "react-native";
import AsyncStorage                   from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, getCurrentUserProfile } from "../firebase/auth";
import { User }    from "../types";
import { colors }  from "../theme";
import TeaLoader   from "../components/TeaLoader";
import { useNetworkSync } from "../hooks/useNetworkSync";

import OnboardingScreen   from "../screens/auth/OnboardingScreen";
import LoginScreen        from "../screens/auth/LoginScreen";
import AdminNavigator     from "./AdminNavigator";
import CollectorNavigator from "./CollectorNavigator";
import SalesNavigator     from "./SalesNavigator";
import SupervisorDashboard from "../screens/supervisor/SupervisorDashboard";

const Stack = createNativeStackNavigator();
const ONBOARDING_KEY = "teafarm_seen_onboarding";

export default function Navigation() {
  const [user,         setUser]         = useState<User | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);
  useNetworkSync();
  useEffect(() => {
    // Check onboarding flag AND auth state in parallel
    const checkOnboarding = async () => {
      try {
        const val = await AsyncStorage.getItem(ONBOARDING_KEY);
        setSeenOnboarding(val === "true");
      } catch {
        setSeenOnboarding(false); // default: show onboarding
      }
    };

    checkOnboarding();

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

  // Show loader until both auth state AND onboarding flag are resolved
  if (loading || seenOnboarding === null) {
    return (
      <View style={styles.loading}>
        <TeaLoader message="TeaFarm Pro" subMessage="Loading your farm..." />
      </View>
    );
  }

  // ── Decide the initial route ──────────────────────────────────────────────
  // 1. User already logged in  → go straight to their home screen
  // 2. User not logged in + hasn't seen onboarding → show Onboarding
  // 3. User not logged in + has seen onboarding    → show Login
  const initialRoute = user
    ? getHomeScreen(user.role)
    : !seenOnboarding
    ? "Onboarding"
    : "Login";

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false, animation: "fade" }}
      >
        {/* ── Onboarding — shown once on first install ── */}
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />

        {/* ── Auth ── */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* ── Admin — has its own tab navigator ── */}
        <Stack.Screen name="Admin" component={AdminNavigator} />

        {/* ── Employee screens — all accessible to admin too ── */}
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