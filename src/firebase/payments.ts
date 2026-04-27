import {
  collection, addDoc, getDocs, updateDoc,
  doc, query, where, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { logAudit } from "./audit";

export const recordPayment = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/payments`), {
    ...data,
    orgId,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action: "payment_recorded",
    entity: "payments",
    entityId: ref.id,
    outcome: "success",
    details: `Payment of KSh ${data.amount} for ${data.recipientName}`,
  });
  return ref.id;
};

export const getPayments = async (orgId: string) => {
  const snap = await getDocs(
    query(collection(db, `organizations/${orgId}/payments`), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getPendingPayments = async (orgId: string) => {
  const snap = await getDocs(
    query(
      collection(db, `organizations/${orgId}/payments`),
      where("status", "==", "pending")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const markPaymentPaid = async (
  orgId: string,
  paymentId: string,
  proofUrl: string,
  actorId: string,
  actorName: string,
  actorRole: string
) => {
  await updateDoc(doc(db, `organizations/${orgId}/payments`, paymentId), {
    status:       "paid",
    paymentProof: proofUrl,
    paidAt:       serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action:   "payment_confirmed",
    entity:   "payments",
    entityId: paymentId,
    outcome:  "success",
    details:  "Payment marked as paid with proof",
  });
};