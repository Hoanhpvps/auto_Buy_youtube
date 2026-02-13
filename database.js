const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.isReady = false;
    this.readyPromise = new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, 'data.db');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.initTables()
            .then(() => {
              this.isReady = true;
              console.log('✅ Database tables initialized');
              resolve();
            })
            .catch(reject);
        }
      });
    });
  }

  // ===== QUAN TRỌNG: Đợi database sẵn sàng =====
  async waitReady() {
    if (!this.isReady) {
      await this.readyPromise;
    }
    return true;
  }

  initTables() {
    return new Promise((resolve, reject) => {
      // Tạo tất cả tables tuần tự
      this.db.serialize(() => {
        // Bảng channels
        this.db.run(`
          CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            channel_id TEXT NOT NULL UNIQUE,
            schedule TEXT,
            service_id INTEGER,
            quantity INTEGER,
            is_active INTEGER DEFAULT 0,
            total_orders INTEGER DEFAULT 0,
            last_check TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Bảng orders - ===== QUAN TRỌNG: Thêm cột video_id =====
        this.db.run(`
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            video_id TEXT NOT NULL,
            video_url TEXT NOT NULL,
            service_id INTEGER,
            quantity INTEGER,
            order_id TEXT,
            status TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id)
          )
        `);

        // Bảng logs
        this.db.run(`
          CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            channel_name TEXT,
            video_id TEXT,
            order_id TEXT,
            status TEXT,
            message TEXT,
            timestamp TEXT,
            FOREIGN KEY (channel_id) REFERENCES channels(id)
          )
        `);

        // Bảng settings
        this.db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // ===== QUAN TRỌNG: Hàm kiểm tra video đã đặt hàng chưa =====
  async getOrderHistory() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ===== QUAN TRỌNG: Lưu đơn hàng (phải có video_id) =====
  async saveOrder(orderData) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO orders (channel_id, video_id, video_url, service_id, quantity, order_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        orderData.channel_id,
        orderData.video_id,        // ===== QUAN TRỌNG =====
        orderData.video_url,
        orderData.service_id,
        orderData.quantity,
        orderData.order_id,
        orderData.status || 'pending'
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // Thêm kênh mới
  async addChannel(channelData) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO channels (name, channel_id, schedule, service_id, quantity)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        channelData.name,
        channelData.channel_id,
        channelData.schedule,
        channelData.service_id,
        channelData.quantity
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // Lấy tất cả kênh
  async getChannels() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM channels ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ===== ALIAS: server.js gọi getAllChannels() =====
  async getAllChannels() {
    return await this.getChannels();
  }

  // ===== THÊM: getChannelByChannelId (tìm theo channel_id thay vì id) =====
  async getChannelByChannelId(channelId) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM channels WHERE channel_id = ?', [channelId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // ===== THÊM: getAllOrders =====
  async getAllOrders() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ===== THÊM: getOrdersByChannel =====
  async getOrdersByChannel(channelId) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM orders WHERE channel_id = ? ORDER BY created_at DESC',
        [channelId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // ===== THÊM: getOrder =====
  async getOrder(orderId) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // ===== THÊM: updateOrder =====
  async updateOrder(orderId, orderData) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const updates = [];
      const values = [];

      if (orderData.status !== undefined) {
        updates.push('status = ?');
        values.push(orderData.status);
      }
      if (orderData.order_id !== undefined) {
        updates.push('order_id = ?');
        values.push(orderData.order_id);
      }

      if (updates.length === 0) {
        resolve({ changes: 0 });
        return;
      }

      values.push(orderId);

      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Lấy 1 kênh theo ID
  async getChannel(channelId) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM channels WHERE id = ?', [channelId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Lấy các kênh đang active
  async getActiveChannels() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM channels WHERE is_active = 1', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Cập nhật trạng thái kênh
  async updateChannelStatus(channelId, isActive) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE channels SET is_active = ? WHERE id = ?',
        [isActive ? 1 : 0, channelId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Cập nhật stats kênh
  async updateChannelStats(channelId, stats) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const updates = [];
      const values = [];

      if (stats.total_orders !== undefined) {
        updates.push('total_orders = ?');
        values.push(stats.total_orders);
      }
      if (stats.last_check !== undefined) {
        updates.push('last_check = ?');
        values.push(stats.last_check);
      }

      if (updates.length === 0) {
        resolve({ changes: 0 });
        return;
      }

      values.push(channelId);

      const sql = `UPDATE channels SET ${updates.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Xóa kênh
  async deleteChannel(channelId) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM channels WHERE id = ?', [channelId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Thêm log
  async addLog(logData) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO logs (channel_id, channel_name, video_id, order_id, status, message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        logData.channel_id,
        logData.channel_name,
        logData.video_id || null,
        logData.order_id || null,
        logData.status,
        logData.message,
        logData.timestamp || new Date().toISOString()
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // Lấy logs (mới nhất trước)
  async getLogs(limit = 100) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Lấy logs theo kênh
  async getLogsByChannel(channelId, limit = 50) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM logs WHERE channel_id = ? ORDER BY timestamp DESC LIMIT ?',
        [channelId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Xóa logs cũ (giữ lại N logs mới nhất)
  async cleanOldLogs(keepCount = 1000) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM logs WHERE id NOT IN (
          SELECT id FROM logs ORDER BY timestamp DESC LIMIT ?
        )`,
        [keepCount],
        function(err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes });
        }
      );
    });
  }

  // Lưu setting
  async saveSetting(key, value) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
        function(err) {
          if (err) reject(err);
          else resolve({ success: true });
        }
      );
    });
  }

  // Lấy setting
  async getSetting(key) {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
  }

  // ===== ALIAS: server.js có thể gọi getConfig thay vì getSetting =====
  async getConfig(key) {
    return await this.getSetting(key);
  }

  // ===== ALIAS: saveConfig =====
  async saveConfig(key, value) {
    return await this.saveSetting(key, value);
  }

  // Lấy tất cả settings
  async getAllSettings() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM settings', [], (err, rows) => {
        if (err) reject(err);
        else {
          const settings = {};
          rows.forEach(row => {
            settings[row.key] = row.value;
          });
          resolve(settings);
        }
      });
    });
  }

  // Lấy thống kê tổng quan
  async getStats() {
    await this.waitReady();
    return new Promise((resolve, reject) => {
      const stats = {
        totalChannels: 0,
        activeChannels: 0,
        totalOrders: 0,
        todayOrders: 0
      };

      // Đếm tổng số kênh
      this.db.get('SELECT COUNT(*) as count FROM channels', [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        stats.totalChannels = row.count;

        // Đếm kênh đang active
        this.db.get('SELECT COUNT(*) as count FROM channels WHERE is_active = 1', [], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          stats.activeChannels = row.count;

          // Đếm tổng đơn hàng
          this.db.get('SELECT COUNT(*) as count FROM orders', [], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            stats.totalOrders = row.count;

            // Đếm đơn hàng hôm nay
            const today = new Date().toISOString().split('T')[0];
            this.db.get(
              'SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?',
              [today],
              (err, row) => {
                if (err) {
                  reject(err);
                  return;
                }
                stats.todayOrders = row.count;
                resolve(stats);
              }
            );
          });
        });
      });
    });
  }

  // Đóng database
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = new Database();
