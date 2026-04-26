import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

import AdminDashboard from "../screens/admin/AdminDashboard";
import EmployeesScreen from "../screens/admin/EmployeesScreen";
import FarmersScreen from "../screens/admin/FarmersScreen";
import ReportsScreen from "../screens/admin/ReportsScreen";
import ExpensesScreen from "../screens/admin/ExpensesScreen";

type AdminTabParamList = {
  Dashboard:  undefined;
  Employees:  undefined;
  Farmers:    undefined;
  Reports:    undefined;
  Expenses:   undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

const tabIcon = (icon: string, focused: boolean) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
);

export default function AdminNavigator() {
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
        component={AdminDashboard}
        options={{
          tabBarLabel: "Home",
          tabBarIcon:  ({ focused }) => tabIcon("🏠", focused),
        }}
      />
      <Tab.Screen
        name="Employees"
        component={EmployeesScreen}
        options={{
          tabBarLabel: "Employees",
          tabBarIcon:  ({ focused }) => tabIcon("👥", focused),
        }}
      />
      <Tab.Screen
        name="Farmers"
        component={FarmersScreen}
        options={{
          tabBarLabel: "Farmers",
          tabBarIcon:  ({ focused }) => tabIcon("👨‍🌾", focused),
        }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          tabBarLabel: "Reports",
          tabBarIcon:  ({ focused }) => tabIcon("📊", focused),
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          tabBarLabel: "Expenses",
          tabBarIcon:  ({ focused }) => tabIcon("💰", focused),
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