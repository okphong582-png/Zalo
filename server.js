const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const profileHandler = require('./api/profile');
const callbackHandler = require('./api/callback');

const PORT = process.env.PORT || 3000;

function serveStatic(res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Route tải hồ sơ .mobileconfig
    if (pathname === '/api/profile' || pathname === '/udid.mobileconfig') {
        return profileHandler(req, res);
    }

    // Route nhận callback từ thiết bị Apple
    if (pathname === '/api/callback') {
        return callbackHandler(req, res);
    }

    // Static files trong thư mục public
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);

    // Fallback về index.html nếu không tìm thấy tệp (cho phép URL có query param)
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };

    serveStatic(res, filePath, mimeTypes[ext] || 'application/octet-stream');
});

server.listen(PORT, () => {
    console.log(`\n✨ ===================================================`);
    console.log(`🚀 WEB LẤY MÃ UDID IPHONE ĐANG CHẠY TẠI:`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📱 Mở trên iPhone Safari để lấy mã UDID tự động`);
    console.log(`✨ ===================================================\n`);
});
