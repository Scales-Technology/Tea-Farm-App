import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";
import CollectorDashboard from "../screens/collector/CollectorDashboard";
import PluckersScreen from "../screens/collector/PluckersScreen";
import CollectionScreen from "../screens/collector/CollectionScreen";
import PaymentsScreen from "../screens/collector/PaymentsScreen";
import InventoryScreen from "../screens/collector/InventoryScreen";

const Tab = createBottomTabNavigator();

export default function CollectorNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused }) => {
          const icons: any = {
            Dashboard: "🏠",
            Pluckers: "🧺",
            Collection: "⚖️",
            Payments: "💳",
            Inventory: "📦",
          };
          return (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
              {icons[route.name]}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={CollectorDashboard} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Pluckers" component={PluckersScreen} options={{ tabBarLabel: "Pluckers" }} />
      <Tab.Screen name="Collection" component={CollectionScreen} options={{ tabBarLabel: "Collect" }} />
      <Tab.Screen name="Payments" component={PaymentsScreen} options={{ tabBarLabel: "Payments" }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ tabBarLabel: "Inventory" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 65,
    paddingBottom: 10,
    paddingTop: 6,
    elevation: 8,
  },
  tabLabel: {
    fontSize: fonts.sizes.xs,
    fontWeight: "600",
  },
});