// Minimal typings for the provider/hook package used by wmszip.
declare module "rn-bluetooth-classic" {
  import * as React from "react";

  export const BluetoothProvider: React.ComponentType<{
    children?: React.ReactNode;
  }>;

  export function useBluetooth(): {
    devices: Array<{ address: string; name?: string; [key: string]: any }>;
    connectedDevice?: any;
    receivedData?: any;
    isConnected?: boolean;
    scanForDevices: () => Promise<any>;
    connectToDevice: (address: string) => Promise<any>;
    disconnectDevice?: (...args: any[]) => Promise<any>;
    writeToDevice: (
      address: string,
      data: string,
      encoding?: string,
    ) => Promise<any>;
    readFromDevice?: (...args: any[]) => Promise<any>;
    [key: string]: any;
  };
}
