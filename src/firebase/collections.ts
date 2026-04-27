import {
  collection, addDoc, getDocs, updateDoc,
  doc, query, where, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { logAudit } from "./audit";

export const saveCollection = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/collections`), {
    ...data,
    orgId,
    paid: false,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action: "tea_collection_recorded",
    entity: "collections",
    entityId: ref.id,
    outcome: "success",
    details: `Batch ${data.batchNumber} — ${data.weight}kg`,
  });
  return ref.id;
};

export const getCollections = async (orgId: string) => {
  const snap = await getDocs(
    query(collection(db, `organizations/${orgId}/collections`), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getCollectionsByDate = async (orgId: string, date: string) => {
  const snap = await getDocs(
    query(
      collection(db, `organizations/${orgId}/collections`),
      where("date", "==", date),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const markCollectionPaid = async (orgId: string, collectionId: string, proofUrl: string) => {
  await updateDoc(doc(db, `organizations/${orgId}/collections`, collectionId), {
    paid: true,
    paymentProof: proofUrl,
    paidAt: serverTimestamp(),
  });
};