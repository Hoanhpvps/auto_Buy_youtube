// API Functions
async function apiCall(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    return await response.json();
}

// Save API Key
async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        alert('Vui lòng nhập API Key!');
        return;
    }
    
    const result = await apiCall('/api/set-api-key', 'POST', { apiKey });
    
    if (result.success) {
        alert(`✅ Đã lưu API Key! Số dư: $${result.balance}`);
        document.getElementById('balance').textContent = `$${result.balance}`;
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Check balance
async function checkBalance() {
    const result = await apiCall('/api/balance');
    
    if (result.success) {
        document.getElementById('balance').textContent = `$${result.balance}`;
        alert(`💰 Số dư: $${result.balance}`);
    } else {
        alert('❌ ' + result.error);
    }
}

// Load services
async function loadServices() {
    const result = await apiCall('/api/load-services', 'POST');
    
    if (result.success) {
        alert(`✅ Đã tải ${result.count} dịch vụ YouTube`);
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Show add channel modal
function showAddChannelModal() {
    if (allServices.length === 0) {
        alert('Vui lòng tải danh sách dịch vụ trước!');
        return;
    }
    
    document.getElementById('newChannelName').value = '';
    document.getElementById('newChannelId').value = '';
    document.getElementById('newChannelSchedule').value = '';
    
    renderModalServices();
    document.getElementById('addChannelModal').classList.add('active');
}

function closeAddChannelModal() {
    document.getElementById('addChannelModal').classList.remove('active');
}

// Render services in modal
function renderModalServices() {
    const container = document.getElementById('modalServicesList');
    
    container.innerHTML = allServices.map(service => `
        <div class="service-item">
            <input type="checkbox" id="modal_service_${service.service}">
            <div class="service-info">
                <div class="service-name">${service.name}</div>
                <div class="service-details">
                    Giá: $${service.rate} | Min: ${service.min} | Max: ${service.max}
                </div>
            </div>
            <input type="number" 
                   id="modal_quantity_${service.service}" 
                   placeholder="SL" 
                   min="${service.min}" 
                   max="${service.max}" 
                   value="${service.min}">
        </div>
    `).join('');
}

// Add new channel
async function addNewChannel() {
    const name = document.getElementById('newChannelName').value.trim();
    const id = document.getElementById('newChannelId').value.trim();
    const schedule = document.getElementById('newChannelSchedule').value.trim();
    const contentType = document.getElementById('newChannelContentType').value;
    
    if (!name || !id) {
        alert('Vui lòng nhập tên kênh và Channel ID!');
        return;
    }
    
    // Extract channel ID if URL is provided
    let channelId = id;
    if (id.includes('youtube.com')) {
        const match = id.match(/channel\/(UC[\w-]{22})/);
        if (match) {
            channelId = match[1];
        }
    }
    
    // Get selected services
    const services = [];
    allServices.forEach(service => {
        const checkbox = document.getElementById(`modal_service_${service.service}`);
        if (checkbox && checkbox.checked) {
            const quantity = document.getElementById(`modal_quantity_${service.service}`).value;
            services.push({
                serviceId: service.service,
                quantity: parseInt(quantity) || service.min
            });
        }
    });
    
    if (services.length === 0) {
        alert('Vui lòng chọn ít nhất một dịch vụ!');
        return;
    }
    
    const result = await apiCall('/api/channels', 'POST', {
        id: channelId,
        name: name,
        schedule: schedule,
        contentType: contentType,
        services: services
    });
    
    if (result.success) {
        alert('✅ Đã thêm kênh!');
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Show edit channel modal
function showEditChannelModal(channelId) {
    const channel = channelsData.find(c => c.id === channelId);
    if (!channel) return;
    
    document.getElementById('editChannelId').value = channelId;
    document.getElementById('editChannelName').value = channel.name;
    document.getElementById('editChannelSchedule').value = channel.schedule || '';
    document.getElementById('editChannelContentType').value = channel.content_type || 'both';
    
    renderEditServices(channel);
    document.getElementById('editChannelModal').classList.add('active');
}

function closeEditChannelModal() {
    document.getElementById('editChannelModal').classList.remove('active');
}

// Render services in edit modal
function renderEditServices(channel) {
    const container = document.getElementById('editServicesList');
    
    container.innerHTML = allServices.map(service => {
        const selected = channel.services.find(s => s.service_id == service.service);
        
        return `
            <div class="service-item">
                <input type="checkbox" 
                       id="edit_service_${service.service}"
                       ${selected ? 'checked' : ''}>
                <div class="service-info">
                    <div class="service-name">${service.name}</div>
                    <div class="service-details">
                        Giá: $${service.rate} | Min: ${service.min} | Max: ${service.max}
                    </div>
                </div>
                <input type="number" 
                       id="edit_quantity_${service.service}" 
                       placeholder="SL" 
                       min="${service.min}" 
                       max="${service.max}" 
                       value="${selected ? selected.quantity : service.min}">
            </div>
        `;
    }).join('');
}

// Save channel edit
async function saveChannelEdit() {
    const channelId = document.getElementById('editChannelId').value;
    const name = document.getElementById('editChannelName').value.trim();
    const schedule = document.getElementById('editChannelSchedule').value.trim();
    const contentType = document.getElementById('editChannelContentType').value;
    
    // Get selected services
    const services = [];
    allServices.forEach(service => {
        const checkbox = document.getElementById(`edit_service_${service.service}`);
        if (checkbox && checkbox.checked) {
            const quantity = document.getElementById(`edit_quantity_${service.service}`).value;
            services.push({
                serviceId: service.service,
                quantity: parseInt(quantity) || service.min
            });
        }
    });
    
    if (services.length === 0) {
        alert('Vui lòng chọn ít nhất một dịch vụ!');
        return;
    }
    
    const result = await apiCall(`/api/channels/${channelId}`, 'PUT', {
        name: name,
        schedule: schedule,
        contentType: contentType,
        services: services
    });
    
    if (result.success) {
        alert('✅ Đã lưu thay đổi!');
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Delete channel
async function deleteChannel(channelId) {
    if (!confirm('Bạn có chắc muốn xóa kênh này?')) {
        return;
    }
    
    const result = await apiCall(`/api/channels/${channelId}`, 'DELETE');
    
    if (result.success) {
        alert('✅ Đã xóa kênh!');
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Start channel
async function startChannel(channelId) {
    const result = await apiCall(`/api/channels/${channelId}/start`, 'POST');
    
    if (result.success) {
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Stop channel
async function stopChannel(channelId) {
    const result = await apiCall(`/api/channels/${channelId}/stop`, 'POST');
    
    if (result.success) {
        location.reload();
    } else {
        alert('❌ ' + result.error);
    }
}

// Start all channels
async function startAllChannels() {
    for (const channel of channelsData) {
        if (!channel.is_running) {
            await apiCall(`/api/channels/${channel.id}/start`, 'POST');
        }
    }
    alert('✅ Đã bật tất cả kênh!');
    location.reload();
}

// Stop all channels
async function stopAllChannels() {
    for (const channel of channelsData) {
        if (channel.is_running) {
            await apiCall(`/api/channels/${channel.id}/stop`, 'POST');
        }
    }
    alert('✅ Đã dừng tất cả kênh!');
    location.reload();
}

// View channel history
async function viewChannelHistory(channelId) {
    const result = await apiCall(`/api/channels/${channelId}/history`);
    
    if (result.success) {
        if (result.videos.length === 0) {
            alert('Chưa có video nào trong lịch sử');
            return;
        }
        
        let message = 'Lịch sử video:\n\n';
        result.videos.forEach((video, index) => {
            message += `${index + 1}. ${video.video_title}\n`;
            message += `   URL: ${video.video_url}\n`;
            message += `   Đơn hàng: ${video.orders.length}\n\n`;
        });
        
        alert(message);
    }
}

// Load logs
async function loadLogs() {
    const result = await apiCall('/api/logs');
    
    if (result.success) {
        const container = document.getElementById('logs');
        
        container.innerHTML = result.logs.map(log => {
            const date = new Date(log.created_at);
            const timeStr = date.toLocaleTimeString('vi-VN');
            const logClass = log.type === 'error' ? 'log-error' : 
                           log.type === 'success' ? 'log-success' : 
                           log.type === 'warning' ? 'log-warning' : 'log-info';
            
            const channelPrefix = log.channel_id ? `[${log.channel_id.substring(0, 8)}...] ` : '';
            
            return `
                <div class="log-entry ${logClass}">
                    <span class="log-time">[${timeStr}]</span>
                    ${channelPrefix}${log.message}
                </div>
            `;
        }).join('');
    }
}

// Clear logs
async function clearLogs() {
    if (!confirm('Xóa tất cả logs?')) {
        return;
    }
    
    const result = await apiCall('/api/logs', 'DELETE');
    
    if (result.success) {
        loadLogs();
    }
}

// Load logs on page load
window.addEventListener('load', () => {
    loadLogs();
    
    // Auto refresh logs every 10 seconds
    setInterval(loadLogs, 10000);
});
