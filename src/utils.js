const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const gradient = require('gradient-string');
const figlet = require('figlet');

/**
 * Hiển thị Banner Zalo Tool
 */
function displayBanner() {
    console.clear();
    const bannerText = figlet.textSync('ZALO BOT PRO', {
        font: 'Standard',
        horizontalLayout: 'fitted'
    });
    console.log(gradient.pastel.multiline(bannerText));
    console.log(chalk.cyan.bold('='.repeat(65)));
    console.log(chalk.yellow.bold('  🚀 TOOL ZALO MARKETING & GROUP MANAGER (NODEJS ZLAPI)'));
    console.log(chalk.green('  📌 Phiên bản: 1.0.0 | Tác giả: Antigravity AI'));
    console.log(chalk.cyan.bold('='.repeat(65)));
    console.log('');
}

/**
 * Chuẩn hóa Cookies từ nhiều định dạng khác nhau:
 * - Chuỗi header: "zpw_sek=...; _ga=...; z_uuid=..."
 * - JSON Array: [{ "name": "zpw_sek", "value": "..." }]
 * - JSON Object từ Cookie-Editor / J2Team
 */
function normalizeCookies(input) {
    if (!input) return [];
    if (typeof input === 'object') {
        if (Array.isArray(input)) return input;
        if (input.cookies && Array.isArray(input.cookies)) return input.cookies;
    }

    let trimmed = String(input).trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
            if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed.cookies;
        } catch (e) {
            // Không phải JSON hợp lệ, tiếp tục phân tích dạng string
        }
    }

    // Phân tích cú pháp dạng key=value; key2=value2
    const pairs = trimmed.split(';').map(s => s.trim()).filter(Boolean);
    const cookies = [];
    for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > -1) {
            const name = pair.substring(0, idx).trim();
            const value = pair.substring(idx + 1).trim();
            cookies.push({
                name: name,
                key: name,
                value: value,
                domain: 'chat.zalo.me',
                path: '/'
            });
        }
    }
    return cookies;
}

/**
 * Xử lý Spin Text: "{Chào bạn|Hi bạn|Hello bạn} chúc bạn {ngày mới tốt lành|buổi sáng vui vẻ}"
 */
function processSpinText(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
        const options = choices.split('|').map(s => s.trim());
        if (options.length === 0) return match;
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
    });
}

/**
 * Thay thế biến cá nhân hóa: {name}, {id}, {group_name}
 */
function personalizeText(template, user = {}) {
    if (!template) return '';
    let result = template;
    const name = user.displayName || user.zaloName || user.name || 'Bạn';
    const id = user.id || user.uid || '';
    
    result = result.replace(/\{name\}/gi, name);
    result = result.replace(/\{id\}/gi, id);
    result = result.replace(/\{uid\}/gi, id);
    return processSpinText(result);
}

/**
 * Hàm delay (milliseconds)
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Xuất dữ liệu ra file (JSON / TXT / CSV)
 */
function exportMembersToFile(members, groupName, format = 'txt') {
    const dataDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const cleanGroupName = (groupName || 'group').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `members_${cleanGroupName}_${timestamp}.${format}`;
    const filePath = path.join(dataDir, fileName);

    if (format === 'json') {
        fs.writeFileSync(filePath, JSON.stringify(members, null, 2), 'utf-8');
    } else if (format === 'csv') {
        let csvContent = '\uFEFFSTT,User ID,Tên hiển thị,Tên Zalo\n';
        members.forEach((m, idx) => {
            csvContent += `${idx + 1},"${m.id}","${(m.displayName || '').replace(/"/g, '""')}","${(m.zaloName || '').replace(/"/g, '""')}"\n`;
        });
        fs.writeFileSync(filePath, csvContent, 'utf-8');
    } else {
        // Mặc định dạng TXT (ID|Tên)
        let txtContent = `# Danh sách thành viên nhóm: ${groupName}\n# Tổng số: ${members.length}\n\n`;
        members.forEach((m, idx) => {
            txtContent += `${idx + 1}. ID: ${m.id} | Tên: ${m.displayName || m.zaloName || 'N/A'}\n`;
        });
        fs.writeFileSync(filePath, txtContent, 'utf-8');
    }

    return filePath;
}

module.exports = {
    displayBanner,
    normalizeCookies,
    processSpinText,
    personalizeText,
    sleep,
    exportMembersToFile
};
