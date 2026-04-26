import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

import SalesDashboard from "../screens/sales/SalesDashboard";
import GradingScreen from "../screens/sales/GradingScreen";
import SalesScreen from "../screens/sales/SalesScreen";

type SalesTabParamList = {
  Dashboard: undefined;
  Grading:   undefined;
  Sales:     undefined;
};

const Tab = createBottomTabNavigator<SalesTabParamList>();

const tabIcon = (icon: string, focused: boolean) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
);

export default function SalesNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown:          false,
        tabBarStyle:          styles.tabBar,
        tabBarLabelStyle:     styles.tabLabel,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={SalesDashboard}
        options={{
          tabBarLabel: "Home",
          tabBarIcon:  ({ focused }) => tabIcon("🏠", focused),
        }}
      />
      <Tab.Screen
        name="Grading"
        component={GradingScreen}
        options={{
          tabBarLabel: "Grading",
          tabBarIcon:  ({ focused }) => tabIcon("🏷️", focused),
        }}
      />
      <Tab.Screen
        name="Sales"
        component={SalesScreen}
        options={{
          tabBarLabel: "Sales",
          tabBarIcon:  ({ focused }) => tabIcon("💼", focused),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor:  colors.border,
    borderTopWidth:  1,
    height:          65,
    paddingBottom:   10,
    paddingTop:      6,
    elevation:       8,
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: -2 },
    shadowOpacity:   0.08,
    shadowRadius:    8,
  },
  tabLabel: {
    fontSize:   fonts.sizes.xs,
    fontWeight: "600",
  },
});