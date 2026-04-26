// ─── Firebase Auth Service ────────────────────────────────────────────────────

import { firebaseAuth, db, COLLECTIONS, serverTimestamp } from "./config";
import { User, UserRole } from "../types";

// ─── Login ────────────────────────────────────────────────────────────────────

export const loginUser = async (
  email: string,
  password: string
): Promise<User> => {
  const credential = await firebaseAuth().signInWithEmailAndPassword(
    email.trim().toLowerCase(),
    password
  );

  const uid = credential.user.uid;
  const userDoc = await db().collection(COLLECTIONS.USERS).doc(uid).get();

  if (!userDoc.exists) {
    throw new Error("User account not found. Contact your administrator.");
  }

  const data = userDoc.data()!;

  if (!data.isActive) {
    throw new Error("Your account has been deactivated. Contact your administrator.");
  }

  return {
    id:             uid,
    name:           data.name,
    email:          data.email,
    role:           data.role as UserRole,
    phone:          data.phone,
    organizationId: data.organizationId,
    createdAt:      data.createdAt?.toDate(),
    isActive:       data.isActive,
  };
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logoutUser = async (): Promise<void> => {
  await firebaseAuth().signOut();
};

// ─── Get current user profile ─────────────────────────────────────────────────

export const getCurrentUserProfile = async (): Promise<User | null> => {
  const firebaseUser = firebaseAuth().currentUser;
  if (!firebaseUser) return null;

  const userDoc = await db()
    .collection(COLLECTIONS.USERS)
    .doc(firebaseUser.uid)
    .get();

  if (!userDoc.exists) return null;

  const data = userDoc.data()!;
  return {
    id:             firebaseUser.uid,
    name:           data.name,
    email:          data.email,
    role:           data.role as UserRole,
    phone:          data.phone,
    organizationId: data.organizationId,
    createdAt:      data.createdAt?.toDate(),
    isActive:       data.isActive,
  };
};

// ─── Create employee account (Admin only) ─────────────────────────────────────

export const createEmployeeAccount = async (
  name: string,
  email: string,
  password: string,
  role: UserRole,
  phone: string,
  organizationId: string,
  createdByName: string,
  createdById: string
): Promise<string> => {
  const credential = await firebaseAuth().createUserWithEmailAndPassword(
    email.trim().toLowerCase(),
    password
  );

  const uid = credential.user.uid;

  await db().collection(COLLECTIONS.USERS).doc(uid).set({
    name,
    email:          email.trim().toLowerCase(),
    role,
    phone,
    organizationId,
    isActive:       true,
    createdAt:      serverTimestamp(),
  });

  // Audit log
  await db().collection(COLLECTIONS.AUDIT_LOGS).add({
    actorId:        createdById,
    actorName:      createdByName,
    actorRole:      "admin",
    action:         `Created employee account for ${name} (${role})`,
    module:         "employees",
    outcome:        "success",
    organizationId,
    createdAt:      serverTimestamp(),
  });

  return uid;
};

// ─── Reset password ───────────────────────────────────────────────────────────

export const resetPassword = async (email: string): Promise<void> => {
  await firebaseAuth().sendPasswordResetEmail(email.trim().toLowerCase());
};

// ─── Auth state listener ──────────────────────────────────────────────────────

export const onAuthStateChanged = (
  callback: (user: any) => void
) => {
  return firebaseAuth().onAuthStateChanged(callback);
};