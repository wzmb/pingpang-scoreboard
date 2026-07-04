const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 获取局域网 IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过内部和非 IPv4 地址
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

app.get('/api/config', (req, res) => {
    res.json({
        ip: getLocalIP(),
        port: process.env.PORT || 3000
    });
});

// Socket.io 通信逻辑
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 大屏端加入
    socket.on('join-screen', (roomId) => {
        socket.join(roomId);
        console.log(`Screen joined room: ${roomId}`);
    });

    // 遥控端加入
    socket.on('join-remote', (roomId) => {
        socket.join(roomId);
        console.log(`Remote joined room: ${roomId}`);
        // 遥控端加入后，通知大屏端（和可能存在的其他遥控端）同步最新状态
        io.to(roomId).emit('remote-connected');
    });

    // 处理加减分命令（从遥控器发往大屏）
    socket.on('command', (data) => {
        const { roomId, action } = data;
        // 转发给该房间的所有客户端，由大屏处理计算，遥控器等待大屏下发 sync-state
        io.to(roomId).emit('command', action);
    });

    // 处理队名更新命令（从遥控器发往大屏）
    socket.on('update-team-names', (data) => {
        const { roomId, leftName, rightName } = data;
        io.to(roomId).emit('update-team-names', { leftName, rightName });
    });

    // 处理交换场地命令
    socket.on('swap-teams', (data) => {
        const { roomId } = data;
        io.to(roomId).emit('swap-teams');
    });

    // 大屏端同步最新比分状态给遥控器
    socket.on('sync-state', (data) => {
        const { roomId, state } = data;
        // 使用 io.to 发送给房间内所有人（包括多个遥控器）
        io.to(roomId).emit('state-updated', state);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`\n=========================================`);
    console.log(`Server is running!`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`Network Access: http://${ip}:${PORT}`);
    console.log(`=========================================\n`);
});
