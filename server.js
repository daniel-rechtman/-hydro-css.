const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb, initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
initializeDatabase();

// ==========================================
// Products API - קטלוג מוצרים
// ==========================================

app.get('/api/products', (req, res) => {
  const db = getDb();
  const { search, brand, active } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (barcode LIKE ? OR model LIKE ? OR brand LIKE ? OR sku_code LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (brand) {
    sql += ' AND brand = ?';
    params.push(brand);
  }
  if (active !== undefined) {
    sql += ' AND active = ?';
    params.push(active === 'true' ? 1 : 0);
  }

  sql += ' ORDER BY brand, model, size LIMIT 500';
  const products = db.prepare(sql).all(...params);
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'מוצר לא נמצא' });
  res.json(product);
});

app.get('/api/products/barcode/:barcode', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.barcode);
  if (!product) return res.status(404).json({ error: 'ברקוד לא נמצא בקטלוג' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const db = getDb();
  const { barcode, brand, model, color, size, sku_code, description, season, gender, category } = req.body;
  if (!barcode) return res.status(400).json({ error: 'ברקוד הוא שדה חובה' });

  try {
    const result = db.prepare(`
      INSERT INTO products (barcode, brand, model, color, size, sku_code, description, season, gender, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(barcode, brand || '', model || '', color || '', size || '', sku_code || '', description || '', season || '', gender || '', category || '');
    res.json({ id: result.lastInsertRowid, message: 'מוצר נוצר בהצלחה' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'ברקוד כבר קיים במערכת' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  const db = getDb();
  const { barcode, brand, model, color, size, sku_code, description, season, gender, category, active } = req.body;
  try {
    db.prepare(`
      UPDATE products SET barcode=?, brand=?, model=?, color=?, size=?, sku_code=?, description=?, season=?, gender=?, category=?, active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(barcode, brand, model, color, size, sku_code, description, season, gender, category, active ? 1 : 0, req.params.id);
    res.json({ message: 'מוצר עודכן בהצלחה' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload CSV catalog
const fs = require('fs');
app.post('/api/products/import-csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });

  try {
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'הקובץ ריק' });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const db = getDb();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO products (barcode, brand, model, color, size, sku_code, description, season, gender, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    let skipped = 0;

    const importAll = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

        if (!row.barcode) { skipped++; continue; }

        const result = insert.run(
          row.barcode, row.brand || '', row.model || '', row.color || '',
          row.size || '', row.sku_code || row.sku || '', row.description || '',
          row.season || '', row.gender || '', row.category || ''
        );
        if (result.changes > 0) imported++;
        else skipped++;
      }
    });

    importAll();
    fs.unlinkSync(req.file.path);
    res.json({ imported, skipped, total: lines.length - 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/brands/list', (req, res) => {
  const db = getDb();
  const brands = db.prepare("SELECT DISTINCT brand FROM products WHERE brand != '' ORDER BY brand").all();
  res.json(brands.map(b => b.brand));
});

// ==========================================
// Containers API - קונטיינרים
// ==========================================

app.get('/api/containers', (req, res) => {
  const db = getDb();
  const containers = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM scan_logs sl JOIN receiving_sessions rs ON sl.session_id = rs.id WHERE rs.container_id = c.id AND sl.action_type = 'intake') as scanned_count
    FROM containers c ORDER BY c.created_at DESC
  `).all();
  res.json(containers);
});

app.post('/api/containers', (req, res) => {
  const db = getDb();
  const { container_number, arrival_date, supplier, estimated_quantity, notes } = req.body;
  if (!container_number) return res.status(400).json({ error: 'מספר קונטיינר הוא חובה' });

  try {
    const result = db.prepare(`
      INSERT INTO containers (container_number, arrival_date, supplier, estimated_quantity, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(container_number, arrival_date || new Date().toISOString().split('T')[0], supplier || '', estimated_quantity || 0, notes || '');
    res.json({ id: result.lastInsertRowid, message: 'קונטיינר נוצר בהצלחה' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'מספר קונטיינר כבר קיים' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/containers/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE containers SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'סטטוס עודכן' });
});

// ==========================================
// Receiving Sessions API - סשן קליטה
// ==========================================

app.get('/api/sessions', (req, res) => {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT rs.*, c.container_number,
      (SELECT COUNT(*) FROM scan_logs WHERE session_id = rs.id AND action_type = 'intake') as scan_count
    FROM receiving_sessions rs
    LEFT JOIN containers c ON rs.container_id = c.id
    ORDER BY rs.started_at DESC
  `).all();
  res.json(sessions);
});

app.get('/api/sessions/active', (req, res) => {
  const db = getDb();
  const session = db.prepare(`
    SELECT rs.*, c.container_number
    FROM receiving_sessions rs
    LEFT JOIN containers c ON rs.container_id = c.id
    WHERE rs.status = 'active'
    ORDER BY rs.started_at DESC LIMIT 1
  `).get();
  res.json(session || null);
});

app.post('/api/sessions', (req, res) => {
  const db = getDb();
  const { container_id, started_by } = req.body;

  const result = db.prepare(`
    INSERT INTO receiving_sessions (container_id, started_by) VALUES (?, ?)
  `).run(container_id || null, started_by || '');
  res.json({ id: result.lastInsertRowid, message: 'סשן קליטה נפתח' });
});

app.put('/api/sessions/:id/end', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE receiving_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ message: 'סשן קליטה נסגר' });
});

// ==========================================
// Locations API - איתורים
// ==========================================

app.get('/api/locations', (req, res) => {
  const db = getDb();
  const { status, search } = req.query;
  let sql = `
    SELECT l.*, p.barcode as product_barcode, p.brand as product_brand, p.model as product_model, p.size as product_size, p.color as product_color
    FROM locations l
    LEFT JOIN products p ON l.assigned_product_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND l.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (l.location_code LIKE ? OR l.zone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY l.location_code';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/locations', (req, res) => {
  const db = getDb();
  const { location_code, zone, assigned_product_id, max_capacity, notes } = req.body;
  if (!location_code) return res.status(400).json({ error: 'קוד איתור הוא חובה' });

  try {
    const result = db.prepare(`
      INSERT INTO locations (location_code, zone, assigned_product_id, max_capacity, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(location_code, zone || '', assigned_product_id || null, max_capacity || 50, notes || '');
    res.json({ id: result.lastInsertRowid, message: 'איתור נוצר בהצלחה' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'קוד איתור כבר קיים' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', (req, res) => {
  const db = getDb();
  const { location_code, zone, assigned_product_id, max_capacity, status, notes } = req.body;
  db.prepare(`
    UPDATE locations SET location_code=?, zone=?, assigned_product_id=?, max_capacity=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(location_code, zone || '', assigned_product_id || null, max_capacity || 50, status || 'open', notes || '', req.params.id);
  res.json({ message: 'איתור עודכן' });
});

app.put('/api/locations/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE locations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'סטטוס איתור עודכן' });
});

// ==========================================
// Scanning API - לוגיקת סריקה
// ==========================================

// Main scan endpoint - the core logic
app.post('/api/scan', (req, res) => {
  const db = getDb();
  const { barcode, session_id, scanned_by, location_id } = req.body;

  if (!barcode) return res.status(400).json({ error: 'ברקוד הוא שדה חובה' });

  // Step 1: Find product by barcode
  const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);

  if (!product) {
    // Unknown barcode - create exception
    db.prepare(`
      INSERT INTO exceptions (barcode_scanned, session_id, issue_type, notes)
      VALUES (?, ?, 'unknown_barcode', 'ברקוד לא מזוהה בקטלוג')
    `).run(barcode, session_id || null);

    return res.json({
      status: 'exception',
      message: 'ברקוד לא נמצא בקטלוג',
      barcode,
      exception: true
    });
  }

  // Step 2: Find open location for this product
  let location;

  if (location_id) {
    // Specific location requested
    location = db.prepare('SELECT * FROM locations WHERE id = ? AND status = "open"').get(location_id);
  } else {
    // Auto-find open location for this product
    location = db.prepare(`
      SELECT * FROM locations
      WHERE assigned_product_id = ? AND status = 'open'
      ORDER BY created_at ASC LIMIT 1
    `).get(product.id);
  }

  // Step 3: Return result
  res.json({
    status: 'found',
    product: {
      id: product.id,
      barcode: product.barcode,
      brand: product.brand,
      model: product.model,
      color: product.color,
      size: product.size,
      sku_code: product.sku_code
    },
    location: location ? {
      id: location.id,
      location_code: location.location_code,
      current_quantity: location.current_quantity,
      max_capacity: location.max_capacity,
      zone: location.zone
    } : null,
    needs_location: !location
  });
});

// Confirm scan - actually add to inventory
app.post('/api/scan/confirm', (req, res) => {
  const db = getDb();
  const { product_id, location_id, session_id, scanned_by, barcode } = req.body;

  if (!product_id || !location_id) {
    return res.status(400).json({ error: 'חובה לציין מוצר ואיתור' });
  }

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(location_id);
  if (!location) return res.status(404).json({ error: 'איתור לא נמצא' });

  // Check if location is open
  if (location.status !== 'open') {
    return res.status(400).json({ error: 'האיתור סגור או מלא' });
  }

  // Check if location is assigned to this product or unassigned
  if (location.assigned_product_id && location.assigned_product_id !== product_id) {
    return res.status(400).json({ error: 'האיתור משויך למוצר אחר' });
  }

  const doConfirm = db.transaction(() => {
    // Assign product to location if not assigned
    if (!location.assigned_product_id) {
      db.prepare('UPDATE locations SET assigned_product_id = ? WHERE id = ?').run(product_id, location_id);
    }

    // Update or insert inventory
    const existing = db.prepare('SELECT * FROM inventory WHERE product_id = ? AND location_id = ?').get(product_id, location_id);
    if (existing) {
      db.prepare('UPDATE inventory SET quantity = quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO inventory (product_id, location_id, quantity) VALUES (?, ?, 1)').run(product_id, location_id);
    }

    // Update location quantity
    db.prepare('UPDATE locations SET current_quantity = current_quantity + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(location_id);

    // Log the scan
    db.prepare(`
      INSERT INTO scan_logs (session_id, product_id, barcode_scanned, location_id, scanned_by, action_type, quantity_change)
      VALUES (?, ?, ?, ?, ?, 'intake', 1)
    `).run(session_id || null, product_id, barcode || '', location_id, scanned_by || '');

    // Check if location is now full
    const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(location_id);
    return updated;
  });

  const updatedLocation = doConfirm();

  res.json({
    message: 'סריקה אושרה - מוצר נוסף לאיתור',
    location: {
      id: updatedLocation.id,
      location_code: updatedLocation.location_code,
      current_quantity: updatedLocation.current_quantity,
      max_capacity: updatedLocation.max_capacity,
      is_full: updatedLocation.current_quantity >= updatedLocation.max_capacity
    }
  });
});

// Undo last scan
app.post('/api/scan/undo', (req, res) => {
  const db = getDb();
  const { session_id } = req.body;

  const lastScan = db.prepare(`
    SELECT * FROM scan_logs WHERE session_id = ? AND action_type = 'intake'
    ORDER BY scan_time DESC LIMIT 1
  `).get(session_id);

  if (!lastScan) return res.status(404).json({ error: 'לא נמצאה סריקה אחרונה לביטול' });

  const doUndo = db.transaction(() => {
    // Decrease inventory
    db.prepare('UPDATE inventory SET quantity = MAX(0, quantity - 1), updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
      .run(lastScan.product_id, lastScan.location_id);

    // Decrease location quantity
    db.prepare('UPDATE locations SET current_quantity = MAX(0, current_quantity - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(lastScan.location_id);

    // Log undo
    db.prepare(`
      INSERT INTO scan_logs (session_id, product_id, barcode_scanned, location_id, scanned_by, action_type, quantity_change, notes)
      VALUES (?, ?, ?, ?, ?, 'undo', -1, ?)
    `).run(session_id, lastScan.product_id, lastScan.barcode_scanned, lastScan.location_id, lastScan.scanned_by, `ביטול סריקה #${lastScan.id}`);

    // Remove empty inventory rows
    db.prepare('DELETE FROM inventory WHERE quantity <= 0').run();
  });

  doUndo();
  res.json({ message: 'הסריקה האחרונה בוטלה', undone_scan_id: lastScan.id });
});

// Mark location as full and optionally create a continuation
app.post('/api/locations/:id/mark-full', (req, res) => {
  const db = getDb();
  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  if (!location) return res.status(404).json({ error: 'איתור לא נמצא' });

  const doMarkFull = db.transaction(() => {
    // Mark as full
    db.prepare("UPDATE locations SET status = 'full', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(location.id);

    // Create continuation location
    const baseCode = location.location_code.replace(/-\d+$/, '');
    const siblings = db.prepare("SELECT location_code FROM locations WHERE location_code LIKE ? ORDER BY location_code DESC LIMIT 1")
      .get(`${baseCode}-%`);

    let nextNum = 2;
    if (siblings) {
      const match = siblings.location_code.match(/-(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const newCode = `${baseCode}-${nextNum}`;

    const result = db.prepare(`
      INSERT INTO locations (location_code, zone, assigned_product_id, max_capacity, parent_location_id, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newCode, location.zone, location.assigned_product_id, location.max_capacity, location.id, `המשך של ${location.location_code}`);

    return { id: result.lastInsertRowid, location_code: newCode };
  });

  const newLocation = doMarkFull();
  res.json({
    message: `איתור ${location.location_code} סומן כמלא. נפתח איתור חדש: ${newLocation.location_code}`,
    old_location: location.location_code,
    new_location: newLocation
  });
});

// ==========================================
// Inventory API - מלאי
// ==========================================

app.get('/api/inventory', (req, res) => {
  const db = getDb();
  const { product_id, location_id } = req.query;
  let sql = `
    SELECT i.*, p.barcode, p.brand, p.model, p.color, p.size, p.sku_code,
           l.location_code, l.zone, l.status as location_status
    FROM inventory i
    JOIN products p ON i.product_id = p.id
    JOIN locations l ON i.location_id = l.id
    WHERE i.quantity > 0
  `;
  const params = [];

  if (product_id) { sql += ' AND i.product_id = ?'; params.push(product_id); }
  if (location_id) { sql += ' AND i.location_id = ?'; params.push(location_id); }

  sql += ' ORDER BY l.location_code, p.brand, p.model';
  res.json(db.prepare(sql).all(...params));
});

// Transfer between locations
app.post('/api/inventory/transfer', (req, res) => {
  const db = getDb();
  const { product_id, from_location_id, to_location_id, quantity } = req.body;
  const qty = quantity || 1;

  const fromInv = db.prepare('SELECT * FROM inventory WHERE product_id = ? AND location_id = ?').get(product_id, from_location_id);
  if (!fromInv || fromInv.quantity < qty) {
    return res.status(400).json({ error: 'אין מספיק מלאי באיתור המקור' });
  }

  const doTransfer = db.transaction(() => {
    // Decrease from source
    db.prepare('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND location_id = ?')
      .run(qty, product_id, from_location_id);
    db.prepare('UPDATE locations SET current_quantity = MAX(0, current_quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(qty, from_location_id);

    // Increase in target
    const existing = db.prepare('SELECT * FROM inventory WHERE product_id = ? AND location_id = ?').get(product_id, to_location_id);
    if (existing) {
      db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(qty, existing.id);
    } else {
      db.prepare('INSERT INTO inventory (product_id, location_id, quantity) VALUES (?, ?, ?)').run(product_id, to_location_id, qty);
    }
    db.prepare('UPDATE locations SET current_quantity = current_quantity + ?, assigned_product_id = COALESCE(assigned_product_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(qty, product_id, to_location_id);

    // Log transfer
    db.prepare(`INSERT INTO scan_logs (product_id, location_id, action_type, quantity_change, notes) VALUES (?, ?, 'transfer', ?, ?)`)
      .run(product_id, to_location_id, qty, `העברה מאיתור #${from_location_id}`);

    // Clean up empty inventory
    db.prepare('DELETE FROM inventory WHERE quantity <= 0').run();
  });

  doTransfer();
  res.json({ message: `הועברו ${qty} יחידות בהצלחה` });
});

// ==========================================
// Exceptions API - חריגים
// ==========================================

app.get('/api/exceptions', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = 'SELECT * FROM exceptions';
  if (status) sql += ` WHERE status = '${status === 'open' ? 'open' : status === 'resolved' ? 'resolved' : 'ignored'}'`;
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all());
});

app.put('/api/exceptions/:id/resolve', (req, res) => {
  const db = getDb();
  const { resolved_by, notes, product_id } = req.body;

  const exception = db.prepare('SELECT * FROM exceptions WHERE id = ?').get(req.params.id);
  if (!exception) return res.status(404).json({ error: 'חריגה לא נמצאה' });

  // If a product_id was provided, this means we're assigning the barcode to an existing product
  if (product_id) {
    db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(exception.barcode_scanned, product_id);
  }

  db.prepare(`
    UPDATE exceptions SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, notes = ?
    WHERE id = ?
  `).run(resolved_by || '', notes || '', req.params.id);

  res.json({ message: 'חריגה טופלה' });
});

// ==========================================
// Reports API - דוחות
// ==========================================

// Dashboard stats
app.get('/api/reports/dashboard', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const stats = {
    scans_today: db.prepare(`SELECT COUNT(*) as count FROM scan_logs WHERE date(scan_time) = ? AND action_type = 'intake'`).get(today).count,
    open_locations: db.prepare("SELECT COUNT(*) as count FROM locations WHERE status = 'open'").get().count,
    full_locations: db.prepare("SELECT COUNT(*) as count FROM locations WHERE status = 'full'").get().count,
    total_products: db.prepare("SELECT COUNT(*) as count FROM products WHERE active = 1").get().count,
    total_inventory: db.prepare("SELECT COALESCE(SUM(quantity), 0) as total FROM inventory").get().total,
    open_exceptions: db.prepare("SELECT COUNT(*) as count FROM exceptions WHERE status = 'open'").get().count,
    active_session: db.prepare(`
      SELECT rs.*, c.container_number
      FROM receiving_sessions rs
      LEFT JOIN containers c ON rs.container_id = c.id
      WHERE rs.status = 'active' ORDER BY rs.started_at DESC LIMIT 1
    `).get() || null,
    recent_scans: db.prepare(`
      SELECT sl.*, p.brand, p.model, p.size, p.color, l.location_code
      FROM scan_logs sl
      LEFT JOIN products p ON sl.product_id = p.id
      LEFT JOIN locations l ON sl.location_id = l.id
      WHERE sl.action_type = 'intake'
      ORDER BY sl.scan_time DESC LIMIT 10
    `).all()
  };

  res.json(stats);
});

// Report: inventory by location
app.get('/api/reports/by-location', (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT l.id, l.location_code, l.zone, l.status, l.current_quantity, l.max_capacity,
           p.brand, p.model, p.size, p.color, p.barcode as product_barcode,
           i.quantity
    FROM locations l
    LEFT JOIN products p ON l.assigned_product_id = p.id
    LEFT JOIN inventory i ON i.location_id = l.id AND i.product_id = p.id
    ORDER BY l.location_code
  `).all();
  res.json(data);
});

// Report: inventory by product
app.get('/api/reports/by-product', (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT p.id, p.barcode, p.brand, p.model, p.color, p.size, p.sku_code,
           COALESCE(SUM(i.quantity), 0) as total_quantity,
           GROUP_CONCAT(DISTINCT l.location_code) as locations
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id AND i.quantity > 0
    LEFT JOIN locations l ON i.location_id = l.id
    WHERE p.active = 1
    GROUP BY p.id
    ORDER BY p.brand, p.model, p.size
  `).all();
  res.json(data);
});

// Report: by container
app.get('/api/reports/by-container/:id', (req, res) => {
  const db = getDb();
  const container = db.prepare('SELECT * FROM containers WHERE id = ?').get(req.params.id);
  if (!container) return res.status(404).json({ error: 'קונטיינר לא נמצא' });

  const scans = db.prepare(`
    SELECT sl.*, p.brand, p.model, p.size, p.color, l.location_code
    FROM scan_logs sl
    JOIN receiving_sessions rs ON sl.session_id = rs.id
    LEFT JOIN products p ON sl.product_id = p.id
    LEFT JOIN locations l ON sl.location_id = l.id
    WHERE rs.container_id = ? AND sl.action_type = 'intake'
    ORDER BY sl.scan_time DESC
  `).all(req.params.id);

  const summary = db.prepare(`
    SELECT COUNT(*) as total_scans,
           COUNT(DISTINCT sl.product_id) as unique_products,
           COUNT(DISTINCT sl.location_id) as locations_used
    FROM scan_logs sl
    JOIN receiving_sessions rs ON sl.session_id = rs.id
    WHERE rs.container_id = ? AND sl.action_type = 'intake'
  `).get(req.params.id);

  const exceptions = db.prepare(`
    SELECT COUNT(*) as count FROM exceptions e
    JOIN receiving_sessions rs ON e.session_id = rs.id
    WHERE rs.container_id = ?
  `).get(req.params.id);

  res.json({ container, scans, summary, exceptions_count: exceptions.count });
});

// Export data as CSV
app.get('/api/reports/export/:type', (req, res) => {
  const db = getDb();
  let data, filename, headers;

  switch (req.params.type) {
    case 'inventory':
      data = db.prepare(`
        SELECT l.location_code, p.barcode, p.brand, p.model, p.color, p.size, i.quantity
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        JOIN locations l ON i.location_id = l.id
        WHERE i.quantity > 0
        ORDER BY l.location_code
      `).all();
      headers = ['איתור', 'ברקוד', 'מותג', 'דגם', 'צבע', 'מידה', 'כמות'];
      filename = 'inventory_export.csv';
      break;

    case 'locations':
      data = db.prepare(`
        SELECT l.location_code, l.zone, l.status, l.current_quantity, l.max_capacity,
               p.brand, p.model, p.size
        FROM locations l LEFT JOIN products p ON l.assigned_product_id = p.id
        ORDER BY l.location_code
      `).all();
      headers = ['קוד איתור', 'אזור', 'סטטוס', 'כמות נוכחית', 'קיבולת מקס', 'מותג', 'דגם', 'מידה'];
      filename = 'locations_export.csv';
      break;

    case 'products':
      data = db.prepare('SELECT barcode, brand, model, color, size, sku_code, season, gender, category FROM products WHERE active = 1 ORDER BY brand, model').all();
      headers = ['ברקוד', 'מותג', 'דגם', 'צבע', 'מידה', 'SKU', 'עונה', 'מין', 'קטגוריה'];
      filename = 'products_export.csv';
      break;

    default:
      return res.status(400).json({ error: 'סוג דוח לא תקין' });
  }

  const BOM = '\uFEFF';
  const csv = BOM + headers.join(',') + '\n' + data.map(row => Object.values(row).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ==========================================
// Start server
// ==========================================

app.listen(PORT, () => {
  console.log(`Warehouse Inventory System running on http://localhost:${PORT}`);
});
