const crypto = require('crypto');
const axios = require('axios');

class PaymentService {
    constructor() {
        this.partnerId = '60448208703';
        this.partnerKey = '028e31af6e924f6dcea682d29e8779ef';
        this.walletNumber = '0051717476';
        this.baseUrl = 'https://doithevip.com';
    }

    /**
     * Tạo chữ ký MD5 theo tài liệu Doithevip:
     * md5(partner_key + code + serial)
     */
    generateSign(code, serial) {
        const raw = `${this.partnerKey}${code}${serial}`;
        return crypto.createHash('md5').update(raw).digest('hex');
    }

    /**
     * Gửi thẻ cào lên Doithevip.com Partner API
     * @param {Object} cardData
     * @param {string} cardData.telco VIETTEL, MOBIFONE, VINAPHONE, VIETNAMOBILE, ZING, GATE...
     * @param {string} cardData.code Mã thẻ
     * @param {string} cardData.serial Số seri
     * @param {number|string} cardData.amount Mệnh giá khai báo
     * @param {string} cardData.username Tên người dùng trong hệ thống
     */
    async chargeCard({ telco, code, serial, amount, username }) {
        if (!telco || !code || !serial || !amount) {
            throw new Error('Vui lòng điền đầy đủ loại thẻ, mã thẻ, số seri và mệnh giá!');
        }

        const requestId = `CHG_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const sign = this.generateSign(code, serial);

        const params = new URLSearchParams();
        params.append('telco', telco.toUpperCase());
        params.append('code', code.trim());
        params.append('serial', serial.trim());
        params.append('amount', String(amount));
        params.append('request_id', requestId);
        params.append('partner_id', this.partnerId);
        params.append('command', 'charging');
        params.append('sign', sign);

        try {
            const response = await axios.post(`${this.baseUrl}/chargingws/v2`, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            });

            const data = response.data;
            /**
             * Trạng thái trả về:
             * 1: Thẻ thành công đúng mệnh giá
             * 2: Thẻ thành công sai mệnh giá
             * 3: Thẻ lỗi
             * 4: Hệ thống bảo trì
             * 99: Thẻ chờ xử lý (PENDING)
             * 100: Gửi thẻ thất bại
             */
            return {
                success: true,
                requestId,
                status: data.status,
                message: this.getStatusMessage(data.status, data.message),
                raw: data
            };
        } catch (error) {
            console.error('[PaymentService] Lỗi gửi thẻ:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Không thể kết nối đến máy chủ thẻ cào'
            };
        }
    }

    /**
     * Kiểm tra trạng thái thẻ cào
     */
    async checkCardStatus({ telco, code, serial, amount, requestId }) {
        const sign = this.generateSign(code, serial);
        const params = new URLSearchParams();
        params.append('command', 'check');
        params.append('telco', telco.toUpperCase());
        params.append('code', code.trim());
        params.append('serial', serial.trim());
        params.append('amount', String(amount));
        params.append('request_id', requestId);
        params.append('partner_id', this.partnerId);
        params.append('sign', sign);

        try {
            const response = await axios.post(`${this.baseUrl}/chargingws/v2`, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 20000
            });
            const data = response.data;
            return {
                success: true,
                status: data.status,
                message: this.getStatusMessage(data.status, data.message),
                declaredValue: data.declared_value,
                realValue: data.value,
                amount: data.amount,
                raw: data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    getStatusMessage(status, fallback) {
        switch (Number(status)) {
            case 1:
                return 'Nạp thẻ thành công! Tiền đã cộng vào tài khoản.';
            case 2:
                return 'Thẻ đúng nhưng sai mệnh giá khai báo.';
            case 3:
                return 'Thẻ sai hoặc đã được sử dụng!';
            case 4:
                return 'Hệ thống đổi thẻ đang bảo trì. Vui lòng thử lại sau.';
            case 99:
                return 'Thẻ đang chờ xử lý từ nhà mạng...';
            case 100:
                return `Gửi thẻ thất bại: ${fallback || 'Lỗi không xác định'}`;
            case 102:
                return 'Chữ ký không hợp lệ.';
            default:
                return fallback || `Mã phản hồi: ${status}`;
        }
    }
}

module.exports = new PaymentService();
