// src/utils/offlineSave.ts
import NetInfo from "@react-native-community/netinfo";
import {
  getFirestore, collection, addDoc, serverTimestamp,
} from "@react-native-firebase/firestore";
import { enqueuePendingWrite } from "../hooks/useOfflineCache";

const db = getFirestore();

interface SaveResult {
  savedOnline: boolean;
  id?:         string;   // Firestore doc ID (only when online)
}

// Drop this in wherever you currently call addDoc
export async function offlineSave(
  collectionName: string,
  data: Record<string, any>
): Promise<SaveResult> {
  const network = await NetInfo.fetch();
  const online  = !!network.isConnected && !!network.isInternetReachable;

  if (online) {
    // Online — write directly, same as before
    const ref = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return { savedOnline: true, id: ref.id };
  } else {
    // Offline — queue for later
    await enqueuePendingWrite({ collectionName, data });
    return { savedOnline: false };
  }
}