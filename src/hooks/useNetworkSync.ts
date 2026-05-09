// src/hooks/useNetworkSync.ts
import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  getFirestore, collection, addDoc, serverTimestamp,
} from "@react-native-firebase/firestore";
import { getPendingWrites, clearPendingWrites } from "./useOfflineCache";

const db = getFirestore();

export function useNetworkSync() {
  const isSyncing  = useRef(false);
  const isOnline   = useRef(true);

  const flushPendingWrites = async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      const pending = await getPendingWrites();
      if (pending.length === 0) return;

      console.log(`📡 Syncing ${pending.length} offline write(s)...`);

      for (const write of pending) {
        await addDoc(collection(db, write.collectionName), {
          ...write.data,
          createdAt:  serverTimestamp(),
          syncedAt:   serverTimestamp(),
          wasOffline: true,
        });
      }

      await clearPendingWrites();
      console.log("✅ Offline writes synced successfully");
    } catch (e: any) {
      console.log("⚠️ Sync failed, will retry on next connection:", e.message);
    } finally {
      isSyncing.current = false;
    }
  };

  useEffect(() => {
    // Listen for connectivity changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const nowOnline = !!state.isConnected && !!state.isInternetReachable;
      // Flush only when transitioning from offline → online
      if (!isOnline.current && nowOnline) {
        flushPendingWrites();
      }
      isOnline.current = nowOnline;
    });

    // Also attempt flush on mount (in case there are stale writes from last session)
    NetInfo.fetch().then(state => {
      if (state.isConnected) flushPendingWrites();
    });

    return () => unsubscribe();
  }, []);
}