import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { BluetoothProvider } from "rn-bluetooth-classic";
import Navigation from "./src/navigation";
import { LoaderProvider } from "./src/context/LoaderContext";

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Classic Bluetooth (scale + receipt printer). Required by
          useClassicBluetooth / usePrinter — without it the weight stays 0.0 */}
      <BluetoothProvider>
        <LoaderProvider>
          <Navigation />
        </LoaderProvider>
      </BluetoothProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});