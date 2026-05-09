import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";
import AdminDashboard from "../screens/admin/AdminDashboard";
import EmployeesScreen from "../screens/admin/EmployeesScreen";
import FarmersScreen from "../screens/admin/FarmersScreen";
import ReportsScreen from "../screens/admin/ReportsScreen";
import ExpensesScreen from "../screens/admin/ExpensesScreen";
import AuditScreen from "../screens/admin/AuditScreen";

const Tab = createBottomTabNavigator();

export default function AdminNavigator() {
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
            Employees: "👥",
            Farmers:   "👨‍🌾",
            Reports:   "📊",
            Expenses:  "💰",
            Audit:     "🔍",
          };
          return (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
              {icons[route.name]}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboard} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Employees" component={EmployeesScreen} options={{ tabBarLabel: "Employees" }} />
      <Tab.Screen name="Farmers"   component={FarmersScreen}   options={{ tabBarLabel: "Farmers" }} />
      <Tab.Screen name="Reports"   component={ReportsScreen}   options={{ tabBarLabel: "Reports" }} />
      <Tab.Screen name="Expenses"  component={ExpensesScreen}  options={{ tabBarLabel: "Expenses" }} />
      <Tab.Screen name="Audit"     component={AuditScreen}     options={{ tabBarLabel: "Audit" }} />
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
  },
  tabLabel: {
    fontSize:   fonts.sizes.xs,
    fontWeight: "600",
  },
});