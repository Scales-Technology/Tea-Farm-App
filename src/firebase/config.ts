// ─── Firebase Configuration ───────────────────────────────────────────────────
// react-native-firebase reads google-services.json automatically
// No manual config needed here — just export the instances

import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

export const firebaseAuth = auth;
export const db = firestore;

// ─── Firestore Collection Names ───────────────────────────────────────────────

export const COLLECTIONS = {
  ORGANIZATIONS: "organizations",
  USERS:         "users",
  FARMERS:       "farmers",
  PLUCKERS:      "pluckers",
  ATTENDANCE:    "attendance",
  COLLECTIONS:   "collections",
  PAYMENTS:      "payments",
  SALES:         "sales",
  INVENTORY:     "inventory",
  EXPENSES:      "expenses",
  FARM_INPUTS:   "farm_inputs",
  AUDIT_LOGS:    "audit_logs",
} as const;

// ─── Firestore Timestamps ─────────────────────────────────────────────────────

export const serverTimestamp = firestore.FieldValue.serverTimestamp;
export const Timestamp = firestore.Timestamp;