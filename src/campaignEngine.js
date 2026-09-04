const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const zaloService = require('./zaloService');
const { personalizeText, sleep } = require('./utils');

const HISTORY_FILE = path.join(process.cwd(), 'campaigns_history.json');

class CampaignEngine extends EventEmitter {
    constructor() {
        super();
        this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
        this.currentCampaign = null;
        this.pausePromiseResolve = null;
        this.stopRequested = false;
        this.initHistory();
    }

    initHistory() {
        if (!fs.existsSync(HISTORY_FILE)) {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
        }
    }

    getHistory() {
        try {
            if (fs.existsSync(HISTORY_FILE)) {
                return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
            }
        } catch (e) {}
        return [];
    }

    saveHistory(campaignRecord) {
        try {
            const history = this.getHistory();
            history.unshift(campaignRecord);
            // Giữ tối đa 50 chiến dịch gần nhất
            if (history.length > 50) history.pop();
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
        } catch (e) {
            console.error('Lỗi khi lưu lịch sử chiến dịch:', e.message);
        }
    }

    getStatus() {
        return {
            status: this.status,
            campaign: this.currentCampaign ? {
                id: this.currentCampaign.id,
                name: this.currentCampaign.name,
                total: this.currentCampaign.total,
                sent: this.currentCampaign.sent,
                success: this.currentCampaign.success,
                failed: this.currentCampaign.failed,
                currentIndex: this.currentCampaign.currentIndex,
                currentMember: this.currentCampaign.currentMember,
                percentage: this.currentCampaign.total > 0
                    ? Math.round((this.currentCampaign.sent / this.currentCampaign.total) * 100)
                    : 0,
                startTime: this.currentCampaign.startTime,
                elapsedSeconds: this.currentCampaign.startTime
                    ? Math.round((Date.now() - new Date(this.currentCampaign.startTime).getTime()) / 1000)
                    : 0
            } : null
        };
    }

    /**
     * Bắt đầu một chiến dịch gửi tin nhắn / file / ảnh mới
     */
    async start({
        name = 'Chiến Dịch Ads Zalo',
        targets = [],
        textTemplate = '',
        filePath = null,
        isVoice = false,
        minDelay = 5,
        maxDelay = 8,
        excludeSelf = true,
        batchSize = 0,
        batchPauseSeconds = 30
    }) {
        if (this.status === 'running' || this.status === 'paused') {
            throw new Error('Đang có chiến dịch đang chạy. Vui lòng dừng chiến dịch hiện tại trước!');
        }

        if (!zaloService.isLoggedIn()) {
            throw new Error('Chưa đăng nhập tài khoản Zalo.');
        }

        let sendList = [...targets];
        const myUid = zaloService.currentUser ? (zaloService.currentUser.uid || zaloService.currentUser.userId) : null;
        if (excludeSelf && myUid) {
            sendList = sendList.filter(m => String(m.id || m.uid) !== String(myUid));
        }

        if (sendList.length === 0) {
            throw new Error('Danh sách người nhận rỗng!');
        }

        const campaignId = 'camp_' + Date.now();
        this.status = 'running';
        this.stopRequested = false;
        this.pausePromiseResolve = null;

        this.currentCampaign = {
            id: campaignId,
            name,
            total: sendList.length,
            sent: 0,
            success: 0,
            failed: 0,
            currentIndex: 0,
            currentMember: null,
            targets: sendList,
            textTemplate,
            filePath,
            isVoice,
            minDelay: Math.max(1, parseInt(minDelay, 10) || 5),
            maxDelay: Math.max(minDelay, parseInt(maxDelay, 10) || 8),
            startTime: new Date().toISOString(),
            logs: [],
            results: []
        };

        this.emit('status_change', this.getStatus());
        this.log(`🚀 [KHỞI ĐỘNG] Bắt đầu chiến dịch "${name}" - Tổng số: ${sendList.length} người nhận ${isVoice ? '(🎤 Chế độ Voice Note)' : ''}.`, 'info');

        // Bắt đầu vòng lặp gửi tin nhắn
        this.runLoop(sendList, textTemplate, filePath, isVoice, batchSize, batchPauseSeconds);
        return this.getStatus();
    }

    async runLoop(sendList, textTemplate, filePath, isVoice, batchSize, batchPauseSeconds) {
        for (let i = 0; i < sendList.length; i++) {
            // Kiểm tra nếu có yêu cầu Stop
            if (this.stopRequested) {
                this.status = 'stopped';
                this.log('🛑 [DỪNG] Chiến dịch đã được dừng bởi người dùng.', 'warn');
                break;
            }

            // Kiểm tra nếu đang Paused
            if (this.status === 'paused') {
                this.log('⏸️ [TẠM DỪNG] Chiến dịch đang tạm dừng. Chờ người dùng tiếp tục...', 'warn');
                await new Promise(resolve => { this.pausePromiseResolve = resolve; });
                if (this.stopRequested) {
                    this.status = 'stopped';
                    this.log('🛑 [DỪNG] Chiến dịch đã bị dừng.', 'warn');
                    break;
                }
                this.status = 'running';
                this.log('▶️ [TIẾP TỤC] Chiến dịch tiếp tục hoạt động.', 'info');
                this.emit('status_change', this.getStatus());
            }

            const member = sendList[i];
            const memberId = member.id || member.uid;
            const memberName = member.displayName || member.zaloName || `User_${memberId}`;
            this.currentCampaign.currentIndex = i + 1;
            this.currentCampaign.currentMember = { id: memberId, name: memberName };

            const finalMsg = textTemplate ? personalizeText(textTemplate, member) : '';

            this.log(`[${i + 1}/${sendList.length}] Đang gửi ${isVoice ? '🎤 Voice' : 'tin nhắn'} tới: ${memberName} (${memberId})...`, 'process');

            try {
                let res;
                if (isVoice && filePath) {
                    res = await zaloService.sendVoiceMessage({
                        threadId: memberId,
                        type: 'user',
                        filePath
                    });
                    if (finalMsg) {
                        try {
                            await zaloService.sendMessageToUser({ targetId: memberId, text: finalMsg });
                        } catch (e) {}
                    }
                } else {
                    res = await zaloService.sendMessageToUser({
                        targetId: memberId,
                        text: finalMsg,
                        filePath: filePath || null
                    });
                }

                this.currentCampaign.sent++;

                if (res.success) {
                    this.currentCampaign.success++;
                    this.currentCampaign.results.push({ id: memberId, name: memberName, status: 'success', time: new Date().toISOString() });
                    this.log(`✅ [THÀNH CÔNG] Đã gửi ${isVoice ? '🎤 Voice' : 'tin nhắn'} tới ${memberName} (${memberId})`, 'success');
                } else {
                    this.currentCampaign.failed++;
                    this.currentCampaign.results.push({ id: memberId, name: memberName, status: 'failed', error: res.error, time: new Date().toISOString() });
                    this.log(`❌ [THẤT BẠI] Gửi tới ${memberName} thất bại: ${res.error}`, 'error');
                }
            } catch (err) {
                this.currentCampaign.sent++;
                this.currentCampaign.failed++;
                this.currentCampaign.results.push({ id: memberId, name: memberName, status: 'failed', error: err.message, time: new Date().toISOString() });
                this.log(`❌ [LỖI] ${err.message}`, 'error');
            }

            this.emit('progress', this.getStatus());

            // Xử lý Batch Pause nếu cấu hình
            if (batchSize > 0 && (i + 1) % batchSize === 0 && i < sendList.length - 1) {
                const pSec = Math.max(5, batchPauseSeconds || 30);
                this.log(`☕ [NGHỈ GIẢI LAO] Đã gửi xong batch ${batchSize} tin nhắn. Tạm nghỉ ${pSec}s để bảo vệ tài khoản...`, 'warn');
                await sleep(pSec * 1000);
            } else if (i < sendList.length - 1) {
                // Tính độ trễ ngẫu nhiên (Random Jitter Delay)
                const min = this.currentCampaign.minDelay;
                const max = this.currentCampaign.maxDelay;
                const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
                this.log(`⏳ Chờ ${randomDelay}s trước khi gửi người tiếp theo...`, 'process');
                await sleep(randomDelay * 1000);
            }
        }

        if (this.status !== 'stopped') {
            this.status = 'completed';
            this.log(`🎉 [HOÀN TẤT] Chiến dịch đã hoàn thành! Thành công: ${this.currentCampaign.success}, Thất bại: ${this.currentCampaign.failed}`, 'success');
        }

        this.currentCampaign.endTime = new Date().toISOString();
        this.saveHistory({
            id: this.currentCampaign.id,
            name: this.currentCampaign.name,
            total: this.currentCampaign.total,
            success: this.currentCampaign.success,
            failed: this.currentCampaign.failed,
            startTime: this.currentCampaign.startTime,
            endTime: this.currentCampaign.endTime,
            status: this.status,
            results: this.currentCampaign.results
        });

        this.emit('complete', this.getStatus());
        this.emit('status_change', this.getStatus());
    }

    /**
     * Tạm dừng chiến dịch
     */
    pause() {
        if (this.status === 'running') {
            this.status = 'paused';
            this.emit('status_change', this.getStatus());
            return true;
        }
        return false;
    }

    /**
     * Tiếp tục chiến dịch
     */
    resume() {
        if (this.status === 'paused') {
            if (this.pausePromiseResolve) {
                this.pausePromiseResolve();
                this.pausePromiseResolve = null;
            }
            this.status = 'running';
            this.emit('status_change', this.getStatus());
            return true;
        }
        return false;
    }

    /**
     * Dừng hẳn chiến dịch
     */
    stop() {
        if (this.status === 'running' || this.status === 'paused') {
            this.stopRequested = true;
            if (this.pausePromiseResolve) {
                this.pausePromiseResolve();
                this.pausePromiseResolve = null;
            }
            this.status = 'stopped';
            this.emit('status_change', this.getStatus());
            return true;
        }
        return false;
    }

    /**
     * Ghi log và broadcast realtime
     */
    log(message, level = 'info') {
        const logEntry = {
            id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
            message,
            level
        };
        if (this.currentCampaign) {
            this.currentCampaign.logs.push(logEntry);
            if (this.currentCampaign.logs.length > 500) {
                this.currentCampaign.logs.shift();
            }
        }
        this.emit('log', logEntry);
    }
}

module.exports = new CampaignEngine();
