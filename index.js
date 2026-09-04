/**
 * ZALO MARKETING PRO - ULTRA-PREMIUM SUITE LAUNCHER
 * Tự động khởi chạy Web Dashboard Siêu Đẹp & High-Tech Control Panel
 */

const { startServer } = require('./server');
const { displayBanner } = require('./src/utils');
const chalk = require('chalk');

async function main() {
    displayBanner();
    console.log(chalk.cyan.bold('⚡ Đang khởi động Zalo Marketing Pro Web Dashboard...'));
    startServer(true);
}

main().catch(err => {
    console.error(chalk.red.bold(`❌ Lỗi khởi động: ${err.message}`));
});
