// ─── Batch Number Generator ───────────────────────────────────────────────────

export const generateBatchNumber = (): string => {
  const now = new Date();
  const year  = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");
  const time  = String(now.getTime()).slice(-5);
  return `TEA-${year}${month}${day}-${time}`;
};

// ─── Format currency ──────────────────────────────────────────────────────────

export const formatCurrency = (amount: number, currency = "KSh"): string => {
  return `${currency} ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ─── Format weight ────────────────────────────────────────────────────────────

export const formatWeight = (kg: number): string => {
  return `${kg.toFixed(2)} kg`;
};

// ─── Format date ──────────────────────────────────────────────────────────────

export const formatDate = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-KE", {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
  });
};

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-KE", {
    hour:   "2-digit",
    minute: "2-digit",
  });
};

export const formatDateTime = (date: Date): string => {
  return `${formatDate(date)} ${formatTime(date)}`;
};

export const todayString = (): string => {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
};

export const currentTimeString = (): string => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

// ─── Role display names ───────────────────────────────────────────────────────

export const getRoleDisplayName = (role: string): string => {
  const names: Record<string, string> = {
    admin:                "Admin",
    collector_supervisor: "Collector Supervisor",
    sales_supervisor:     "Sales Supervisor",
    main_supervisor:      "Main Supervisor",
  };
  return names[role] || role;
};

// ─── Payment method display ───────────────────────────────────────────────────

export const getPaymentMethodDisplay = (method: string): string => {
  const display: Record<string, string> = {
    cash:  "Cash",
    bank:  "Bank Transfer",
    mpesa: "M-Pesa",
  };
  return display[method] || method;
};