// ─── useClassicBluetooth.ts — TeaFarm Pro ────────────────────────────────────
// Classic Bluetooth (SPP) scale, same stack as wmszip's RecordPage:
//   <BluetoothProvider> + useBluetooth() from "rn-bluetooth-classic"
//   (App.tsx must wrap the app in <BluetoothProvider> — without it
//    receivedData never updates and the weight stays at 0.0 kg).
//
// Same return shape as before, so ScaleSelectorModal / CollectionScreen /
// GradingScreen need no changes. BLE (useBLE) is untouched.
//
// What changed vs the old version:
//   • weight parsing → utils/scaleParser's parseScaleData, a direct port of
//     wmszip's own proven parseBluetoothData -- every received chunk is
//     parsed and shown immediately and independently, same as wmszip. (An
//     earlier version here buffered chunks to reassemble split frames and
//     validated decoded bytes before trusting them; both of those ideas
//     caused real bugs -- a rejected-decode mis-parse, then a frozen
//     display when a later packet's parse failed -- so they're gone. See
//     the comment at the top of scaleParser.ts.)
//   • a second, direct data listener on the connected device as a safety net
//   • paired devices / enable-Bluetooth use react-native-bluetooth-classic
//     directly (the old require("rn-bluetooth-classic").default had neither)
//   • Android 12+ Bluetooth permissions are requested before connecting
//   • dropped connections are noticed and re-established
//   • disconnect() really disconnects

import { useState, useEffect, useRef, useCallback } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { useBluetooth } from "rn-bluetooth-classic";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseScaleData } from "../utils/scaleParser";

const SAVED_CLASSIC_KEY = "teafarm_classic_scale_device";

export interface ClassicScaleReading {
  weight: number;
  unit: string;
  isStable: boolean;
  raw: string;
}

export interface ClassicScaleDevice {
  address: string;
  name: string;
}

async function ensureBtPermissions(forScan = false): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const P = PermissionsAndroid.PERMISSIONS;
  if (Number(Platform.Version) >= 31) {
    const wanted = forScan
      ? [P.BLUETOOTH_CONNECT, P.BLUETOOTH_SCAN, P.ACCESS_FINE_LOCATION]
      : [P.BLUETOOTH_CONNECT];
    const res = await PermissionsAndroid.requestMultiple(wanted);
    return wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
  }
  if (forScan) {
    const r = await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

export function useClassicBluetooth() {
  const [connectedDevice, setConnectedDevice] =
    useState<ClassicScaleDevice | null>(null);
  const [scaleReading, setScaleReading] = useState<ClassicScaleReading | null>(
    null,
  );
  const [capturedWeight, setCapturedWeight] =
    useState<ClassicScaleReading | null>(null);
  const [savedDevice, setSavedDevice] = useState<ClassicScaleDevice | null>(
    null,
  );
  const [pairedDevices, setPairedDevices] = useState<ClassicScaleDevice[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const autoConnectDoneRef = useRef(false);
  const prevDataRef = useRef<any>(null);
  const connectingRef = useRef(false);
  const directSubRef = useRef<any>(null);
  // When the provider (the wmszip path) last delivered data. The direct
  // listener below only acts when the provider has been silent, so the two
  // never fight over the number on screen.
  const providerAtRef = useRef(0);

  const bt = useBluetooth();
  const btRef = useRef(bt);
  btRef.current = bt;
  const receivedData = bt.receivedData;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        directSubRef.current?.remove?.();
      } catch {}
      directSubRef.current = null;
    };
  }, []);

  // ── Turn incoming scale data into a reading ──────────────────────────────
  // Same model as wmszip's RecordPage.js: parse every chunk the moment it
  // arrives and show it immediately, with nothing held back waiting for
  // more data. If a chunk doesn't parse, this simply does nothing and
  // waits for the next one -- the display keeps the last good reading
  // rather than clearing it, but it is never more than one real chunk
  // away from updating again (unlike the old buffered version, which
  // could get permanently stuck if parses kept failing).
  const applyData = useCallback((data: any) => {
    const r = parseScaleData(data);
    console.log(
      "[ClassicBT] data:",
      JSON.stringify(data),
      "→",
      r ? `${r.weightKg}kg` : "no weight",
    );
    if (r && mountedRef.current) {
      setScaleReading({
        weight: r.weightKg,
        unit: "kg",
        isStable: r.isStable,
        // what the scale really sent, shown under the weight for diagnosis
        raw: r.raw || String(data),
      });
    }
  }, []);

  // Provider path — exactly the RecordPage.js pattern (receivedData)
  useEffect(() => {
    if (
      receivedData === undefined ||
      receivedData === null ||
      receivedData === ""
    )
      return;
    if (receivedData === prevDataRef.current) return;
    prevDataRef.current = receivedData;
    providerAtRef.current = Date.now();
    applyData(receivedData);
  }, [receivedData, applyData]);

  // Safety net: listen on the connected device directly as well, so a weight
  // still shows even if the provider's stream does not deliver.
  const attachDirectListener = useCallback(
    async (address: string) => {
      try {
        try {
          directSubRef.current?.remove?.();
        } catch {}
        directSubRef.current = null;
        const dev: any = await RNBluetoothClassic.getConnectedDevice(address);
        directSubRef.current = dev.onDataReceived((ev: any) => {
          if (ev && ev.data !== undefined && ev.data !== null) {
            // Only a fallback: if the provider is delivering, it is the
            // single source of the displayed weight (exactly like wmszip).
            if (Date.now() - providerAtRef.current < 4000) return;
            applyData(ev.data);
          }
        });
      } catch (e: any) {
        console.log("[ClassicBT] direct listener not attached:", e?.message);
      }
    },
    [applyData],
  );

  // ── Bluetooth on/off ─────────────────────────────────────────────────────
  useEffect(() => {
    RNBluetoothClassic.isBluetoothEnabled()
      .then((on) => {
        if (mountedRef.current) setIsEnabled(!!on);
      })
      .catch(() => {});
  }, []);

  // ── Saved device ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVED_CLASSIC_KEY);
        if (raw && mountedRef.current) setSavedDevice(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────────
  // silent = automatic (re)connect: keeps a weight the user already captured.
  const connectToDevice = useCallback(
    async (device: ClassicScaleDevice, silent = false) => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      try {
        if (!silent) setIsConnecting(true);
        setError(null);
        if (!(await ensureBtPermissions())) {
          throw new Error("Bluetooth permission was denied.");
        }
        console.log("[ClassicBT] Connecting to:", device.name, device.address);
        // Must be the provider's connectToDevice so its data listener is
        // attached to this connection (same call wmszip uses).
        await btRef.current.connectToDevice(device.address);
        if (!mountedRef.current) return;
        setConnectedDevice(device);
        if (!silent) {
          setScaleReading(null);
          setCapturedWeight(null);
        }
        providerAtRef.current = 0;
        attachDirectListener(device.address);
        await AsyncStorage.setItem(SAVED_CLASSIC_KEY, JSON.stringify(device));
        if (mountedRef.current) setSavedDevice(device);
      } catch (e: any) {
        if (mountedRef.current) {
          setError(e?.message || "Connection failed");
          setConnectedDevice(null);
        }
      } finally {
        connectingRef.current = false;
        if (mountedRef.current) setIsConnecting(false);
      }
    },
    [attachDirectListener],
  );

  // ── Auto-reconnect to the saved scale on mount ───────────────────────────
  useEffect(() => {
    if (autoConnectDoneRef.current) return;
    autoConnectDoneRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVED_CLASSIC_KEY);
        if (!raw || !mountedRef.current) return;
        const saved: ClassicScaleDevice = JSON.parse(raw);
        setSavedDevice(saved);
        setIsAutoConnecting(true);
        await new Promise((r) => setTimeout(r, 800));
        if (!mountedRef.current) return;
        console.log("[ClassicBT] Auto-reconnecting to:", saved.name);
        await connectToDevice(saved, true);
      } catch (e: any) {
        console.log("[ClassicBT] Auto-reconnect failed:", e?.message);
      } finally {
        if (mountedRef.current) setIsAutoConnecting(false);
      }
    })();
  }, [connectToDevice]);

  // ── Notice a dropped connection (scale switched off / out of range) ──────
  useEffect(() => {
    if (!connectedDevice) return;
    const dev = connectedDevice;
    const id = setInterval(async () => {
      try {
        const up = await RNBluetoothClassic.isDeviceConnected(dev.address);
        if (!up && mountedRef.current) {
          console.log("[ClassicBT] connection dropped — reconnecting");
          setConnectedDevice(null);
          connectToDevice(dev, true);
        }
      } catch {}
    }, 8000);
    return () => clearInterval(id);
  }, [connectedDevice, connectToDevice]);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    try {
      directSubRef.current?.remove?.();
    } catch {}
    directSubRef.current = null;
    if (connectedDevice) {
      RNBluetoothClassic.disconnectFromDevice(connectedDevice.address).catch(
        () => {},
      );
    }
    if (mountedRef.current) {
      setConnectedDevice(null);
      setScaleReading(null);
      setCapturedWeight(null);
    }
  }, [connectedDevice]);

  // ── Paired devices ───────────────────────────────────────────────────────
  const getPairedDevices = useCallback(async () => {
    try {
      setIsScanning(true);
      if (!(await ensureBtPermissions())) {
        throw new Error("Bluetooth permission was denied.");
      }
      const devices = await RNBluetoothClassic.getBondedDevices();
      const mapped: ClassicScaleDevice[] = devices.map((d: any) => ({
        address: d.address,
        name: d.name || d.address,
      }));
      if (mountedRef.current) setPairedDevices(mapped);
    } catch (e: any) {
      if (mountedRef.current)
        setError(e?.message || "Failed to get paired devices");
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  }, []);

  const clearSavedDevice = useCallback(async () => {
    await AsyncStorage.removeItem(SAVED_CLASSIC_KEY);
    if (mountedRef.current) setSavedDevice(null);
  }, []);

  const captureWeight = useCallback(() => {
    if (scaleReading && mountedRef.current)
      setCapturedWeight({ ...scaleReading });
  }, [scaleReading]);

  const enableBluetooth = useCallback(async () => {
    try {
      await RNBluetoothClassic.requestBluetoothEnabled();
      if (mountedRef.current) setIsEnabled(true);
    } catch (e: any) {
      if (mountedRef.current)
        setError(e?.message || "Failed to enable Bluetooth");
    }
  }, []);

  return {
    pairedDevices,
    connectedDevice,
    scaleReading,
    capturedWeight,
    savedDevice,
    isConnecting,
    isAutoConnecting,
    isScanning,
    isEnabled,
    error,
    getPairedDevices,
    connectToDevice: (d: ClassicScaleDevice) => connectToDevice(d, false),
    disconnect,
    clearSavedDevice,
    captureWeight,
    enableBluetooth,
  };
}
