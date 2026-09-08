const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const open = require('open');
const zaloService = require('./src/zaloService');
const campaignEngine = require('./src/campaignEngine');
const chatManager = require('./src/chatManager');
const { exportMembersToFile } = require('./src/utils');
const paymentService = require('./src/paymentService');
const botManager = require('./src/botManager');
const musicService = require('./src/musicService');

const app = express();
const PORT = process.env.PORT || 3000;

// Gắn bộ hook xử lý tin nhắn cho Zalo Bot
zaloService.onMessage(async (msg, data, threadId, isGroup) => {
    try {
        await botManager.handleZaloIncomingMessage({
            ...data,
            threadId,
            isGroup,
            type: isGroup ? 'group' : 'user'
        }, zaloService);
    } catch (e) {
        console.error('[ZaloBot Hook Error]:', e.message);
    }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cấu hình Multer lưu file upload kéo thả
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e6);
        const ext = path.extname(file.originalname);
        const originalNameClean = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
        cb(null, `${originalNameClean}_${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage });

// ==================== AUTH ROUTES ====================

app.get('/api/auth/status', (req, res) => {
    res.json({
        isLoggedIn: zaloService.isLoggedIn(),
        user: zaloService.currentUser || null,
        accounts: zaloService.getSavedAccounts()
    });
});

app.post('/api/auth/login-cookie', async (req, res) => {
    try {
        const { cookie, imei, userAgent } = req.body;
        if (!cookie || !imei) {
            return res.status(400).json({ success: false, error: 'Cookie và IMEI không được để trống!' });
        }
        const user = await zaloService.login({ cookie, imei, userAgent });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/auth/login-qr', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const qrEmitter = zaloService.loginWithQR();

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    qrEmitter.on('qr_code', (data) => sendEvent('qr_code', data));
    qrEmitter.on('qr_scanned', (data) => sendEvent('qr_scanned', data));
    qrEmitter.on('qr_expired', () => sendEvent('qr_expired', { message: 'Mã QR đã hết hạn' }));
    qrEmitter.on('qr_declined', () => sendEvent('qr_declined', { message: 'Đăng nhập bị từ chối' }));
    qrEmitter.on('success', (user) => {
        sendEvent('success', { user });
        res.end();
    });
    qrEmitter.on('error', (error) => {
        sendEvent('error', { error });
        res.end();
    });

    req.on('close', () => {});
});

app.post('/api/auth/accounts/:uid/select', async (req, res) => {
    try {
        const { uid } = req.params;
        const accounts = zaloService.getSavedAccounts();
        const acc = accounts.find(a => a.uid === uid);
        if (!acc) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản!' });

        const user = await zaloService.login({
            cookie: acc.cookie,
            imei: acc.imei,
            userAgent: acc.userAgent
        });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/auth/accounts/:uid', (req, res) => {
    const success = zaloService.removeAccount(req.params.uid);
    res.json({ success });
});

app.post('/api/auth/logout', (req, res) => {
    zaloService.logout();
    res.json({ success: true });
});

// ==================== GROUPS & MEMBERS ROUTES ====================

app.get('/api/groups', async (req, res) => {
    try {
        if (!zaloService.isLoggedIn()) {
            return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
        }
        const groups = await zaloService.getGroupList();
        res.json({ success: true, count: groups.length, groups });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/groups/:id/members', async (req, res) => {
    try {
        if (!zaloService.isLoggedIn()) {
            return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
        }
        const data = await zaloService.getGroupMembers(req.params.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/groups/:id/export', async (req, res) => {
    try {
        const { format = 'csv' } = req.query;
        const data = await zaloService.getGroupMembers(req.params.id);
        const filePath = exportMembersToFile(data.members, data.groupName, format);
        res.download(filePath);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== LIVE CHAT & MESSAGE MANAGER ROUTES ====================

// Lấy danh sách tất cả các cuộc trò chuyện
app.get('/api/chat/conversations', (req, res) => {
    if (!zaloService.isLoggedIn()) {
        return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
    }
    const list = chatManager.getConversations();
    res.json({ success: true, conversations: list });
});

// Lấy tin nhắn của một cuộc trò chuyện
app.get('/api/chat/conversations/:threadId/messages', (req, res) => {
    if (!zaloService.isLoggedIn()) {
        return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
    }
    const messages = chatManager.getConversationMessages(req.params.threadId);
    res.json({ success: true, messages });
});

// Gửi tin nhắn trực tiếp đến Người dùng hoặc Nhóm
app.post('/api/chat/send', async (req, res) => {
    try {
        if (!zaloService.isLoggedIn()) {
            return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
        }

        const { threadId, type = 'user', text, filePath } = req.body;
        const result = await zaloService.sendChatMessage({
            threadId,
            type,
            text,
            filePath
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Gửi tin nhắn dạng Voice (Tin nhắn thoại / Sóng âm) đến Người dùng hoặc Nhóm
app.post('/api/chat/send-voice', async (req, res) => {
    try {
        if (!zaloService.isLoggedIn()) {
            return res.status(401).json({ success: false, error: 'Chưa đăng nhập Zalo' });
        }

        const { threadId, type = 'group', filePath, voiceUrl } = req.body;
        const result = await zaloService.sendVoiceMessage({
            threadId,
            type,
            filePath,
            voiceUrl
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Server-Sent Events (SSE) cho Realtime Live Chat
app.get('/api/chat/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onNewMessage = (payload) => sendEvent('new_message', payload);
    chatManager.on('new_message', onNewMessage);

    req.on('close', () => {
        chatManager.removeListener('new_message', onNewMessage);
    });
});

// ==================== CAMPAIGN & TEMPLATE ROUTES ====================

app.get('/api/template', (req, res) => {
    const msgFilePath = path.join(__dirname, 'message.txt');
    let content = '';
    if (fs.existsSync(msgFilePath)) {
        content = fs.readFileSync(msgFilePath, 'utf-8');
    }
    res.json({ success: true, content });
});

app.post('/api/template', (req, res) => {
    try {
        const { content } = req.body;
        const msgFilePath = path.join(__dirname, 'message.txt');
        fs.writeFileSync(msgFilePath, content || '', 'utf-8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Chưa chọn file upload' });
    }
    res.json({
        success: true,
        file: {
            name: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype,
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`
        }
    });
});

app.post('/api/campaign/start', async (req, res) => {
    try {
        const {
            name,
            targets,
            textTemplate,
            filePath,
            isVoice,
            minDelay,
            maxDelay,
            excludeSelf,
            batchSize,
            batchPauseSeconds
        } = req.body;

        const result = await campaignEngine.start({
            name,
            targets,
            textTemplate,
            filePath,
            isVoice,
            minDelay,
            maxDelay,
            excludeSelf,
            batchSize,
            batchPauseSeconds
        });

        res.json({ success: true, status: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/campaign/pause', (req, res) => {
    const success = campaignEngine.pause();
    res.json({ success, status: campaignEngine.getStatus() });
});

app.post('/api/campaign/resume', (req, res) => {
    const success = campaignEngine.resume();
    res.json({ success, status: campaignEngine.getStatus() });
});

app.post('/api/campaign/stop', (req, res) => {
    const success = campaignEngine.stop();
    res.json({ success, status: campaignEngine.getStatus() });
});

app.get('/api/campaign/status', (req, res) => {
    res.json(campaignEngine.getStatus());
});

app.get('/api/campaign/history', (req, res) => {
    res.json({ success: true, history: campaignEngine.getHistory() });
});

app.get('/api/campaign/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('status', campaignEngine.getStatus());

    const onLog = (logEntry) => sendEvent('log', logEntry);
    const onProgress = (status) => sendEvent('progress', status);
    const onStatusChange = (status) => sendEvent('status_change', status);
    const onComplete = (status) => sendEvent('complete', status);

    campaignEngine.on('log', onLog);
    campaignEngine.on('progress', onProgress);
    campaignEngine.on('status_change', onStatusChange);
    campaignEngine.on('complete', onComplete);

    req.on('close', () => {
        campaignEngine.removeListener('log', onLog);
        campaignEngine.removeListener('progress', onProgress);
        campaignEngine.removeListener('status_change', onStatusChange);
        campaignEngine.removeListener('complete', onComplete);
    });
});

// ==================== BOT SAAS & AUTOMATION ROUTES ====================

// Đồng bộ thông tin người dùng từ Firebase Realtime Database
app.post('/api/bot/sync-user', (req, res) => {
    const { username, plan, balance, timeRemaining } = req.body;
    botManager.setUser({ username, plan, timeRemaining });
    res.json({ success: true, status: botManager.getUserStatus() });
});

// Lấy thông tin trạng thái các Bot & Thời gian sử dụng
app.get('/api/bot/status', (req, res) => {
    res.json({
        success: true,
        status: botManager.getUserStatus(),
        approvedChats: botManager.approvedChats
    });
});

// Bật / Tắt Zalo Bot
app.post('/api/bot/zalo/start', (req, res) => {
    try {
        botManager.startZaloBot();
        res.json({ success: true, status: botManager.getUserStatus() });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/zalo/stop', (req, res) => {
    botManager.stopZaloBot();
    res.json({ success: true, status: botManager.getUserStatus() });
});

// Bật / Tắt Telegram Bot
app.post('/api/bot/tele/start', async (req, res) => {
    try {
        const { token, cookies, customScriptPath } = req.body;
        const result = await botManager.startTeleBot({ token, cookies, customScriptPath });
        res.json({ success: true, result, status: botManager.getUserStatus() });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post('/api/bot/tele/stop', (req, res) => {
    botManager.stopTeleBot();
    res.json({ success: true, status: botManager.getUserStatus() });
});

// Upload mã bot Telegram riêng (.js)
app.post('/api/bot/tele/upload', upload.single('botFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Chưa chọn file script bot (.js)' });
    }
    res.json({
        success: true,
        filePath: req.file.path,
        filename: req.file.filename
    });
});

// Quản lý danh sách chat Zalo được duyệt
app.get('/api/bot/approved-chats', (req, res) => {
    res.json({ success: true, approvedChats: botManager.approvedChats });
});

app.post('/api/bot/approved-chats', (req, res) => {
    const { threadId, name } = req.body;
    if (!threadId) return res.status(400).json({ success: false, error: 'Vui lòng cung cấp threadId' });
    botManager.approvedChats[threadId] = {
        approved: true,
        approvedAt: Date.now(),
        approvedBy: 'Dashboard Admin',
        name: name || `Nhóm ${threadId}`
    };
    botManager.saveApprovedChats();
    res.json({ success: true, approvedChats: botManager.approvedChats });
});

app.delete('/api/bot/approved-chats/:threadId', (req, res) => {
    const { threadId } = req.params;
    delete botManager.approvedChats[threadId];
    botManager.saveApprovedChats();
    res.json({ success: true, approvedChats: botManager.approvedChats });
});

// Realtime SSE cho Bot & Đồng hồ đếm ngược thời gian
app.get('/api/bot/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent('status', botManager.getUserStatus());

    const onTick = (data) => sendEvent('time_tick', data);
    const onExpired = (data) => sendEvent('time_expired', data);
    const onZaloStatus = (data) => sendEvent('zalo_status', data);
    const onTeleStatus = (data) => sendEvent('tele_status', data);
    const onTeleLog = (data) => sendEvent('tele_log', data);
    const onUserUpdate = (data) => sendEvent('user_update', data);

    botManager.on('time_tick', onTick);
    botManager.on('time_expired', onExpired);
    botManager.on('zalo_status', onZaloStatus);
    botManager.on('tele_status', onTeleStatus);
    botManager.on('tele_log', onTeleLog);
    botManager.on('user_update', onUserUpdate);

    req.on('close', () => {
        botManager.removeListener('time_tick', onTick);
        botManager.removeListener('time_expired', onExpired);
        botManager.removeListener('zalo_status', onZaloStatus);
        botManager.removeListener('tele_status', onTeleStatus);
        botManager.removeListener('tele_log', onTeleLog);
        botManager.removeListener('user_update', onUserUpdate);
    });
});

// ==================== PAYMENT & UPGRADE ROUTES ====================

// Gửi thẻ cào lên Doithevip.com Partner API
app.post('/api/payment/charge', async (req, res) => {
    try {
        const { telco, code, serial, amount, username } = req.body;
        const result = await paymentService.chargeCard({ telco, code, serial, amount, username });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Kiểm tra trạng thái thẻ cào
app.post('/api/payment/check', async (req, res) => {
    try {
        const { telco, code, serial, amount, requestId } = req.body;
        const result = await paymentService.checkCardStatus({ telco, code, serial, amount, requestId });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Nâng cấp gói Pro (20,000 VND -> 100 Giờ)
app.post('/api/payment/upgrade-pro', (req, res) => {
    try {
        const { username } = req.body;
        // Cộng 100 giờ (360,000 giây)
        const newStatus = botManager.addTimeToUser(360000, 'pro');
        res.json({
            success: true,
            message: 'Chúc mừng! Đã kích hoạt thành công Gói Pro (100 tiếng chạy bot 24/7)!',
            status: newStatus
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Core Dynamic Encrypted Loader (Ẩn source app.js khỏi F12)
app.get('/api/sys/core.js', (req, res) => {
    const coreFilePath = path.join(__dirname, 'public', 'js', 'core_bundle.js');
    if (!fs.existsSync(coreFilePath)) {
        return res.status(404).send('// Core not compiled');
    }
    const content = fs.readFileSync(coreFilePath, 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(content);
});

function startServer(autoOpen = true) {
    app.listen(PORT, async () => {
        const url = `http://localhost:${PORT}`;
        console.log(`\n✨ ===================================================`);
        console.log(`🚀 ZALO MARKETING PRO DASHBOARD ĐANG CHẠY TẠI:`);
        console.log(`🌐 ${url}`);
        console.log(`✨ ===================================================\n`);

        // Tự động khôi phục session đăng nhập
        await zaloService.autoLogin();

        if (autoOpen) {
            try {
                await open(url);
            } catch (e) {}
        }
    });
}

if (require.main === module) {
    startServer(true);
}

module.exports = { app, startServer };
