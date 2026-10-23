export type ID = string;

export type Gender = "male" | "female" | "other";
export type PersonType = "member" | "walk_in";
export type MemberShift = "morning" | "evening";

export type ProgressNote = {
  id: ID;
  date: string;
  title: string;
  note: string;
};

export type Measurement = {
  id: ID;
  date: string;
  weightKg: number;
  heightCm: number;
  chestCm: number;
  waistCm: number;
  armsCm: number;
  bodyFat: number;
};

export type Member = {
  id: ID;
  /** Absent on legacy records, which are treated as regular members. */
  type?: PersonType;
  /** Optional gym visit shift. Legacy members without a value are unassigned. */
  shift?: MemberShift | null;
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  dob: string;
  address: string;
  photo?: string | null;
  joinDate: string;
  emergencyContact: string;
  notes: ProgressNote[];
  measurements: Measurement[];
  deletedAt?: string | null;
  deletedBy?: string | null;
};

export type Plan = {
  id: ID;
  name: string;
  price: number;
  /** Default one-time joining fee used when registering a new member. */
  joiningFee?: number;
  durationDays: number;
  description: string;
  active: boolean;
  locked?: boolean;
  deletedAt?: string | null;
};

/** One membership term for a member. Drives status + dues. */
export type Membership = {
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string;
  id: ID;
  memberId: ID;
  planId: ID;
  startDate: string;
  endDate: string;
  price: number;
  discount: number;
  /** Joining fee charged for this specific membership term. */
  joiningFee?: number;
  frozen: boolean;
  frozenAt?: string | null;
  createdAt: string;
};

export type PaymentMethod = "cash" | "upi" | "card" | "bank" | "cheque" | "other";

export type Payment = {
  /** Receipt visibility only; the payment remains part of financial totals. */
  invoiceDeletedAt?: string | null;
  invoiceDeletedBy?: string | null;
  id: ID;
  invoiceNo: string;
  memberId?: ID | null;
  membershipId?: ID | null;
  saleId?: ID | null;
  kind: "membership" | "product" | "other";
  /** Explicitly identifies a payment collected against an outstanding membership balance. */
  purpose?: "membership_balance";
  /** Payer details for standalone walk-in payments that are not member records. */
  payerName?: string;
  payerPhone?: string;
  payerEmail?: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  note: string;
};

export type AttendanceRecord = {
  /** Stable per member and local calendar day to prevent duplicate check-ins. */
  id: ID;
  memberId: ID;
  memberName: string;
  memberPhone: string;
  shift: MemberShift | null;
  date: string;
  checkedInAt: string;
  /** Present when this check-in has been moved to Trash. */
  deletedAt?: string | null;
  deletedBy?: string | null;
};

export const DEFAULT_PRODUCT_CATEGORIES = [
  "Supplements",
  "Apparel",
  "Accessories",
  "Equipment",
  "Beverages",
  "S/K",
] as const;

/** Product categories are workspace-managed; defaults are provided for new gyms. */
export type ProductCategory = string;

export type Product = {
  id: ID;
  name: string;
  category: ProductCategory;
  sku: string;
  cost: number;
  price: number;
  stock: number;
  lowStockAt: number;
  createdAt: string;
  locked?: boolean;
  deletedAt?: string | null;
};

export type Sale = {
  id: ID;
  invoiceNo: string;
  productId: ID;
  productName: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  /** Discount applied to the sale, in currency units. */
  discount?: number;
  total: number;
  /** Amount collected at the time of sale. Defaults to `total` when absent. */
  paid?: number;
  buyer: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  memberId?: ID | null;
  date: string;
};

export type ExpenseCategory =
  | "Rent"
  | "Salaries"
  | "Utilities"
  | "Equipment"
  | "Maintenance"
  | "Marketing"
  | "Supplies"
  | "Other";

export type ExpenseAttachment = {
  name: string;
  type: string;
  size: number;
  /** Private Supabase Storage object path for persisted attachments. */
  path?: string;
  /** Temporary/legacy inline source. New cloud records store `path` instead. */
  dataUrl?: string;
};

export type Expense = {
  id: ID;
  expenseNo: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes: string;
  attachment?: ExpenseAttachment | null;
  createdAt: string;
  /** Locked expenses cannot be moved to Trash until unlocked from Edit Expense. */
  locked?: boolean;
  deletedAt?: string | null;
};

export type InquiryStatus = "new" | "contacted" | "trial" | "follow_up" | "converted" | "lost";
export type InquiryPriority = "hot" | "warm" | "cold";
export type InquirySource =
  "walk_in" | "referral" | "instagram" | "facebook" | "google" | "phone" | "website" | "other";

export type Inquiry = {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  source: InquirySource;
  interest: string;
  status: InquiryStatus;
  priority: InquiryPriority;
  nextFollowUp?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityType =
  | "member_added"
  | "membership_renewed"
  | "membership_corrected"
  | "membership_voided"
  | "membership_expired"
  | "payment_received"
  | "product_sold"
  | "product_added"
  | "invoice_generated"
  | "member_trashed"
  | "member_restored"
  | "member_deleted"
  | "expense_added"
  | "expense_updated"
  | "expense_trashed"
  | "inquiry_added"
  | "inquiry_updated"
  | "inquiry_deleted";

export type Activity = {
  id: ID;
  type: ActivityType;
  title: string;
  description: string;
  date: string;
  /** Member associated with this activity, when one exists. */
  memberId?: ID;
};

export type Settings = {
  gymName: string;
  /** Private Storage path for the gym's custom logo/avatar. */
  gymLogo?: string | null;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  invoicePrefix: string;
  lowStockAlerts: boolean;
  expiryReminderDays: number;
  adminName: string;
  revenueCardMetric?: "today" | "weekly" | "monthly" | "yearly" | "total";
  calendarSystem?: CalendarSystem;
  phoneCountry?: PhoneCountry;
  timeZone?: GymTimeZone;
};

export type CalendarSystem = "gregorian" | "bikram_sambat";
export type PhoneCountry = "nepal" | "india" | "usa";
export type GymTimeZone =
  | "Asia/Kathmandu"
  | "Asia/Kolkata"
  | "America/New_York"
  | "America/Chicago"
  | "America/Denver"
  | "America/Los_Angeles";

export type ReceptionistPermissions = {
  dashboard: boolean;
  members: boolean;
  memberships: boolean;
  payments: boolean;
  products: boolean;
  viewProductCost: boolean;
  expenses: boolean;
  reports: boolean;
  inquiries: boolean;
  notifications: boolean;
  trash: boolean;
  viewRevenue: boolean;
};

export type ReceptionistAccount = {
  enabled: boolean;
  name: string;
  email: string;
  passwordHash: string;
  permissions?: ReceptionistPermissions;
};

export type GymState = {
  version: number;
  auth: { passwordHash: string; email: string };
  staff?: { receptionist?: ReceptionistAccount };
  settings: Settings;
  members: Member[];
  plans: Plan[];
  memberships: Membership[];
  payments: Payment[];
  /** Missing in older workspace/backup payloads; normalized to an empty list. */
  attendance: AttendanceRecord[];
  products: Product[];
  /** Missing in older workspaces; default categories are restored during cloud hydration. */
  productCategories?: ProductCategory[];
  sales: Sale[];
  activities: Activity[];
  expenses: Expense[];
  inquiries: Inquiry[];
  readNotifications: string[];

  invoiceSeq: number;
};

export type MemberStatus = "active" | "expired" | "frozen" | "expiring" | "unassigned";
