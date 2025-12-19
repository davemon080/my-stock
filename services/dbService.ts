
import { neon } from '@neondatabase/serverless';
import { Product, Branch, Transaction, Seller, AppConfig } from '../types.ts';

const DATABASE_URL = "postgresql://neondb_owner:npg_oNL4Ok5GvDie@ep-billowing-hall-adwkuu1o-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

export const db = {
  // Global System Configuration
  async getConfig(): Promise<Partial<AppConfig>> {
    const result = await sql`SELECT * FROM supermarket_config LIMIT 1`;
    if (result.length === 0) {
      await sql`INSERT INTO supermarket_config (name, logo_url, admin_password) VALUES ('SUPERMART PRO', '', 'admin')`;
      return { supermarketName: 'SUPERMART PRO', logoUrl: '', adminPassword: 'admin' };
    }
    return {
      supermarketName: result[0].name,
      logoUrl: result[0].logo_url,
      adminPassword: result[0].admin_password
    };
  },

  async updateConfig(name: string, logo: string, adminPass: string) {
    return sql`UPDATE supermarket_config SET name = ${name}, logo_url = ${logo}, admin_password = ${adminPass}`;
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
      // Inventory decrement
      await sql`
        UPDATE products SET quantity = quantity - ${item.quantity} WHERE id = ${item.productId}
      `;
    }
  },

  // DANGER: Wipe All Data
  async wipeAllData() {
    // Truncate all operational tables
    await sql`TRUNCATE TABLE transaction_items, transactions, products, sellers, branches, supermarket_config RESTART IDENTITY CASCADE`;
    
    // Re-seed minimal required state
    await sql`INSERT INTO supermarket_config (name, logo_url, admin_password) VALUES ('SUPERMART PRO', '', 'admin')`;
    await sql`INSERT INTO branches (id, name, location) VALUES ('br_main', 'Main Branch', 'Corporate HQ')`;
  }
};
