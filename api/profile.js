/**
 * API Route: /api/profile
 * Tạo và tải về hồ sơ cấu hình .mobileconfig chuẩn Apple OTA Profile Service
 * Hoạt động 100% native không cần thư viện ngoài (Tương thích Vercel & Node.js thuần).
 */
module.exports = (req, res) => {
    // Xác định host và giao thức (Tự động hỗ trợ Vercel, Domain tùy chỉnh hoặc Localhost)
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const callbackUrl = `${proto}://${host}/api/callback`;

    // Cấu trúc Apple MobileConfig Plist
    const mobileConfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <dict>
        <key>URL</key>
        <string>${callbackUrl}</string>
        <key>DeviceAttributes</key>
        <array>
            <string>UDID</string>
            <string>DEVICE_NAME</string>
            <string>VERSION</string>
            <string>PRODUCT</string>
            <string>SERIAL</string>
            <string>IMEI</string>
        </array>
    </dict>
    <key>PayloadOrganization</key>
    <string>Lấy Mã UDID Thiết Bị</string>
    <key>PayloadDisplayName</key>
    <string>Cài Đặt Lấy UDID iPhone</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadUUID</key>
    <string>2C3F2A40-7A0B-4D1E-8B39-44F4E2C7D6A1</string>
    <key>PayloadIdentifier</key>
    <string>com.udid.apple.profile</string>
    <key>PayloadDescription</key>
    <string>Hồ sơ này hỗ trợ trích xuất mã UDID thiết bị Apple iPhone / iPad để phục vụ cài app hoặc đăng ký thiết bị.</string>
    <key>PayloadType</key>
    <string>Profile Service</string>
</dict>
</plist>`;

    // Thiết lập Header bắt buộc để iOS nhận diện là file cấu hình
    res.writeHead(200, {
        'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
        'Content-Disposition': 'attachment; filename="get_udid.mobileconfig"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    res.end(mobileConfigXml);
};
