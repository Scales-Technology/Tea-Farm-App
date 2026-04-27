import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";
import SalesDashboard from "../screens/sales/SalesDashboard";
import GradingScreen from "../screens/sales/GradingScreen";
import SalesScreen from "../screens/sales/SalesScreen";

const Tab = createBottomTabNavigator();

export default function SalesNavigator() {
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
            Grading: "🏷️",
            Sales: "💼",
          };
          return (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
              {icons[route.name]}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={SalesDashboard} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Grading" component={GradingScreen} options={{ tabBarLabel: "Grading" }} />
      <Tab.Screen name="Sales" component={SalesScreen} options={{ tabBarLabel: "Sales" }} />
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