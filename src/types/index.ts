// ─── Tea Farm App — Global Types ─────────────────────────────────────────────

export type UserRole =
  | "admin"
  | "collector_supervisor"
  | "sales_supervisor"
  | "main_supervisor";

export type PaymentMethod = "cash" | "bank" | "mpesa";
export type PaymentDuration = "daily" | "weekly" | "monthly";
export type PaymentStatus = "pending" | "paid" | "failed";
export type TeaGrade = "A" | "B";
export type Language = "en" | "sw";

// ─── User / Employee ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  organizationId: string;
  createdAt: Date;
  isActive: boolean;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  farmName: string;
  location: string;
  ownerName: string;
  phone: string;
  email: string;
  createdAt: Date;
}

// ─── Farmer ───────────────────────────────────────────────────────────────────

export interface Farmer {
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  location: string;
  paymentMethod: PaymentMethod;
  paymentDuration: PaymentDuration;
  paymentDetails: string; // account number, mpesa number etc
  organizationId: string;
  createdAt: Date;
  isActive: boolean;
  totalKgCollected?: number;
  totalAmountPaid?: number;
}

// ─── Plucker ──────────────────────────────────────────────────────────────────

export interface Plucker {
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  pluckZone: string;
  farmName: string;
  location: string;
  paymentMethod: PaymentMethod;
  paymentDuration: PaymentDuration;
  paymentDetails: string;
  organizationId: string;
  createdAt: Date;
  isActive: boolean;
  totalKgCollected?: number;
  totalAmountPaid?: number;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  pluckerId: string;
  pluckerName: string;
  date: string; // YYYY-MM-DD
  arrivalTime: string; // HH:MM
  organizationId: string;
}

// ─── Collection ───────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  batchNumber: string;
  sourceType: "plucker" | "farmer";
  sourceId: string;
  sourceName: string;
  weightKg: number;
  pricePerKg: number;
  totalAmount: number;
  collectedBy: string; // employee id
  collectedByName: string;
  organizationId: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
  receiptPrinted: boolean;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  sourceType: "plucker" | "farmer";
  sourceId: string;
  sourceName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  proofImageUrl?: string;
  processedBy: string;
  processedByName: string;
  organizationId: string;
  date: string;
  createdAt: Date;
  collectionIds: string[]; // which collections this payment covers
}

// ─── Sale ─────────────────────────────────────────────────────────────────────

export interface Sale {
  id: string;
  batchNumber: string;
  gradeA_kg: number;
  gradeB_kg: number;
  gradeA_pricePerKg: number;
  gradeB_pricePerKg: number;
  gradeA_total: number;
  gradeB_total: number;
  totalAmount: number;
  buyerName: string; // tea factory name
  soldBy: string;
  soldByName: string;
  organizationId: string;
  date: string;
  createdAt: Date;
  receiptPrinted: boolean;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventorySnapshot {
  id: string;
  organizationId: string;
  date: string;
  totalCollectedKg: number;
  totalSoldKg: number;
  totalRejectedKg: number;
  inStockKg: number;
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  category: string; // wages, transport, maintenance, etc
  description: string;
  amount: number;
  recordedBy: string;
  recordedByName: string;
  organizationId: string;
  date: string;
  createdAt: Date;
}

// ─── Farm Input ───────────────────────────────────────────────────────────────

export interface FarmInput {
  id: string;
  itemName: string; // fertilizer, seedlings, tools
  quantity: number;
  unit: string; // kg, bags, pieces
  supplier: string;
  cost: number;
  receivedBy: string;
  receivedByName: string;
  organizationId: string;
  date: string;
  createdAt: Date;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string; // "registered farmer", "processed payment", etc
  module: string; // "farmers", "payments", "collections", etc
  outcome: "success" | "failure" | "pending";
  details?: string;
  organizationId: string;
  createdAt: Date;
}

// ─── Navigation params ────────────────────────────────────────────────────────

export interface CollectionFormParams {
  sourceType: "plucker" | "farmer";
  sourceId: string;
  sourceName: string;
}

export interface PaymentFormParams {
  sourceType: "plucker" | "farmer";
  sourceId: string;
  sourceName: string;
  pendingAmount: number;
}