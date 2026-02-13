const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');
const scheduler = require('./scheduler');
const tutmxhApi = require('./tutmxh-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' ? false : false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== MIDDLEWARE: Require authentication =====
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// ===== ROUTES =====

// Login page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login POST
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid username or password' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ===== MAIN PAGE =====
app.get('/', requireAuth, async (req, res) => {
  try {
    // ✅ FIX: Thêm await cho tất cả database calls
    const channels = await db.getAllChannels();
    const settings = await db.getAllSettings();
    const stats = await db.getStats();
    
    // ✅ FIX: Parse services safely
    let services = [];
    if (settings && settings.services) {
      try {
        services = JSON.parse(settings.services);
      } catch (e) {
        console.error('Error parsing services:', e);
        services = [];
      }
    }
    
    res.render('index', {
      channels: channels || [],
      services: services,
      stats: stats || { totalChannels: 0, activeChannels: 0, totalOrders: 0, todayOrders: 0 },
      apiKey: settings.api_key || '',
      username: req.session.username
    });
  } catch (error) {
    console.error('Error loading index page:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

// ===== API ENDPOINTS =====

// Get all channels
app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    const channels = await db.getAllChannels();
    res.json({ success: true, data: channels });
  } catch (error) {
    console.error('Error getting channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new channel
app.post('/api/channels', requireAuth, async (req, res) => {
  try {
    const { name, channel_id, schedule, service_id, quantity } = req.body;
    
    // Validate input
    if (!name || !channel_id || !service_id || !quantity) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const result = await db.addChannel({
      name,
      channel_id,
      schedule: schedule || '',
      service_id: parseInt(service_id),
      quantity: parseInt(quantity)
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update channel
app.put('/api/channels/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, channel_id, schedule, service_id, quantity } = req.body;
    
    await db.updateChannel(id, {
      name,
      channel_id,
      schedule,
      service_id: parseInt(service_id),
      quantity: parseInt(quantity)
    });
    
    // Restart scheduler for this channel if it's active
    const channel = await db.getChannel(id);
    if (channel && channel.is_active) {
      await scheduler.restartJob(parseInt(id));
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete channel
app.delete('/api/channels/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Stop scheduler first
    scheduler.stopJob(parseInt(id));
    
    // Delete from database
    await db.deleteChannel(parseInt(id));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start channel
app.post('/api/channels/start/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update status in database
    await db.updateChannelStatus(parseInt(id), true);
    
    // Get channel data
    const channel = await db.getChannel(parseInt(id));
    
    // Start scheduler
    scheduler.startScheduledJob(channel);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error starting channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop channel
app.post('/api/channels/stop/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Stop scheduler
    scheduler.stopJob(parseInt(id));
    
    // Update status in database
    await db.updateChannelStatus(parseInt(id), false);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping channel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start all channels
app.post('/api/channels/start-all', requireAuth, async (req, res) => {
  try {
    const channels = await db.getActiveChannels();
    
    channels.forEach(channel => {
      scheduler.startScheduledJob(channel);
    });
    
    res.json({ success: true, count: channels.length });
  } catch (error) {
    console.error('Error starting all channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop all channels
app.post('/api/channels/stop-all', requireAuth, async (req, res) => {
  try {
    scheduler.stopAllJobs();
    
    // Update all channels to inactive
    const channels = await db.getAllChannels();
    for (const channel of channels) {
      await db.updateChannelStatus(channel.id, false);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping all channels:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== API KEY & SERVICES =====

// Save API key
app.post('/api/config/api-key', requireAuth, async (req, res) => {
  try {
    const { api_key } = req.body;
    
    if (!api_key) {
      return res.status(400).json({ 
        success: false, 
        error: 'API key is required' 
      });
    }
    
    // Save to database
    await db.saveConfig('api_key', api_key);
    
    // Set in tutmxhApi
    tutmxhApi.setApiKey(api_key);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load services from TUTMXH
app.get('/api/services', requireAuth, async (req, res) => {
  try {
    // Get API key from database
    const apiKey = await db.getConfig('api_key');
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'API key not configured' 
      });
    }
    
    // Set API key
    tutmxhApi.setApiKey(apiKey);
    
    // Fetch services
    const result = await tutmxhApi.getServices();
    
    if (result.success) {
      // Save to database
      await db.saveConfig('services', JSON.stringify(result.data));
      res.json({ success: true, data: result.data });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error loading services:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check balance
app.get('/api/balance', requireAuth, async (req, res) => {
  try {
    const apiKey = await db.getConfig('api_key');
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'API key not configured' 
      });
    }
    
    tutmxhApi.setApiKey(apiKey);
    const result = await tutmxhApi.getBalance();
    
    res.json(result);
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== LOGS =====

// Get logs
app.get('/api/logs', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await db.getLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get logs by channel
app.get('/api/logs/channel/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const logs = await db.getLogsByChannel(parseInt(id), limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting channel logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ORDERS =====

// Get all orders
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const orders = await db.getOrderHistory();
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get orders by channel
app.get('/api/orders/channel/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await db.getOrdersByChannel(parseInt(id));
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error getting channel orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== STATS =====

// Get statistics
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// ===== START SERVER =====
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Open: http://localhost:${PORT}`);
  
  try {
    // Wait for database to be ready
    await db.waitReady();
    
    // Load API key if exists
    const apiKey = await db.getConfig('api_key');
    if (apiKey) {
      tutmxhApi.setApiKey(apiKey);
      console.log('✅ API key loaded');
    }
    
    // Resume all active channels
    console.log('📢 Resuming all active channels...');
    await scheduler.resumeAllChannels();
    
  } catch (error) {
    console.error('❌ Startup error:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  scheduler.stopAllJobs();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  scheduler.stopAllJobs();
  await db.close();
  process.exit(0);
});
