
export type UserRole = 'Admin' | 'Seller';

export interface Admin {
  id: string;
  email: string;
  password: string;
  name: string;
  createdAt: string;
}

export interface Seller {
  id: string;
  email: string;
  password: string;
  name: string;
  branchId: string; 
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  quantity: number;
  minThreshold: number;
  expiryDate?: string;
  lastUpdated: string;
  tags?: string[];
}

export interface TransactionItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  costPriceAtSale: number;
}

export interface Transaction {
  id: string;
  items: TransactionItem[];
  total: number;
  totalCost: number;
  type: 'SALE' | 'RESTOCK';
  timestamp: string;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  products: Product[];
  transactions: Transaction[];
  createdAt: string;
}

export interface AppConfig {
  supermarketName: string;
  logoUrl: string;
  adminPassword?: string; // Deprecated
  adminRegisterPasscode?: string;
  sellers: Seller[];
  branches: Branch[];
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  totalCostValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'alert' | 'success';
  timestamp: string;
  read: boolean;
  user: string;
}

export type ApprovalActionType = 'ADD' | 'EDIT' | 'DELETE';

export interface ApprovalRequest {
  id: string;
  branchId: string;
  actionType: ApprovalActionType;
  productId?: string;
  productData: Partial<Product>;
  requestedBy: string;
  timestamp: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}
