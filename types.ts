
export type UserRole = 'Admin' | 'Seller';

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
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
}

export interface Transaction {
  id: string;
  items: TransactionItem[];
  total: number;
  type: 'SALE' | 'RESTOCK';
  timestamp: string;
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}
