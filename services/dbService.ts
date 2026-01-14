
import { neon } from '@neondatabase/serverless';
import { Product, Branch, Transaction, Seller, AppConfig, Notification, ApprovalRequest, Admin } from '../types.ts';

const DATABASE_URL = "postgresql://neondb_owner:npg_oNL4Ok5GvDie@ep-billowing-hall-adwkuu1o-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

export const db = {
  // Global System Configuration
  async getConfig(): Promise<Partial<AppConfig>> {
    const result = await sql`SELECT * FROM supermarket_config LIMIT 1`;
    if (result.length === 0) {
      await sql`INSERT INTO supermarket_config (name, logo_url, admin_register_passcode) VALUES ('MY STORE', '', '1234')`;
      return { supermarketName: 'MY STORE', logoUrl: '', adminRegisterPasscode: '1234' };
    }
    return {
      supermarketName: result[0].name,
      logoUrl: result[0].logo_url,
      adminRegisterPasscode: result[0].admin_register_passcode
    };
  },

  async updateConfig(name: string, logo: string) {
    return sql`UPDATE supermarket_config SET name = ${name}, logo_url = ${logo}`;
  },

  async updateRegisterPasscode(passcode: string) {
    return sql`UPDATE supermarket_config SET admin_register_passcode = ${passcode}`;
  },

  // Admin Management
  async getAdminByEmail(email: string): Promise<Admin | null> {
    const rows = await sql`SELECT * FROM admins WHERE email = ${email} LIMIT 1`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      password: r.password,
      name: r.name,
      createdAt: r.created_at
    };
  },

  async registerAdmin(admin: Admin) {
    return sql`
      INSERT INTO admins (id, email, password, name, created_at)
      VALUES (${admin.id}, ${admin.email}, ${admin.password}, ${admin.name}, ${admin.createdAt})
    `;
  },

  async updateAdminPassword(adminId: string, newPass: string) {
    return sql`UPDATE admins SET password = ${newPass} WHERE id = ${adminId}`;
  },

  async getTotalAdminsCount(): Promise<number> {
    const result = await sql`SELECT COUNT(*) as count FROM admins`;
    return parseInt(result[0].count);
  },

  // Branch Management
  async getBranches(): Promise<Branch[]> {
    const branches = await sql`SELECT * FROM branches ORDER BY created_at ASC`;
    return branches.map(b => ({
      id: b.id,
      name: b.name,
      location: b.location,
      createdAt: b.created_at,
      products: [], 
      transactions: [] 
    }));
  },

  async addBranch(branch: Omit<Branch, 'products' | 'transactions'>) {
    return sql`INSERT INTO branches (id, name, location, created_at) VALUES (${branch.id}, ${branch.name}, ${branch.location}, ${branch.createdAt})`;
  },

  async deleteBranch(id: string) {
    return sql`DELETE FROM branches WHERE id = ${id}`;
  },

  async updateBranch(id: string, name: string, location: string) {
    return sql`UPDATE branches SET name = ${name}, location = ${location} WHERE id = ${id}`;
  },

  // Inventory Management
  async getProducts(branchId: string): Promise<Product[]> {
    const rows = await sql`SELECT * FROM products WHERE branch_id = ${branchId} ORDER BY name ASC`;
    return rows.map(r => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      price: Number(r.price),
      costPrice: Number(r.cost_price),
      quantity: r.quantity,
      minThreshold: r.min_threshold,
      lastUpdated: r.last_updated
    }));
  },

  async upsertProduct(product: Product, branchId: string) {
    return sql`
      INSERT INTO products (id, branch_id, sku, name, price, cost_price, quantity, min_threshold, last_updated)
      VALUES (${product.id}, ${branchId}, ${product.sku}, ${product.name}, ${product.price}, ${product.costPrice}, ${product.quantity}, ${product.minThreshold}, ${product.lastUpdated})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        cost_price = EXCLUDED.cost_price,
        quantity = EXCLUDED.quantity,
        min_threshold = EXCLUDED.min_threshold,
        last_updated = EXCLUDED.last_updated
    `;
  },

  async deleteProduct(id: string) {
    return sql`DELETE FROM products WHERE id = ${id}`;
  },

  // Staff Management
  async getSellers(): Promise<Seller[]> {
    const rows = await sql`SELECT * FROM sellers`;
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      password: r.password,
      name: r.name,
      branchId: r.branch_id
    }));
  },

  async addSeller(seller: Seller) {
    return sql`INSERT INTO sellers (id, email, password, name, branch_id) VALUES (${seller.id}, ${seller.email}, ${seller.password}, ${seller.name}, ${seller.branchId})`;
  },

  async deleteSeller(id: string) {
    return sql`DELETE FROM sellers WHERE id = ${id}`;
  },

  // Financials & Transactions
  async getTransactions(branchId: string): Promise<Transaction[]> {
    const txs = await sql`SELECT * FROM transactions WHERE branch_id = ${branchId} ORDER BY timestamp DESC`;
    const items = await sql`
      SELECT ti.* FROM transaction_items ti 
      JOIN transactions t ON ti.transaction_id = t.id 
      WHERE t.branch_id = ${branchId}
    `;

    return txs.map(t => ({
      id: t.id,
      total: Number(t.total),
      totalCost: Number(t.total_cost),
      type: t.type,
      timestamp: t.timestamp,
      items: items
        .filter(i => i.transaction_id === t.id)
        .map(i => ({
          productId: i.product_id,
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
          price: Number(i.price),
          costPriceAtSale: Number(i.cost_price_at_sale)
        }))
    }));
  },

  async addTransaction(tx: Transaction, branchId: string) {
    await sql`
      INSERT INTO transactions (id, branch_id, total, total_cost, type, timestamp)
      VALUES (${tx.id}, ${branchId}, ${tx.total}, ${tx.totalCost}, ${tx.type}, ${tx.timestamp})
    `;

    for (const item of tx.items) {
      await sql`
        INSERT INTO transaction_items (transaction_id, product_id, name, sku, quantity, price, cost_price_at_sale)
        VALUES (${tx.id}, ${item.productId}, ${item.name}, ${item.sku}, ${item.quantity}, ${item.price}, ${item.costPriceAtSale})
      `;
      await sql`UPDATE products SET quantity = quantity - ${item.quantity} WHERE id = ${item.productId}`;
    }
  },

  // Approvals
  async getApprovals(branchId: string): Promise<ApprovalRequest[]> {
    const rows = await sql`SELECT * FROM approvals WHERE branch_id = ${branchId} AND status = 'PENDING' ORDER BY timestamp DESC`;
    return rows.map(r => ({
      id: r.id,
      branchId: r.branch_id,
      actionType: r.action_type as any,
      productId: r.product_id,
      productData: r.product_data,
      requestedBy: r.requested_by,
      timestamp: r.timestamp,
      status: r.status as any
    }));
  },

  async addApprovalRequest(req: Omit<ApprovalRequest, 'status'>) {
    return sql`
      INSERT INTO approvals (id, branch_id, action_type, product_id, product_data, requested_by, timestamp)
      VALUES (${req.id}, ${req.branchId}, ${req.actionType}, ${req.productId}, ${JSON.stringify(req.productData)}, ${req.requestedBy}, ${req.timestamp})
    `;
  },

  async updateApprovalStatus(requestId: string, status: 'APPROVED' | 'DECLINED') {
    return sql`UPDATE approvals SET status = ${status} WHERE id = ${requestId}`;
  },

  // Notifications
  async getNotifications(branchId: string): Promise<Notification[]> {
    const rows = await sql`SELECT * FROM notifications WHERE branch_id = ${branchId} ORDER BY timestamp DESC LIMIT 100`;
    return rows.map(r => ({
      id: r.id,
      message: r.message,
      type: r.type as any,
      timestamp: r.timestamp,
      read: false,
      user: r.user_name
    }));
  },

  async addNotification(branchId: string, message: string, type: string, userName: string) {
    const id = Math.random().toString(36).substr(2, 9);
    return sql`
      INSERT INTO notifications (id, branch_id, message, type, user_name)
      VALUES (${id}, ${branchId}, ${message}, ${type}, ${userName})
    `;
  },

  // Wipe All Data
  async wipeAllData() {
    await sql`TRUNCATE TABLE transaction_items, transactions, products, sellers, branches, supermarket_config, notifications, approvals, admins RESTART IDENTITY CASCADE`;
    await sql`INSERT INTO supermarket_config (name, logo_url) VALUES ('MY STORE', '')`;
    await sql`INSERT INTO branches (id, name, location) VALUES ('br_main', 'Main Store', 'Headquarters')`;
  },

  // Scoped Wipe
  async wipeBranchData(branchId: string) {
    await sql`DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE branch_id = ${branchId})`;
    await sql`DELETE FROM transactions WHERE branch_id = ${branchId}`;
    await sql`DELETE FROM products WHERE branch_id = ${branchId}`;
    await sql`DELETE FROM notifications WHERE branch_id = ${branchId}`;
    await sql`DELETE FROM approvals WHERE branch_id = ${branchId}`;
    await sql`DELETE FROM sellers WHERE branch_id = ${branchId}`;
  }
};
