const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'warehouse.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  db.exec(`
    -- קטלוג מוצרים
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      color TEXT DEFAULT '',
      size TEXT DEFAULT '',
      sku_code TEXT DEFAULT '',
      description TEXT DEFAULT '',
      season TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      category TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- קונטיינרים / משלוחים
    CREATE TABLE IF NOT EXISTS containers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_number TEXT UNIQUE NOT NULL,
      arrival_date DATE,
      supplier TEXT DEFAULT '',
      estimated_quantity INTEGER DEFAULT 0,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'archived')),
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- סשנים של קליטה
    CREATE TABLE IF NOT EXISTS receiving_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id INTEGER,
      started_by TEXT DEFAULT '',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      FOREIGN KEY (container_id) REFERENCES containers(id)
    );

    -- איתורים
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_code TEXT UNIQUE NOT NULL,
      zone TEXT DEFAULT '',
      assigned_product_id INTEGER,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'closed', 'archived')),
      max_capacity INTEGER DEFAULT 50,
      current_quantity INTEGER DEFAULT 0,
      parent_location_id INTEGER,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_product_id) REFERENCES products(id),
      FOREIGN KEY (parent_location_id) REFERENCES locations(id)
    );

    -- מלאי בפועל
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      UNIQUE(product_id, location_id)
    );

    -- לוג סריקות / תנועות
    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      product_id INTEGER,
      barcode_scanned TEXT NOT NULL,
      location_id INTEGER,
      scan_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      scanned_by TEXT DEFAULT '',
      action_type TEXT DEFAULT 'intake' CHECK(action_type IN ('intake', 'transfer', 'correction', 'removal', 'undo')),
      quantity_change INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      FOREIGN KEY (session_id) REFERENCES receiving_sessions(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    -- חריגים
    CREATE TABLE IF NOT EXISTS exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode_scanned TEXT NOT NULL,
      session_id INTEGER,
      issue_type TEXT DEFAULT 'unknown_barcode' CHECK(issue_type IN ('unknown_barcode', 'duplicate_suspect', 'wrong_location', 'damaged', 'other')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'ignored')),
      resolved_by TEXT DEFAULT '',
      resolved_at DATETIME,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES receiving_sessions(id)
    );

    -- אינדקסים
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku_code);
    CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status);
    CREATE INDEX IF NOT EXISTS idx_locations_product ON locations(assigned_product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
    CREATE INDEX IF NOT EXISTS idx_scan_logs_session ON scan_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_scan_logs_time ON scan_logs(scan_time);
    CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status);
  `);

  console.log('Database initialized successfully');
  return db;
}

module.exports = { getDb, initializeDatabase };
