const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const axios = require('axios');
const { fork } = require('child_process');
const musicService = require('./musicService');

class BotManager extends EventEmitter {
    constructor() {
        super();
        this.dataDir = path.join(__dirname, '..');
        this.approvedChatsFile = path.join(this.dataDir, 'approved_chats.json');
        this.teleBotDir = path.join(this.dataDir, 'uploads', 'tele_bots');
        
        if (!fs.existsSync(this.teleBotDir)) {
            fs.mkdirSync(this.teleBotDir, { recursive: true });
        }

        this.approvedChats = this.loadApprovedChats();

        // Cấu hình runtime người dùng
        this.currentUser = null;
        this.plan = 'free'; // 'free' hoặc 'pro'
        this.timeRemaining = 3000; // Mặc định Free: 50 phút = 3000 giây
        this.isTimerRunning = false;
        this.timerInterval = null;

        // Trạng thái bot
        this.zaloBotRunning = false;
        this.teleBotRunning = false;
        this.teleBotConfig = null;
        this.telePollingTimeout = null;
        this.teleLastUpdateId = 0;
        this.teleCustomProcess = null;

        this.initTimer();
    }

    loadApprovedChats() {
        try {
            if (fs.existsSync(this.approvedChatsFile)) {
                return JSON.parse(fs.readFileSync(this.approvedChatsFile, 'utf8'));
            }
        } catch (e) {
            console.error('Lỗi đọc approved_chats.json:', e);
        }
        return {};
    }

    saveApprovedChats() {
        try {
            fs.writeFileSync(this.approvedChatsFile, JSON.stringify(this.approvedChats, null, 2), 'utf8');
        } catch (e) {
            console.error('Lỗi ghi approved_chats.json:', e);
        }
    }

    setUser(userData) {
        if (!userData) return;
        this.currentUser = userData.username;
        this.plan = userData.plan || 'free';
        if (typeof userData.timeRemaining === 'number') {
            this.timeRemaining = userData.timeRemaining;
        } else {
            this.timeRemaining = this.plan === 'pro' ? 360000 : 3000;
        }
        this.emit('user_update', this.getUserStatus());
    }

    getUserStatus() {
        return {
            username: this.currentUser,
            plan: this.plan,
            timeRemaining: this.timeRemaining,
            timeFormatted: this.formatDuration(this.timeRemaining),
            zaloBotRunning: this.zaloBotRunning,
            teleBotRunning: this.teleBotRunning
        };
    }

    formatDuration(seconds) {
        if (seconds <= 0) return '0 phút';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours} giờ ${minutes} phút ${secs}s`;
        }
        return `${minutes} phút ${secs}s`;
    }

    initTimer() {
        this.timerInterval = setInterval(() => {
            if (this.zaloBotRunning || this.teleBotRunning) {
                if (this.timeRemaining > 0) {
                    this.timeRemaining--;
                    this.emit('time_tick', {
                        timeRemaining: this.timeRemaining,
                        timeFormatted: this.formatDuration(this.timeRemaining)
                    });

                    // Khi hết thời gian runtime
                    if (this.timeRemaining <= 0) {
                        console.warn('[BotManager] Thời gian chạy bot đã hết! Dừng toàn bộ bot.');
                        this.stopZaloBot();
                        this.stopTeleBot();
                        this.emit('time_expired', {
                            message: 'Thời gian chạy bot đã hết! Vui lòng nâng cấp gói Pro để tiếp tục sử dụng 100 giờ.'
                        });
                    }
                }
            }
        }, 1000);
    }

    addTimeToUser(seconds, newPlan = null) {
        this.timeRemaining += seconds;
        if (newPlan) this.plan = newPlan;
        this.emit('user_update', this.getUserStatus());
        return this.getUserStatus();
    }

    // ==================== ZALO BOT LOGIC ====================

    startZaloBot() {
        if (this.timeRemaining <= 0) {
            throw new Error('Thời gian chạy bot đã hết! Vui lòng nâng cấp gói Pro hoặc nạp thẻ để tiếp tục.');
        }
        this.zaloBotRunning = true;
        this.emit('zalo_status', { running: true });
        console.log('[BotManager] Zalo Bot đã kích hoạt chế độ tự động phản hồi.');
        return true;
    }

    stopZaloBot() {
        this.zaloBotRunning = false;
        this.emit('zalo_status', { running: false });
        console.log('[BotManager] Zalo Bot đã tạm dừng.');
        return true;
    }

    /**
     * Xử lý tin nhắn đến từ Zalo
     */
    async handleZaloIncomingMessage(msgData, zaloService) {
        if (!this.zaloBotRunning) return;
        if (this.timeRemaining <= 0) return;

        const text = (msgData.content || msgData.text || '').trim();
        if (!text.startsWith('.')) return; // Chỉ nhận diện lệnh bắt đầu bằng '.'

        const threadId = String(msgData.threadId || msgData.idTo || msgData.uidFrom);
        const isGroup = msgData.isGroup || msgData.type === 'group';
        const senderName = msgData.dName || msgData.fromName || 'Bạn';

        const parts = text.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ').trim();

        console.log(`[BotManager Zalo] Nhận lệnh "${command}" từ thread: ${threadId}`);

        // Lệnh 1: .duyetchat
        if (command === '.duyetchat') {
            this.approvedChats[threadId] = {
                approved: true,
                approvedAt: Date.now(),
                approvedBy: senderName,
                threadId
            };
            this.saveApprovedChats();

            const replyMsg = `✅ [HỆ THỐNG DUYỆT CHAT]\n═══════════════════════\nCuộc trò chuyện này đã được DUYỆT THÀNH CÔNG!\nBây giờ tất cả thành viên có thể gõ .menu để dùng tính năng bot.`;
            await zaloService.sendChatMessage({
                threadId,
                type: isGroup ? 'group' : 'user',
                text: replyMsg
            });
            return;
        }

        // Kiểm tra xem chat này đã duyệt chưa
        const isApproved = !!this.approvedChats[threadId];

        // Lệnh 2: .menu
        if (command === '.menu') {
            if (!isApproved) {
                const rejectMsg = `⛔ [THÔNG BÁO TỪ CHỐI]\n═══════════════════════\nNhóm/Cuộc trò chuyện này CHƯA ĐƯỢC DUYỆT!\nChỉ những chat được duyệt mới hiện menu và sử dụng được bot.\n👉 Hãy gõ .duyetchat để kích hoạt nhóm này.`;
                await zaloService.sendChatMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    text: rejectMsg
                });
                return;
            }

            const menuMsg = `⚡ [HỆ THỐNG ZALO BOT PRO] ⚡\n══════════════════════════\nXin chào ${senderName}!\nDanh sách lệnh đang hoạt động:\n\n🎵 .soundcloud <tên bài hát>\n   ➤ Tự động tìm kiếm & gửi Voice Note bài hát âm thanh cực nét.\n\n🛡️ .duyetchat\n   ➤ Duyệt nhóm hoạt động bot.\n\nℹ️ .info\n   ➤ Xem thông tin gói bot & thời gian hoạt động còn lại.\n\n══════════════════════════\n💎 Gói hiện tại: ${this.plan.toUpperCase()} | Còn lại: ${this.formatDuration(this.timeRemaining)}`;
            await zaloService.sendChatMessage({
                threadId,
                type: isGroup ? 'group' : 'user',
                text: menuMsg
            });
            return;
        }

        // Lệnh 3: .soundcloud <tên bài hát>
        if (command === '.soundcloud') {
            if (!isApproved) {
                await zaloService.sendChatMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    text: `⛔ Chat chưa được duyệt! Vui lòng gõ .duyetchat trước.`
                });
                return;
            }

            if (!args) {
                await zaloService.sendChatMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    text: `⚠️ Vui lòng nhập tên bài hát cần tìm! Ví dụ:\n.soundcloud Nơi Này Có Anh`
                });
                return;
            }

            await zaloService.sendChatMessage({
                threadId,
                type: isGroup ? 'group' : 'user',
                text: `🔍 Đang tìm kiếm và tải nhạc "${args}"... Vui lòng đợi trong giây lát!`
            });

            try {
                const track = await musicService.searchAndDownload(args);
                console.log(`[BotManager Zalo] Đang gửi Voice Note bài: ${track.title}`);

                await zaloService.sendVoiceMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    filePath: track.filePath
                });

                await zaloService.sendChatMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    text: `🎶 Đã phát bài hát: "${track.title}" - ${track.artist}\n🎙️ Dạng Voice Note có sóng âm cực nét!`
                });
            } catch (err) {
                console.error('[BotManager Zalo] Lỗi phát nhạc:', err.message);
                await zaloService.sendChatMessage({
                    threadId,
                    type: isGroup ? 'group' : 'user',
                    text: `❌ Lỗi tải nhạc: ${err.message}`
                });
            }
            return;
        }

        // Lệnh 4: .info
        if (command === '.info') {
            const infoMsg = `ℹ️ [THÔNG TIN HỆ THỐNG BOT]\n══════════════════════════\n👤 Người quản lý: ${this.currentUser || 'Chưa đăng nhập'}\n💎 Gói dịch vụ: ${this.plan === 'pro' ? 'VIP PRO (100 GIỜ)' : 'GÓI FREE (50 PHÚT)'}\n⏳ Thời gian còn lại: ${this.formatDuration(this.timeRemaining)}\n🚀 Trạng thái Bot Zalo: ${this.zaloBotRunning ? '🟢 Đang chạy' : '🔴 Tạm dừng'}\n🤖 Trạng thái Bot Telegram: ${this.teleBotRunning ? '🟢 Đang chạy' : '🔴 Tạm dừng'}\n══════════════════════════`;
            await zaloService.sendChatMessage({
                threadId,
                type: isGroup ? 'group' : 'user',
                text: infoMsg
            });
            return;
        }
    }

    // ==================== TELEGRAM BOT LOGIC ====================

    async startTeleBot({ token, cookies, customScriptPath }) {
        if (this.timeRemaining <= 0) {
            throw new Error('Thời gian chạy bot đã hết! Vui lòng nạp tiền nâng cấp gói Pro để tiếp tục.');
        }

        // Nếu người dùng upload mã bot riêng để chạy
        if (customScriptPath && fs.existsSync(customScriptPath)) {
            this.stopTeleBot();
            console.log(`[BotManager Tele] Đang khởi động script Telegram bot riêng: ${customScriptPath}`);
            this.teleCustomProcess = fork(customScriptPath, [], {
                env: { ...process.env, TELE_TOKEN: token || '', TELE_COOKIES: cookies || '' },
                silent: true
            });

            this.teleCustomProcess.stdout.on('data', (data) => {
                console.log(`[Tele Custom Bot STDOUT]: ${data.toString().trim()}`);
                this.emit('tele_log', { text: data.toString() });
            });

            this.teleCustomProcess.stderr.on('data', (data) => {
                console.error(`[Tele Custom Bot STDERR]: ${data.toString().trim()}`);
                this.emit('tele_log', { text: data.toString(), error: true });
            });

            this.teleCustomProcess.on('exit', (code) => {
                console.log(`[Tele Custom Bot] Thoát với mã: ${code}`);
                this.teleBotRunning = false;
                this.emit('tele_status', { running: false, exitCode: code });
            });

            this.teleBotRunning = true;
            this.teleBotConfig = { type: 'custom', script: customScriptPath };
            this.emit('tele_status', { running: true, type: 'custom' });
            return { success: true, mode: 'custom_script' };
        }

        // Chạy Telegram Bot qua HTTP Bot API Token hoặc Cookies
        if (!token && !cookies) {
            throw new Error('Vui lòng cung cấp Telegram Bot Token hoặc Cookies!');
        }

        const botToken = token ? token.trim() : (cookies.includes('bot') ? cookies.trim() : cookies.trim());
        
        // Xác thực token với Telegram API
        try {
            const res = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 10000 });
            if (!res.data.ok) {
                throw new Error('Bot token Telegram không hợp lệ!');
            }
            const botInfo = res.data.result;
            console.log(`[BotManager Tele] Kết nối thành công bot: @${botInfo.username} (${botInfo.first_name})`);

            this.teleBotRunning = true;
            this.teleBotConfig = { token: botToken, info: botInfo };
            this.teleLastUpdateId = 0;
            this.emit('tele_status', { running: true, botInfo });

            this.pollTelegramUpdates(botToken);
            return { success: true, botInfo };
        } catch (err) {
            throw new Error(`Không thể kết nối Telegram: ${err.response?.data?.description || err.message}`);
        }
    }

    async pollTelegramUpdates(token) {
        if (!this.teleBotRunning) return;
        if (this.timeRemaining <= 0) {
            this.stopTeleBot();
            return;
        }

        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
                params: { offset: this.teleLastUpdateId + 1, timeout: 20 },
                timeout: 30000
            });

            if (res.data.ok && Array.isArray(res.data.result)) {
                for (const update of res.data.result) {
                    this.teleLastUpdateId = update.update_id;
                    if (update.message) {
                        await this.handleTelegramMessage(token, update.message);
                    }
                }
            }
        } catch (e) {
            // Log nhưng không làm sập vòng lặp
            if (e.code !== 'ECONNABORTED') {
                console.warn('[Tele Polling]:', e.message);
            }
        }

        if (this.teleBotRunning) {
            this.telePollingTimeout = setTimeout(() => this.pollTelegramUpdates(token), 1000);
        }
    }

    async handleTelegramMessage(token, message) {
        const chatId = message.chat?.id;
        const text = (message.text || '').trim();
        const fromUser = message.from?.first_name || 'Người dùng';

        if (!chatId || !text) return;

        console.log(`[Tele Bot] Tin nhắn từ @${message.from?.username || chatId}: "${text}"`);

        // Lệnh /start
        if (text === '/start') {
            const reply = `🤖 *CHÀO MỪNG ĐẾN VỚI TELEGRAM BOT PRO*\n━━━━━━━━━━━━━━━━━━━━\nXin chào *${fromUser}*!\n\n💎 *Gói dịch vụ:* ${this.plan.toUpperCase()}\n⏱️ *Thời gian còn lại:* ${this.formatDuration(this.timeRemaining)}\n\n✨ *DANH SÁCH LỆNH:*\n• \`/start\` : Xem trạng thái & thông tin bot\n• \`/music <tên bài>\` : Tải nhạc SoundCloud gửi ngay\n• \`/info\` : Xem chi tiết gói & thời gian sử dụng\n• Hỗ trợ tải file mã bot riêng để chạy 24/7!\n━━━━━━━━━━━━━━━━━━━━\n_Hệ thống Bot Cloud Zalo & Telegram Pro_`;
            await this.sendTelegramMessage(token, chatId, reply);
            return;
        }

        // Lệnh /info
        if (text === '/info') {
            const reply = `ℹ️ *THÔNG TIN TÀI KHOẢN BOT*\n━━━━━━━━━━━━━━━━━━━━\n👤 *Chủ tài khoản:* ${this.currentUser || 'Khách'}\n📦 *Gói cước:* ${this.plan === 'pro' ? 'VIP PRO (100 GIỜ)' : 'GÓI FREE (50 PHÚT)'}\n⏳ *Thời gian còn lại:* ${this.formatDuration(this.timeRemaining)}\n🟢 *Trạng thái:* Hoạt động tốt\n━━━━━━━━━━━━━━━━━━━━`;
            await this.sendTelegramMessage(token, chatId, reply);
            return;
        }

        // Lệnh /music <tên bài>
        if (text.startsWith('/music')) {
            const query = text.replace(/^\/music/i, '').trim();
            if (!query) {
                await this.sendTelegramMessage(token, chatId, '⚠️ Vui lòng nhập tên bài hát! Ví dụ:\n`/music Cắt Đôi Nỗi Sầu`');
                return;
            }

            await this.sendTelegramMessage(token, chatId, `🔍 Đang tìm và tải nhạc *"${query}"*...`);
            try {
                const track = await musicService.searchAndDownload(query);
                await this.sendTelegramMessage(token, chatId, `🎶 Đã tải thành công: *${track.title}* - _${track.artist}_`);
                // Gửi audio file
                const formData = new FormData();
                const fileBlob = fs.createReadStream(track.filePath);
                // Telegram sendAudio
                const FormDataPkg = require('axios');
                const form = new (require('form-data'))();
                form.append('chat_id', chatId);
                form.append('audio', fs.createReadStream(track.filePath));
                form.append('title', track.title);
                form.append('performer', track.artist);

                await axios.post(`https://api.telegram.org/bot${token}/sendAudio`, form, {
                    headers: form.getHeaders(),
                    timeout: 30000
                });
            } catch (err) {
                await this.sendTelegramMessage(token, chatId, `❌ Không thể tải nhạc: ${err.message}`);
            }
            return;
        }
    }

    async sendTelegramMessage(token, chatId, text) {
        try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text,
                parse_mode: 'Markdown'
            }, { timeout: 10000 });
        } catch (e) {
            console.error('[Tele SendMessage Error]:', e.response?.data || e.message);
        }
    }

    stopTeleBot() {
        this.teleBotRunning = false;
        if (this.telePollingTimeout) {
            clearTimeout(this.telePollingTimeout);
            this.telePollingTimeout = null;
        }
        if (this.teleCustomProcess) {
            try {
                this.teleCustomProcess.kill();
            } catch (e) {}
            this.teleCustomProcess = null;
        }
        this.emit('tele_status', { running: false });
        console.log('[BotManager] Telegram Bot đã dừng.');
        return true;
    }
}

module.exports = new BotManager();
