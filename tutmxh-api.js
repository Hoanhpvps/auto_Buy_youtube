const axios = require('axios');

class TutmxhAPI {
  constructor() {
    this.baseUrl = 'https://tutmxh.com/api/v2';
    this.apiKey = null;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async request(data) {
    if (!this.apiKey) {
      throw new Error('API Key chưa được cấu hình');
    }

    try {
      const response = await axios.post(this.baseUrl, {
        key: this.apiKey,
        ...data
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      console.error('API Request Error:', error.message);
      throw error;
    }
  }

  // Lấy danh sách dịch vụ
  async getServices() {
    try {
      const data = await this.request({ action: 'services' });
      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Tạo đơn hàng
  async createOrder(serviceId, link, quantity, options = {}) {
    try {
      const requestData = {
        action: 'add',
        service: serviceId,
        link: link,
        quantity: quantity
      };

      // Thêm các tham số tùy chọn nếu có
      if (options.list) requestData.list = options.list;
      if (options.suggest) requestData.suggest = options.suggest;
      if (options.search) requestData.search = options.search;
      if (options.comments) requestData.comments = options.comments;

      const data = await this.request(requestData);

      // ===== FIX: API mới trả về { "order": 99999 } =====
      if (data.order) {
        return {
          success: true,
          data: {
            order: data.order  // Đảm bảo trả về đúng key "order"
          }
        };
      } else if (data.error) {
        return {
          success: false,
          error: data.error
        };
      } else {
        return {
          success: false,
          error: 'Không nhận được mã đơn hàng từ API'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Kiểm tra trạng thái đơn hàng
  async getOrderStatus(orderId) {
    try {
      const data = await this.request({
        action: 'status',
        order: orderId
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Kiểm tra nhiều đơn hàng cùng lúc (tối đa 100)
  async getMultipleOrderStatus(orderIds) {
    try {
      const data = await this.request({
        action: 'status',
        orders: orderIds.join(',')
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Kiểm tra số dư
  async getBalance() {
    try {
      const data = await this.request({ action: 'balance' });
      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Tạo refill
  async createRefill(orderId) {
    try {
      const data = await this.request({
        action: 'refill',
        order: orderId
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Tạo nhiều refill cùng lúc
  async createMultipleRefill(orderIds) {
    try {
      const data = await this.request({
        action: 'refill',
        orders: orderIds.join(',')
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Kiểm tra trạng thái refill
  async getRefillStatus(refillId) {
    try {
      const data = await this.request({
        action: 'refill_status',
        refill: refillId
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Lấy danh sách products
  async getProducts() {
    try {
      const data = await this.request({ action: 'products' });
      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Tạo đơn hàng product
  async createProductOrder(productId, quantity, require) {
    try {
      const data = await this.request({
        action: 'add_product_order',
        product: productId,
        quantity: quantity,
        require: require
      });

      // ===== FIX: Product order cũng trả về { "order": 99999 } =====
      if (data.order) {
        return {
          success: true,
          data: {
            order: data.order
          }
        };
      } else if (data.error) {
        return {
          success: false,
          error: data.error
        };
      } else {
        return {
          success: false,
          error: 'Không nhận được mã đơn hàng từ API'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Kiểm tra trạng thái product order
  async getProductOrderStatus(orderId) {
    try {
      const data = await this.request({
        action: 'product_order_status',
        order: orderId
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Lấy kết quả product order
  async getProductResult(orderId) {
    try {
      const data = await this.request({
        action: 'result_product',
        order: orderId
      });

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new TutmxhAPI();
