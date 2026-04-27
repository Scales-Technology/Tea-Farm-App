import {
  collection, addDoc, getDocs, updateDoc,
  deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { logAudit } from "./audit";

export const addPlucker = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/pluckers`), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action:   "plucker_registered",
    entity:   "pluckers",
    entityId: ref.id,
    outcome:  "success",
    details:  `Plucker ${data.name} registered`,
  });
  return ref.id;
};

export const getPluckers = async (orgId: string) => {
  const snap = await getDocs(collection(db, `organizations/${orgId}/pluckers`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updatePlucker = async (orgId: string, pluckerId: string, data: any) => {
  await updateDoc(doc(db, `organizations/${orgId}/pluckers`, pluckerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deletePlucker = async (orgId: string, pluckerId: string) => {
  await deleteDoc(doc(db, `organizations/${orgId}/pluckers`, pluckerId));
};

export const recordAttendance = async (orgId: string, pluckerId: string, pluckerName: string) => {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  await addDoc(collection(db, `organizations/${orgId}/attendance`), {
    pluckerId,
    pluckerName,
    orgId,
    date,
    arrivalTime: now.toLocaleTimeString(),
    createdAt:   serverTimestamp(),
  });
};

export const getAttendanceByDate = async (orgId: string, date: string) => {
  const snap = await getDocs(collection(db, `organizations/${orgId}/attendance`));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => d.date === date);
};