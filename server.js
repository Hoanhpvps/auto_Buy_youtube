require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database');
const api = require('./tutmxh-api');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy (bắt buộc cho Render.com / các hosting dùng reverse proxy)
app.set('trust proxy', 1);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    // Render.com dùng HTTPS qua reverse proxy → cần proxy + sameSite none
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes

// Login page
app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard
app.get('/', requireAuth, (req, res) => {
  const channels = db.getAllChannels();
  const apiKey = db.getConfig('api_key');
  const balance = db.getConfig('last_balance') || '0';
  const servicesJson = db.getConfig('services');
  const services = servicesJson ? JSON.parse(servicesJson) : [];
  
  // Add services and stats to each channel
  const channelsWithData = channels.map(channel => {
    const channelServices = db.getChannelServices(channel.id);
    const stats = db.getChannelStats(channel.id);
    const processedVideos = db.getChannelProcessedVideos(channel.id);
    
    return {
      ...channel,
      services: channelServices,
      stats: stats,
      videosCount: processedVideos.length
    };
  });
  
  res.render('dashboard', {
    channels: channelsWithData,
    allServices: services,
    apiKey: apiKey || '',
    balance: balance,
    totalChannels: channels.length,
    runningChannels: channels.filter(c => c.is_running).length
  });
});

// API Routes

// Set API Key
app.post('/api/set-api-key', requireAuth, async (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.json({ success: false, error: 'API Key không được để trống' });
  }
  
  try {
    // Test API key - checkBalance gio nem loi neu co van de
    const balance = await api.checkBalance(apiKey);

    db.setConfig('api_key', apiKey);
    db.addLog(`✅ Đã cập nhật API Key - Số dư: $${balance}`, 'success');

    // Load services
    await api.getServices(apiKey);

    res.json({ success: true, balance: balance });
  } catch (error) {
    // Hien thi dung loi tra ve tu API (vi du: Invalid key, IP blocked, ...)
    res.json({ success: false, error: error.message });
  }
});

// Get balance
app.get('/api/balance', requireAuth, async (req, res) => {
  const apiKey = db.getConfig('api_key');
  if (!apiKey) {
    return res.json({ success: false, error: 'API Key chưa được cấu hình' });
  }
  
  try {
    const balance = await api.checkBalance(apiKey);
    res.json({ success: true, balance: balance });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Load services
app.post('/api/load-services', requireAuth, async (req, res) => {
  const apiKey = db.getConfig('api_key');
  if (!apiKey) {
    return res.json({ success: false, error: 'API Key chưa được cấu hình' });
  }
  
  const services = await api.getServices(apiKey);
  res.json({ success: true, count: services.length });
});

// Add channel
app.post('/api/channels', requireAuth, (req, res) => {
  const { id, name, schedule, services, contentType } = req.body;
  
  if (!id || !name) {
    return res.json({ success: false, error: 'Channel ID và tên không được để trống' });
  }
  
  if (!services || services.length === 0) {
    return res.json({ success: false, error: 'Vui lòng chọn ít nhất một dịch vụ' });
  }
  
  // Check if channel exists
  const existing = db.getChannel(id);
  if (existing) {
    return res.json({ success: false, error: 'Kênh đã tồn tại' });
  }
  
  try {
    db.addChannel({ 
      id, 
      name, 
      schedule: schedule || '',
      content_type: contentType || 'both'
    });
    db.setChannelServices(id, services);
    db.addLog(`✅ Đã thêm kênh: ${name}`, 'success');
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Update channel
app.put('/api/channels/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, schedule, services, contentType } = req.body;
  
  const channel = db.getChannel(id);
  if (!channel) {
    return res.json({ success: false, error: 'Kênh không tồn tại' });
  }
  
  try {
    db.updateChannel(id, { 
      name, 
      schedule,
      content_type: contentType
    });
    
    if (services) {
      db.setChannelServices(id, services);
    }
    
    // Restart if running
    if (channel.is_running) {
      scheduler.stopChannelMonitoring(id);
      scheduler.startChannelMonitoring(id);
    }
    
    db.addLog(`✅ Đã cập nhật kênh: ${name}`, 'success', id);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Delete channel
app.delete('/api/channels/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  const channel = db.getChannel(id);
  if (!channel) {
    return res.json({ success: false, error: 'Kênh không tồn tại' });
  }
  
  scheduler.stopChannelMonitoring(id);
  db.deleteChannel(id);
  db.addLog(`🗑️ Đã xóa kênh: ${channel.name}`, 'info');
  
  res.json({ success: true });
});

// Start channel
app.post('/api/channels/:id/start', requireAuth, (req, res) => {
  const { id } = req.params;
  
  const channel = db.getChannel(id);
  if (!channel) {
    return res.json({ success: false, error: 'Kênh không tồn tại' });
  }
  
  db.updateChannel(id, { is_running: 1 });
  scheduler.startChannelMonitoring(id);
  
  res.json({ success: true });
});

// Stop channel
app.post('/api/channels/:id/stop', requireAuth, (req, res) => {
  const { id } = req.params;
  
  const channel = db.getChannel(id);
  if (!channel) {
    return res.json({ success: false, error: 'Kênh không tồn tại' });
  }
  
  db.updateChannel(id, { is_running: 0 });
  scheduler.stopChannelMonitoring(id);
  
  res.json({ success: true });
});

// Get logs
app.get('/api/logs', requireAuth, (req, res) => {
  const logs = db.getLogs(200);
  res.json({ success: true, logs: logs });
});

// Clear logs
app.delete('/api/logs', requireAuth, (req, res) => {
  db.clearLogs();
  res.json({ success: true });
});

// Get channel history
app.get('/api/channels/:id/history', requireAuth, (req, res) => {
  const { id } = req.params;
  
  const videos = db.getChannelProcessedVideos(id);
  const videosWithOrders = videos.map(video => {
    const orders = db.getVideoOrders(video.id);
    return { ...video, orders };
  });
  
  res.json({ success: true, videos: videosWithOrders });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Open: http://localhost:${PORT}`);
  
  // Resume running channels
  scheduler.resumeAllChannels();
  
  db.addLog('✅ Hệ thống đã khởi động', 'success');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  db.addLog('⏹️ Hệ thống đang tắt', 'info');
  process.exit(0);
});
