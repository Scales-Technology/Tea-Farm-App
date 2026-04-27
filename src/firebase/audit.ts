import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export const logAudit = async (params: {
  orgId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string;
  outcome: "success" | "failure" | "pending";
  details?: string;
}) => {
  try {
    await addDoc(collection(db, `organizations/${params.orgId}/audit_logs`), {
      ...params,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Audit log failed:", e);
  }
};

export const getAuditLogs = async (orgId: string) => {
  const snap = await getDocs(
    query(
      collection(db, `organizations/${orgId}/audit_logs`),
      orderBy("createdAt", "desc")
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};