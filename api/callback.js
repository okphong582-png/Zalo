/**
 * API Route: /api/callback
 * Nhận payload POST từ Apple ProfileService sau khi người dùng cài hồ sơ cấu hình trên iPhone,
 * trích xuất UDID và chuyển hướng 301 quay lại web Safari kèm thông số UDID.
 */

function getRawBody(req) {
    return new Promise((resolve) => {
        if (req.body && typeof req.body === 'string') {
            return resolve(req.body);
        }
        if (req.body && Buffer.isBuffer(req.body)) {
            return resolve(req.body.toString('utf-8'));
        }
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve(buf.toString('utf-8'));
        });
        req.on('error', () => resolve(''));
    });
}

module.exports = async (req, res) => {
    // Chỉ xử lý POST từ thiết bị iOS
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).send('Chỉ chấp nhận phương thức POST từ thiết bị Apple.');
    }

    try {
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');

        const rawData = await getRawBody(req);

        // Trích xuất các trường từ XML plist được Apple gửi về
        const extractField = (key) => {
            const regex = new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]+)<\\/string>`, 'i');
            const match = rawData.match(regex);
            return match ? match[1].trim() : '';
        };

        const udid = extractField('UDID');
        const product = extractField('PRODUCT');
        const version = extractField('VERSION');
        const deviceName = extractField('DEVICE_NAME');
        const serial = extractField('SERIAL');
        const imei = extractField('IMEI');

        console.log('[Apple iOS Callback Received]:', { udid, product, version, deviceName, serial, imei });

        // Tạo URL chuyển hướng trả về trang hiển thị mã
        const queryParams = new URLSearchParams();
        if (udid) queryParams.set('udid', udid);
        if (product) queryParams.set('model', product);
        if (version) queryParams.set('version', version);
        if (deviceName) queryParams.set('name', deviceName);
        if (serial) queryParams.set('serial', serial);
        if (imei) queryParams.set('imei', imei);

        const targetUrl = `${proto}://${host}/?${queryParams.toString()}`;

        // QUAN TRỌNG: Apple ProfileService BẮT BUỘC HTTP status 301 (Moved Permanently)
        // để tự động kích hoạt iOS mở lại trình duyệt Safari và trả về trang đích.
        res.writeHead(301, {
            Location: targetUrl,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0'
        });
        res.end();
    } catch (err) {
        console.error('[Callback Error]:', err);
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
        res.writeHead(301, {
            Location: `${proto}://${host}/?error=${encodeURIComponent(err.message)}`
        });
        res.end();
    }
};

// Cấu hình Vercel Serverless Function: tắt bodyParser mặc định để đọc raw body từ Apple
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
