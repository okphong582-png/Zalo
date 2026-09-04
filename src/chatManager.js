const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const CHAT_STORE_FILE = path.join(process.cwd(), 'chat_store.json');

class ChatManager extends EventEmitter {
    constructor() {
        super();
        this.conversations = new Map(); // threadId -> { threadId, type, name, avatar, lastMessage, updatedAt, unreadCount, messages: [] }
        this.initStore();
    }

    initStore() {
        try {
            if (fs.existsSync(CHAT_STORE_FILE)) {
                const data = JSON.parse(fs.readFileSync(CHAT_STORE_FILE, 'utf-8'));
                if (Array.isArray(data)) {
                    data.forEach(c => {
                        this.conversations.set(String(c.threadId), c);
                    });
                }
            }
        } catch (e) {
            console.error('Lỗi khi nạp chat store:', e.message);
        }
    }

    saveStore() {
        try {
            const list = Array.from(this.conversations.values());
            // Giới hạn lưu 50 cuộc trò chuyện gần nhất, mỗi cuộc tối đa 100 tin nhắn
            const cleanList = list.map(c => ({
                ...c,
                messages: (c.messages || []).slice(-100)
            })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 50);

            fs.writeFileSync(CHAT_STORE_FILE, JSON.stringify(cleanList, null, 2), 'utf-8');
        } catch (e) {
            console.error('Lỗi lưu chat store:', e.message);
        }
    }

    /**
     * Lấy danh sách tất cả các cuộc trò chuyện
     */
    getConversations() {
        const list = Array.from(this.conversations.values());
        return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    /**
     * Lấy chi tiết tin nhắn của một cuộc trò chuyện
     */
    getConversationMessages(threadId) {
        const c = this.conversations.get(String(threadId));
        if (c) {
            c.unreadCount = 0; // Đánh dấu đã đọc
            this.saveStore();
            return c.messages || [];
        }
        return [];
    }

    /**
     * Thêm tin nhắn mới vào cuộc trò chuyện
     */
    addMessage({
        threadId,
        type = 'user', // 'user' | 'group'
        name = '',
        avatar = '',
        fromId,
        fromName = '',
        isOutgoing = false,
        text = '',
        attachments = [],
        msgId = null
    }) {
        if (!threadId) return null;
        const idStr = String(threadId);

        let conv = this.conversations.get(idStr);
        if (!conv) {
            conv = {
                threadId: idStr,
                type,
                name: name || (type === 'group' ? `Nhóm ${idStr}` : `Người dùng ${idStr}`),
                avatar: avatar || '',
                lastMessage: '',
                updatedAt: new Date().toISOString(),
                unreadCount: 0,
                messages: []
            };
            this.conversations.set(idStr, conv);
        }

        if (name && name !== conv.name) conv.name = name;
        if (avatar && avatar !== conv.avatar) conv.avatar = avatar;

        const messageEntry = {
            id: msgId || 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            fromId: String(fromId || ''),
            fromName: fromName || (isOutgoing ? 'Bạn' : conv.name),
            isOutgoing,
            text: text || '',
            attachments: attachments || [],
            timestamp: new Date().toISOString(),
            timeFormatted: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        };

        if (!Array.isArray(conv.messages)) conv.messages = [];
        conv.messages.push(messageEntry);
        if (conv.messages.length > 200) conv.messages.shift();

        conv.lastMessage = text || (attachments.length > 0 ? '[Đính kèm file/ảnh]' : 'Tin nhắn mới');
        conv.updatedAt = messageEntry.timestamp;
        if (!isOutgoing) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
        }

        this.saveStore();

        this.emit('new_message', {
            threadId: idStr,
            conversation: {
                threadId: conv.threadId,
                type: conv.type,
                name: conv.name,
                avatar: conv.avatar,
                lastMessage: conv.lastMessage,
                updatedAt: conv.updatedAt,
                unreadCount: conv.unreadCount
            },
            message: messageEntry
        });

        return messageEntry;
    }
}

module.exports = new ChatManager();
