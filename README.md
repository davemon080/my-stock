
# SuperMart Inventory Pro - Complete Database Schema

To initialize your Neon PostgreSQL database for all system features, execute these commands in the Neon Console SQL Editor.

```sql
-- 1. Configuration Table (Shop Info)
CREATE TABLE IF NOT EXISTS supermarket_config (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT 'SUPERMART PRO',
    logo_url TEXT,
    admin_register_passcode TEXT DEFAULT '1234'
);

-- 2. Admin Accounts Table
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Branches Table
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Products Table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    cost_price DECIMAL(12, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    min_threshold INTEGER NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Sellers Table
CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE
);

-- 6. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    total DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Transaction Items Table
CREATE TABLE IF NOT EXISTS transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    product_id TEXT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    cost_price_at_sale DECIMAL(12, 2) NOT NULL
);

-- 8. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    user_name TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Approvals Table
CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    product_id TEXT,
    product_data JSONB,
    requested_by TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'PENDING'
);

-- Initial Data
INSERT INTO supermarket_config (name, logo_url, admin_register_passcode) 
SELECT 'SUPERMART PRO', '', '1234'
WHERE NOT EXISTS (SELECT 1 FROM supermarket_config);

INSERT INTO branches (id, name, location)
SELECT 'br_main', 'Main Store', 'Headquarters'
WHERE NOT EXISTS (SELECT 1 FROM branches);
```
