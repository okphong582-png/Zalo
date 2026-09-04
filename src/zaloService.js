const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');
const { Zalo, LoginQRCallbackEventType, ThreadType } = require('zca-js');
const { normalizeCookies } = require('./utils');
const EventEmitter = require('events');
const chatManager = require('./chatManager');

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
const DEFAULT_SESSION_FILE = path.join(process.cwd(), 'session.json');
const ACCOUNTS_FILE = path.join(process.cwd(), 'accounts.json');
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

class ZaloService extends EventEmitter {
    constructor() {
        super();
        this.api = null;
        this.zalo = null;
        this.currentUser = null;
        this.listenerStarted = false;
        this.initStorage();
        this.session = this.loadSession();
    }

    initStorage() {
        if (!fs.existsSync(SESSIONS_DIR)) {
            fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        }
        if (!fs.existsSync(ACCOUNTS_FILE)) {
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2), 'utf-8');
        }
    }

    async autoLogin() {
        if (this.session && this.session.cookie && this.session.imei) {
            try {
                await this.login({
                    cookie: this.session.cookie,
                    imei: this.session.imei,
                    userAgent: this.session.userAgent
                });
                console.log(`[Auto-Login] Đã tự động kết nối tài khoản: ${this.currentUser?.name} (${this.currentUser?.uid})`);
                return true;
            } catch (e) {
                console.log(`[Auto-Login] Phiên cũ hết hạn hoặc cần đăng nhập lại: ${e.message}`);
                return false;
            }
        }
        return false;
    }

    getSavedAccounts() {
        try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
                return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
            }
        } catch (e) {}
        return [];
    }

    saveAccountToStorage(accountData) {
        try {
            const accounts = this.getSavedAccounts();
            const existingIdx = accounts.findIndex(a => a.uid === accountData.uid);
            if (existingIdx >= 0) {
                accounts[existingIdx] = { ...accounts[existingIdx], ...accountData, updatedAt: new Date().toISOString() };
            } else {
                accounts.push({ ...accountData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            }
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');

            const sessionPath = path.join(SESSIONS_DIR, `session_${accountData.uid}.json`);
            fs.writeFileSync(sessionPath, JSON.stringify(accountData, null, 2), 'utf-8');
        } catch (e) {
            console.error('Lỗi khi lưu account:', e.message);
        }
    }

    removeAccount(uid) {
        try {
            let accounts = this.getSavedAccounts();
            accounts = accounts.filter(a => a.uid !== uid);
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');

            const sessionPath = path.join(SESSIONS_DIR, `session_${uid}.json`);
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
            if (this.currentUser && this.currentUser.uid === uid) {
                this.api = null;
                this.currentUser = null;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    loadSession() {
        try {
            if (fs.existsSync(DEFAULT_SESSION_FILE)) {
                const data = fs.readFileSync(DEFAULT_SESSION_FILE, 'utf-8');
                return JSON.parse(data);
            }
        } catch (e) {}
        return null;
    }

    saveSession(cookie, imei, userAgent = DEFAULT_USER_AGENT, profile = null) {
        try {
            const sessionData = {
                cookie,
                imei,
                userAgent: userAgent || DEFAULT_USER_AGENT,
                uid: profile ? (profile.userId || profile.uid) : (this.currentUser?.uid || 'unknown'),
                name: profile ? (profile.displayName || profile.name) : (this.currentUser?.name || 'Zalo User'),
                avatar: profile ? profile.avatar : (this.currentUser?.avatar || ''),
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(DEFAULT_SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf-8');
            this.session = sessionData;

            if (profile && profile.userId) {
                this.saveAccountToStorage({
                    uid: profile.userId,
                    name: profile.displayName || profile.zaloName || 'Zalo User',
                    avatar: profile.avatar || '',
                    phoneNumber: profile.phoneNumber || '',
                    cookie,
                    imei,
                    userAgent: sessionData.userAgent
                });
            }

            return true;
        } catch (e) {
            console.error('Lỗi khi lưu session:', e.message);
            return false;
        }
    }

    createZaloInstance() {
        const imageMetadataGetter = (filePath) => {
            try {
                const dimensions = sizeOf(filePath);
                const stats = fs.statSync(filePath);
                return {
                    width: dimensions.width || 800,
                    height: dimensions.height || 600,
                    size: stats.size
                };
            } catch (err) {
                const stats = fs.statSync(filePath);
                return {
                    width: 800,
                    height: 600,
                    size: stats.size
                };
            }
        };

        return new Zalo({
            imageMetadataGetter,
            logging: false
        });
    }

    /**
     * Bắt đầu Listener lắng nghe tin nhắn Realtime
     */
    startRealtimeListener() {
        if (!this.api || this.listenerStarted) return;
        try {
            if (this.api.listener) {
                this.api.listener.on('message', (msg) => {
                    if (!msg || !msg.data) return;
                    const data = msg.data;
                    const isGroup = msg.type === ThreadType.Group;
                    const threadId = String(isGroup ? data.idTo || msg.threadId : (data.uidFrom === this.currentUser?.uid ? data.idTo : data.uidFrom));
                    const isOutgoing = String(data.uidFrom) === String(this.currentUser?.uid);

                    chatManager.addMessage({
                        threadId,
                        type: isGroup ? 'group' : 'user',
                        name: data.dName || (isGroup ? `Nhóm ${threadId}` : `User_${threadId}`),
                        avatar: data.avatar || '',
                        fromId: data.uidFrom,
                        fromName: data.dName || `User_${data.uidFrom}`,
                        isOutgoing,
                        text: data.content || '',
                        msgId: data.msgId
                    });
                });

                this.api.listener.start();
                this.listenerStarted = true;
            }
        } catch (e) {
            console.error('Lỗi khởi động Realtime Listener:', e.message);
        }
    }

    async login({ cookie, imei, userAgent }) {
        const cookies = normalizeCookies(cookie);
        if (!cookies || cookies.length === 0) {
            throw new Error('Cookie không hợp lệ hoặc rỗng. Vui lòng kiểm tra lại.');
        }
        if (!imei || typeof imei !== 'string' || imei.trim() === '') {
            throw new Error('IMEI không được để trống.');
        }

        const finalUserAgent = userAgent || (this.session && this.session.userAgent) || DEFAULT_USER_AGENT;
        this.zalo = this.createZaloInstance();

        this.api = await this.zalo.login({
            cookie: cookies,
            imei: imei.trim(),
            userAgent: finalUserAgent,
            language: 'vi'
        });

        try {
            const accInfo = await this.api.fetchAccountInfo();
            const profile = (accInfo && accInfo.profile) ? accInfo.profile : accInfo;
            this.currentUser = {
                uid: profile.userId || profile.uid || 'unknown',
                userId: profile.userId || profile.uid || 'unknown',
                name: profile.displayName || profile.zaloName || profile.name || 'Zalo User',
                displayName: profile.displayName || profile.zaloName || profile.name || 'Zalo User',
                avatar: profile.avatar || '',
                phoneNumber: profile.phoneNumber || '',
                raw: profile
            };
            this.saveSession(cookies, imei.trim(), finalUserAgent, profile);
        } catch (e) {
            try {
                const ownId = await this.api.getOwnId();
                this.currentUser = {
                    uid: ownId,
                    userId: ownId,
                    name: `Zalo User (${ownId})`,
                    displayName: `Zalo User (${ownId})`,
                    avatar: '',
                    phoneNumber: ''
                };
                this.saveSession(cookies, imei.trim(), finalUserAgent, { userId: ownId, displayName: `Zalo User (${ownId})` });
            } catch (err2) {
                this.currentUser = { uid: 'unknown', userId: 'unknown', name: 'Zalo User', displayName: 'Zalo User', avatar: '', phoneNumber: '' };
            }
        }

        this.startRealtimeListener();
        this.emit('login_success', this.currentUser);
        return this.currentUser;
    }

    loginWithQR(userAgent = DEFAULT_USER_AGENT) {
        const qrEmitter = new EventEmitter();
        this.zalo = this.createZaloInstance();

        (async () => {
            try {
                const api = await this.zalo.loginQR(
                    { userAgent, language: 'vi' },
                    (event) => {
                        switch (event.type) {
                            case LoginQRCallbackEventType.QRCodeGenerated: {
                                const rawImage = event.data.image || '';
                                const formattedImage = rawImage.startsWith('data:image')
                                    ? rawImage
                                    : `data:image/png;base64,${rawImage}`;
                                qrEmitter.emit('qr_code', {
                                    image: formattedImage,
                                    code: event.data.code,
                                    token: event.data.token
                                });
                                break;
                            }
                            case LoginQRCallbackEventType.QRCodeScanned:
                                qrEmitter.emit('qr_scanned', {
                                    avatar: event.data.avatar,
                                    displayName: event.data.display_name
                                });
                                break;
                            case LoginQRCallbackEventType.QRCodeExpired:
                                qrEmitter.emit('qr_expired');
                                break;
                            case LoginQRCallbackEventType.QRCodeDeclined:
                                qrEmitter.emit('qr_declined');
                                break;
                            case LoginQRCallbackEventType.GotLoginInfo:
                                qrEmitter.emit('got_login_info', event.data);
                                break;
                        }
                    }
                );

                this.api = api;
                try {
                    const accInfo = await this.api.fetchAccountInfo();
                    const profile = (accInfo && accInfo.profile) ? accInfo.profile : accInfo;
                    this.currentUser = {
                        uid: profile.userId || profile.uid || 'unknown',
                        userId: profile.userId || profile.uid || 'unknown',
                        name: profile.displayName || profile.zaloName || profile.name || 'Zalo User',
                        displayName: profile.displayName || profile.zaloName || profile.name || 'Zalo User',
                        avatar: profile.avatar || '',
                        phoneNumber: profile.phoneNumber || ''
                    };
                } catch (e) {
                    const ownId = await this.api.getOwnId().catch(() => 'unknown');
                    this.currentUser = { uid: ownId, userId: ownId, name: `Zalo User (${ownId})`, displayName: `Zalo User (${ownId})`, avatar: '', phoneNumber: '' };
                }

                this.startRealtimeListener();
                qrEmitter.emit('success', this.currentUser);
                this.emit('login_success', this.currentUser);
            } catch (err) {
                qrEmitter.emit('error', err.message);
            }
        })();

        return qrEmitter;
    }

    logout() {
        this.api = null;
        this.currentUser = null;
        this.listenerStarted = false;
        if (fs.existsSync(DEFAULT_SESSION_FILE)) {
            try { fs.unlinkSync(DEFAULT_SESSION_FILE); } catch (e) {}
        }
        this.session = null;
        this.emit('logout');
    }

    isLoggedIn() {
        return this.api !== null && this.currentUser !== null;
    }

    /**
     * Tạo URL avatar mặc định đẹp mắt dựa trên tên
     */
    generateFallbackAvatar(name, background = '00f0ff', color = '000') {
        const cleanName = encodeURIComponent(name || 'Zalo');
        return `https://ui-avatars.com/api/?name=${cleanName}&background=${background}&color=${color}&bold=true&rounded=true`;
    }

    /**
     * Lấy danh sách toàn bộ nhóm với Fallback Avatar người tạo nhóm thông minh
     */
    async getGroupList() {
        if (!this.api) throw new Error('Chưa đăng nhập Zalo.');

        const allGroups = await this.api.getAllGroups();
        const groupIds = Object.keys(allGroups.gridVerMap || {});

        if (groupIds.length === 0) {
            return [];
        }

        const groupsInfoRes = await this.api.getGroupInfo(groupIds);
        const gridInfoMap = groupsInfoRes.gridInfoMap || {};

        // Thu thập danh sách creator IDs cần lấy avatar fallback nếu nhóm chưa có logo
        const creatorIdsToFetch = new Set();
        for (const groupId of groupIds) {
            const g = gridInfoMap[groupId];
            if (g && (!g.avt || g.avt.trim() === '')) {
                if (g.creatorId) {
                    const cUid = String(g.creatorId).split('_')[0].trim();
                    if (cUid && /^\d+$/.test(cUid)) creatorIdsToFetch.add(cUid);
                }
            }
        }

        // Lấy profile của người tạo nhóm nếu có
        const creatorProfiles = new Map();
        if (creatorIdsToFetch.size > 0) {
            try {
                const resProfiles = await this.api.getGroupMembersInfo(Array.from(creatorIdsToFetch));
                if (resProfiles && resProfiles.profiles) {
                    for (const [id, prof] of Object.entries(resProfiles.profiles)) {
                        const cleanId = String(id).split('_')[0];
                        if (prof && prof.avatar) {
                            creatorProfiles.set(cleanId, prof.avatar);
                        }
                    }
                }
            } catch (e) {}
        }

        const list = [];
        for (const groupId of groupIds) {
            const g = gridInfoMap[groupId];
            if (g) {
                const isLocked = g.setting && g.setting.lockViewMember === 1;
                const membersCount = g.totalMember || (g.memVerList ? g.memVerList.length : 0);
                const gName = g.name || 'Nhóm không tên';
                const cUid = g.creatorId ? String(g.creatorId).split('_')[0].trim() : '';

                // Xử lý Logo Avatar Fallback:
                // 1. Logo chính của nhóm
                // 2. Avatar của người tạo nhóm (Creator Avatar)
                // 3. Avatar tự động tạo theo tên nhóm
                let finalAvatar = g.avt || g.fullAvt || '';
                if (!finalAvatar || finalAvatar.trim() === '') {
                    if (cUid && creatorProfiles.has(cUid)) {
                        finalAvatar = creatorProfiles.get(cUid);
                    } else {
                        finalAvatar = this.generateFallbackAvatar(gName);
                    }
                }

                list.push({
                    id: groupId,
                    name: gName,
                    totalMember: membersCount,
                    avatar: finalAvatar,
                    creatorId: cUid,
                    desc: g.desc || '',
                    type: g.type,
                    isLockedView: isLocked,
                    createdTime: g.createdTime ? new Date(g.createdTime).toISOString() : null,
                    raw: g
                });
            } else {
                list.push({
                    id: groupId,
                    name: `Nhóm ${groupId}`,
                    totalMember: 0,
                    avatar: this.generateFallbackAvatar(`Nhóm ${groupId}`),
                    creatorId: '',
                    desc: '',
                    isLockedView: false,
                    raw: null
                });
            }
        }

        list.sort((a, b) => (b.totalMember || 0) - (a.totalMember || 0));
        return list;
    }

    async getGroupMembers(groupId) {
        if (!this.api) throw new Error('Chưa đăng nhập Zalo.');

        const groupInfoRes = await this.api.getGroupInfo(groupId);
        const group = (groupInfoRes.gridInfoMap && groupInfoRes.gridInfoMap[groupId]) || null;

        if (!group) {
            throw new Error(`Không tìm thấy thông tin nhóm ID: ${groupId}`);
        }

        const rawIds = new Set();

        if (Array.isArray(group.memVerList)) {
            group.memVerList.forEach(item => {
                const uid = String(item).split('_')[0].trim();
                if (uid && /^\d+$/.test(uid)) rawIds.add(uid);
            });
        }

        if (Array.isArray(group.memberIds)) {
            group.memberIds.forEach(item => {
                const uid = String(item).split('_')[0].trim();
                if (uid && /^\d+$/.test(uid)) rawIds.add(uid);
            });
        }

        if (Array.isArray(group.adminIds)) {
            group.adminIds.forEach(item => {
                const uid = String(item).split('_')[0].trim();
                if (uid && /^\d+$/.test(uid)) rawIds.add(uid);
            });
        }

        if (group.creatorId) {
            const uid = String(group.creatorId).split('_')[0].trim();
            if (uid && /^\d+$/.test(uid)) rawIds.add(uid);
        }

        const currentMems = group.currentMems || [];
        const memberMap = new Map();

        for (const mem of currentMems) {
            if (mem.id) {
                const uid = String(mem.id);
                rawIds.add(uid);
                const dName = mem.dName || mem.zaloName || `User_${uid}`;
                memberMap.set(uid, {
                    id: uid,
                    displayName: dName,
                    zaloName: mem.zaloName || dName,
                    avatar: mem.avatar || mem.avatar_25 || this.generateFallbackAvatar(dName),
                    accountStatus: mem.accountStatus || 0
                });
            }
        }

        const allMemberIds = Array.from(rawIds);
        const missingIds = allMemberIds.filter(id => !memberMap.has(id));

        if (missingIds.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < missingIds.length; i += batchSize) {
                const batch = missingIds.slice(i, i + batchSize);
                try {
                    const profilesRes = await this.api.getGroupMembersInfo(batch);
                    if (profilesRes && profilesRes.profiles) {
                        for (const [id, prof] of Object.entries(profilesRes.profiles)) {
                            const cleanId = String(id).split('_')[0];
                            const dName = prof.displayName || prof.zaloName || `User_${cleanId}`;
                            memberMap.set(cleanId, {
                                id: cleanId,
                                displayName: dName,
                                zaloName: prof.zaloName || dName,
                                avatar: prof.avatar || this.generateFallbackAvatar(dName),
                                accountStatus: prof.accountStatus || 0
                            });
                        }
                    }
                } catch (err) {
                    for (const id of batch) {
                        if (!memberMap.has(id)) {
                            memberMap.set(id, {
                                id: id,
                                displayName: `User_${id}`,
                                zaloName: `User_${id}`,
                                avatar: this.generateFallbackAvatar(`User_${id}`),
                                accountStatus: 0
                            });
                        }
                    }
                }
            }
        }

        const result = [];
        for (const id of allMemberIds) {
            if (memberMap.has(id)) {
                result.push(memberMap.get(id));
            } else {
                result.push({
                    id: id,
                    displayName: `User_${id}`,
                    zaloName: `User_${id}`,
                    avatar: this.generateFallbackAvatar(`User_${id}`),
                    accountStatus: 0
                });
            }
        }

        return {
            groupId: group.groupId || groupId,
            groupName: group.name || 'Nhóm',
            totalMember: group.totalMember || result.length,
            avatar: group.avt || group.fullAvt || this.generateFallbackAvatar(group.name || 'Nhóm'),
            isLockedView: group.setting && group.setting.lockViewMember === 1,
            members: result
        };
    }

    /**
     * Gửi tin nhắn đến Người dùng hoặc Nhóm (Kèm cập nhật vào Chat Manager)
     */
    async sendChatMessage({ threadId, type = 'user', text, filePath }) {
        if (!this.api) throw new Error('Chưa đăng nhập Zalo.');
        if (!threadId) throw new Error('Thread ID không được để trống.');

        const isGroup = type === 'group';
        const threadType = isGroup ? ThreadType.Group : ThreadType.User;
        const hasFile = filePath && fs.existsSync(filePath);
        const hasText = text && text.trim().length > 0;

        if (!hasFile && !hasText) {
            throw new Error('Cần nhập nội dung tin nhắn hoặc chọn file đính kèm.');
        }

        let resultData = null;

        if (hasFile) {
            const ext = path.extname(filePath).toLowerCase().replace('.', '');
            const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

            resultData = await this.api.sendMessage(
                {
                    msg: hasText ? text : '',
                    attachments: [filePath]
                },
                String(threadId),
                threadType
            );

            if (!isImage && hasText) {
                try {
                    await this.api.sendMessage({ msg: text }, String(threadId), threadType);
                } catch (e) {}
            }
        } else if (hasText) {
            resultData = await this.api.sendMessage({ msg: text }, String(threadId), threadType);
        }

        // Lưu vào Chat Manager
        chatManager.addMessage({
            threadId: String(threadId),
            type: isGroup ? 'group' : 'user',
            fromId: this.currentUser?.uid,
            fromName: this.currentUser?.name || 'Bạn',
            isOutgoing: true,
            text: text || '',
            attachments: hasFile ? [{ path: filePath, name: path.basename(filePath) }] : []
        });

        return { success: true, data: resultData };
    }

    async sendMessageToUser({ targetId, text, filePath }) {
        return this.sendChatMessage({ threadId: targetId, type: 'user', text, filePath });
    }

    /**
     * Tự động upload file âm thanh lên máy chủ CDN tốc độ cao để lấy Direct Voice URL
     */
    async uploadAudioToVoiceUrl(filePath) {
        if (!filePath) throw new Error('Đường dẫn file âm thanh không hợp lệ.');
        if (typeof filePath === 'string' && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
            return filePath;
        }
        if (!fs.existsSync(filePath)) {
            throw new Error(`Không tìm thấy file âm thanh tại: ${filePath}`);
        }

        const FormData = require('form-data');
        const axios = require('axios');

        // 1. Thử upload lên Catbox để lấy direct .mp3 / .m4a link
        try {
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', fs.createReadStream(filePath));
            const res = await axios.post('https://catbox.moe/user/api.php', formData, {
                headers: formData.getHeaders(),
                timeout: 15000
            });
            if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
                return res.data.trim();
            }
        } catch (e) {
            console.warn('[Voice Upload] Catbox upload error, thử tmpfiles...', e.message);
        }

        // 2. Thử upload lên tmpfiles
        try {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            const res = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
                headers: formData.getHeaders(),
                timeout: 15000
            });
            if (res.data && res.data.data && res.data.data.url) {
                return res.data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            }
        } catch (e) {
            console.warn('[Voice Upload] tmpfiles upload error, fallback local URL...', e.message);
        }

        // 3. Fallback: Dùng local server URL
        const filename = path.basename(filePath);
        return `http://localhost:3000/uploads/${filename}`;
    }

    /**
     * Gửi tin nhắn dạng Voice (Tin nhắn thoại / Sóng âm) vào Nhóm hoặc Người dùng
     */
    async sendVoiceMessage({ threadId, type = 'group', filePath, voiceUrl, ttl = 0 }) {
        if (!this.api) throw new Error('Chưa đăng nhập Zalo.');
        if (!threadId) throw new Error('Thread ID không được để trống.');

        const isGroup = type === 'group';
        const threadType = isGroup ? ThreadType.Group : ThreadType.User;

        let finalVoiceUrl = voiceUrl;
        if (!finalVoiceUrl && filePath) {
            finalVoiceUrl = await this.uploadAudioToVoiceUrl(filePath);
        }

        if (!finalVoiceUrl) {
            throw new Error('Cần cung cấp file âm thanh hoặc đường dẫn Voice URL hợp lệ.');
        }

        const result = await this.api.sendVoice(
            { voiceUrl: finalVoiceUrl, ttl: ttl || 0 },
            String(threadId),
            threadType
        );

        // Lưu vào Chat Manager
        chatManager.addMessage({
            threadId: String(threadId),
            type: isGroup ? 'group' : 'user',
            fromId: this.currentUser?.uid,
            fromName: this.currentUser?.name || 'Bạn',
            isOutgoing: true,
            text: '🎤 [Tin nhắn thoại - Voice Note]',
            attachments: [{
                type: 'voice',
                path: filePath || finalVoiceUrl,
                url: finalVoiceUrl,
                name: path.basename(filePath || 'voice.m4a')
            }]
        });

        return {
            success: true,
            voiceUrl: finalVoiceUrl,
            data: result
        };
    }
}

module.exports = new ZaloService();

