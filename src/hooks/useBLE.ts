import { useState, useRef, useEffect } from "react";
import { BleManager, Device } from "react-native-ble-plx";
import { PermissionsAndroid, Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import base64 from "base64-js";

const WEIGHT_SERVICE_UUID  = "0000ffe0-0000-1000-8000-00805f9b34fb";
const WEIGHT_CHAR_UUID     = "0000ffe1-0000-1000-8000-00805f9b34fb";
const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_CHAR_UUID    = "00002a19-0000-1000-8000-00805f9b34fb";
const SAVED_DEVICE_KEY     = "ble_scale_saved_device";

const STATUS_STABLE = 0x42;
const STATUS_IDLE_A = 0x41;
const STATUS_IDLE_B = 0x43;

const KEEPALIVE_MS  = 9000;
const MAX_RECONNECT = 10;

// How long to wait before showing disconnected UI.
// JDY-23 reconnects in ~2s so user never sees the disconnect.
const UI_DISCONNECT_DELAY_MS = 8000;

const bleManager = new BleManager();

export interface ScaleReading {
  weight: number;
  unit: "kg" | "lbs";
  isStable: boolean;
  timestamp: Date;
}

export interface SavedDevice {
  id: string;
  name: string;
}

export function useBLE() {
  const [isScanning,        setIsScanning]        = useState(false);
  const [connectedDevice,   setConnectedDevice]   = useState<Device | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);
  const [scaleReading,      setScaleReading]      = useState<ScaleReading | null>(null);
  const [capturedWeight,    setCapturedWeight]    = useState<ScaleReading | null>(null);
  const [savedDevice,       setSavedDevice]       = useState<SavedDevice | null>(null);
  const [isAutoConnecting,  setIsAutoConnecting]  = useState(false);

  const deviceRef              = useRef<Device | null>(null);
  const sessionIdRef           = useRef(0);
  const disconnectSubRef       = useRef<any>(null);
  const monitorSubRef          = useRef<any>(null);
  const keepaliveTimerRef      = useRef<any>(null);
  const reconnectTimerRef      = useRef<any>(null);
  const uiDisconnectTimerRef   = useRef<any>(null);
  const isConnectingRef        = useRef(false);
  const shouldReconnectRef     = useRef(false);
  const lastDeviceRef          = useRef<Device | null>(null);
  const autoConnectAttemptRef  = useRef(false);
  const lastScaleReadingRef    = useRef<ScaleReading | null>(null);

  useEffect(() => {
    loadSavedDevice();
    return () => {
      shouldReconnectRef.current = false;
      cleanupSession();
    };
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const cleanupSession = () => {
    if (monitorSubRef.current) {
      try { monitorSubRef.current.remove(); } catch (_) {}
      monitorSubRef.current = null;
    }
    if (keepaliveTimerRef.current) {
      clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (disconnectSubRef.current) {
      try { disconnectSubRef.current.remove(); } catch (_) {}
      disconnectSubRef.current = null;
    }
  };

  const cancelUiDisconnectTimer = () => {
    if (uiDisconnectTimerRef.current) {
      clearTimeout(uiDisconnectTimerRef.current);
      uiDisconnectTimerRef.current = null;
    }
  };

  const parseWeightData = (value: string): ScaleReading | null => {
    try {
      const bytes = base64.toByteArray(value);
      if (bytes.length !== 11) return null;
      if (bytes[0] !== 0x02 || bytes[10] !== 0x0d) return null;

      const status = bytes[1];

      // Skip idle packets — scale not active
      if (status === STATUS_IDLE_A || status === STATUS_IDLE_B) return null;

      // Extract ASCII weight string from bytes 2–8
      let weightStr = "";
      for (let i = 2; i <= 8; i++) weightStr += String.fromCharCode(bytes[i]);
      weightStr = weightStr.trim();

      const isImperial = weightStr.toLowerCase().includes("l");
      const unit: "kg" | "lbs" = isImperial ? "lbs" : "kg";

      const numericStr = weightStr.replace(/[^0-9.]/g, "");
      if (!numericStr) return null;

      const weightValue = parseFloat(numericStr);
      if (isNaN(weightValue)) return null;

      // FIX: Round to 2 decimal places.
      // Values like 0.01 from an empty scale get rounded to 0.00.
      // We allow 0.00 through — the UI will display it correctly.
      const finalWeight =
        unit === "kg"
          ? Math.round(weightValue * 100) / 100
          : Math.round(weightValue * 10) / 10;

      return {
        weight: finalWeight,
        unit,
        isStable: status === STATUS_STABLE,
        timestamp: new Date(),
      };
    } catch (_) { return null; }
  };

  const startKeepalive = (device: Device, sessionId: number) => {
    if (keepaliveTimerRef.current) {
      clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
    keepaliveTimerRef.current = setInterval(async () => {
      if (sessionIdRef.current !== sessionId || !deviceRef.current) {
        clearInterval(keepaliveTimerRef.current!);
        keepaliveTimerRef.current = null;
        return;
      }
      try {
        await device.readCharacteristicForService(
          BATTERY_SERVICE_UUID,
          BATTERY_CHAR_UUID
        );
      } catch (_) {}
    }, KEEPALIVE_MS);
  };

  const loadSavedDevice = async () => {
    try {
      const saved = await AsyncStorage.getItem(SAVED_DEVICE_KEY);
      if (saved) {
        const d: SavedDevice = JSON.parse(saved);
        setSavedDevice(d);
        setTimeout(() => autoConnectToSaved(d), 2000);
      }
    } catch (_) {}
  };

  const saveDevice = async (device: Device) => {
    try {
      const toSave: SavedDevice = {
        id: device.id,
        name: device.name || device.localName || "BLE Scale",
      };
      await AsyncStorage.setItem(SAVED_DEVICE_KEY, JSON.stringify(toSave));
      setSavedDevice(toSave);
    } catch (_) {}
  };

  const clearSavedDevice = async () => {
    try {
      await AsyncStorage.removeItem(SAVED_DEVICE_KEY);
      setSavedDevice(null);
    } catch (_) {}
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    if ((Platform.Version as number) >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  };

  const scheduleReconnect = (device: Device, attempt: number) => {
    if (!shouldReconnectRef.current) return;
    if (attempt > MAX_RECONNECT) {
      console.log("Max reconnect attempts reached — scale is off");
      cancelUiDisconnectTimer();
      setConnectedDevice(null);
      setScaleReading(null);
      setIsAutoConnecting(false);
      shouldReconnectRef.current = false;
      Alert.alert(
        "Scale Disconnected",
        "Scale appears to be off or out of range. Please reconnect manually."
      );
      return;
    }
    const delay = Math.min(2000 + (attempt - 1) * 500, 5000);
    reconnectTimerRef.current = setTimeout(async () => {
      if (!shouldReconnectRef.current) return;
      try {
        await connectToDeviceInternal(device);
        cancelUiDisconnectTimer();
        setIsAutoConnecting(false);
      } catch (_) {
        scheduleReconnect(device, attempt + 1);
      }
    }, delay);
  };

  const connectToDeviceInternal = async (device: Device) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    const mySession = ++sessionIdRef.current;

    try {
      cleanupSession();

      if (deviceRef.current) {
        try { await deviceRef.current.cancelConnection(); } catch (_) {}
        deviceRef.current = null;
        await sleep(800);
      }

      const connected = await device.connect({
        timeout:     15000,
        autoConnect: false,
      });

      if (sessionIdRef.current !== mySession) {
        connected.cancelConnection().catch(() => {});
        return;
      }

      await connected.discoverAllServicesAndCharacteristics();

      if (sessionIdRef.current !== mySession) {
        connected.cancelConnection().catch(() => {});
        return;
      }

      await sleep(1200);

      deviceRef.current          = connected;
      lastDeviceRef.current      = device;
      shouldReconnectRef.current = true;

      setConnectedDevice(connected);
      // Restore last known reading so screen never goes blank during reconnect
      if (lastScaleReadingRef.current) {
        setScaleReading(lastScaleReadingRef.current);
      }
      await saveDevice(device);

      if (disconnectSubRef.current) {
        try { disconnectSubRef.current.remove(); } catch (_) {}
        disconnectSubRef.current = null;
      }

      disconnectSubRef.current = bleManager.onDeviceDisconnected(
        device.id,
        () => {
          if (sessionIdRef.current !== mySession) return;
          console.log("Device disconnected — reconnecting silently...");
          cleanupSession();
          deviceRef.current = null;

          if (shouldReconnectRef.current && lastDeviceRef.current) {
            setIsAutoConnecting(true);

            // Delay UI update — if reconnect succeeds fast user sees nothing
            cancelUiDisconnectTimer();
            uiDisconnectTimerRef.current = setTimeout(() => {
              setConnectedDevice(null);
              setScaleReading(null);
            }, UI_DISCONNECT_DELAY_MS);

            scheduleReconnect(lastDeviceRef.current, 1);
          } else {
            setConnectedDevice(null);
            setScaleReading(null);
          }
        }
      );

      monitorSubRef.current = connected.monitorCharacteristicForService(
        WEIGHT_SERVICE_UUID,
        WEIGHT_CHAR_UUID,
        (error: any, characteristic: any) => {
          if (sessionIdRef.current !== mySession) return;
          if (error) {
            if (
              !error.message?.includes("cancelled") &&
              !error.message?.includes("destroyed") &&
              !error.message?.includes("disconnected")
            ) {
              console.log("Monitor error:", error.message);
            }
            return;
          }
          if (characteristic?.value) {
            const reading = parseWeightData(characteristic.value);
            if (reading) {
              lastScaleReadingRef.current = reading;
              setScaleReading(reading);
            }
          }
        }
      );

      startKeepalive(connected, mySession);
      console.log("✅ Connected and stable!");

    } catch (error: any) {
      console.log("Connection error:", error?.message || error);
      if (sessionIdRef.current === mySession) {
        cleanupSession();
        deviceRef.current = null;
      }
      throw error;
    } finally {
      isConnectingRef.current = false;
    }
  };

  const autoConnectToSaved = async (saved: SavedDevice) => {
    if (autoConnectAttemptRef.current) return;
    autoConnectAttemptRef.current = true;
    setIsAutoConnecting(true);
    try {
      const ok = await requestPermissions();
      if (!ok) {
        setIsAutoConnecting(false);
        autoConnectAttemptRef.current = false;
        return;
      }
      bleManager.startDeviceScan(
        null,
        { allowDuplicates: false },
        async (err, scanned) => {
          if (err) {
            setIsAutoConnecting(false);
            autoConnectAttemptRef.current = false;
            return;
          }
          if (scanned && scanned.id === saved.id) {
            bleManager.stopDeviceScan();
            try { await connectToDeviceInternal(scanned); } catch (_) {}
            setIsAutoConnecting(false);
            autoConnectAttemptRef.current = false;
          }
        }
      );
      setTimeout(() => {
        bleManager.stopDeviceScan();
        setIsAutoConnecting(false);
        autoConnectAttemptRef.current = false;
      }, 20000);
    } catch (_) {
      setIsAutoConnecting(false);
      autoConnectAttemptRef.current = false;
    }
  };

  const startScan = async () => {
    const ok = await requestPermissions();
    if (!ok) {
      Alert.alert("Permission Required", "Bluetooth permissions needed.");
      return;
    }
    setDiscoveredDevices([]);
    setIsScanning(true);
    bleManager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (err, device) => {
        if (err) { setIsScanning(false); return; }
        if (device && (device.name || device.localName)) {
          setDiscoveredDevices((prev) =>
            prev.find((d) => d.id === device.id) ? prev : [...prev, device]
          );
        }
      }
    );
    setTimeout(() => {
      bleManager.stopDeviceScan();
      setIsScanning(false);
    }, 15000);
  };

  const stopScan = () => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
  };

  const connectToDevice = async (device: Device) => {
    bleManager.stopDeviceScan();
    setIsScanning(false);
    try { await connectToDeviceInternal(device); }
    catch (e: any) { Alert.alert("Connection Failed", e?.message || "Could not connect."); }
  };

  const disconnect = async () => {
    shouldReconnectRef.current  = false;
    lastDeviceRef.current       = null;
    lastScaleReadingRef.current = null;
    sessionIdRef.current++;
    cancelUiDisconnectTimer();
    cleanupSession();
    if (deviceRef.current) {
      try { await deviceRef.current.cancelConnection(); } catch (_) {}
      deviceRef.current = null;
    }
    setConnectedDevice(null);
    setScaleReading(null);
    setCapturedWeight(null);
    setIsAutoConnecting(false);
  };

  const captureWeight = () => {
    if (scaleReading) {
      setCapturedWeight({ ...scaleReading, timestamp: new Date() });
      Alert.alert(
        "✅ Weight Captured",
        `${scaleReading.weight.toFixed(2)} ${scaleReading.unit}`
      );
      setScaleReading(null);
    } else {
      Alert.alert("No Reading", "Please place weight on scale first.");
    }
  };

  return {
    isScanning,
    connectedDevice,
    discoveredDevices,
    scaleReading,
    capturedWeight,
    savedDevice,
    isAutoConnecting,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    captureWeight,
    clearSavedDevice,
  };
}