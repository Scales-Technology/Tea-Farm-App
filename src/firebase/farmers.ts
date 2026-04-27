import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { logAudit } from "./audit";

export const addFarmer = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/farmers`), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action: "farmer_registered",
    entity: "farmers",
    entityId: ref.id,
    outcome: "success",
    details: `Farmer ${data.name} registered`,
  });
  return ref.id;
};

export const getFarmers = async (orgId: string) => {
  const snap = await getDocs(collection(db, `organizations/${orgId}/farmers`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updateFarmer = async (orgId: string, farmerId: string, data: any) => {
  await updateDoc(doc(db, `organizations/${orgId}/farmers`, farmerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteFarmer = async (orgId: string, farmerId: string) => {
  await deleteDoc(doc(db, `organizations/${orgId}/farmers`, farmerId));
};