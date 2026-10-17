// ─── Bluetooth receipt printer hook ───────────────────────────────────────────
// Remembers the chosen printer, keeps it connected, prints receipts.
// Printing is classic Bluetooth (same as wmszip), whichever way the scale
// is connected (BLE or classic).

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { useBluetooth } from "rn-bluetooth-classic";
import {
  PrinterSettings,
  DEFAULT_PRINTER_SETTINGS,
  loadPrinterSettings,
  savePrinterSettings,
} from "../services/printerSettings";
import { printReceipt, printTestPage } from "../services/printService";
import { PrinterMode } from "../utils/escpos";

export interface PrinterDevice {
  address: string;
  name?: string;
}

export function usePrinter() {
  const bt = useBluetooth();
  const btRef = useRef(bt);
  btRef.current = bt;

  const [settings, setSettings] = useState<PrinterSettings>(
    DEFAULT_PRINTER_SETTINGS,
  );
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [paired, setPaired] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastError, setLastError] = useState("");
  const connectingRef = useRef(false);

  const ensurePermissions = useCallback(
    async (forScan = false): Promise<boolean> => {
      if (Platform.OS !== "android") return true;
      const P = PermissionsAndroid.PERMISSIONS;
      if (Number(Platform.Version) >= 31) {
        const wanted = forScan
          ? [P.BLUETOOTH_CONNECT, P.BLUETOOTH_SCAN, P.ACCESS_FINE_LOCATION]
          : [P.BLUETOOTH_CONNECT];
        const res = await PermissionsAndroid.requestMultiple(wanted);
        return wanted.every(
          (p) => res[p] === PermissionsAndroid.RESULTS.GRANTED,
        );
      }
      if (forScan) {
        const r = await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION);
        return r === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    },
    [],
  );

  const update = useCallback(async (patch: Partial<PrinterSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await savePrinterSettings(next);
  }, []);

  useEffect(() => {
    loadPrinterSettings().then((s) => {
      setSettings(s);
      settingsRef.current = s;
      setLoaded(true);
    });
  }, []);

  const connectPrinter = useCallback(
    async (addressArg?: string): Promise<boolean> => {
      const address = addressArg ?? settingsRef.current.printerAddress;
      if (!address || connectingRef.current) return false;
      connectingRef.current = true;
      setConnecting(true);
      try {
        if (!(await ensurePermissions()))
          throw new Error("Bluetooth permission was denied.");
        await RNBluetoothClassic.connectToDevice(address);
        setConnected(true);
        setLastError("");
        return true;
      } catch (e: any) {
        setConnected(false);
        setLastError(e?.message || "Could not connect to the printer.");
        return false;
      } finally {
        connectingRef.current = false;
        setConnecting(false);
      }
    },
    [ensurePermissions],
  );

  const refreshStatus = useCallback(async () => {
    const address = settingsRef.current.printerAddress;
    if (!address) {
      setConnected(false);
      return false;
    }
    try {
      const up = await RNBluetoothClassic.isDeviceConnected(address);
      setConnected(up);
      return up;
    } catch (_) {
      setConnected(false);
      return false;
    }
  }, []);

  // Warm up: connect to the saved printer once when the screen opens, so the
  // first receipt does not have to wait for the connection.
  useEffect(() => {
    if (!loaded || !settings.printerAddress) return;
    (async () => {
      if (!(await refreshStatus()))
        await connectPrinter(settings.printerAddress);
    })();
  }, [loaded, settings.printerAddress]);

  const selectPrinter = useCallback(
    async (d: PrinterDevice): Promise<boolean> => {
      await update({
        printerAddress: d.address,
        printerName: d.name || d.address,
      });
      return connectPrinter(d.address);
    },
    [update, connectPrinter],
  );

  const setPrinterMode = useCallback(
    (m: PrinterMode) => update({ printerMode: m }),
    [update],
  );
  const setAutoPrint = useCallback(
    (v: boolean) => update({ autoPrint: v }),
    [update],
  );

  const refreshPaired = useCallback(async () => {
    try {
      if (!(await ensurePermissions())) return;
      const list = await RNBluetoothClassic.getBondedDevices();
      setPaired(list.map((d: any) => ({ address: d.address, name: d.name })));
    } catch (e: any) {
      setLastError(e?.message || "Could not load paired devices.");
    }
  }, [ensurePermissions]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      if (!(await ensurePermissions(true))) {
        throw new Error("Bluetooth / location permission was denied.");
      }
      await btRef.current.scanForDevices();
    } catch (e: any) {
      setLastError(e?.message || "Scan failed.");
    } finally {
      setScanning(false);
    }
  }, [ensurePermissions]);

  const found: PrinterDevice[] = (bt.devices || [])
    .filter((d: any) => !paired.some((p) => p.address === d.address))
    .map((d: any) => ({ address: d.address, name: d.name }));

  /** Sends a receipt. Throws an Error with a readable message when it fails. */
  const print = useCallback(async (text: string) => {
    const s = settingsRef.current;
    await printReceipt(btRef.current.writeToDevice, text, {
      address: s.printerAddress,
      mode: s.printerMode,
    });
    setConnected(true);
  }, []);

  const printTest = useCallback(async (level: 1 | 2 | 3) => {
    const s = settingsRef.current;
    await printTestPage(btRef.current.writeToDevice, level, {
      address: s.printerAddress,
      mode: s.printerMode,
    });
  }, []);

  return {
    settings,
    connected,
    connecting,
    paired,
    found,
    scanning,
    lastError,
    refreshStatus,
    refreshPaired,
    scan,
    selectPrinter,
    setPrinterMode,
    setAutoPrint,
    print,
    printTest,
  };
}

export type PrinterController = ReturnType<typeof usePrinter>;
