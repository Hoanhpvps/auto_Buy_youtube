const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'data.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT,
    content_type TEXT DEFAULT 'both',
    is_running INTEGER DEFAULT 0,
    last_video_id TEXT,
    last_checked TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS channel_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS processed_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    video_title TEXT,
    video_url TEXT,
    is_livestream INTEGER DEFAULT 0,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    UNIQUE(channel_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS video_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    processed_video_id INTEGER NOT NULL,
    service_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (processed_video_id) REFERENCES processed_videos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Database functions
const db_functions = {
  // Config
  getConfig: (key) => {
    const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  },

  setConfig: (key, value) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    stmt.run(key, value);
  },

  // Channels
  getAllChannels: () => {
    return db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
  },

  getChannel: (id) => {
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  },

  addChannel: (channel) => {
    const stmt = db.prepare(`
      INSERT INTO channels (id, name, schedule, content_type, is_running, last_video_id, last_checked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(channel.id, channel.name, channel.schedule || '', channel.content_type || 'both', 0, null, null);
  },

  updateChannel: (id, data) => {
    const fields = [];
    const values = [];
    
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.schedule !== undefined) { fields.push('schedule = ?'); values.push(data.schedule); }
    if (data.content_type !== undefined) { fields.push('content_type = ?'); values.push(data.content_type); }
    if (data.is_running !== undefined) { fields.push('is_running = ?'); values.push(data.is_running ? 1 : 0); }
    if (data.last_video_id !== undefined) { fields.push('last_video_id = ?'); values.push(data.last_video_id); }
    if (data.last_checked !== undefined) { fields.push('last_checked = ?'); values.push(data.last_checked); }
    
    if (fields.length === 0) return;
    
    values.push(id);
    const stmt = db.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },

  deleteChannel: (id) => {
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  },

  // Channel Services
  getChannelServices: (channelId) => {
    return db.prepare('SELECT * FROM channel_services WHERE channel_id = ?').all(channelId);
  },

  setChannelServices: (channelId, services) => {
    const deleteStmt = db.prepare('DELETE FROM channel_services WHERE channel_id = ?');
    const insertStmt = db.prepare('INSERT INTO channel_services (channel_id, service_id, quantity) VALUES (?, ?, ?)');
    
    const transaction = db.transaction(() => {
      deleteStmt.run(channelId);
      for (const service of services) {
        insertStmt.run(channelId, service.serviceId, service.quantity);
      }
    });
    
    transaction();
  },

  // Processed Videos
  getProcessedVideo: (channelId, videoId) => {
    return db.prepare('SELECT * FROM processed_videos WHERE channel_id = ? AND video_id = ?').get(channelId, videoId);
  },

  addProcessedVideo: (channelId, videoId, title, url, isLivestream = false) => {
    const stmt = db.prepare(`
      INSERT INTO processed_videos (channel_id, video_id, video_title, video_url, is_livestream)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(channelId, videoId, title, url, isLivestream ? 1 : 0);
    return result.lastInsertRowid;
  },

  getChannelProcessedVideos: (channelId) => {
    return db.prepare('SELECT * FROM processed_videos WHERE channel_id = ? ORDER BY processed_at DESC').all(channelId);
  },

  // Video Orders
  addVideoOrder: (processedVideoId, serviceId, orderId, quantity) => {
    const stmt = db.prepare(`
      INSERT INTO video_orders (processed_video_id, service_id, order_id, quantity)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(processedVideoId, serviceId, orderId, quantity);
  },

  getVideoOrders: (processedVideoId) => {
    return db.prepare('SELECT * FROM video_orders WHERE processed_video_id = ?').all(processedVideoId);
  },

  hasServiceOrder: (processedVideoId, serviceId) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM video_orders WHERE processed_video_id = ? AND service_id = ?');
    const result = stmt.get(processedVideoId, serviceId);
    return result.count > 0;
  },

  // Logs
  addLog: (message, type = 'info', channelId = null) => {
    const stmt = db.prepare('INSERT INTO logs (channel_id, message, type) VALUES (?, ?, ?)');
    stmt.run(channelId, message, type);
  },

  getLogs: (limit = 200) => {
    return db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  clearLogs: () => {
    db.prepare('DELETE FROM logs').run();
  },

  // Stats
  getChannelStats: (channelId) => {
    const videosProcessed = db.prepare('SELECT COUNT(*) as count FROM processed_videos WHERE channel_id = ?').get(channelId).count;
    const ordersCreated = db.prepare(`
      SELECT COUNT(*) as count FROM video_orders vo
      JOIN processed_videos pv ON vo.processed_video_id = pv.id
      WHERE pv.channel_id = ?
    `).get(channelId).count;
    
    return { videosProcessed, ordersCreated };
  }
};

module.exports = { db, ...db_functions };
