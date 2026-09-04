/**
 * ZALO MARKETING PRO - CLIENT LOGIC & REALTIME SUITE (VOICE NOTE & GITHUB PAGES DYNAMIC BASE)
 */

// Global Application State
const state = {
    user: null,
    isLoggedIn: false,
    groups: [],
    selectedGroup: null,
    selectedGroupMembers: [],
    checkedMemberIds: new Set(),
    attachedFile: null,
    campaignStatus: 'idle',
    eventSource: null,
    chatEventSource: null,
    // Live Chat State
    conversations: [],
    activeChat: null,
    activeChatMessages: [],
    chatFilter: 'all',
    chatAttachedFile: null,
    chatVoiceFile: null,
    // Voice & MediaRecorder state
    mediaRecorder: null,
    audioChunks: [],
    recTimerInterval: null,
    recSeconds: 0,
    // Modal Voice State
    modalVoiceFile: null,
    modalMediaRecorder: null,
    modalAudioChunks: [],
    modalRecTimerInterval: null,
    modalRecSeconds: 0
};

// Global Audio Player Helper
let currentPlayingAudio = null;
let currentPlayingBtn = null;

// API Base URL (Dành cho GitHub Pages hoặc Multi-domain)
function getApiBase() {
    let custom = localStorage.getItem('zalo_server_url');
    if (custom) {
        return custom.trim().replace(/\/+$/, '');
    }
    return '';
}

function openServerModal() {
    const input = document.getElementById('serverBaseUrlInput');
    if (input) input.value = localStorage.getItem('zalo_server_url') || '';
    document.getElementById('serverConfigModalOverlay')?.classList.add('active');
}

function closeServerModal() {
    document.getElementById('serverConfigModalOverlay')?.classList.remove('active');
}

function initServerConfigModal() {
    document.getElementById('btnSaveServerConfig')?.addEventListener('click', () => {
        const url = (document.getElementById('serverBaseUrlInput')?.value || '').trim();
        if (url) {
            localStorage.setItem('zalo_server_url', url);
            showToast(`Đã lưu Backend Server: ${url}`, 'success');
        } else {
            localStorage.removeItem('zalo_server_url');
            showToast('Đã chuyển về kết nối mặc định.', 'info');
        }
        closeServerModal();
        checkAuthStatus();
        initEventStream();
        initChatStream();
    });

    document.getElementById('btnTestServerPing')?.addEventListener('click', async () => {
        const url = (document.getElementById('serverBaseUrlInput')?.value || '').trim().replace(/\/+$/, '');
        const pingText = document.getElementById('serverPingText');
        pingText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';

        try {
            const target = (url || getApiBase()) + '/api/auth/status';
            const res = await fetch(target, { method: 'GET' });
            if (res.ok) {
                const data = await res.json();
                pingText.innerHTML = `<span class="text-green"><i class="fa-solid fa-circle-check"></i> Kết nối thành công! (${data.isLoggedIn ? 'Đã đăng nhập' : 'Chưa đăng nhập'})</span>`;
            } else {
                pingText.innerHTML = `<span class="text-red"><i class="fa-solid fa-triangle-exclamation"></i> Server trả về mã lỗi: ${res.status}</span>`;
            }
        } catch (e) {
            pingText.innerHTML = `<span class="text-red"><i class="fa-solid fa-circle-xmark"></i> Không thể kết nối: ${e.message}</span>`;
        }
    });
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    initServerConfigModal();
    initAuthHandlers();
    initGroupHub();
    initCampaignStudio();
    initCampaignMonitor();
    initLiveChat();
    initVoiceSystem();
    initHistoryTab();
    initEventStream();
    initChatStream();
    checkAuthStatus();
});

// Live Clock
function initClock() {
    const clockEl = document.getElementById('liveClock');
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('vi-VN', { hour12: false });
    }, 1000);
}

// Navigation Tabs
function initNavigation() {
    const navItems = document.querySelectorAll('.sidebar-menu .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Mobile Bottom Nav Buttons
    const mobileNavItems = document.querySelectorAll('.mobile-nav-btn');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Mobile Back to Conversations list in chat
    document.getElementById('btnBackToConvsMobile')?.addEventListener('click', () => {
        document.querySelector('.chat-sidebar-panel')?.classList.remove('mobile-hidden');
        document.querySelector('.chat-room-panel')?.classList.add('mobile-hidden');
    });

    const innerTabs = document.querySelectorAll('.inner-tab-btn');
    innerTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            innerTabs.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.inner-tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target)?.classList.add('active');
        });
    });

    document.getElementById('btnRefreshData')?.addEventListener('click', () => {
        showToast('Đang tải lại dữ liệu...', 'info');
        checkAuthStatus();
        if (state.isLoggedIn) {
            loadGroups();
            loadConversations();
        }
    });

    document.getElementById('btnQuickLaunchAds')?.addEventListener('click', () => {
        switchTab('campaign');
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.sidebar-menu .nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.mobile-nav-btn').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.content-body .tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    const titles = {
        dashboard: { title: 'Tổng Quan Hệ Thống', sub: 'Quản lý và tự động hóa chiến dịch Zalo Marketing' },
        chat: { title: 'Hộp Thư & Nhắn Tin Trực Tiếp', sub: 'Nhắn tin 1-1, gửi voice thoại và gửi tin vào nhóm Zalo thời gian thực' },
        groups: { title: 'Quản Lý Nhóm & Quét Thành Viên', sub: 'Xem nhóm Zalo, gửi voice vào nhóm, xuất file Excel/CSV/JSON' },
        campaign: { title: 'Studio Gửi Tin Nhắn Ads & Voice', sub: 'Soạn tin nhắn, gửi Voice Note hàng loạt, spin text và gửi thật' },
        auth: { title: 'Trung Tâm Đăng Nhập & Đa Tài Khoản', sub: 'Đăng nhập QR Code thời gian thực hoặc Cookie/IMEI' },
        history: { title: 'Lịch Sử Chiến Dịch', sub: 'Xem báo cáo chi tiết các đợt gửi tin trước đó' }
    };
    if (titles[tabId]) {
        document.getElementById('pageTitle').textContent = titles[tabId].title;
        document.getElementById('pageSubtitle').textContent = titles[tabId].sub;
    }

    if (tabId === 'chat' && state.isLoggedIn) {
        loadConversations();
    }
    if (tabId === 'groups' && state.isLoggedIn && state.groups.length === 0) {
        loadGroups();
    }
    if (tabId === 'history') {
        loadHistory();
    }
}

// Fallback avatar helper
function getFallbackAvatar(name) {
    const clean = encodeURIComponent(name || 'Zalo');
    return `https://ui-avatars.com/api/?name=${clean}&background=00f0ff&color=000&bold=true&rounded=true`;
}

// ==================== SSE EVENT STREAMS ====================
function initEventStream() {
    if (state.eventSource) {
        state.eventSource.close();
    }

    const es = new EventSource(`${getApiBase()}/api/campaign/events`);
    state.eventSource = es;

    es.addEventListener('status', (e) => updateCampaignStatusUI(JSON.parse(e.data)));
    es.addEventListener('status_change', (e) => updateCampaignStatusUI(JSON.parse(e.data)));
    es.addEventListener('progress', (e) => updateCampaignStatusUI(JSON.parse(e.data)));
    es.addEventListener('log', (e) => appendTerminalLog(JSON.parse(e.data)));
    es.addEventListener('complete', (e) => {
        updateCampaignStatusUI(JSON.parse(e.data));
        showToast('🎉 Chiến dịch gửi tin nhắn đã hoàn thành!', 'success');
    });

    es.onerror = () => {
        document.getElementById('connectionStatus').className = 'connection-status';
        document.getElementById('connectionText').textContent = 'Mất Kết Nối';
    };

    es.onopen = () => {
        document.getElementById('connectionStatus').className = 'connection-status connected';
        document.getElementById('connectionText').textContent = 'Đang Kết Nối';
    };
}

function initChatStream() {
    if (state.chatEventSource) {
        state.chatEventSource.close();
    }

    const es = new EventSource(`${getApiBase()}/api/chat/stream`);
    state.chatEventSource = es;

    es.addEventListener('new_message', (e) => {
        const payload = JSON.parse(e.data);
        handleIncomingChatMessage(payload);
    });
}

function handleIncomingChatMessage(payload) {
    const { threadId, message, conversation } = payload;

    // Update conversation in list
    const existingIdx = state.conversations.findIndex(c => String(c.threadId) === String(threadId));
    if (existingIdx >= 0) {
        state.conversations[existingIdx] = { ...state.conversations[existingIdx], ...conversation };
    } else {
        state.conversations.unshift(conversation);
    }

    renderConversationsList();

    // If currently chatting in this room
    if (state.activeChat && String(state.activeChat.threadId) === String(threadId)) {
        state.activeChatMessages.push(message);
        renderActiveChatMessages();
    } else if (!message.isOutgoing) {
        showToast(`💬 Tin nhắn mới từ ${conversation.name}: ${message.text || '[Đính kèm/Voice]'}`, 'info');
        updateChatUnreadBadge();
    }
}

function updateChatUnreadBadge() {
    const totalUnread = state.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const badge = document.getElementById('chatUnreadBadge');
    if (badge) {
        if (totalUnread > 0) {
            badge.textContent = totalUnread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// ==================== AUTH MODULE ====================
async function checkAuthStatus() {
    try {
        const res = await fetch(`${getApiBase()}/api/auth/status`);
        const data = await res.json();
        state.isLoggedIn = data.isLoggedIn;
        state.user = data.user;

        updateUserUI();
        renderSavedAccounts(data.accounts || []);

        if (state.isLoggedIn) {
            loadGroups();
            loadConversations();
        }
    } catch (err) {
        console.error('Lỗi checkAuthStatus:', err);
    }
}

function updateUserUI() {
    const sidebarAvatar = document.getElementById('sidebarUserAvatar');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarId = document.getElementById('sidebarUserId');

    const dashAvatar = document.getElementById('dashUserAvatar');
    const dashName = document.getElementById('dashUserName');
    const dashUid = document.getElementById('dashUserUid');
    const dashPhone = document.getElementById('dashUserPhone');
    const dashStatus = document.getElementById('dashAccountStatus');

    if (state.isLoggedIn && state.user) {
        const avt = state.user.avatar || getFallbackAvatar(state.user.name);
        const name = state.user.displayName || state.user.name || 'Zalo User';
        const uid = state.user.uid || state.user.userId || 'N/A';
        const phone = state.user.phoneNumber || 'Ẩn';

        sidebarAvatar.src = avt;
        sidebarName.textContent = name;
        sidebarId.textContent = `UID: ${uid}`;

        dashAvatar.src = avt;
        dashName.textContent = name;
        dashUid.innerHTML = `<i class="fa-solid fa-fingerprint"></i> UID: ${uid}`;
        dashPhone.innerHTML = `<i class="fa-solid fa-phone"></i> SĐT: ${phone}`;
        dashStatus.textContent = 'ĐÃ KẾT NỐI';
        dashStatus.className = 'status-badge live';
    } else {
        sidebarAvatar.src = getFallbackAvatar('Zalo');
        sidebarName.textContent = 'Chưa đăng nhập';
        sidebarId.textContent = 'Bấm để kết nối';

        dashAvatar.src = getFallbackAvatar('Zalo');
        dashName.textContent = 'Chưa Kết Nối Zalo';
        dashUid.innerHTML = `<i class="fa-solid fa-fingerprint"></i> UID: ---`;
        dashPhone.innerHTML = `<i class="fa-solid fa-phone"></i> SĐT: ---`;
        dashStatus.textContent = 'CHƯA ĐĂNG NHẬP';
        dashStatus.className = 'status-badge';
    }
}

function initAuthHandlers() {
    const btnGenQR = document.getElementById('btnGenerateQR');
    btnGenQR?.addEventListener('click', startQRLogin);

    const btnLoginCookie = document.getElementById('btnLoginCookie');
    btnLoginCookie?.addEventListener('click', async () => {
        const cookie = document.getElementById('cookieInput').value.trim();
        const imei = document.getElementById('imeiInput').value.trim();
        if (!cookie || !imei) {
            return showToast('Vui lòng nhập đầy đủ Cookie và IMEI!', 'error');
        }

        btnLoginCookie.disabled = true;
        btnLoginCookie.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';

        try {
            const res = await fetch(`${getApiBase()}/api/auth/login-cookie`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie, imei })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Đăng nhập thành công: ${data.user.name}`, 'success');
                checkAuthStatus();
                switchTab('dashboard');
            } else {
                showToast(`Đăng nhập thất bại: ${data.error}`, 'error');
            }
        } catch (e) {
            showToast(`Lỗi kết nối: ${e.message}`, 'error');
        } finally {
            btnLoginCookie.disabled = false;
            btnLoginCookie.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng Nhập Ngay';
        }
    });
}

let currentQREventSource = null;
function startQRLogin() {
    if (currentQREventSource) {
        try { currentQREventSource.close(); } catch(e) {}
        currentQREventSource = null;
    }

    const qrStatus = document.getElementById('qrStatusMsg');
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    const qrImg = document.getElementById('qrCodeImage');
    const btnGen = document.getElementById('btnGenerateQR');

    qrImg.classList.add('hidden');
    qrPlaceholder.classList.remove('hidden');

    btnGen.disabled = true;
    btnGen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo mã QR...';
    qrStatus.innerHTML = '<span class="pulse-dot"></span> Đang kết nối máy chủ Zalo...';

    const qrEventSource = new EventSource(`${getApiBase()}/api/auth/login-qr`);
    currentQREventSource = qrEventSource;

    qrEventSource.addEventListener('qr_code', (e) => {
        const data = JSON.parse(e.data);
        qrPlaceholder.classList.add('hidden');
        let imgSrc = data.image || '';
        if (imgSrc && !imgSrc.startsWith('data:image')) {
            imgSrc = 'data:image/png;base64,' + imgSrc;
        }
        qrImg.src = imgSrc;
        qrImg.classList.remove('hidden');
        qrStatus.innerHTML = '<span class="pulse-dot"></span> Đang chờ bạn quét mã QR...';
        btnGen.disabled = false;
        btnGen.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Tạo Mã QR Khác';
    });

    qrEventSource.addEventListener('qr_scanned', (e) => {
        const data = JSON.parse(e.data);
        qrStatus.innerHTML = `<span class="pulse-dot"></span> Đã quét! Vui lòng bấm <strong>Xác nhận</strong> trên Zalo (${data.displayName})`;
    });

    qrEventSource.addEventListener('qr_expired', () => {
        qrStatus.textContent = '❌ Mã QR đã hết hạn. Vui lòng bấm tạo lại!';
        qrEventSource.close();
    });

    qrEventSource.addEventListener('success', (e) => {
        const data = JSON.parse(e.data);
        showToast(`Đăng nhập QR thành công: ${data.user.name}`, 'success');
        qrStatus.textContent = '✅ Đăng nhập thành công!';
        qrEventSource.close();
        checkAuthStatus();
        switchTab('dashboard');
    });

    qrEventSource.addEventListener('error', (e) => {
        const data = JSON.parse(e.data || '{}');
        showToast(`Lỗi QR: ${data.error || 'Mất kết nối'}`, 'error');
        qrEventSource.close();
        btnGen.disabled = false;
        btnGen.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Thử Lại';
    });
}

function renderSavedAccounts(accounts) {
    const container = document.getElementById('accountsGrid');
    const badge = document.getElementById('accountCountBadge');
    const savedCountBadge = document.getElementById('savedAccountsCount');

    if (badge) badge.textContent = accounts.length;
    if (savedCountBadge) savedCountBadge.textContent = accounts.length;

    if (!container) return;
    if (accounts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center w-100">Chưa có tài khoản nào được lưu.</p>';
        return;
    }

    container.innerHTML = accounts.map(acc => {
        const isActive = state.user && state.user.uid === acc.uid;
        const avt = acc.avatar || getFallbackAvatar(acc.name);
        return `
            <div class="account-card-item ${isActive ? 'active-acc' : ''}">
                <div class="user-avatar-wrap">
                    <img src="${avt}" class="user-avatar" alt="Avatar" onerror="this.src='${getFallbackAvatar(acc.name)}'">
                </div>
                <div class="user-info">
                    <h4>${acc.name || 'Zalo User'}</h4>
                    <p>UID: ${acc.uid}</p>
                </div>
                <div class="acc-actions">
                    ${!isActive ? `<button class="btn btn-primary btn-xs" onclick="selectAccount('${acc.uid}')">Chọn</button>` : '<span class="badge-vip">Đang dùng</span>'}
                    <button class="btn btn-outline btn-xs" onclick="deleteAccount('${acc.uid}')" title="Xóa"><i class="fa-solid fa-trash text-red"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

async function selectAccount(uid) {
    try {
        showToast('Đang chuyển đổi tài khoản...', 'info');
        const res = await fetch(`${getApiBase()}/api/auth/accounts/${uid}/select`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`Đã chuyển sang tài khoản: ${data.user.name}`, 'success');
            checkAuthStatus();
        } else {
            showToast(`Không thể chọn: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteAccount(uid) {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này khỏi danh sách lưu?')) return;
    try {
        await fetch(`${getApiBase()}/api/auth/accounts/${uid}`, { method: 'DELETE' });
        showToast('Đã xóa tài khoản', 'info');
        checkAuthStatus();
    } catch (e) {}
}

// ==================== LIVE CHAT & INBOX ====================
function initLiveChat() {
    // Filter buttons (All, User, Group)
    document.querySelectorAll('.chat-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chat-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.chatFilter = btn.getAttribute('data-filter');
            renderConversationsList();
        });
    });

    // Search conversations
    document.getElementById('chatSearchInput')?.addEventListener('input', () => {
        renderConversationsList();
    });

    // New Chat Button
    document.getElementById('btnNewChatPrompt')?.addEventListener('click', openNewChatModal);
    document.getElementById('btnConfirmStartNewChat')?.addEventListener('click', handleStartNewChat);

    // Chat textarea Enter to send
    const textarea = document.getElementById('chatInputText');
    textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCurrentChatMessage();
        }
    });

    document.getElementById('btnSendChatMessage')?.addEventListener('click', sendCurrentChatMessage);
    document.getElementById('btnRefreshChatMessages')?.addEventListener('click', () => {
        if (state.activeChat) openConversation(state.activeChat.threadId, state.activeChat.type, state.activeChat.name, state.activeChat.avatar);
    });

    // Chat Generic File Attachment
    const chatFileInput = document.getElementById('chatFileInput');
    document.getElementById('btnAttachFileChat')?.addEventListener('click', () => {
        chatFileInput?.click();
    });

    chatFileInput?.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('file', file);
            showToast(`Đang upload: ${file.name}...`, 'info');
            try {
                const res = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    state.chatAttachedFile = data.file;
                    state.chatVoiceFile = null;
                    document.getElementById('chatAttachmentBar')?.classList.remove('hidden');
                    document.getElementById('chatAttachFileName').textContent = data.file.name;
                    document.getElementById('chatVoiceBadge')?.classList.add('hidden');
                    document.getElementById('attachPreviewIcon').className = 'fa-solid fa-paperclip text-cyan';
                    showToast('Đã đính kèm file!', 'success');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    });

    // Chat Voice Audio File Attachment
    const chatVoiceFileInput = document.getElementById('chatVoiceFileInput');
    document.getElementById('btnAttachVoiceChat')?.addEventListener('click', () => {
        chatVoiceFileInput?.click();
    });

    chatVoiceFileInput?.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('file', file);
            showToast(`Đang upload Voice: ${file.name}...`, 'info');
            try {
                const res = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    state.chatVoiceFile = data.file;
                    state.chatAttachedFile = data.file;
                    document.getElementById('chatAttachmentBar')?.classList.remove('hidden');
                    document.getElementById('chatAttachFileName').textContent = `🎤 [Voice] ${data.file.name}`;
                    document.getElementById('chatVoiceBadge')?.classList.remove('hidden');
                    document.getElementById('attachPreviewIcon').className = 'fa-solid fa-microphone-lines text-green';
                    showToast('Đã chọn file gửi dạng Tin Nhắn Thoại (Voice)!', 'success');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    });

    document.getElementById('btnCancelChatAttach')?.addEventListener('click', () => {
        state.chatAttachedFile = null;
        state.chatVoiceFile = null;
        document.getElementById('chatAttachmentBar')?.classList.add('hidden');
    });
}

// ==================== VOICE NOTE & MIC RECORDER ====================
function initVoiceSystem() {
    // 1. Mic Recording in Chat Bar
    document.getElementById('btnRecordMicChat')?.addEventListener('click', startLiveRecording);
    document.getElementById('btnCancelVoiceRecord')?.addEventListener('click', cancelLiveRecording);
    document.getElementById('btnStopAndSendVoice')?.addEventListener('click', stopAndSendLiveRecording);

    // 2. Group Hero Voice Button
    document.getElementById('btnSendVoiceToGroup')?.addEventListener('click', () => {
        if (state.selectedGroup) {
            openVoiceGroupModal(state.selectedGroup.id, state.selectedGroup.name);
        }
    });

    // 3. Group Voice Modal Tabs
    document.querySelectorAll('.voice-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.voice-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.voice-tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.getElementById(target)?.classList.add('active');
        });
    });

    // 4. Group Voice Modal File Drop
    const vDropZone = document.getElementById('voiceModalDropZone');
    const vFileInput = document.getElementById('voiceModalFileInput');

    vDropZone?.addEventListener('click', (e) => {
        if (!e.target.closest('#btnRemoveVoiceModalFile')) {
            vFileInput?.click();
        }
    });

    vFileInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleVoiceModalUpload(e.target.files[0]);
        }
    });

    document.getElementById('btnRemoveVoiceModalFile')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.modalVoiceFile = null;
        document.getElementById('voiceModalDropContent')?.classList.remove('hidden');
        document.getElementById('voiceModalAttachedInfo')?.classList.add('hidden');
        document.getElementById('voiceModalAudioPreviewWrap')?.classList.add('hidden');
    });

    // 5. Group Voice Modal Mic Record
    document.getElementById('btnStartModalMic')?.addEventListener('click', startModalMicRecording);
    document.getElementById('btnStopModalMic')?.addEventListener('click', stopModalMicRecording);

    // 6. Group Voice Modal Send Button
    document.getElementById('btnConfirmSendVoiceToGroup')?.addEventListener('click', handleConfirmSendVoiceToGroup);
}

// Live Mic Recording in Chat
async function startLiveRecording() {
    if (!state.isLoggedIn) {
        return showToast('Vui lòng đăng nhập Zalo trước!', 'error');
    }
    if (!state.activeChat) {
        return showToast('Vui lòng chọn một cuộc trò chuyện trước khi thu âm!', 'warn');
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.audioChunks = [];
        state.mediaRecorder = new MediaRecorder(stream);

        state.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.start();

        // UI
        document.getElementById('chatRecordingBar')?.classList.remove('hidden');
        state.recSeconds = 0;
        document.getElementById('chatRecTimer').textContent = '00:00';
        clearInterval(state.recTimerInterval);
        state.recTimerInterval = setInterval(() => {
            state.recSeconds++;
            const m = String(Math.floor(state.recSeconds / 60)).padStart(2, '0');
            const s = String(state.recSeconds % 60).padStart(2, '0');
            document.getElementById('chatRecTimer').textContent = `${m}:${s}`;
        }, 1000);

        showToast('🎙️ Đang thu âm giọng nói... Bấm "Gửi Voice Ngay" khi hoàn tất!', 'info');
    } catch (err) {
        showToast(`Không thể truy cập Microphone: ${err.message}`, 'error');
    }
}

function cancelLiveRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(state.recTimerInterval);
    state.audioChunks = [];
    document.getElementById('chatRecordingBar')?.classList.add('hidden');
}

async function stopAndSendLiveRecording() {
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;

    clearInterval(state.recTimerInterval);
    document.getElementById('chatRecordingBar')?.classList.add('hidden');

    state.mediaRecorder.onstop = async () => {
        state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/m4a' });
        const audioFile = new File([audioBlob], `voice_${Date.now()}.m4a`, { type: 'audio/m4a' });

        const formData = new FormData();
        formData.append('file', audioFile);

        showToast('Đang tải và gửi Voice Note...', 'info');

        try {
            const upRes = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
            const upData = await upRes.json();
            if (upData.success) {
                // Gửi Voice
                const res = await fetch(`${getApiBase()}/api/chat/send-voice`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        threadId: state.activeChat.threadId,
                        type: state.activeChat.type,
                        filePath: upData.file.path
                    })
                });
                const sendData = await res.json();
                if (sendData.success) {
                    showToast('🎉 Đã gửi Tin Nhắn Thoại (Voice) thành công!', 'success');
                } else {
                    showToast(`Gửi voice thất bại: ${sendData.error}`, 'error');
                }
            }
        } catch (e) {
            showToast(`Lỗi gửi voice: ${e.message}`, 'error');
        }
    };

    state.mediaRecorder.stop();
}

// Modal Voice Handlers
function openVoiceGroupModal(groupId, groupName) {
    document.getElementById('voiceModalGroupName').textContent = groupName || 'Nhóm';
    document.getElementById('voiceModalGroupId').textContent = `ID: ${groupId}`;
    document.getElementById('sendVoiceGroupModalOverlay')?.classList.add('active');
    state.modalVoiceFile = null;
    document.getElementById('voiceModalDropContent')?.classList.remove('hidden');
    document.getElementById('voiceModalAttachedInfo')?.classList.add('hidden');
    document.getElementById('voiceModalAudioPreviewWrap')?.classList.add('hidden');
}

function closeVoiceGroupModal() {
    document.getElementById('sendVoiceGroupModalOverlay')?.classList.remove('active');
    if (state.modalMediaRecorder && state.modalMediaRecorder.state !== 'inactive') {
        state.modalMediaRecorder.stop();
        state.modalMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(state.modalRecTimerInterval);
}

async function handleVoiceModalUpload(file) {
    const formData = new FormData();
    formData.append('file', file);
    showToast(`Đang nạp file voice: ${file.name}...`, 'info');

    try {
        const res = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            state.modalVoiceFile = data.file;
            document.getElementById('voiceModalDropContent')?.classList.add('hidden');
            document.getElementById('voiceModalAttachedInfo')?.classList.remove('hidden');
            document.getElementById('voiceModalFileName').textContent = data.file.name;
            document.getElementById('voiceModalFileSize').textContent = (data.file.size / 1024).toFixed(1) + ' KB';

            const audioEl = document.getElementById('voiceModalAudioElement');
            audioEl.src = URL.createObjectURL(file);
            document.getElementById('voiceModalAudioPreviewWrap')?.classList.remove('hidden');
            showToast('Đã nạp file âm thanh!', 'success');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function startModalMicRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.modalAudioChunks = [];
        state.modalMediaRecorder = new MediaRecorder(stream);

        state.modalMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.modalAudioChunks.push(e.data);
        };

        state.modalMediaRecorder.start();

        document.getElementById('modalMicPulse')?.classList.add('recording');
        document.getElementById('btnStartModalMic')?.classList.add('hidden');
        document.getElementById('btnStopModalMic')?.classList.remove('hidden');
        document.getElementById('modalMicStatus').textContent = 'Đang thu âm... Nói vào micro của bạn!';

        state.modalRecSeconds = 0;
        document.getElementById('modalMicTimer').textContent = '00:00';
        clearInterval(state.modalRecTimerInterval);
        state.modalRecTimerInterval = setInterval(() => {
            state.modalRecSeconds++;
            const m = String(Math.floor(state.modalRecSeconds / 60)).padStart(2, '0');
            const s = String(state.modalRecSeconds % 60).padStart(2, '0');
            document.getElementById('modalMicTimer').textContent = `${m}:${s}`;
        }, 1000);
    } catch (err) {
        showToast(`Không thể truy cập Microphone: ${err.message}`, 'error');
    }
}

function stopModalMicRecording() {
    if (!state.modalMediaRecorder || state.modalMediaRecorder.state === 'inactive') return;

    clearInterval(state.modalRecTimerInterval);
    document.getElementById('modalMicPulse')?.classList.remove('recording');
    document.getElementById('btnStartModalMic')?.classList.remove('hidden');
    document.getElementById('btnStopModalMic')?.classList.add('hidden');
    document.getElementById('modalMicStatus').textContent = 'Đã thu xong! Bạn có thể nghe thử bên dưới.';

    state.modalMediaRecorder.onstop = async () => {
        state.modalMediaRecorder.stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(state.modalAudioChunks, { type: 'audio/m4a' });
        const audioFile = new File([audioBlob], `rec_${Date.now()}.m4a`, { type: 'audio/m4a' });

        const audioEl = document.getElementById('voiceModalAudioElement');
        audioEl.src = URL.createObjectURL(audioBlob);
        document.getElementById('voiceModalAudioPreviewWrap')?.classList.remove('hidden');

        // Tự động upload
        const formData = new FormData();
        formData.append('file', audioFile);
        const upRes = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
        const upData = await upRes.json();
        if (upData.success) {
            state.modalVoiceFile = upData.file;
            showToast('Đã lưu đoạn thu âm thành công!', 'success');
        }
    };

    state.modalMediaRecorder.stop();
}

async function handleConfirmSendVoiceToGroup() {
    if (!state.selectedGroup) return;
    if (!state.modalVoiceFile) {
        return showToast('Vui lòng chọn file âm thanh hoặc thu âm trước khi gửi!', 'error');
    }

    const btn = document.getElementById('btnConfirmSendVoiceToGroup');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi Voice...';

    try {
        const res = await fetch(`${getApiBase()}/api/chat/send-voice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                threadId: state.selectedGroup.id,
                type: 'group',
                filePath: state.modalVoiceFile.path
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast('🎉 Đã gửi Voice Note vào nhóm thành công!', 'success');
            closeVoiceGroupModal();
        } else {
            showToast(`Gửi voice thất bại: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> GỬI VOICE VÀO NHÓM NGAY';
    }
}

// Audio Player Toggle in Chat Bubble
function toggleVoiceAudio(audioUrl, btnEl) {
    if (!audioUrl) return;

    const row = btnEl.closest('.chat-msg-row');
    const waveBars = row ? row.querySelector('.voice-bars') : null;

    if (currentPlayingAudio && !currentPlayingAudio.paused && currentPlayingBtn === btnEl) {
        currentPlayingAudio.pause();
        btnEl.innerHTML = '<i class="fa-solid fa-play"></i>';
        waveBars?.classList.remove('playing');
        return;
    }

    if (currentPlayingAudio) {
        currentPlayingAudio.pause();
        if (currentPlayingBtn) currentPlayingBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        document.querySelectorAll('.voice-bars').forEach(b => b.classList.remove('playing'));
    }

    const audio = new Audio(audioUrl);
    currentPlayingAudio = audio;
    currentPlayingBtn = btnEl;

    btnEl.innerHTML = '<i class="fa-solid fa-pause"></i>';
    waveBars?.classList.add('playing');

    audio.play().catch(e => {
        showToast('Không thể phát âm thanh: ' + e.message, 'error');
        btnEl.innerHTML = '<i class="fa-solid fa-play"></i>';
        waveBars?.classList.remove('playing');
    });

    audio.onended = () => {
        btnEl.innerHTML = '<i class="fa-solid fa-play"></i>';
        waveBars?.classList.remove('playing');
        currentPlayingAudio = null;
    };
}

async function loadConversations() {
    const container = document.getElementById('conversationsListContainer');
    try {
        const res = await fetch(`${getApiBase()}/api/chat/conversations`);
        const data = await res.json();
        if (data.success) {
            state.conversations = data.conversations || [];
            document.getElementById('kpiTotalChats').textContent = state.conversations.length;
            renderConversationsList();
            updateChatUnreadBadge();
        }
    } catch (e) {
        if (container) container.innerHTML = `<p class="text-muted text-center p-3">Lỗi tải tin nhắn: ${e.message}</p>`;
    }
}

function renderConversationsList() {
    const container = document.getElementById('conversationsListContainer');
    if (!container) return;

    const q = (document.getElementById('chatSearchInput')?.value || '').toLowerCase().trim();
    let filtered = state.conversations;

    if (state.chatFilter === 'user') {
        filtered = filtered.filter(c => c.type === 'user');
    } else if (state.chatFilter === 'group') {
        filtered = filtered.filter(c => c.type === 'group');
    }

    if (q) {
        filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(q) || String(c.threadId).includes(q));
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4">Chưa có cuộc trò chuyện nào.<br><button class="btn btn-outline btn-xs mt-2" onclick="openNewChatModal()">+ Nhắn Tin Mới</button></p>';
        return;
    }

    container.innerHTML = filtered.map(c => {
        const isActive = state.activeChat && String(state.activeChat.threadId) === String(c.threadId);
        const avt = c.avatar || getFallbackAvatar(c.name);
        const timeStr = c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadBadge = (c.unreadCount && c.unreadCount > 0) ? `<span class="conv-unread-count">${c.unreadCount}</span>` : '';

        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openConversation('${c.threadId}', '${c.type}', '${encodeURIComponent(c.name || '')}', '${encodeURIComponent(c.avatar || '')}')">
                <div class="conv-avatar-wrap">
                    <img src="${avt}" class="conv-avatar" alt="Avatar" onerror="this.src='${getFallbackAvatar(c.name)}'">
                </div>
                <div class="conv-meta">
                    <div class="conv-top-row">
                        <span class="conv-name">${c.name || 'Người dùng'}</span>
                        <span class="conv-time">${timeStr}</span>
                    </div>
                    <div class="conv-bottom-row">
                        <span class="conv-last-msg">${c.lastMessage || 'Chưa có tin nhắn'}</span>
                        ${unreadBadge}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function openConversation(threadId, type = 'user', nameEncoded = '', avatarEncoded = '') {
    const name = decodeURIComponent(nameEncoded);
    const avatar = decodeURIComponent(avatarEncoded);

    state.activeChat = {
        threadId: String(threadId),
        type,
        name: name || (type === 'group' ? `Nhóm ${threadId}` : `User_${threadId}`),
        avatar: avatar || getFallbackAvatar(name)
    };

    // Update conversation item active state
    renderConversationsList();

    document.getElementById('emptyChatState')?.classList.add('hidden');
    const activeBox = document.getElementById('activeChatBox');
    activeBox?.classList.remove('hidden');

    // On mobile devices, hide conversations sidebar and reveal active chat room
    if (window.innerWidth <= 768) {
        document.querySelector('.chat-sidebar-panel')?.classList.add('mobile-hidden');
        document.querySelector('.chat-room-panel')?.classList.remove('mobile-hidden');
    }

    document.getElementById('activeChatName').textContent = state.activeChat.name;
    document.getElementById('activeChatId').textContent = `ID: ${state.activeChat.threadId}`;
    document.getElementById('activeChatTypeBadge').textContent = type === 'group' ? 'Nhóm Chat' : 'Cá Nhân';
    document.getElementById('activeChatAvatar').src = state.activeChat.avatar;

    const stream = document.getElementById('chatMessagesStream');
    stream.innerHTML = '<div class="text-center text-muted p-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải tin nhắn...</div>';

    try {
        const res = await fetch(`${getApiBase()}/api/chat/conversations/${threadId}/messages`);
        const data = await res.json();
        if (data.success) {
            state.activeChatMessages = data.messages || [];
            renderActiveChatMessages();
        }
    } catch (e) {
        stream.innerHTML = `<div class="text-center text-red p-4">Lỗi: ${e.message}</div>`;
    }
}

function renderActiveChatMessages() {
    const stream = document.getElementById('chatMessagesStream');
    if (!stream) return;

    if (state.activeChatMessages.length === 0) {
        stream.innerHTML = '<div class="text-center text-muted p-5"><i class="fa-solid fa-comments fa-2x"></i><p class="mt-2">Chưa có tin nhắn nào trong cuộc trò chuyện này.<br>Hãy gửi tin nhắn đầu tiên bên dưới!</p></div>';
        return;
    }

    stream.innerHTML = state.activeChatMessages.map(msg => {
        const isOut = msg.isOutgoing;
        const avt = isOut
            ? (state.user?.avatar || getFallbackAvatar('Bạn'))
            : (state.activeChat?.avatar || getFallbackAvatar(msg.fromName));

        let attachmentHtml = '';
        if (msg.attachments && msg.attachments.length > 0) {
            attachmentHtml = msg.attachments.map(att => {
                const targetUrl = att.url || att.path || '';
                const isVoice = att.type === 'voice' || /\.(mp3|m4a|wav|aac|ogg|opus|webm)$/i.test(targetUrl);
                const isImg = targetUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(targetUrl);

                if (isVoice) {
                    return `
                        <div class="bubble-voice-player">
                            <button type="button" class="voice-play-btn" onclick="toggleVoiceAudio('${encodeURI(targetUrl)}', this)">
                                <i class="fa-solid fa-play"></i>
                            </button>
                            <div class="voice-waveform-preview">
                                <div class="voice-bars">
                                    <span style="height: 6px;"></span>
                                    <span style="height: 14px;"></span>
                                    <span style="height: 18px;"></span>
                                    <span style="height: 10px;"></span>
                                    <span style="height: 15px;"></span>
                                    <span style="height: 8px;"></span>
                                    <span style="height: 16px;"></span>
                                    <span style="height: 12px;"></span>
                                    <span style="height: 18px;"></span>
                                    <span style="height: 7px;"></span>
                                </div>
                                <div class="voice-meta-row">
                                    <span>🎤 Tin nhắn thoại</span>
                                    <span class="voice-duration">Voice</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (isImg) {
                    return `<img src="${targetUrl}" class="bubble-img" alt="Ảnh">`;
                } else {
                    return `
                        <div class="bubble-doc-file">
                            <i class="fa-solid fa-file-lines fa-2x"></i>
                            <span>${att.name || 'Tài liệu đính kèm'}</span>
                        </div>
                    `;
                }
            }).join('');
        }

        return `
            <div class="chat-msg-row ${isOut ? 'outgoing' : 'incoming'}">
                <img src="${avt}" class="chat-msg-avatar" alt="Avatar" onerror="this.src='${getFallbackAvatar(msg.fromName)}'">
                <div class="chat-msg-bubble">
                    ${!isOut ? `<div class="chat-msg-sender">${msg.fromName || 'Người nhận'}</div>` : ''}
                    ${attachmentHtml}
                    ${msg.text ? `<div class="chat-msg-text">${msg.text}</div>` : ''}
                    <div class="chat-msg-time">
                        <span>${msg.timeFormatted || ''}</span>
                        ${isOut ? '<i class="fa-solid fa-check-double text-cyan"></i>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Scroll to bottom
    stream.scrollTop = stream.scrollHeight;
}

async function sendCurrentChatMessage() {
    if (!state.isLoggedIn) {
        return showToast('Vui lòng đăng nhập Zalo trước khi nhắn tin!', 'error');
    }
    if (!state.activeChat) return;

    const textarea = document.getElementById('chatInputText');
    const text = (textarea?.value || '').trim();
    const filePath = state.chatAttachedFile ? state.chatAttachedFile.path : null;
    const fileName = state.chatAttachedFile ? state.chatAttachedFile.name : null;
    const isVoice = !!state.chatVoiceFile;

    if (!text && !filePath) return;

    textarea.value = '';
    state.chatAttachedFile = null;
    state.chatVoiceFile = null;
    document.getElementById('chatAttachmentBar')?.classList.add('hidden');

    // Optimistic UI Update: Hiển thị ngay lập tức trên khung chat
    const tempMsg = {
        id: 'temp_' + Date.now(),
        fromId: state.user?.uid,
        fromName: state.user?.name || 'Bạn',
        isOutgoing: true,
        text: isVoice ? '🎤 [Tin nhắn thoại - Voice Note]' : (text || ''),
        attachments: filePath ? [{ path: filePath, name: fileName, type: isVoice ? 'voice' : 'file' }] : [],
        timestamp: new Date().toISOString(),
        timeFormatted: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    state.activeChatMessages.push(tempMsg);
    renderActiveChatMessages();

    try {
        let endpoint = `${getApiBase()}/api/chat/send`;
        let payload = {
            threadId: state.activeChat.threadId,
            type: state.activeChat.type,
            text,
            filePath
        };

        if (isVoice) {
            endpoint = `${getApiBase()}/api/chat/send-voice`;
            payload = {
                threadId: state.activeChat.threadId,
                type: state.activeChat.type,
                filePath
            };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            let parsedErr = 'Lỗi gửi tin nhắn';
            try {
                const j = JSON.parse(errText);
                parsedErr = j.error || parsedErr;
            } catch(e) {
                parsedErr = `Mã lỗi ${res.status}`;
            }
            showToast(`Gửi thất bại: ${parsedErr}`, 'error');
            return;
        }

        const data = await res.json();
        if (!data.success) {
            showToast(`Gửi thất bại: ${data.error}`, 'error');
        } else {
            showToast(isVoice ? '🎤 Đã gửi Voice Note thành công!' : '✅ Đã gửi tin nhắn thành công!', 'success');
        }
    } catch (e) {
        showToast(`Lỗi gửi tin nhắn: ${e.message}`, 'error');
    }
}

function openNewChatModal() {
    document.getElementById('newChatModalOverlay')?.classList.add('active');
}
function closeNewChatModal() {
    document.getElementById('newChatModalOverlay')?.classList.remove('active');
}

function handleStartNewChat() {
    const targetId = document.getElementById('newChatTargetIdInput')?.value.trim();
    const targetName = document.getElementById('newChatTargetNameInput')?.value.trim();
    const typeRadio = document.querySelector('input[name="newChatTypeRadio"]:checked');
    const type = typeRadio ? typeRadio.value : 'user';

    if (!targetId || !/^\d+$/.test(targetId)) {
        return showToast('Vui lòng nhập User ID hoặc Group ID hợp lệ (chỉ gồm chữ số)!', 'error');
    }

    closeNewChatModal();
    openConversation(targetId, type, encodeURIComponent(targetName || (type === 'group' ? `Nhóm ${targetId}` : `User_${targetId}`)));
}

// 1-Click quick chat with member or group
function quickChatWithUser(uid, name = '', avatar = '') {
    switchTab('chat');
    openConversation(uid, 'user', encodeURIComponent(name || `User_${uid}`), encodeURIComponent(avatar || ''));
}
function quickChatWithGroup(groupId, name = '', avatar = '') {
    switchTab('chat');
    openConversation(groupId, 'group', encodeURIComponent(name || `Nhóm ${groupId}`), encodeURIComponent(avatar || ''));
}

// ==================== GROUP & MEMBER HUB ====================
function initGroupHub() {
    const searchInput = document.getElementById('groupSearchInput');
    searchInput?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        renderGroupsList(state.groups.filter(g => (g.name || '').toLowerCase().includes(q)));
    });

    const memberSearchInput = document.getElementById('memberSearchInput');
    memberSearchInput?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = state.selectedGroupMembers.filter(m => 
            (m.displayName || '').toLowerCase().includes(q) || 
            (m.zaloName || '').toLowerCase().includes(q) || 
            String(m.id).includes(q)
        );
        renderMembersTable(filtered);
    });

    document.getElementById('btnSelectAllMembers')?.addEventListener('click', () => {
        state.selectedGroupMembers.forEach(m => state.checkedMemberIds.add(m.id));
        updateMemberCheckboxes();
    });

    document.getElementById('btnDeselectAllMembers')?.addEventListener('click', () => {
        state.checkedMemberIds.clear();
        updateMemberCheckboxes();
    });

    document.getElementById('masterMemberCheckbox')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.selectedGroupMembers.forEach(m => state.checkedMemberIds.add(m.id));
        } else {
            state.checkedMemberIds.clear();
        }
        updateMemberCheckboxes();
    });

    document.getElementById('btnChatWithThisGroup')?.addEventListener('click', () => {
        if (state.selectedGroup) {
            quickChatWithGroup(state.selectedGroup.id, state.selectedGroup.name, state.selectedGroup.avatar);
        }
    });

    document.getElementById('btnLaunchForGroup')?.addEventListener('click', () => {
        if (state.selectedGroup) {
            switchTab('campaign');
            const selectEl = document.getElementById('campaignGroupSelect');
            if (selectEl) {
                selectEl.value = state.selectedGroup.id;
                selectEl.dispatchEvent(new Event('change'));
            }
        }
    });
}

async function loadGroups() {
    const container = document.getElementById('groupsListContainer');
    if (container) {
        container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải nhóm...</div>';
    }

    try {
        const res = await fetch(`${getApiBase()}/api/groups`);
        const data = await res.json();
        if (data.success) {
            state.groups = data.groups || [];
            document.getElementById('kpiTotalGroups').textContent = state.groups.length;
            document.getElementById('groupTotalCount').textContent = state.groups.length;
            document.getElementById('groupCountBadge').textContent = state.groups.length;

            renderGroupsList(state.groups);
            populateCampaignGroupSelect(state.groups);
        } else {
            if (container) container.innerHTML = `<p class="text-muted text-center p-3">${data.error}</p>`;
        }
    } catch (e) {
        if (container) container.innerHTML = `<p class="text-muted text-center p-3">Lỗi tải nhóm: ${e.message}</p>`;
    }
}

function renderGroupsList(groups) {
    const container = document.getElementById('groupsListContainer');
    if (!container) return;

    if (groups.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-3">Không tìm thấy nhóm nào.</p>';
        return;
    }

    container.innerHTML = groups.map((g) => {
        const isActive = state.selectedGroup && state.selectedGroup.id === g.id;
        const avt = g.avatar || getFallbackAvatar(g.name);
        return `
            <div class="group-item-card ${isActive ? 'active' : ''}" onclick="selectGroup('${g.id}')">
                <img src="${avt}" class="group-item-avatar" alt="Avatar" onerror="this.src='${getFallbackAvatar(g.name)}'">
                <div class="group-item-info">
                    <h4>${g.name || 'Nhóm không tên'}</h4>
                    <p><i class="fa-solid fa-users"></i> ${g.totalMember} TV ${g.isLockedView ? '• <span class="text-amber">Chặn xem</span>' : ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

async function selectGroup(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    state.selectedGroup = group;
    renderGroupsList(state.groups);

    document.getElementById('noGroupSelectedState')?.classList.add('hidden');
    const content = document.getElementById('groupMembersContent');
    content?.classList.remove('hidden');

    document.getElementById('selectedGroupName').textContent = group.name;
    document.getElementById('selectedGroupId').textContent = `ID: ${group.id}`;
    document.getElementById('selectedGroupCount').innerHTML = `<i class="fa-solid fa-users"></i> ${group.totalMember} Thành Viên`;
    document.getElementById('selectedGroupAvatar').src = group.avatar || getFallbackAvatar(group.name);

    const lockBadge = document.getElementById('selectedGroupLockBadge');
    if (group.isLockedView) {
        lockBadge.classList.remove('hidden');
    } else {
        lockBadge.classList.add('hidden');
    }

    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang quét thành viên nhóm...</td></tr>';

    try {
        const res = await fetch(`${getApiBase()}/api/groups/${groupId}/members`);
        const data = await res.json();
        if (data.success) {
            state.selectedGroupMembers = data.data.members || [];
            state.checkedMemberIds.clear();
            state.selectedGroupMembers.forEach(m => state.checkedMemberIds.add(m.id));

            renderMembersTable(state.selectedGroupMembers);
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red p-4">Lỗi: ${data.error}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red p-4">Lỗi: ${e.message}</td></tr>`;
    }
}

function renderMembersTable(members) {
    const tbody = document.getElementById('membersTableBody');
    if (!tbody) return;

    if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-4">Không có thành viên nào.</td></tr>';
        return;
    }

    tbody.innerHTML = members.map((m, idx) => {
        const isChecked = state.checkedMemberIds.has(m.id);
        const avt = m.avatar || getFallbackAvatar(m.displayName || m.zaloName);
        const dName = m.displayName || 'Không rõ';
        return `
            <tr>
                <td><input type="checkbox" class="member-chk" data-id="${m.id}" ${isChecked ? 'checked' : ''} onchange="toggleMemberCheck('${m.id}', this.checked)"></td>
                <td>${idx + 1}</td>
                <td><img src="${avt}" class="table-avatar" alt="Avatar" onerror="this.src='${getFallbackAvatar(dName)}'"></td>
                <td><strong>${dName}</strong></td>
                <td class="text-muted">${m.zaloName || 'Không rõ'}</td>
                <td><code class="text-cyan">${m.id}</code></td>
                <td>
                    <button class="btn btn-outline btn-xs" onclick="quickChatWithUser('${m.id}', '${encodeURIComponent(dName)}', '${encodeURIComponent(avt)}')">
                        <i class="fa-solid fa-comment-dots text-cyan"></i> Nhắn
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    updateMemberCheckboxes();
}

function toggleMemberCheck(id, checked) {
    if (checked) state.checkedMemberIds.add(id);
    else state.checkedMemberIds.delete(id);
    updateMemberCheckboxes();
}

function updateMemberCheckboxes() {
    const badge = document.getElementById('selectedMembersCountBadge');
    if (badge) badge.textContent = `Đã chọn: ${state.checkedMemberIds.size}/${state.selectedGroupMembers.length}`;

    const masterChk = document.getElementById('masterMemberCheckbox');
    if (masterChk) {
        masterChk.checked = state.selectedGroupMembers.length > 0 && state.checkedMemberIds.size === state.selectedGroupMembers.length;
    }

    document.querySelectorAll('.member-chk').forEach(chk => {
        const id = chk.getAttribute('data-id');
        chk.checked = state.checkedMemberIds.has(id);
    });
}

function exportGroupData(format) {
    if (!state.selectedGroup) return;
    window.location.href = `${getApiBase()}/api/groups/${state.selectedGroup.id}/export?format=${format}`;
    showToast(`Đang tải file danh sách thành viên (${format.toUpperCase()})...`, 'success');
}

// ==================== CAMPAIGN STUDIO ====================
function initCampaignStudio() {
    document.querySelectorAll('input[name="targetSourceRadio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isGroup = e.target.value === 'group';
            document.getElementById('targetGroupSelectWrap')?.classList.toggle('hidden', !isGroup);
            document.getElementById('targetManualInputWrap')?.classList.toggle('hidden', isGroup);
            updateCampaignTargetCount();
        });
    });

    const selectEl = document.getElementById('campaignGroupSelect');
    selectEl?.addEventListener('change', async () => {
        const gId = selectEl.value;
        if (gId) {
            showToast('Đang tải danh sách thành viên của nhóm...', 'info');
            const res = await fetch(`${getApiBase()}/api/groups/${gId}/members`);
            const data = await res.json();
            if (data.success) {
                state.campaignTargets = data.data.members || [];
                document.getElementById('campaignTargetCount').textContent = state.campaignTargets.length;
            }
        } else {
            state.campaignTargets = [];
            document.getElementById('campaignTargetCount').textContent = '0';
        }
    });

    document.getElementById('campaignManualIds')?.addEventListener('input', updateCampaignTargetCount);

    const msgText = document.getElementById('campaignMessageText');
    msgText?.addEventListener('input', updateLivePhonePreview);

    document.getElementById('btnTestSpin')?.addEventListener('click', () => {
        updateLivePhonePreview();
        showToast('Đã thử nghiệm ngẫu nhiên Spin Text!', 'info');
    });

    document.getElementById('btnLoadSavedTemplate')?.addEventListener('click', async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/template`);
            const data = await res.json();
            if (data.success && data.content) {
                document.getElementById('campaignMessageText').value = data.content;
                updateLivePhonePreview();
                showToast('Đã nạp nội dung từ message.txt', 'success');
            }
        } catch (e) {}
    });

    // File Drag & Drop
    const dropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('fileInputHidden');

    dropZone?.addEventListener('click', (e) => {
        if (!e.target.closest('#btnRemoveFile')) {
            fileInput?.click();
        }
    });

    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    document.getElementById('btnRemoveFile')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.attachedFile = null;
        document.getElementById('dropZoneContent')?.classList.remove('hidden');
        document.getElementById('fileAttachedInfo')?.classList.add('hidden');
        document.getElementById('previewBubbleAttachment')?.classList.add('hidden');
        document.getElementById('voiceOptionToggleWrap')?.classList.add('hidden');
    });

    // Delay sliders
    const minSlider = document.getElementById('delayMinRange');
    const maxSlider = document.getElementById('delayMaxRange');
    const minValText = document.getElementById('delayMinVal');
    const maxValText = document.getElementById('delayMaxVal');

    minSlider?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val > parseInt(maxSlider.value, 10)) maxSlider.value = val;
        minValText.textContent = val;
        maxValText.textContent = maxSlider.value;
    });

    maxSlider?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (val < parseInt(minSlider.value, 10)) minSlider.value = val;
        minValText.textContent = minSlider.value;
        maxValText.textContent = val;
    });

    document.getElementById('btnStartCampaign')?.addEventListener('click', launchCampaign);
}

function populateCampaignGroupSelect(groups) {
    const select = document.getElementById('campaignGroupSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn một nhóm để gửi --</option>' +
        groups.map(g => `<option value="${g.id}">[${g.name}] (${g.totalMember} TV)</option>`).join('');
}

function updateCampaignTargetCount() {
    const sourceRadio = document.querySelector('input[name="targetSourceRadio"]:checked');
    if (!sourceRadio) return;

    if (sourceRadio.value === 'manual') {
        const text = document.getElementById('campaignManualIds').value;
        const list = text.split(/[\n,\s;]+/).filter(s => s.trim() && /^\d+$/.test(s.trim()));
        document.getElementById('campaignTargetCount').textContent = list.length;
    } else {
        const count = (state.campaignTargets || []).length;
        document.getElementById('campaignTargetCount').textContent = count;
    }
}

async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    showToast(`Đang upload: ${file.name}...`, 'info');

    try {
        const res = await fetch(`${getApiBase()}/api/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            state.attachedFile = data.file;
            document.getElementById('dropZoneContent')?.classList.add('hidden');
            document.getElementById('fileAttachedInfo')?.classList.remove('hidden');
            document.getElementById('attachedFileName').textContent = data.file.name;
            document.getElementById('attachedFileSize').textContent = (data.file.size / 1024).toFixed(1) + ' KB';

            const bubbleAttach = document.getElementById('previewBubbleAttachment');
            const imgEl = document.getElementById('previewAttachmentImg');
            const docEl = document.getElementById('previewDocFile');
            const docName = document.getElementById('previewDocName');

            bubbleAttach.classList.remove('hidden');

            const ext = file.name.split('.').pop().toLowerCase();
            const isAudio = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'opus', 'webm'].includes(ext);

            if (isAudio) {
                document.getElementById('voiceOptionToggleWrap')?.classList.remove('hidden');
                document.getElementById('chkSendAsVoice').checked = true;
                imgEl.classList.add('hidden');
                docEl.classList.remove('hidden');
                docName.textContent = `🎤 [Voice Note] ${file.name}`;
            } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                document.getElementById('voiceOptionToggleWrap')?.classList.add('hidden');
                imgEl.src = URL.createObjectURL(file);
                imgEl.classList.remove('hidden');
                docEl.classList.add('hidden');
            } else {
                document.getElementById('voiceOptionToggleWrap')?.classList.add('hidden');
                imgEl.classList.add('hidden');
                docEl.classList.remove('hidden');
                docName.textContent = file.name;
            }

            showToast('Đã đính kèm file thành công!', 'success');
        } else {
            showToast(`Upload thất bại: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function insertTag(tag) {
    const textarea = document.getElementById('campaignMessageText');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.substring(0, start) + tag + val.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    updateLivePhonePreview();
}

function processSpinTextLocal(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
        const options = choices.split('|').map(s => s.trim());
        if (options.length === 0) return match;
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
    });
}

function updateLivePhonePreview() {
    const rawText = document.getElementById('campaignMessageText')?.value || '';
    let processed = processSpinTextLocal(rawText);
    processed = processed.replace(/\{name\}/gi, 'Nguyễn Văn A');
    processed = processed.replace(/\{id\}/gi, '2558304990');
    processed = processed.replace(/\{uid\}/gi, '2558304990');

    const previewEl = document.getElementById('previewBubbleText');
    if (previewEl) {
        previewEl.innerHTML = processed ? processed.replace(/\n/g, '<br>') : '<em>(Nội dung tin nhắn trống)</em>';
    }

    const now = new Date();
    document.getElementById('previewBubbleTime').textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

async function launchCampaign() {
    if (!state.isLoggedIn) {
        return showToast('Vui lòng đăng nhập Zalo trước khi chạy chiến dịch!', 'error');
    }

    const sourceRadio = document.querySelector('input[name="targetSourceRadio"]:checked');
    let targets = [];

    if (sourceRadio && sourceRadio.value === 'manual') {
        const raw = document.getElementById('campaignManualIds').value;
        const ids = raw.split(/[\n,\s;]+/).filter(s => s.trim() && /^\d+$/.test(s.trim()));
        targets = ids.map(id => ({ id, displayName: `User_${id}`, zaloName: `User_${id}` }));
    } else {
        const select = document.getElementById('campaignGroupSelect');
        const groupId = select.value;
        if (!groupId) {
            return showToast('Vui lòng chọn 1 nhóm hoặc dán danh sách User ID!', 'error');
        }
        targets = state.campaignTargets || [];
    }

    if (targets.length === 0) {
        return showToast('Danh sách người nhận không được để trống!', 'error');
    }

    const textTemplate = document.getElementById('campaignMessageText').value;
    const filePath = state.attachedFile ? state.attachedFile.path : null;
    const isVoice = document.getElementById('chkSendAsVoice')?.checked || false;

    if (!textTemplate.trim() && !filePath) {
        return showToast('Vui lòng nhập nội dung tin nhắn hoặc đính kèm 1 file/ảnh/voice!', 'error');
    }

    const minDelay = parseInt(document.getElementById('delayMinRange').value, 10) || 5;
    const maxDelay = parseInt(document.getElementById('delayMaxRange').value, 10) || 8;
    const excludeSelf = document.getElementById('chkExcludeSelf').checked;

    if (!confirm(`🚀 Xác nhận BẮT ĐẦU GỬI THẬT cho ${targets.length} người nhận ${isVoice ? '(Chế độ Voice Note)' : ''}?`)) return;

    try {
        const res = await fetch(`${getApiBase()}/api/campaign/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `Chiến Dịch Ads [${new Date().toLocaleTimeString('vi-VN')}]`,
                targets,
                textTemplate,
                filePath,
                isVoice,
                minDelay,
                maxDelay,
                excludeSelf
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('🚀 Chiến dịch đã được khởi động thành công!', 'success');
            openCampaignMonitor();
        } else {
            showToast(`Lỗi khởi động: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ==================== CAMPAIGN MONITOR MODAL ====================
function initCampaignMonitor() {
    document.getElementById('btnCloseMonitor')?.addEventListener('click', closeCampaignMonitor);
    document.getElementById('btnClearLogs')?.addEventListener('click', () => {
        document.getElementById('monitorTerminalBody').innerHTML = '';
    });
    document.getElementById('btnDownloadLogs')?.addEventListener('click', downloadLogs);

    document.getElementById('btnPauseCampaign')?.addEventListener('click', async () => {
        await fetch(`${getApiBase()}/api/campaign/pause`, { method: 'POST' });
        showToast('Đã tạm dừng chiến dịch', 'warn');
    });

    document.getElementById('btnResumeCampaign')?.addEventListener('click', async () => {
        await fetch(`${getApiBase()}/api/campaign/resume`, { method: 'POST' });
        showToast('Chiến dịch tiếp tục', 'info');
    });

    document.getElementById('btnStopCampaign')?.addEventListener('click', async () => {
        if (!confirm('Bạn có chắc chắn muốn DỪNG HẲN chiến dịch này không?')) return;
        await fetch(`${getApiBase()}/api/campaign/stop`, { method: 'POST' });
        showToast('Đã dừng chiến dịch', 'error');
    });
}

function openCampaignMonitor() {
    document.getElementById('campaignMonitorOverlay')?.classList.add('active');
}
function closeCampaignMonitor() {
    document.getElementById('campaignMonitorOverlay')?.classList.remove('active');
}

function updateCampaignStatusUI(statusData) {
    if (!statusData) return;
    const c = statusData.campaign;
    state.campaignStatus = statusData.status;

    const btnPause = document.getElementById('btnPauseCampaign');
    const btnResume = document.getElementById('btnResumeCampaign');

    if (statusData.status === 'running') {
        btnPause?.classList.remove('hidden');
        btnResume?.classList.add('hidden');
    } else if (statusData.status === 'paused') {
        btnPause?.classList.add('hidden');
        btnResume?.classList.remove('hidden');
    } else {
        btnPause?.classList.add('hidden');
        btnResume?.classList.add('hidden');
    }

    if (c) {
        document.getElementById('monitorCampaignName').textContent = `${c.name} [${statusData.status.toUpperCase()}]`;
        document.getElementById('monitorProgressBar').style.width = `${c.percentage}%`;
        document.getElementById('monitorPercentage').textContent = `${c.percentage}%`;
        document.getElementById('monitorSentCount').textContent = c.sent;
        document.getElementById('monitorTotalCount').textContent = c.total;
        document.getElementById('monitorSuccessCount').textContent = `${c.success} Thành công`;
        document.getElementById('monitorFailCount').textContent = `${c.failed} Thất bại`;

        document.getElementById('kpiTotalSent').textContent = c.sent;
        if (c.sent > 0) {
            const rate = Math.round((c.success / c.sent) * 100);
            document.getElementById('kpiSuccessRate').textContent = `${rate}%`;
        }
    }
}

function appendTerminalLog(logEntry) {
    const terminal = document.getElementById('monitorTerminalBody');
    if (!terminal) return;

    const div = document.createElement('div');
    div.className = `log-line log-${logEntry.level || 'info'}`;
    div.textContent = `[${logEntry.timestamp}] ${logEntry.message}`;
    terminal.appendChild(div);

    terminal.scrollTop = terminal.scrollHeight;
}

function downloadLogs() {
    const terminal = document.getElementById('monitorTerminalBody');
    if (!terminal) return;
    const text = terminal.innerText;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zalo_campaign_logs_${Date.now()}.txt`;
    a.click();
}

// ==================== HISTORY TAB ====================
function initHistoryTab() {
    document.getElementById('btnRefreshHistory')?.addEventListener('click', loadHistory);
}

async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${getApiBase()}/api/campaign/history`);
        const data = await res.json();
        if (data.success && data.history && data.history.length > 0) {
            tbody.innerHTML = data.history.map(item => `
                <tr>
                    <td>${new Date(item.startTime).toLocaleString('vi-VN')}</td>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.total}</td>
                    <td class="text-green font-bold">${item.success}</td>
                    <td class="text-red font-bold">${item.failed}</td>
                    <td><span class="badge ${item.status === 'completed' ? 'badge-count' : 'badge-lock'}">${item.status.toUpperCase()}</span></td>
                    <td>
                        <button class="btn btn-outline btn-xs" onclick="openCampaignMonitor()"><i class="fa-solid fa-eye"></i> Xem</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-4">Chưa có chiến dịch nào được thực hiện</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red p-4">Lỗi: ${e.message}</td></tr>`;
    }
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        info: '<i class="fa-solid fa-circle-info text-cyan"></i>',
        success: '<i class="fa-solid fa-circle-check text-green"></i>',
        warn: '<i class="fa-solid fa-triangle-exclamation text-amber"></i>',
        error: '<i class="fa-solid fa-circle-xmark text-red"></i>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `${icons[type] || icons.info} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
