
# SuperMart Inventory Pro - Complete Database Schema

To initialize your Neon PostgreSQL database for all system features, execute these commands in the Neon Console SQL Editor.

```sql
-- 1. Configuration Table (Branding & Global Security)
CREATE TABLE IF NOT EXISTS supermarket_config (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT 'SUPERMART PRO',
    logo_url TEXT,
    admin_password TEXT DEFAULT 'admin'
);

-- 2. Branches Table (Multi-Location Support)
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products Table (Relational Inventory)
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

-- 4. Sellers Table (Staff Deployment)
CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE
);

-- 5. Transactions Table (Sales Ledger)
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    total DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Transaction Items Table (Line-Item Auditing)
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

-- Initial Data Injection
INSERT INTO supermarket_config (name, logo_url, admin_password) 
SELECT 'SUPERMART PRO', '', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM supermarket_config);

-- Provision Initial Main Branch if empty
INSERT INTO branches (id, name, location)
SELECT 'br_main', 'Main Branch', 'Corporate HQ'
WHERE NOT EXISTS (SELECT 1 FROM branches);
```

### Deployment Strategy
1. **Schema Initialization**: Run the SQL above to provision the cloud infrastructure.
2. **Staff Authorization**: Use the 'Settings' tab in the app to deploy staff accounts.
3. **AI Integration**: The 'Analytics' dashboard utilizes Gemini AI to analyze stock levels defined in the `products` table.
