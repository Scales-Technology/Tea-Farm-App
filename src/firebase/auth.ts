import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { User, UserRole } from "../types";

const USERS      = "users";
const AUDIT_LOGS = "audit_logs";

// ── Login ─────────────────────────────────────────────────────────────────────
export const loginUser = async (email: string, password: string): Promise<User> => {
  const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const uid        = credential.user.uid;
  const userDoc    = await getDoc(doc(db, USERS, uid));

  if (!userDoc.exists()) throw new Error("User account not found. Contact your administrator.");

  const data = userDoc.data()!;
  if (!data.isActive) throw new Error("Your account has been deactivated. Contact your administrator.");

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

// ── Logout ────────────────────────────────────────────────────────────────────
export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};

// ── Get current user profile ──────────────────────────────────────────────────
export const getCurrentUserProfile = async (): Promise<User | null> => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;

  const userDoc = await getDoc(doc(db, USERS, firebaseUser.uid));
  if (!userDoc.exists()) return null;

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

// ── Create employee account (Admin only) ──────────────────────────────────────
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
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password
  );
  const uid = credential.user.uid;

  await setDoc(doc(db, USERS, uid), {
    name,
    email:          email.trim().toLowerCase(),
    role,
    phone,
    organizationId,
    isActive:       true,
    createdAt:      serverTimestamp(),
  });

  await addDoc(collection(db, AUDIT_LOGS), {
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

// ── Reset password ────────────────────────────────────────────────────────────
export const resetPassword = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
};

// ── Auth state listener ───────────────────────────────────────────────────────
export const onAuthStateChanged = (callback: (user: any) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};