import {
  collection, addDoc, getDocs,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { logAudit } from "./audit";

export const recordGrading = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/grading`), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action:   "tea_graded",
    entity:   "grading",
    entityId: ref.id,
    outcome:  "success",
    details:  `Grade A: ${data.gradeA}kg, Grade B: ${data.gradeB}kg`,
  });
  return ref.id;
};

export const recordSale = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/sales`), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action:   "tea_sold",
    entity:   "sales",
    entityId: ref.id,
    outcome:  "success",
    details:  `Sold to ${data.soldTo} — KSh ${data.totalAmount}`,
  });
  return ref.id;
};

export const getSales = async (orgId: string) => {
  const snap = await getDocs(
    query(collection(db, `organizations/${orgId}/sales`), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getGrading = async (orgId: string) => {
  const snap = await getDocs(
    query(collection(db, `organizations/${orgId}/grading`), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const recordExpense = async (orgId: string, data: any, actorId: string, actorName: string, actorRole: string) => {
  const ref = await addDoc(collection(db, `organizations/${orgId}/expenses`), {
    ...data,
    orgId,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    orgId, actorId, actorName, actorRole,
    action:   "expense_recorded",
    entity:   "expenses",
    entityId: ref.id,
    outcome:  "success",
    details:  `Expense: ${data.category} — KSh ${data.amount}`,
  });
  return ref.id;
};

export const getExpenses = async (orgId: string) => {
  const snap = await getDocs(
    query(collection(db, `organizations/${orgId}/expenses`), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};