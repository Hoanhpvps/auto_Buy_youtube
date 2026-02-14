const cron = require('node-cron');
const db = require('./database');
const api = require('./tutmxh-api');

// Active intervals for continuous monitoring
const channelIntervals = {};

// Lấy thời gian hiện tại theo múi giờ Việt Nam (GMT+7)
// Render.com chạy ở UTC nên phải convert thủ công
function getNowVN() {
  const now = new Date();
  // UTC + 7 hours
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime;
}

// Parse schedule string
function parseSchedule(scheduleStr) {
  if (!scheduleStr) return [];
  
  const times = scheduleStr.split(',').map(t => t.trim()).filter(t => t);
  const result = [];
  
  for (const timeStr of times) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        result.push({
          hours: hours,
          minutes: minutes,
          display: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
        });
      }
    }
  }
  
  return result;
}

// Check if current time matches schedule (dùng giờ VN GMT+7)
function isScheduledTime(scheduleTimes) {
  const nowVN = getNowVN();
  return scheduleTimes.some(time => 
    time.hours === nowVN.getUTCHours() && time.minutes === nowVN.getUTCMinutes()
  );
}

// Process a single channel
async function checkChannel(channelId) {
  const channel = db.getChannel(channelId);
  if (!channel || !channel.is_running) return;
  
  const apiKey = db.getConfig('api_key');
  if (!apiKey) {
    db.addLog('API Key chưa được cấu hình', 'error', channelId);
    return;
  }
  
  try {
    const now = new Date();
    const nowVN = getNowVN();
    const timeStr = `${nowVN.getUTCHours().toString().padStart(2,'0')}:${nowVN.getUTCMinutes().toString().padStart(2,'0')} (VN)`;
    
    db.addLog(`🔍 Kiểm tra video mới lúc ${timeStr}...`, 'info', channelId);
    
    // Fetch latest video
    const latestVideo = await api.fetchLatestVideo(channelId);
    
    if (!latestVideo) {
      db.addLog('⚠️ Không tìm thấy video trong RSS feed', 'warning', channelId);
      db.updateChannel(channelId, { last_checked: now.toISOString() });
      return;
    }
    
    db.addLog(`📺 Tìm thấy video: ${latestVideo.title}`, 'info', channelId);
    db.addLog(`🔗 URL: ${latestVideo.url}`, 'info', channelId);
    db.addLog(`🆔 Video ID: ${latestVideo.videoId}`, 'info', channelId);
    
    // Check if it's a livestream (if YouTube API is configured)
    let isLivestream = false;
    let livestreamInfo = null;
    
    if (process.env.YOUTUBE_API_KEY) {
      livestreamInfo = await api.checkIfLivestream(latestVideo.videoId);
      
      if (livestreamInfo) {
        isLivestream = livestreamInfo.isLivestream;
        
        if (isLivestream) {
          const statusText = livestreamInfo.status === 'live' ? '🔴 ĐANG LIVE' : 
                           livestreamInfo.status === 'upcoming' ? '📅 SẮP LIVE' : 
                           '🎥 Livestream';
          db.addLog(`${statusText}`, 'success', channelId);
        } else {
          db.addLog(`📹 Video thường`, 'info', channelId);
        }
      }
    }
    
    // Check content type filter
    const contentType = channel.content_type || 'both';
    
    if (contentType === 'video_only' && isLivestream) {
      db.addLog(`⏭️ Bỏ qua - Kênh chỉ xử lý video thường`, 'info', channelId);
      db.updateChannel(channelId, { 
        last_video_id: latestVideo.videoId,
        last_checked: now.toISOString() 
      });
      return;
    }
    
    if (contentType === 'livestream_only' && !isLivestream) {
      db.addLog(`⏭️ Bỏ qua - Kênh chỉ xử lý livestream`, 'info', channelId);
      db.updateChannel(channelId, { 
        last_video_id: latestVideo.videoId,
        last_checked: now.toISOString() 
      });
      return;
    }
    
    // Check if video is recent (published in last 15 minutes)
    const isRecent = api.isRecentVideo(latestVideo.published, 15);
    if (!isRecent) {
      const minutesAgo = Math.round((new Date() - latestVideo.published) / 1000 / 60);
      db.addLog(`⏰ Video đã được public ${minutesAgo} phút trước (không đủ mới)`, 'info', channelId);
    }
    
    // Check if it's a new video (so far not seen in this run)
    const isNewVideo = channel.last_video_id !== latestVideo.videoId;
    
    // ⛔ KIỂM TRA: Video đã được xử lý trong DB chưa? (bảo vệ tránh đặt đơn trùng)
    const existingProcessed = db.getProcessedVideo(channelId, latestVideo.videoId);
    
    db.updateChannel(channelId, { 
      last_video_id: latestVideo.videoId,
      last_checked: now.toISOString() 
    });
    
    if (!isNewVideo || existingProcessed) {
      if (existingProcessed) {
        // Kiểm tra xem đã đặt đơn chưa
        const existingOrders = db.getVideoOrders(existingProcessed.id);
        if (existingOrders.length > 0) {
          db.addLog(`⏭️ Video đã được đặt đơn trước đó (${existingOrders.length} đơn) - Bỏ qua`, 'info', channelId);
          return;
        }
        // Video đã biết nhưng chưa có đơn nào → tiếp tục đặt đơn
        db.addLog(`🔄 Video đã biết nhưng chưa có đơn, tiếp tục xử lý...`, 'info', channelId);
      } else {
        db.addLog(`ℹ️ Video hiện tại đã được xử lý trước đó`, 'info', channelId);
        db.addLog(`💡 Hệ thống đang chờ video mới xuất hiện`, 'info', channelId);
        return;
      }
    }
    
    // New video detected (or existing video without orders)!
    db.addLog(`🆕 VIDEO MỚI PHÁT HIỆN!`, 'success', channelId);
    
    // Check if already processed (get or create record)
    let processedVideo = existingProcessed || db.getProcessedVideo(channelId, latestVideo.videoId);
    
    if (!processedVideo) {
      const pvId = db.addProcessedVideo(channelId, latestVideo.videoId, latestVideo.title, latestVideo.url, isLivestream);
      processedVideo = { id: pvId };
    }
    
    // Get channel services
    const channelServices = db.getChannelServices(channelId);
    
    if (channelServices.length === 0) {
      db.addLog('⚠️ Kênh chưa có dịch vụ nào được chọn', 'warning', channelId);
      return;
    }
    
    // Get services list
    const servicesJson = db.getConfig('services');
    const allServices = servicesJson ? JSON.parse(servicesJson) : [];
    
    let orderedCount = 0;
    
    for (const selectedService of channelServices) {
      const service = allServices.find(s => s.service == selectedService.service_id);
      const serviceName = service ? service.name : `Service #${selectedService.service_id}`;
      
      // Check if already ordered
      if (db.hasServiceOrder(processedVideo.id, selectedService.service_id)) {
        db.addLog(`⏭️ Bỏ qua ${serviceName} - Đã mua`, 'info', channelId);
        continue;
      }
      
      db.addLog(`📦 Tạo đơn: ${serviceName} (SL: ${selectedService.quantity})...`, 'info', channelId);
      
      try {
        const orderId = await api.createOrder(
          apiKey,
          latestVideo.url,
          selectedService.service_id,
          selectedService.quantity
        );
        
        if (orderId) {
          db.addLog(`✅ Đơn #${orderId} - ${serviceName}`, 'success', channelId);
          db.addVideoOrder(processedVideo.id, selectedService.service_id, orderId, selectedService.quantity);
          orderedCount++;
        }
      } catch (error) {
        db.addLog(`❌ Lỗi tạo đơn ${serviceName}: ${error.message}`, 'error', channelId);
      }
      
      // Wait 2 seconds between orders
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (orderedCount > 0) {
      db.addLog(`✨ Hoàn thành ${orderedCount} đơn hàng`, 'success', channelId);
      // Update balance
      await api.checkBalance(apiKey);
    } else {
      db.addLog(`⚠️ Không tạo được đơn hàng nào`, 'warning', channelId);
    }
    
  } catch (error) {
    console.error(`Error checking channel ${channelId}:`, error);
    db.addLog(`❌ Lỗi: ${error.message}`, 'error', channelId);
  }
}

// Start monitoring a channel
function startChannelMonitoring(channelId) {
  stopChannelMonitoring(channelId); // Stop if already running
  
  const channel = db.getChannel(channelId);
  if (!channel) return;
  
  db.addLog('🚀 Bắt đầu theo dõi kênh', 'success', channelId);
  
  const schedule = channel.schedule ? channel.schedule.trim() : '';
  
  if (schedule === '') {
    // Chế độ liên tục: check ngay + mỗi 5 phút
    db.addLog('⏰ Chế độ: Liên tục (mỗi 5 phút)', 'info', channelId);
    checkChannel(channelId); // Check ngay lần đầu
    channelIntervals[channelId] = setInterval(() => {
      checkChannel(channelId);
    }, 5 * 60 * 1000);
  } else {
    // Chế độ theo lịch: KHÔNG check ngay, chỉ check khi đúng giờ đặt lịch
    const scheduleTimes = parseSchedule(schedule);
    if (scheduleTimes.length > 0) {
      db.addLog(`⏰ Chế độ: Theo lịch (${scheduleTimes.map(t => t.display).join(', ')}) - Chờ đến giờ...`, 'info', channelId);
      
      let lastCheckMinute = null;
      
      // Kiểm tra mỗi 10 giây xem đã đến giờ chưa
      channelIntervals[channelId] = setInterval(() => {
        const now = new Date();
        const currentMinute = `${now.getHours()}:${now.getMinutes()}`;
        
        // Tránh check nhiều lần trong cùng một phút
        if (lastCheckMinute === currentMinute) {
          return;
        }
        
        if (isScheduledTime(scheduleTimes)) {
          lastCheckMinute = currentMinute;
          const nowVN2 = getNowVN();
          const timeStr = `${nowVN2.getUTCHours().toString().padStart(2,'0')}:${nowVN2.getUTCMinutes().toString().padStart(2,'0')} (VN)`;
          db.addLog(`⏰ ĐÃ ĐẾN GIỜ CHẠY: ${timeStr}`, 'success', channelId);
          checkChannel(channelId);
        }
      }, 10000);
    } else {
      db.addLog('⚠️ Lịch không hợp lệ, chuyển sang chế độ liên tục (mỗi 5 phút)', 'warning', channelId);
      checkChannel(channelId);
      channelIntervals[channelId] = setInterval(() => {
        checkChannel(channelId);
      }, 5 * 60 * 1000);
    }
  }
}

// Stop monitoring a channel
function stopChannelMonitoring(channelId) {
  if (channelIntervals[channelId]) {
    clearInterval(channelIntervals[channelId]);
    delete channelIntervals[channelId];
    db.addLog('⏹️ Đã dừng theo dõi kênh', 'info', channelId);
  }
}

// Resume all running channels on startup
function resumeAllChannels() {
  const channels = db.getAllChannels();
  for (const channel of channels) {
    if (channel.is_running) {
      console.log(`Resuming channel: ${channel.name} (${channel.id})`);
      startChannelMonitoring(channel.id);
    }
  }
}

module.exports = {
  checkChannel,
  startChannelMonitoring,
  stopChannelMonitoring,
  resumeAllChannels
};
