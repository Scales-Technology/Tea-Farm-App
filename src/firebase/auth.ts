// ─── Firebase Auth Service — v24 Namespaced API ───────────────────────────────
import firestore from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import { User, UserRole } from "../types";

const db = firestore();
const fa = auth();

export const COLLECTIONS = {
  ORGANIZATIONS: "organizations",
  USERS: "users",
  FARMERS: "farmers",
  PLUCKERS: "pluckers",
  ATTENDANCE: "attendance",
  COLLECTIONS: "collections",
  PAYMENTS: "payments",
  GRADINGS: "gradings",
  SALES: "sales",
  INVENTORY: "inventory",
  EXPENSES: "expenses",
  FARM_INPUTS: "farm_inputs",
  AUDIT_LOGS: "audit_logs",
};

// ─── Register Organization + Admin ────────────────────────────────────────────
export const registerOrganization = async (
  farmName: string,
  location: string,
  ownerName: string,
  phone: string,
  email: string,
  password: string,
): Promise<void> => {
  const credential = await fa.createUserWithEmailAndPassword(
    email.trim().toLowerCase(),
    password,
  );
  const uid = credential.user.uid;
  const orgRef = await db.collection(COLLECTIONS.ORGANIZATIONS).add({
    farmName,
    location,
    ownerName,
    phone,
    email: email.trim().toLowerCase(),
    adminId: uid,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  await db.collection(COLLECTIONS.USERS).doc(uid).set({
    name: ownerName,
    email: email.trim().toLowerCase(),
    role: "admin",
    phone,
    organizationId: orgRef.id,
    isActive: true,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  await orgRef.update({ id: orgRef.id });
};

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginUser = async (
  email: string,
  password: string,
): Promise<User> => {
  const credential = await fa.signInWithEmailAndPassword(
    email.trim().toLowerCase(),
    password,
  );
  const uid = credential.user.uid;
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userDoc.exists)
    throw new Error("User account not found. Contact your administrator.");
  const data = userDoc.data()!;
  if (!data.isActive) {
    await fa.signOut();
    throw new Error(
      "Your account has been restricted. Contact your administrator.",
    );
  }
  return {
    id: uid,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    phone: data.phone,
    organizationId: data.organizationId,
    createdAt: data.createdAt?.toDate(),
    isActive: data.isActive,
  };
};

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logoutUser = async (): Promise<void> => {
  await fa.signOut();
};

// ─── Get current user profile ─────────────────────────────────────────────────
export const getCurrentUserProfile = async (): Promise<User | null> => {
  const firebaseUser = fa.currentUser;
  if (!firebaseUser) return null;
  const userDoc = await db
    .collection(COLLECTIONS.USERS)
    .doc(firebaseUser.uid)
    .get();
  if (!userDoc.exists) return null;
  const data = userDoc.data()!;
  return {
    id: firebaseUser.uid,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    phone: data.phone,
    organizationId: data.organizationId,
    createdAt: data.createdAt?.toDate(),
    isActive: data.isActive,
  };
};

// ─── Create employee account ──────────────────────────────────────────────────
export const createEmployeeAccount = async (
  name: string,
  email: string,
  password: string,
  role: UserRole,
  phone: string,
  organizationId: string,
  createdByName: string,
  createdById: string,
): Promise<string> => {
  const credential = await fa.createUserWithEmailAndPassword(
    email.trim().toLowerCase(),
    password,
  );
  const uid = credential.user.uid;
  await db.collection(COLLECTIONS.USERS).doc(uid).set({
    name,
    email: email.trim().toLowerCase(),
    role,
    phone,
    organizationId,
    isActive: true,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  await db.collection(COLLECTIONS.AUDIT_LOGS).add({
    actorId: createdById,
    actorName: createdByName,
    actorRole: "admin",
    action: `Created employee: ${name} (${role})`,
    module: "employees",
    outcome: "success",
    organizationId,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return uid;
};

// ─── Toggle employee access ───────────────────────────────────────────────────
export const toggleEmployeeAccess = async (
  userId: string,
  isActive: boolean,
  organizationId: string,
  actorName: string,
  actorId: string,
): Promise<void> => {
  // Defense-in-depth alongside the UI guard in EmployeesScreen: the admin
  // is the farm owner and the one who created every other account, so
  // restricting (or, in handleDeactivate, deactivating) the admin account
  // itself is never valid, however this function ends up called.
  const targetSnap = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  if (targetSnap.exists && targetSnap.data()?.role === "admin") {
    throw new Error(
      "The admin account is the farm owner and can't be restricted.",
    );
  }
  await db.collection(COLLECTIONS.USERS).doc(userId).update({ isActive });
  await db.collection(COLLECTIONS.AUDIT_LOGS).add({
    actorId,
    actorName,
    actorRole: "admin",
    action: `${isActive ? "Enabled" : "Restricted"} employee account`,
    module: "employees",
    outcome: "success",
    organizationId,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
};

// ─── Auth state listener ──────────────────────────────────────────────────────
export const onAuthStateChanged = (callback: (user: any) => void) => {
  return fa.onAuthStateChanged(callback);
};
