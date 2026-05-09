import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import Navigation from "./src/navigation";
import { LoaderProvider } from "./src/context/LoaderContext";

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <LoaderProvider>
        <Navigation />
      </LoaderProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});