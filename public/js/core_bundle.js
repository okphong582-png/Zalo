/**
 * NEXUS BOT CLOUD - CORE ENGINE & SAAS AUTOMATION SUITE
 * Zalo Bot, Telegram Bot, Doithevip Auto Charging & Firebase Gatekeeper
 */

// ==================== FIREBASE CONFIG & INITIALIZATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyDTnJF15YmZ5aSlkodR9S0QGr7OC2rRvEY",
    authDomain: "webe-f3a6e.firebaseapp.com",
    databaseURL: "https://webe-f3a6e-default-rtdb.firebaseio.com",
    projectId: "webe-f3a6e",
    storageBucket: "webe-f3a6e.firebasestorage.app",
    messagingSenderId: "1040643741311",
    appId: "1:1040643741311:web:42e7c8b638adadff1e514a",
    measurementId: "G-ETHYJFTD0N"
};

let db = null;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    }
} catch (e) {
    console.warn('[Firebase Init]:', e.message);
}

// ==================== GLOBAL SAAS STATE ====================
const saasState = {
    // Auth & User
    currentUser: null,
    plan: 'free',
    balance: 0,
    timeRemaining: 3000,
    timeFormatted: '50 phút 00s',
    userRef: null,

    // Bot States
    zaloBotRunning: false,
    teleBotRunning: false,
    teleBotInfo: null,
    approvedChats: {},

    // Zalo Service State
    zaloLoggedIn: false,
    zaloUser: null,
    groups: [],
    selectedGroup: null,
    selectedGroupMembers: [],
    checkedMemberIds: new Set(),
    conversations: [],
    activeChat: null,
    activeChatMessages: [],
    chatFilter: 'all',

    // Streams
    botEventSource: null,
    chatEventSource: null,
    qrEventSource: null,

    // Voice & Media
    mediaRecorder: null,
    audioChunks: [],
    recTimerInterval: null,
    recSeconds: 0
};

// ==================== HELPER TOAST ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check text-green' :
        type === 'error' ? 'fa-circle-xmark text-red' :
        type === 'warning' ? 'fa-triangle-exclamation text-amber' : 'fa-circle-info text-cyan';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==================== SECURITY & ANTI-F12 PROTECTION ====================
function initAntiF12Protection() {
    // Chặn phím tắt mở DevTools & Source
    document.addEventListener('keydown', (e) => {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (Xem nguồn trang)
        if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
            e.preventDefault();
            return false;
        }
        // Ctrl+S (Lưu trang)
        if (e.ctrlKey && (e.key === 'S' || e.key === 's')) {
            e.preventDefault();
            return false;
        }
    });

    // Chặn chuột phải (Context Menu)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // Anti-Debugger Loop
    setInterval(() => {
        const start = performance.now();
        debugger;
        const end = performance.now();
        if (end - start > 100) {
            console.clear();
        }
    }, 1000);
}

// ==================== GATEKEEPER FIREBASE AUTH ====================
function initGatekeeperAuth() {
    const modal = document.getElementById('gatekeeperModal');
    const tabLogin = document.getElementById('tabAuthLogin');
    const tabRegister = document.getElementById('tabAuthRegister');
    const formLogin = document.getElementById('formAuthLogin');
    const formRegister = document.getElementById('formAuthRegister');

    // Chuyển Tab Đăng Nhập / Đăng Ký (hỗ trợ cả inline onclick và event listener)
    window.switchAuthTab = function(mode) {
        const tabL = document.getElementById('tabAuthLogin');
        const tabR = document.getElementById('tabAuthRegister');
        const formL = document.getElementById('formAuthLogin');
        const formR = document.getElementById('formAuthRegister');
        if (mode === 'register') {
            if (tabR) tabR.classList.add('active');
            if (tabL) tabL.classList.remove('active');
            if (formR) formR.style.display = 'block';
            if (formL) formL.style.display = 'none';
        } else {
            if (tabL) tabL.classList.add('active');
            if (tabR) tabR.classList.remove('active');
            if (formL) formL.style.display = 'block';
            if (formR) formR.style.display = 'none';
        }
    };

    tabLogin?.addEventListener('click', () => window.switchAuthTab('login'));
    tabRegister?.addEventListener('click', () => window.switchAuthTab('register'));

    // Xử lý Đăng Nhập
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('authLoginUser')?.value.trim();
        const password = document.getElementById('authLoginPass')?.value.trim();
        const btn = document.getElementById('btnSubmitLogin');

        if (!username || !password) {
            showToast('Vui lòng nhập tên tài khoản và mật khẩu!', 'warning');
            return;
        }

        if (!db) {
            showToast('Chưa thể kết nối đến Firebase Database!', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...';

        try {
            const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const snapshot = await db.ref(`users/${cleanUser}`).once('value');

            if (!snapshot.exists()) {
                showToast('Tài khoản không tồn tại! Vui lòng đăng ký.', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
                return;
            }

            const userData = snapshot.val();
            const storedPass = userData.password;
            const encodedInput = btoa(password);

            if (storedPass !== encodedInput && storedPass !== password) {
                showToast('Mật khẩu không chính xác! Vui lòng thử lại.', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
                return;
            }

            // Đăng nhập thành công
            loginUserSuccess(cleanUser, userData);
        } catch (err) {
            showToast(`Lỗi đăng nhập: ${err.message}`, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng Nhập Hệ Thống';
        }
    });

    // Xử lý Đăng Ký
    formRegister?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('authRegUser')?.value.trim();
        const password = document.getElementById('authRegPass')?.value.trim();
        const confirmPass = document.getElementById('authRegPassConfirm')?.value.trim();
        const btn = document.getElementById('btnSubmitRegister');

        if (!username || !password) {
            showToast('Vui lòng điền đầy đủ thông tin!', 'warning');
            return;
        }

        if (password.length < 6) {
            showToast('Mật khẩu phải từ 6 ký tự trở lên!', 'warning');
            return;
        }

        if (password !== confirmPass) {
            showToast('Mật khẩu nhập lại không khớp!', 'warning');
            return;
        }

        if (!db) {
            showToast('Chưa thể kết nối đến Firebase Database!', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo tài khoản...';

        try {
            const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (!cleanUser) {
                showToast('Tên đăng nhập không hợp lệ!', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng Ký Tài Khoản';
                return;
            }

            const checkSnap = await db.ref(`users/${cleanUser}`).once('value');
            if (checkSnap.exists()) {
                showToast('Tên đăng nhập này đã được sử dụng! Vui lòng chọn tên khác.', 'warning');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng Ký Tài Khoản';
                return;
            }

            const newUser = {
                profile: {
                    username: cleanUser,
                    createdAt: Date.now()
                },
                password: btoa(password),
                balance: 0,
                plan: 'free',
                timeRemaining: 3000, // 50 phút = 3000 giây
                approved_chats: {}
            };

            await db.ref(`users/${cleanUser}`).set(newUser);
            showToast('Đăng ký tài khoản thành công! Tặng ngay 50 phút dùng thử.', 'success');
            loginUserSuccess(cleanUser, newUser);
        } catch (err) {
            showToast(`Lỗi tạo tài khoản: ${err.message}`, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng Ký Tài Khoản';
        }
    });

    // Nút Đăng Xuất
    document.getElementById('btnLogoutSaaS')?.addEventListener('click', () => {
        logoutUser();
    });

    // Kiểm tra session lưu sẵn
    checkPersistedUser();
}

function checkPersistedUser() {
    const saved = localStorage.getItem('nexus_saas_user');
    if (saved) {
        try {
            const userObj = JSON.parse(saved);
            if (userObj && userObj.username && db) {
                db.ref(`users/${userObj.username}`).once('value').then(snap => {
                    if (snap.exists()) {
                        loginUserSuccess(userObj.username, snap.val(), false);
                    } else {
                        openGatekeeperModal();
                    }
                }).catch(() => openGatekeeperModal());
                return;
            }
        } catch (e) {}
    }
    openGatekeeperModal();
}

function openGatekeeperModal() {
    const modal = document.getElementById('gatekeeperModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('gatekeeper-locked');
    }
}

function closeGatekeeperModal() {
    const modal = document.getElementById('gatekeeperModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('gatekeeper-locked');
    }
}

function loginUserSuccess(username, userData, showWelcome = true) {
    saasState.currentUser = username;
    saasState.plan = userData.plan || 'free';
    saasState.balance = userData.balance || 0;
    saasState.timeRemaining = typeof userData.timeRemaining === 'number' ? userData.timeRemaining : 3000;

    localStorage.setItem('nexus_saas_user', JSON.stringify({ username }));
    closeGatekeeperModal();

    if (showWelcome) {
        showToast(`Chào mừng ${username} trở lại hệ thống Nexus Bot Cloud!`, 'success');
    }

    // Đồng bộ với backend
    fetch('/api/bot/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            plan: saasState.plan,
            balance: saasState.balance,
            timeRemaining: saasState.timeRemaining
        })
    }).catch(e => console.warn('Sync error:', e));

    // Lắng nghe thay đổi số dư và gói cước realtime từ Firebase RTDB
    if (saasState.userRef) saasState.userRef.off();
    saasState.userRef = db.ref(`users/${username}`);
    saasState.userRef.on('value', snap => {
        if (snap.exists()) {
            const val = snap.val();
            saasState.balance = val.balance || 0;
            saasState.plan = val.plan || 'free';
            if (typeof val.timeRemaining === 'number') {
                saasState.timeRemaining = val.timeRemaining;
            }
            updateUserUi();
        }
    });

    updateUserUi();
    initBotStream();
    loadBotStatus();
    loadApprovedChats();
}

function logoutUser() {
    if (saasState.userRef) {
        saasState.userRef.off();
        saasState.userRef = null;
    }
    localStorage.removeItem('nexus_saas_user');
    saasState.currentUser = null;
    updateUserUi();
    openGatekeeperModal();
    showToast('Đã đăng xuất khỏi hệ thống.', 'info');
}

function updateUserUi() {
    const nameEl = document.getElementById('navUsername');
    const balanceEl = document.getElementById('navBalance');
    const planBadge = document.getElementById('navPlanBadge');
    const timeBadge = document.getElementById('navTimeRemaining');
    const proCardBtn = document.getElementById('btnUpgradeProCard');

    if (nameEl) nameEl.textContent = saasState.currentUser || 'Khách';
    if (balanceEl) balanceEl.textContent = (saasState.balance || 0).toLocaleString() + ' đ';

    if (planBadge) {
        if (saasState.plan === 'pro') {
            planBadge.className = 'badge-plan pro';
            planBadge.innerHTML = '<i class="fa-solid fa-crown text-amber"></i> PRO VIP (100H)';
        } else {
            planBadge.className = 'badge-plan free';
            planBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> GÓI FREE';
        }
    }

    if (timeBadge) {
        timeBadge.innerHTML = `<i class="fa-solid fa-clock"></i> ${formatSeconds(saasState.timeRemaining)}`;
        if (saasState.timeRemaining <= 0) {
            timeBadge.classList.add('expired');
        } else {
            timeBadge.classList.remove('expired');
        }
    }

    // Nút Pro Upgrade trên trang
    if (proCardBtn) {
        if (saasState.plan === 'pro') {
            proCardBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đang Dùng Gói Pro';
            proCardBtn.classList.add('disabled');
        } else {
            proCardBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Nâng Cấp Ngay (20.000đ)';
            proCardBtn.classList.remove('disabled');
        }
    }
}

function formatSeconds(seconds) {
    if (seconds <= 0) return '0 phút';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes} phút ${secs}s`;
}

// ==================== REALTIME BOT STREAM & COUNTDOWN ====================
function initBotStream() {
    if (saasState.botEventSource) {
        saasState.botEventSource.close();
    }

    saasState.botEventSource = new EventSource('/api/bot/stream');

    saasState.botEventSource.addEventListener('time_tick', (e) => {
        const data = JSON.parse(e.data);
        saasState.timeRemaining = data.timeRemaining;
        saasState.timeFormatted = data.timeFormatted;
        const timeBadge = document.getElementById('navTimeRemaining');
        const dashTimeEl = document.getElementById('dashTimeRemaining');
        if (timeBadge) timeBadge.innerHTML = `<i class="fa-solid fa-clock"></i> ${data.timeFormatted}`;
        if (dashTimeEl) dashTimeEl.textContent = data.timeFormatted;

        // Lưu định kỳ lên Firebase
        if (saasState.currentUser && saasState.timeRemaining % 30 === 0 && db) {
            db.ref(`users/${saasState.currentUser}/timeRemaining`).set(saasState.timeRemaining);
        }
    });

    saasState.botEventSource.addEventListener('time_expired', (e) => {
        const data = JSON.parse(e.data);
        showToast(data.message, 'warning');
        updateUserUi();
        loadBotStatus();
    });

    saasState.botEventSource.addEventListener('zalo_status', (e) => {
        const data = JSON.parse(e.data);
        saasState.zaloBotRunning = data.running;
        updateZaloBotSwitch();
    });

    saasState.botEventSource.addEventListener('tele_status', (e) => {
        const data = JSON.parse(e.data);
        saasState.teleBotRunning = data.running;
        updateTeleBotSwitch();
    });

    saasState.botEventSource.addEventListener('tele_log', (e) => {
        const data = JSON.parse(e.data);
        appendTeleLog(data.text, data.error);
    });
}

// ==================== BOT ZALO PRO LOGIC ====================
function initZaloBotControls() {
    const btnToggle = document.getElementById('btnToggleZaloBot');
    btnToggle?.addEventListener('click', async () => {
        if (saasState.timeRemaining <= 0) {
            showToast('Thời gian chạy bot đã hết! Vui lòng nâng cấp gói Pro 20k để có 100 tiếng sử dụng.', 'warning');
            return;
        }

        const endpoint = saasState.zaloBotRunning ? '/api/bot/zalo/stop' : '/api/bot/zalo/start';
        try {
            const res = await fetch(endpoint, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                saasState.zaloBotRunning = data.status.zaloBotRunning;
                updateZaloBotSwitch();
                showToast(saasState.zaloBotRunning ? 'Đã kích hoạt Zalo Bot tự động!' : 'Đã tạm dừng Zalo Bot.', 'success');
            } else {
                showToast(data.error || 'Lỗi thao tác Bot Zalo', 'error');
            }
        } catch (e) {
            showToast(`Lỗi: ${e.message}`, 'error');
        }
    });

    // Thêm nhóm duyệt chat thủ công
    document.getElementById('btnAddApprovedChat')?.addEventListener('click', async () => {
        const input = document.getElementById('inputApproveThreadId');
        const nameInput = document.getElementById('inputApproveThreadName');
        const threadId = input?.value.trim();
        const name = nameInput?.value.trim();

        if (!threadId) {
            showToast('Vui lòng nhập Thread ID / ID nhóm cần duyệt!', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/bot/approved-chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId, name })
            });
            const data = await res.json();
            if (data.success) {
                saasState.approvedChats = data.approvedChats;
                renderApprovedChats();
                if (input) input.value = '';
                if (nameInput) nameInput.value = '';
                showToast(`Đã thêm Thread ID ${threadId} vào danh sách được duyệt!`, 'success');
            }
        } catch (e) {
            showToast(e.message, 'error');
        }
    });

    // Tab chuyển đổi quét QR và Cookie
    document.getElementById('tabZaloQr')?.addEventListener('click', () => {
        document.getElementById('tabZaloQr')?.classList.add('active');
        document.getElementById('tabZaloCookie')?.classList.remove('active');
        document.getElementById('zaloQrSection').style.display = 'block';
        document.getElementById('zaloCookieSection').style.display = 'none';
        startZaloQrScan();
    });

    document.getElementById('tabZaloCookie')?.addEventListener('click', () => {
        document.getElementById('tabZaloCookie')?.classList.add('active');
        document.getElementById('tabZaloQr')?.classList.remove('active');
        document.getElementById('zaloQrSection').style.display = 'none';
        document.getElementById('zaloCookieSection').style.display = 'block';
    });

    // Đăng nhập Zalo bằng Cookie + IMEI
    document.getElementById('btnSubmitZaloCookie')?.addEventListener('click', async () => {
        const cookie = document.getElementById('zaloInputCookie')?.value.trim();
        const imei = document.getElementById('zaloInputImei')?.value.trim();
        const userAgent = document.getElementById('zaloInputUA')?.value.trim();

        if (!cookie || !imei) {
            showToast('Vui lòng nhập đầy đủ Cookie và IMEI!', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubmitZaloCookie');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng nhập...';

        try {
            const res = await fetch('/api/auth/login-cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookie, imei, userAgent })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Đăng nhập Zalo thành công: ${data.user?.name || data.user?.uid}`, 'success');
                checkZaloAuthStatus();
            } else {
                showToast(data.error || 'Đăng nhập Zalo thất bại!', 'error');
            }
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-key"></i> Đăng Nhập Zalo Bằng Cookie';
        }
    });
}

function updateZaloBotSwitch() {
    const btn = document.getElementById('btnToggleZaloBot');
    const statusText = document.getElementById('zaloBotStatusText');
    const indicator = document.getElementById('zaloBotIndicator');

    if (saasState.zaloBotRunning) {
        if (btn) {
            btn.classList.add('btn-active');
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Tắt Bot Zalo';
        }
        if (statusText) statusText.textContent = 'Đang hoạt động tự động (.menu, .soundcloud, .duyetchat)';
        if (indicator) indicator.className = 'status-indicator pulse-green';
    } else {
        if (btn) {
            btn.classList.remove('btn-active');
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Bật Bot Zalo';
        }
        if (statusText) statusText.textContent = 'Đang tạm dừng';
        if (indicator) indicator.className = 'status-indicator status-off';
    }
}

async function loadApprovedChats() {
    try {
        const res = await fetch('/api/bot/approved-chats');
        const data = await res.json();
        if (data.success) {
            saasState.approvedChats = data.approvedChats || {};
            renderApprovedChats();
        }
    } catch (e) {}
}

function renderApprovedChats() {
    const tbody = document.getElementById('approvedChatsTableBody');
    if (!tbody) return;

    const keys = Object.keys(saasState.approvedChats);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-3">Chưa có nhóm nào được duyệt. Các thành viên có thể gõ <code>.duyetchat</code> trong nhóm Zalo hoặc thêm ID ở trên.</td></tr>`;
        return;
    }

    tbody.innerHTML = keys.map(id => {
        const item = saasState.approvedChats[id];
        const dateStr = item.approvedAt ? new Date(item.approvedAt).toLocaleString('vi-VN') : 'Mới';
        return `
            <tr>
                <td><code>${id}</code></td>
                <td><strong>${item.name || item.approvedBy || 'Nhóm Zalo'}</strong></td>
                <td><span class="badge badge-success"><i class="fa-solid fa-check"></i> Đã Duyệt</span></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="removeApprovedChat('${id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.removeApprovedChat = async function(threadId) {
    if (!confirm(`Bạn có chắc muốn hủy duyệt nhóm ${threadId}?`)) return;
    try {
        const res = await fetch(`/api/bot/approved-chats/${threadId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            saasState.approvedChats = data.approvedChats;
            renderApprovedChats();
            showToast(`Đã hủy duyệt nhóm ${threadId}`, 'info');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
};

let qrAutoRefreshTimeout = null;
let qrCountdownInterval = null;
let qrSecondsLeft = 60;

function startZaloQrScan() {
    if (saasState.qrEventSource) {
        saasState.qrEventSource.close();
        saasState.qrEventSource = null;
    }
    if (qrAutoRefreshTimeout) {
        clearTimeout(qrAutoRefreshTimeout);
        qrAutoRefreshTimeout = null;
    }
    if (qrCountdownInterval) {
        clearInterval(qrCountdownInterval);
        qrCountdownInterval = null;
    }

    const qrImg = document.getElementById('zaloQrImage');
    const qrStatus = document.getElementById('zaloQrStatus');
    const btnGen = document.getElementById('btnGenZaloQr');
    const btnRefresh = document.getElementById('btnRefreshZaloQr');
    const countdownWrap = document.getElementById('qrCountdownWrap');
    const timerEl = document.getElementById('qrTimer');

    if (btnGen) {
        btnGen.disabled = true;
        btnGen.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo mã QR...';
    }
    if (qrStatus) {
        qrStatus.innerHTML = '<span class="text-cyan"><i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối máy chủ Zalo tạo mã QR...</span>';
    }

    saasState.qrEventSource = new EventSource('/api/auth/login-qr');

    saasState.qrEventSource.addEventListener('qr_code', (e) => {
        const data = JSON.parse(e.data);
        const imgSrc = data.image || data.url || (data.code ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.code)}` : '');
        if (qrImg && imgSrc) {
            qrImg.src = imgSrc;
            qrImg.style.display = 'block';
        }
        if (qrStatus) {
            qrStatus.innerHTML = '<span class="text-green"><i class="fa-solid fa-qrcode"></i> Mã QR sẵn sàng! Mở ứng dụng Zalo trên điện thoại để quét.</span>';
        }
        if (btnGen) {
            btnGen.disabled = false;
            btnGen.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Tạo Lại Mã QR';
        }
        if (btnRefresh) {
            btnRefresh.style.display = 'inline-flex';
        }

        // Đếm ngược 60 giây phiên QR
        qrSecondsLeft = 60;
        if (countdownWrap) countdownWrap.style.display = 'block';
        if (timerEl) timerEl.textContent = qrSecondsLeft;

        if (qrCountdownInterval) clearInterval(qrCountdownInterval);
        qrCountdownInterval = setInterval(() => {
            qrSecondsLeft--;
            if (timerEl) timerEl.textContent = qrSecondsLeft;
            if (qrSecondsLeft <= 0) {
                clearInterval(qrCountdownInterval);
            }
        }, 1000);
    });

    saasState.qrEventSource.addEventListener('qr_scanned', (e) => {
        if (qrCountdownInterval) clearInterval(qrCountdownInterval);
        if (qrStatus) {
            qrStatus.innerHTML = '<span class="text-green"><i class="fa-solid fa-mobile-screen-button"></i> Đã quét thành công! Hãy nhấn <strong>Xác nhận</strong> trên điện thoại.</span>';
        }
    });

    // Khi phiên hết hạn -> TỰ ĐỘNG TẠO MÃ QR MỚI
    const handleExpired = () => {
        if (qrCountdownInterval) clearInterval(qrCountdownInterval);
        if (qrStatus) {
            qrStatus.innerHTML = '<span class="text-amber"><i class="fa-solid fa-rotate fa-spin"></i> Phiên QR đã hết hạn. Đang tự động tạo mã QR mới...</span>';
        }
        if (saasState.qrEventSource) {
            saasState.qrEventSource.close();
            saasState.qrEventSource = null;
        }
        qrAutoRefreshTimeout = setTimeout(() => {
            startZaloQrScan();
        }, 1500);
    };

    saasState.qrEventSource.addEventListener('qr_expired', handleExpired);
    saasState.qrEventSource.addEventListener('qr_declined', () => {
        if (qrStatus) qrStatus.innerHTML = '<span class="text-red"><i class="fa-solid fa-ban"></i> Đăng nhập bị từ chối trên thiết bị. Bấm tạo lại mã nếu muốn thử lại.</span>';
        if (saasState.qrEventSource) {
            saasState.qrEventSource.close();
            saasState.qrEventSource = null;
        }
        if (btnGen) {
            btnGen.disabled = false;
            btnGen.innerHTML = '<i class="fa-solid fa-qrcode"></i> Tạo Lại Mã QR';
        }
    });

    saasState.qrEventSource.addEventListener('success', (e) => {
        if (qrCountdownInterval) clearInterval(qrCountdownInterval);
        const data = JSON.parse(e.data);
        showToast(`Đăng nhập Zalo thành công: ${data.user?.name || 'Tài khoản Zalo'}`, 'success');
        if (qrStatus) {
            qrStatus.innerHTML = '<span class="text-green"><i class="fa-solid fa-circle-check"></i> Đăng nhập thành công! Bot Zalo đã sẵn sàng.</span>';
        }
        if (countdownWrap) countdownWrap.style.display = 'none';
        if (saasState.qrEventSource) {
            saasState.qrEventSource.close();
            saasState.qrEventSource = null;
        }
        checkZaloAuthStatus();
    });

    saasState.qrEventSource.addEventListener('error', (e) => {
        handleExpired();
    });
}

window.startZaloQrScan = startZaloQrScan;

// ==================== BOT TELEGRAM PRO LOGIC ====================
function initTeleBotControls() {
    const btnToggle = document.getElementById('btnToggleTeleBot');
    const btnUpload = document.getElementById('btnUploadTeleScript');
    const fileInput = document.getElementById('teleScriptFile');

    // Chuyển tab chế độ chạy Telegram (Token vs Upload Code)
    document.getElementById('tabTeleToken')?.addEventListener('click', () => {
        document.getElementById('tabTeleToken')?.classList.add('active');
        document.getElementById('tabTeleUpload')?.classList.remove('active');
        document.getElementById('teleTokenSection').style.display = 'block';
        document.getElementById('teleUploadSection').style.display = 'none';
    });

    document.getElementById('tabTeleUpload')?.addEventListener('click', () => {
        document.getElementById('tabTeleUpload')?.classList.add('active');
        document.getElementById('tabTeleToken')?.classList.remove('active');
        document.getElementById('teleTokenSection').style.display = 'none';
        document.getElementById('teleUploadSection').style.display = 'block';
    });

    // Bật / Tắt Telegram Bot
    btnToggle?.addEventListener('click', async () => {
        if (saasState.teleBotRunning) {
            // Tắt bot
            try {
                const res = await fetch('/api/bot/tele/stop', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    saasState.teleBotRunning = false;
                    updateTeleBotSwitch();
                    showToast('Đã dừng Telegram Bot.', 'info');
                }
            } catch (e) {
                showToast(e.message, 'error');
            }
            return;
        }

        // Bật bot
        if (saasState.timeRemaining <= 0) {
            showToast('Thời gian chạy bot đã hết! Vui lòng nâng cấp gói Pro 20k.', 'warning');
            return;
        }

        const token = document.getElementById('teleInputToken')?.value.trim();
        const cookies = document.getElementById('teleInputCookies')?.value.trim();
        const uploadedPath = saasState.uploadedTeleScript;

        if (!token && !cookies && !uploadedPath) {
            showToast('Vui lòng nhập Telegram Bot Token, Cookies hoặc tải lên file mã script!', 'warning');
            return;
        }

        btnToggle.disabled = true;
        btnToggle.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối...';

        try {
            const res = await fetch('/api/bot/tele/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, cookies, customScriptPath: uploadedPath })
            });
            const data = await res.json();
            if (data.success) {
                saasState.teleBotRunning = true;
                updateTeleBotSwitch();
                showToast('Telegram Bot Pro đã khởi chạy thành công 24/7!', 'success');
            } else {
                showToast(data.error || 'Không thể khởi động Telegram Bot', 'error');
            }
        } catch (e) {
            showToast(`Lỗi: ${e.message}`, 'error');
        } finally {
            btnToggle.disabled = false;
        }
    });

    // Upload script bot Telegram riêng
    btnUpload?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('botFile', file);

        showToast(`Đang tải lên script: ${file.name}...`, 'info');
        try {
            const res = await fetch('/api/bot/tele/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                saasState.uploadedTeleScript = data.filePath;
                const statusEl = document.getElementById('teleUploadStatus');
                if (statusEl) statusEl.innerHTML = `<span class="text-green"><i class="fa-solid fa-file-code"></i> Đã nạp script: <strong>${data.filename}</strong></span>`;
                showToast('Tải lên script bot Telegram thành công! Bây giờ bạn có thể bấm Bật Bot.', 'success');
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Xóa terminal log
    document.getElementById('btnClearTeleLogs')?.addEventListener('click', () => {
        const term = document.getElementById('teleTerminalLogs');
        if (term) term.innerHTML = '<div class="term-line text-muted">// Terminal đã được làm sạch.</div>';
    });
}

function updateTeleBotSwitch() {
    const btn = document.getElementById('btnToggleTeleBot');
    const statusText = document.getElementById('teleBotStatusText');
    const indicator = document.getElementById('teleBotIndicator');

    if (saasState.teleBotRunning) {
        if (btn) {
            btn.classList.add('btn-active');
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Dừng Bot Telegram';
        }
        if (statusText) statusText.textContent = '🟢 Đang chạy Cloud 24/7 (/start, /music, /info)';
        if (indicator) indicator.className = 'status-indicator pulse-green';
    } else {
        if (btn) {
            btn.classList.remove('btn-active');
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Bật Bot Telegram';
        }
        if (statusText) statusText.textContent = '🔴 Đang dừng';
        if (indicator) indicator.className = 'status-indicator status-off';
    }
}

function appendTeleLog(text, isError = false) {
    const term = document.getElementById('teleTerminalLogs');
    if (!term) return;

    const line = document.createElement('div');
    line.className = isError ? 'term-line text-red' : 'term-line text-cyan';
    const time = new Date().toLocaleTimeString('vi-VN');
    line.innerHTML = `<span class="term-time">[${time}]</span> ${escapeHtml(text.trim())}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== DOITHEVIP AUTO RECHARGE INTEGRATION ====================
function initPaymentSystem() {
    const form = document.getElementById('formChargingCard');
    const btnSubmit = document.getElementById('btnSubmitCharging');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!saasState.currentUser) {
            showToast('Vui lòng đăng nhập trước khi nạp thẻ!', 'warning');
            openGatekeeperModal();
            return;
        }

        const telco = document.getElementById('chargingTelco')?.value;
        const amount = document.getElementById('chargingAmount')?.value;
        const serial = document.getElementById('chargingSerial')?.value.trim();
        const code = document.getElementById('chargingCode')?.value.trim();

        if (!telco || !amount || !serial || !code) {
            showToast('Vui lòng điền đầy đủ loại thẻ, mệnh giá, số seri và mã thẻ!', 'warning');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nạp thẻ qua hệ thống Doithevip...';

        try {
            const res = await fetch('/api/payment/charge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telco,
                    amount,
                    serial,
                    code,
                    username: saasState.currentUser
                })
            });

            const data = await res.json();
            if (data.success) {
                const status = Number(data.status);
                // Lưu lịch sử
                logCardHistory({
                    time: Date.now(),
                    telco,
                    amount: Number(amount),
                    serial,
                    code,
                    status,
                    message: data.message
                });

                if (status === 1) {
                    // Thẻ đúng mệnh giá -> cộng tiền vào Firebase RTDB
                    const realAmount = Number(amount);
                    const newBal = (saasState.balance || 0) + realAmount;
                    if (db && saasState.currentUser) {
                        await db.ref(`users/${saasState.currentUser}/balance`).set(newBal);
                    }
                    showToast(`🎉 Nạp thẻ THÀNH CÔNG! Đã cộng +${realAmount.toLocaleString()}đ vào ví của bạn.`, 'success');
                    form.reset();
                } else if (status === 99) {
                    showToast('⏳ Thẻ đã gửi lên hệ thống và đang chờ nhà mạng duyệt. Tiền sẽ tự cộng khi thành công.', 'info');
                    pollCardStatus(telco, code, serial, amount, data.requestId);
                    form.reset();
                } else {
                    showToast(data.message || 'Thẻ sai hoặc không hợp lệ!', 'error');
                }
            } else {
                showToast(data.error || 'Không thể gửi thẻ cào!', 'error');
            }
        } catch (err) {
            showToast(`Lỗi kết nối máy chủ nạp thẻ: ${err.message}`, 'error');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fa-solid fa-credit-card"></i> Nạp Thẻ Cào Ngay';
        }
    });

    // Nút Nâng Cấp Gói Pro (20,000đ -> 100 giờ)
    document.getElementById('btnUpgradeProCard')?.addEventListener('click', async () => {
        if (!saasState.currentUser) {
            openGatekeeperModal();
            return;
        }

        if (saasState.plan === 'pro') {
            showToast('Tài khoản của bạn đã là gói PRO VIP (100H)!', 'info');
            return;
        }

        const currentBal = saasState.balance || 0;
        if (currentBal < 20000) {
            showToast(`Số dư ví không đủ 20.000đ (Hiện có: ${currentBal.toLocaleString()}đ). Vui lòng nạp thẻ cào để tiếp tục!`, 'warning');
            // Tự động chuyển sang Tab Nạp Thẻ Cào
            if (typeof switchMainTab === 'function') {
                switchMainTab('sectionPayment');
            }
            return;
        }

        if (!confirm('Xác nhận sử dụng 20.000đ từ ví để nâng cấp GÓI PRO (100 tiếng chạy bot Zalo & Telegram 24/7)?')) {
            return;
        }

        try {
            // Trừ 20k trên Firebase RTDB
            const newBal = currentBal - 20000;
            const newTime = (saasState.timeRemaining || 0) + 360000; // 100 giờ = 360,000 giây

            if (db && saasState.currentUser) {
                await db.ref(`users/${saasState.currentUser}/balance`).set(newBal);
                await db.ref(`users/${saasState.currentUser}/plan`).set('pro');
                await db.ref(`users/${saasState.currentUser}/timeRemaining`).set(newTime);
            }

            // Gọi backend cập nhật botManager
            const res = await fetch('/api/payment/upgrade-pro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: saasState.currentUser })
            });

            const data = await res.json();
            if (data.success) {
                showToast('🚀 CHÚC MỪNG! Bạn đã nâng cấp thành công GÓI PRO VIP (+100 GIỜ chạy bot 24/7)!', 'success');
                updateUserUi();
            }
        } catch (err) {
            showToast(`Lỗi kích hoạt gói: ${err.message}`, 'error');
        }
    });
}

function pollCardStatus(telco, code, serial, amount, requestId) {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        if (attempts > 8) {
            clearInterval(interval);
            return;
        }
        try {
            const res = await fetch('/api/payment/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telco, code, serial, amount, requestId })
            });
            const data = await res.json();
            if (data.success && data.status === 1) {
                clearInterval(interval);
                const realAmount = Number(data.amount || amount);
                const newBal = (saasState.balance || 0) + realAmount;
                if (db && saasState.currentUser) {
                    await db.ref(`users/${saasState.currentUser}/balance`).set(newBal);
                }
                showToast(`🎉 Thẻ ${telco} ${Number(amount).toLocaleString()}đ đã DUYỆT THÀNH CÔNG! Đã cộng +${realAmount.toLocaleString()}đ vào ví.`, 'success');
            }
        } catch (e) {}
    }, 10000);
}

function logCardHistory(item) {
    const list = JSON.parse(localStorage.getItem('nexus_card_history') || '[]');
    list.unshift(item);
    if (list.length > 20) list.pop();
    localStorage.setItem('nexus_card_history', JSON.stringify(list));
    renderCardHistory();
}

function renderCardHistory() {
    const tbody = document.getElementById('cardHistoryTableBody');
    if (!tbody) return;

    const list = JSON.parse(localStorage.getItem('nexus_card_history') || '[]');
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">Chưa có giao dịch nạp thẻ nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(item => {
        const statusBadge = item.status === 1 ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Thành Công</span>' :
            item.status === 99 ? '<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Chờ Duyệt</span>' :
            '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Thất Bại</span>';

        return `
            <tr>
                <td>${new Date(item.time).toLocaleString('vi-VN')}</td>
                <td><strong>${item.telco}</strong></td>
                <td>${item.amount.toLocaleString()} đ</td>
                <td><code>${item.serial || '***'}</code></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

// ==================== INITIAL DATA LOAD ====================
async function loadBotStatus() {
    try {
        const res = await fetch('/api/bot/status');
        const data = await res.json();
        if (data.success) {
            saasState.zaloBotRunning = data.status.zaloBotRunning;
            saasState.teleBotRunning = data.status.teleBotRunning;
            saasState.approvedChats = data.approvedChats || {};
            updateZaloBotSwitch();
            updateTeleBotSwitch();
            renderApprovedChats();
        }
    } catch (e) {}
}

async function checkZaloAuthStatus() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        saasState.zaloLoggedIn = data.isLoggedIn;
        saasState.zaloUser = data.user;

        const badge = document.getElementById('zaloAccountStatusBadge');
        if (badge) {
            if (data.isLoggedIn) {
                badge.className = 'badge badge-success';
                badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã Đăng Nhập: ${data.user?.name || data.user?.uid}`;
            } else {
                badge.className = 'badge badge-warning';
                badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Chưa Đăng Nhập Zalo`;
            }
        }
    } catch (e) {}
}

// ==================== TABS NAVIGATION ====================
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    const sections = document.querySelectorAll('.saas-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            navButtons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            btn.classList.add('active');
            const targetSec = document.getElementById(target);
            if (targetSec) targetSec.classList.add('active');
        });
    });
}

// ==================== MAIN INITIALIZER ====================
function bootNexusApp() {
    try {
        initAntiF12Protection();
        initGatekeeperAuth();
        initNavigation();
        initZaloBotControls();
        initTeleBotControls();
        initPaymentSystem();
        renderCardHistory();
        checkZaloAuthStatus();
        console.log('[Nexus Core]: System initialized successfully.');
    } catch (err) {
        console.error('[Nexus Core Init Error]:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNexusApp);
} else {
    bootNexusApp();
}
