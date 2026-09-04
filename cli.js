/**
 * ZALO MARKETING PRO - HIGH-TECH CONSOLE CLI MODE
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const path = require('path');
const fs = require('fs');
const zaloService = require('./src/zaloService');
const {
    displayBanner,
    personalizeText,
    sleep,
    exportMembersToFile
} = require('./src/utils');

async function main() {
    displayBanner();

    // Tự động kiểm tra session đã lưu
    if (zaloService.session && zaloService.session.cookie && zaloService.session.imei) {
        console.log(chalk.cyan('🔄 Phát hiện phiên đăng nhập đã lưu. Đang tự động kết nối...'));
        try {
            const user = await zaloService.login({
                cookie: zaloService.session.cookie,
                imei: zaloService.session.imei,
                userAgent: zaloService.session.userAgent
            });
            console.log(chalk.green.bold(`✅ Tự động đăng nhập thành công: ${chalk.yellow.bold(user.name)} (ID: ${user.uid})\n`));
        } catch (err) {
            console.log(chalk.red(`⚠️ Không thể khôi phục phiên cũ: ${err.message}. Vui lòng đăng nhập lại.\n`));
        }
    }

    while (true) {
        const isLoggedIn = zaloService.isLoggedIn();
        const accountDisplay = isLoggedIn
            ? chalk.green.bold(`[ĐÃ ĐĂNG NHẬP: ${zaloService.currentUser.name} (${zaloService.currentUser.uid})]`)
            : chalk.red.bold('[CHƯA ĐĂNG NHẬP]');

        console.log(chalk.white.bold(`\nTrạng thái tài khoản: ${accountDisplay}`));

        const { choice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'Vui lòng chọn chức năng:',
                pageSize: 10,
                choices: [
                    {
                        name: '🔑 1. Đăng nhập tài khoản Zalo (Nhập Cookie & IMEI)',
                        value: 'login'
                    },
                    {
                        name: '👥 2. Quản lý nhóm (Danh sách nhóm & Hiện tất cả thành viên: Tên, UID)',
                        value: 'groups'
                    },
                    {
                        name: '📢 3. Gửi tin nhắn Ads cho từng thành viên (Gửi Thật - Văn bản / File / Ảnh)',
                        value: 'send_ads'
                    },
                    {
                        name: '🌐 4. Mở Giao Diện Web Dashboard Cao Cấp (Browser GUI)',
                        value: 'open_web'
                    },
                    {
                        name: '🚪 5. Thoát chương trình',
                        value: 'exit'
                    }
                ]
            }
        ]);

        switch (choice) {
            case 'login':
                await handleLogin();
                break;
            case 'groups':
                await handleGroupManager();
                break;
            case 'send_ads':
                await handleSendAds();
                break;
            case 'open_web':
                const open = require('open');
                console.log(chalk.cyan('\n🌐 Đang mở Web Dashboard tại http://localhost:3000...'));
                try { await open('http://localhost:3000'); } catch(e) {}
                break;
            case 'exit':
                console.log(chalk.yellow('\nCảm ơn bạn đã sử dụng Zalo Marketing Pro! Hẹn gặp lại.'));
                process.exit(0);
        }
    }
}

async function handleLogin() {
    console.log(chalk.cyan.bold('\n' + '='.repeat(60)));
    console.log(chalk.yellow.bold('  🔑 ĐĂNG NHẬP TÀI KHOẢN ZALO (COOKIE & IMEI)'));
    console.log(chalk.cyan.bold('='.repeat(60)));

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'cookie',
            message: 'Nhập Cookies Zalo (chuỗi zpw_sek=... hoặc định dạng JSON):',
            validate: input => input.trim().length > 0 ? true : 'Cookie không được để trống!'
        },
        {
            type: 'input',
            name: 'imei',
            message: 'Nhập IMEI tài khoản Zalo:',
            validate: input => input.trim().length > 0 ? true : 'IMEI không được để trống!'
        }
    ]);

    try {
        console.log(chalk.blue('\n⏳ Đang tiến hành đăng nhập và xác thực với Zalo...'));
        const user = await zaloService.login({
            cookie: answers.cookie.trim(),
            imei: answers.imei.trim()
        });

        console.log(chalk.green.bold('\n🎉 ĐĂNG NHẬP THÀNH CÔNG!'));
        console.log(chalk.white(`👤 Tên tài khoản: ${chalk.yellow.bold(user.name)}`));
        console.log(chalk.white(`🆔 User ID (Zalo ID): ${chalk.yellow.bold(user.uid)}`));
        console.log(chalk.gray('💾 Phiên đăng nhập đã được lưu vào session.json cho các lần sau.'));
    } catch (err) {
        console.log(chalk.red.bold(`\n❌ Đăng nhập thất bại: ${err.message}`));
    }

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại menu...' }]);
}

async function handleGroupManager() {
    if (!zaloService.isLoggedIn()) {
        console.log(chalk.red.bold('\n❌ Bạn chưa đăng nhập! Vui lòng chọn mục 1 để đăng nhập trước.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    console.log(chalk.blue('\n⏳ Đang tải danh sách nhóm của bạn...'));
    let groups = [];
    try {
        groups = await zaloService.getGroupList();
    } catch (err) {
        console.log(chalk.red.bold(`\n❌ Lỗi khi tải danh sách nhóm: ${err.message}`));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    if (groups.length === 0) {
        console.log(chalk.yellow('\n⚠️ Tài khoản này hiện không tham gia nhóm nào.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    const groupChoices = groups.map((g, idx) => ({
        name: `[${idx + 1}] ${g.name} (ID: ${g.id}) - ${chalk.cyan(g.totalMember + ' thành viên')}`,
        value: g.id
    }));
    groupChoices.push({ name: chalk.gray('🔙 Quay lại menu chính'), value: 'back' });

    const { selectedGroupId } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedGroupId',
            message: `Tìm thấy ${groups.length} nhóm. Chọn nhóm để xem thành viên:`,
            pageSize: 15,
            choices: groupChoices
        }
    ]);

    if (selectedGroupId === 'back') return;

    const selectedGroup = groups.find(g => g.id === selectedGroupId);
    console.log(chalk.blue(`\n⏳ Đang lấy toàn bộ thành viên nhóm: "${selectedGroup.name}"...`));

    try {
        const groupInfo = await zaloService.getGroupMembers(selectedGroupId);
        const members = groupInfo.members;

        console.log(chalk.green.bold(`\n👥 TỔNG SỐ THÀNH VIÊN QUÉT ĐƯỢC: ${members.length} THÀNH VIÊN`));

        const table = new Table({
            head: [chalk.cyan('STT'), chalk.cyan('Tên Hiển Thị'), chalk.cyan('Tên Zalo'), chalk.cyan('User ID (Zalo ID)')],
            colWidths: [6, 25, 25, 25],
            wordWrap: true
        });

        const previewLimit = 50;
        members.slice(0, previewLimit).forEach((m, idx) => {
            table.push([idx + 1, m.displayName || 'N/A', m.zaloName || 'N/A', chalk.yellow(m.id)]);
        });

        console.log(table.toString());
        if (members.length > previewLimit) {
            console.log(chalk.gray(`... và ${members.length - previewLimit} thành viên khác.`));
        }

        const { postAction } = await inquirer.prompt([
            {
                type: 'list',
                name: 'postAction',
                message: 'Bạn muốn làm gì tiếp theo?',
                choices: [
                    { name: '📄 Xuất danh sách ra file Excel / CSV', value: 'export_csv' },
                    { name: '📝 Xuất danh sách ra file TXT', value: 'export_txt' },
                    { name: '📢 Gửi tin nhắn Ads cho toàn bộ thành viên nhóm này', value: 'send_now' },
                    { name: '🔙 Quay lại', value: 'back' }
                ]
            }
        ]);

        if (postAction === 'export_csv' || postAction === 'export_txt') {
            const format = postAction === 'export_csv' ? 'csv' : 'txt';
            const savedPath = exportMembersToFile(members, groupInfo.groupName, format);
            console.log(chalk.green.bold(`\n✅ Đã xuất thành công tại: ${savedPath}`));
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để tiếp tục...' }]);
        } else if (postAction === 'send_now') {
            await handleSendAds(members, `Nhóm: ${groupInfo.groupName}`);
        }
    } catch (err) {
        console.log(chalk.red.bold(`\n❌ Lỗi khi lấy thành viên: ${err.message}`));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
    }
}

async function handleSendAds(preloadedMembers = null, sourceName = '') {
    if (!zaloService.isLoggedIn()) {
        console.log(chalk.red.bold('\n❌ Bạn chưa đăng nhập! Vui lòng đăng nhập trước.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    let targetMembers = preloadedMembers;
    let campaignSource = sourceName;

    if (!targetMembers) {
        console.log(chalk.cyan.bold('\n' + '='.repeat(60)));
        console.log(chalk.yellow.bold('  📢 GỬI TIN NHẮN ADS CHO THÀNH VIÊN (GỬI THẬT)'));
        console.log(chalk.cyan.bold('='.repeat(60)));

        const { targetType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'targetType',
                message: 'Chọn nguồn đối tượng nhận tin:',
                choices: [
                    { name: '👥 1. Chọn từ một Nhóm Zalo', value: 'from_group' },
                    { name: '✍️  2. Nhập danh sách User ID thủ công', value: 'manual_ids' },
                    { name: '🔙 Quay lại', value: 'back' }
                ]
            }
        ]);

        if (targetType === 'back') return;

        if (targetType === 'from_group') {
            const groups = await zaloService.getGroupList();
            const groupChoices = groups.map((g, idx) => ({
                name: `[${idx + 1}] ${g.name} (${g.totalMember} TV)`,
                value: g.id
            }));

            const { gId } = await inquirer.prompt([
                { type: 'list', name: 'gId', message: 'Chọn nhóm để quét thành viên gửi tin:', choices: groupChoices }
            ]);

            const gInfo = await zaloService.getGroupMembers(gId);
            targetMembers = gInfo.members;
            campaignSource = `Nhóm: ${gInfo.groupName}`;
        } else if (targetType === 'manual_ids') {
            const { rawIds } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'rawIds',
                    message: 'Nhập các User ID (cách nhau bằng dấu phẩy hoặc khoảng trắng):'
                }
            ]);
            const ids = rawIds.split(/[\s,]+/).filter(id => id.trim().length > 0);
            targetMembers = ids.map(id => ({ id: id.trim(), displayName: `User_${id.trim()}`, zaloName: `User_${id.trim()}` }));
            campaignSource = `${targetMembers.length} User ID nhập thủ công`;
        }
    }

    if (!targetMembers || targetMembers.length === 0) {
        console.log(chalk.red('\n❌ Không có thành viên nào để gửi.'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    console.log(chalk.green.bold(`\n🎯 Đã nạp ${targetMembers.length} người nhận từ: ${campaignSource}\n`));

    // Nguồn nội dung tin nhắn
    const msgFilePath = path.join(process.cwd(), 'message.txt');
    const hasMsgFile = fs.existsSync(msgFilePath);

    const { textSource } = await inquirer.prompt([
        {
            type: 'list',
            name: 'textSource',
            message: 'Chọn cách nhập nội dung tin nhắn:',
            choices: [
                ...(hasMsgFile ? [{
                    name: '📄 1. Lấy nội dung từ file message.txt (Khuyên dùng: Hỗ trợ xuống nhiều dòng, icon emoji, link nhóm thoải mái)',
                    value: 'from_file'
                }] : []),
                { name: '✍️  2. Nhập trực tiếp trên màn hình console', value: 'manual' },
                { name: '⏩ 3. Bỏ qua phần chữ (Chỉ gửi File hoặc Ảnh)', value: 'skip' }
            ]
        }
    ]);

    let textContent = '';
    if (textSource === 'from_file') {
        textContent = fs.readFileSync(msgFilePath, 'utf-8');
        console.log(chalk.cyan('\n📋 NỘI DUNG TỪ FILE message.txt:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.white(textContent));
        console.log(chalk.gray('─'.repeat(50)) + '\n');
    } else if (textSource === 'manual') {
        const { manualText } = await inquirer.prompt([
            { type: 'input', name: 'manualText', message: 'Nhập nội dung tin nhắn:' }
        ]);
        textContent = manualText || '';
    }

    const { filePath } = await inquirer.prompt([
        {
            type: 'input',
            name: 'filePath',
            message: 'Đường dẫn File hoặc Ảnh đính kèm (Enter để bỏ qua nếu chỉ gửi chữ):',
            validate: input => {
                const clean = input.trim().replace(/^["']|["']$/g, '');
                if (!clean) return true;
                if (!fs.existsSync(clean)) return `❌ Không tìm thấy file tại: ${clean}`;
                return true;
            }
        }
    ]);

    const cleanFilePath = filePath ? filePath.trim().replace(/^["']|["']$/g, '') : '';

    if (!textContent.trim() && !cleanFilePath) {
        console.log(chalk.red.bold('\n❌ Bạn phải có ít nhất 1 nội dung văn bản HOẶC 1 file đính kèm!'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
        return;
    }

    const { delaySeconds } = await inquirer.prompt([
        {
            type: 'number',
            name: 'delaySeconds',
            message: 'Độ trễ delay giữa mỗi tin nhắn (giây):',
            default: 5,
            validate: val => (val >= 1 ? true : 'Tối thiểu 1 giây!')
        }
    ]);

    let sendList = [...targetMembers];
    const myUid = zaloService.currentUser ? (zaloService.currentUser.uid || zaloService.currentUser.userId) : null;
    if (myUid) {
        sendList = sendList.filter(m => String(m.id) !== String(myUid));
    }

    console.log(chalk.cyan.bold('\n' + '='.repeat(65)));
    console.log(chalk.yellow.bold(`🚀 BẮT ĐẦU GỬI CHO ${sendList.length} NGƯỜI NHẬN...`));
    console.log(chalk.cyan.bold('='.repeat(65)) + '\n');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sendList.length; i++) {
        const member = sendList[i];
        const memberName = member.displayName || member.zaloName || `User_${member.id}`;
        const finalMsg = textContent.trim() ? personalizeText(textContent, member) : '';

        process.stdout.write(chalk.white(`[${i + 1}/${sendList.length}] Gửi tới: ${chalk.cyan.bold(memberName)} (${member.id})... `));

        try {
            const sendResult = await zaloService.sendMessageToUser({
                targetId: member.id,
                text: finalMsg,
                filePath: cleanFilePath || null
            });

            if (sendResult.success) {
                successCount++;
                console.log(chalk.green.bold('✅ THÀNH CÔNG'));
            } else {
                failCount++;
                console.log(chalk.red.bold(`❌ THẤT BẠI (${sendResult.error})`));
            }
        } catch (err) {
            failCount++;
            console.log(chalk.red.bold(`❌ LỖI (${err.message})`));
        }

        if (i < sendList.length - 1) {
            await sleep(delaySeconds * 1000);
        }
    }

    console.log(chalk.cyan.bold('\n' + '='.repeat(65)));
    console.log(chalk.yellow.bold('  🏁 KẾT QUẢ GỬI CHIẾN DỊCH'));
    console.log(chalk.cyan.bold('='.repeat(65)));
    console.log(chalk.green.bold(`✅ Thành công: ${successCount}`));
    console.log(chalk.red.bold(`❌ Thất bại: ${failCount}`));
    console.log(chalk.white(`📊 Tổng cộng: ${sendList.length}`));
    console.log(chalk.cyan.bold('='.repeat(65)));

    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Nhấn [Enter] để quay lại...' }]);
}

if (require.main === module) {
    main().catch(err => {
        console.error(chalk.red.bold(`\n❌ Đã xảy ra lỗi nghiêm trọng: ${err.message}`));
        process.exit(1);
    });
}

module.exports = { main };
