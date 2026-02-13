const cron = require('node-cron');
const axios = require('axios');
const db = require('./database');
const tutmxhApi = require('./tutmxh-api');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.continuousJobs = new Map();
  }

  // ===== FIX: Hàm kiểm tra xem hiện tại có phải giờ đặt lịch không =====
  isScheduledTime(scheduleString) {
    if (!scheduleString || scheduleString.trim() === '') {
      return true; // Nếu không có lịch, cho phép chạy mọi lúc
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const scheduledTimes = scheduleString.split(',').map(t => t.trim());
    
    // Kiểm tra xem giờ hiện tại có trong danh sách lịch không
    return scheduledTimes.includes(currentTime);
  }

  // ===== FIX: Hàm kiểm tra video đã được đặt hàng chưa =====
  async isVideoAlreadyOrdered(videoId) {
    try {
      const orders = await db.getOrderHistory();
      // Kiểm tra xem videoId có trong lịch sử đơn hàng không
      return orders.some(order => order.video_id === videoId);
    } catch (error) {
      console.error('Error checking video history:', error);
      return false;
    }
  }

  // ===== FIX: Hàm check và tạo đơn hàng (có kiểm tra lịch) =====
  async checkAndOrder(channel) {
    const logEntry = {
      channel_id: channel.id,
      channel_name: channel.name,
      timestamp: new Date().toISOString()
    };

    try {
      // ===== KIỂM TRA 1: Có phải giờ đặt lịch không? =====
      if (!this.isScheduledTime(channel.schedule)) {
        const message = `⏰ Chưa đến giờ đặt lịch. Lịch: ${channel.schedule || 'Mỗi 5 phút'}`;
        console.log(`[${channel.name}] ${message}`);
        await db.addLog({
          ...logEntry,
          status: 'skipped',
          message: message
        });
        return;
      }

      console.log(`[${channel.name}] ✅ Đúng giờ đặt lịch, bắt đầu kiểm tra kênh...`);

      // Lấy video mới nhất
      const channelUrl = `https://www.youtube.com/channel/${channel.channel_id}`;
      const videoId = await this.getLatestVideoId(channelUrl);

      if (!videoId) {
        const message = '❌ Không tìm thấy video mới';
        console.log(`[${channel.name}] ${message}`);
        await db.addLog({
          ...logEntry,
          status: 'error',
          message: message
        });
        return;
      }

      console.log(`[${channel.name}] 📹 Video mới nhất: ${videoId}`);

      // ===== KIỂM TRA 2: Video đã được đặt hàng chưa? =====
      const alreadyOrdered = await this.isVideoAlreadyOrdered(videoId);
      if (alreadyOrdered) {
        const message = `⏭️ Video ${videoId} đã được đặt hàng trước đó, bỏ qua`;
        console.log(`[${channel.name}] ${message}`);
        await db.addLog({
          ...logEntry,
          video_id: videoId,
          status: 'skipped',
          message: message
        });
        return;
      }

      // Tạo đơn hàng
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[${channel.name}] 🛒 Đặt hàng cho video: ${videoUrl}`);

      const orderResult = await tutmxhApi.createOrder(
        channel.service_id,
        videoUrl,
        channel.quantity
      );

      if (orderResult.success) {
        // ===== FIX: Lấy order ID từ response.order (theo API mới) =====
        const orderId = orderResult.data.order;

        await db.saveOrder({
          channel_id: channel.id,
          video_id: videoId,
          video_url: videoUrl,
          service_id: channel.service_id,
          quantity: channel.quantity,
          order_id: orderId,
          status: 'completed'
        });

        const message = `✅ Đặt hàng thành công! Order ID: ${orderId}`;
        console.log(`[${channel.name}] ${message}`);
        
        await db.addLog({
          ...logEntry,
          video_id: videoId,
          order_id: orderId,
          status: 'success',
          message: message
        });

        // Cập nhật stats
        await db.updateChannelStats(channel.id, {
          total_orders: (channel.total_orders || 0) + 1,
          last_check: new Date().toISOString()
        });

      } else {
        const message = `❌ Lỗi đặt hàng: ${orderResult.error}`;
        console.log(`[${channel.name}] ${message}`);
        
        await db.addLog({
          ...logEntry,
          video_id: videoId,
          status: 'error',
          message: message
        });
      }

    } catch (error) {
      const message = `❌ Lỗi: ${error.message}`;
      console.error(`[${channel.name}] ${message}`, error);
      
      await db.addLog({
        ...logEntry,
        status: 'error',
        message: message
      });
    }
  }

  // Lấy video ID mới nhất từ kênh YouTube
  async getLatestVideoId(channelUrl) {
    try {
      const response = await axios.get(channelUrl);
      const html = response.data;
      
      // Tìm video ID trong HTML
      const match = html.match(/"videoId":"([^"]+)"/);
      if (match && match[1]) {
        return match[1];
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching channel:', error.message);
      return null;
    }
  }

  // Start scheduled job cho 1 kênh
  startScheduledJob(channel) {
    if (this.jobs.has(channel.id)) {
      console.log(`[${channel.name}] Job đã chạy rồi`);
      return;
    }

    const schedule = channel.schedule;
    
    if (!schedule || schedule.trim() === '') {
      // Nếu không có lịch, chạy mỗi 5 phút
      console.log(`[${channel.name}] 🔄 Bắt đầu chạy mỗi 5 phút`);
      const job = cron.schedule('*/5 * * * *', async () => {
        await this.checkAndOrder(channel);
      });
      
      this.jobs.set(channel.id, job);
      job.start();
      
    } else {
      // Có lịch cụ thể
      const times = schedule.split(',').map(t => t.trim());
      console.log(`[${channel.name}] 📅 Bắt đầu lịch: ${times.join(', ')}`);
      
      times.forEach(time => {
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;
        
        const job = cron.schedule(cronExpression, async () => {
          await this.checkAndOrder(channel);
        });
        
        const jobKey = `${channel.id}_${time}`;
        this.jobs.set(jobKey, job);
        job.start();
      });
    }
  }

  // Stop job của 1 kênh
  stopJob(channelId) {
    // Dừng tất cả jobs liên quan đến channel này
    const jobsToStop = [];
    
    for (const [key, job] of this.jobs.entries()) {
      if (key === channelId || key.toString().startsWith(`${channelId}_`)) {
        job.stop();
        jobsToStop.push(key);
      }
    }
    
    jobsToStop.forEach(key => this.jobs.delete(key));
    
    console.log(`Stopped ${jobsToStop.length} job(s) for channel ${channelId}`);
  }

  // Restart job của 1 kênh
  async restartJob(channelId) {
    this.stopJob(channelId);
    const channel = await db.getChannel(channelId);
    if (channel) {
      this.startScheduledJob(channel);
    }
  }

  // Start tất cả jobs đang active
  async startAllActiveJobs() {
    const channels = await db.getActiveChannels();
    console.log(`Starting ${channels.length} active channel(s)...`);
    
    channels.forEach(channel => {
      this.startScheduledJob(channel);
    });
  }

  // ===== THÊM HÀM NÀY: Resume all active channels (alias của startAllActiveJobs) =====
  async resumeAllChannels() {
    console.log('📢 Resuming all active channels...');
    await this.startAllActiveJobs();
  }

  // Stop tất cả jobs
  stopAllJobs() {
    this.jobs.forEach(job => job.stop());
    this.jobs.clear();
    console.log('All jobs stopped');
  }
}

module.exports = new Scheduler();
