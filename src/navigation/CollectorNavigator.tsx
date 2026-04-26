import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme";

import CollectorDashboard from "../screens/collector/CollectorDashboard";
import PluckersScreen from "../screens/collector/PluckersScreen";
import CollectionScreen from "../screens/collector/CollectionScreen";
import PaymentsScreen from "../screens/collector/PaymentsScreen";
import InventoryScreen from "../screens/collector/InventoryScreen";

type CollectorTabParamList = {
  Dashboard:  undefined;
  Pluckers:   undefined;
  Collection: undefined;
  Payments:   undefined;
  Inventory:  undefined;
};

const Tab = createBottomTabNavigator<CollectorTabParamList>();

const tabIcon = (icon: string, focused: boolean) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>
);

export default function CollectorNavigator() {
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
        component={CollectorDashboard}
        options={{
          tabBarLabel: "Home",
          tabBarIcon:  ({ focused }) => tabIcon("🏠", focused),
        }}
      />
      <Tab.Screen
        name="Pluckers"
        component={PluckersScreen}
        options={{
          tabBarLabel: "Pluckers",
          tabBarIcon:  ({ focused }) => tabIcon("🧺", focused),
        }}
      />
      <Tab.Screen
        name="Collection"
        component={CollectionScreen}
        options={{
          tabBarLabel: "Collect",
          tabBarIcon:  ({ focused }) => tabIcon("⚖️", focused),
        }}
      />
      <Tab.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{
          tabBarLabel: "Payments",
          tabBarIcon:  ({ focused }) => tabIcon("💳", focused),
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          tabBarLabel: "Inventory",
          tabBarIcon:  ({ focused }) => tabIcon("📦", focused),
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