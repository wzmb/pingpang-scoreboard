const socket = io();

// 比赛状态
let state = {
    leftScore: 0,
    rightScore: 0,
    leftSets: 0,
    rightSets: 0,
    server: 'left', // 'left' 或 'right'
    leftName: '主队',
    rightName: '客队',
    isSwapped: false,
    currentSetDecided: false, // 标记当前局是否已决出胜负
    lastSetWinner: null, // 记录当前局的胜者，用于撤销局分
    serverOffset: 0 // 手动换发球方的偏移量
};

// 生成唯一的房间ID
const roomId = Math.random().toString(36).substring(2, 8);

// DOM 元素
const leftTeamEl = document.querySelector('.left-team');
const rightTeamEl = document.querySelector('.right-team');
const leftScoreEl = document.getElementById('left-score');
const rightScoreEl = document.getElementById('right-score');
const leftSetsEl = document.getElementById('left-sets');
const rightSetsEl = document.getElementById('right-sets');
const leftServeEl = document.getElementById('left-serve');
const rightServeEl = document.getElementById('right-serve');
const leftNameEl = document.getElementById('left-name');
const rightNameEl = document.getElementById('right-name');
const qrPanel = document.getElementById('qr-panel');
const resetBtn = document.getElementById('reset-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const topControls = document.querySelector('.top-controls');

// 标识当前是大屏端
const isScreen = true;

// 初始化
async function init() {
    // 获取本机局域网 IP
    const res = await fetch('/api/config');
    const config = await res.json();

    // 生成遥控器 URL
    const remoteUrl = `http://${config.ip}:${config.port}/remote.html?room=${roomId}`;

    // 清除旧二维码
    const qrcodeEl = document.getElementById('qrcode');
    qrcodeEl.innerHTML = '';

    // 生成二维码 (尺寸缩小一半，即面积1/4)
    new QRCode(qrcodeEl, {
        text: remoteUrl,
        width: 100,
        height: 100,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L // 缩小尺寸后，降低纠错级别让二维码点阵变大，更容易扫
    });

    // 移除 QRCode 库自动生成的 title 属性，防止悬停出现系统提示框
    // QRCode.js 会将 title 添加到传入的容器 div 上，因此直接移除 div 上的 title
    qrcodeEl.removeAttribute('title');

    // 延时移除 img 上的 title（部分浏览器或异步渲染可能导致立即移除失败）
    setTimeout(() => {
        qrcodeEl.removeAttribute('title');
        const qrImage = qrcodeEl.querySelector('img');
        if (qrImage) {
            qrImage.removeAttribute('title');
        }
    }, 50);

    // 将网址显示在文本容器中
    const qrUrlTextEl = document.getElementById('qr-url-text');
    if (qrUrlTextEl) {
        qrUrlTextEl.innerHTML = `扫描二维码打开遥控界面<br><span class="url-link">${remoteUrl}</span>`;
    }

    // 加入房间
    socket.emit('join-screen', roomId);
    updateUI();

    // 自动聚焦到页面，方便使用键盘快捷键
    document.body.focus();
}

// 计算发球权
function calculateServer() {
    const totalPoints = state.leftScore + state.rightScore;
    let isLeftServing = true;

    // 如果是 10-10 之后的平局阶段 (Deuce)，每球换发
    if (state.leftScore >= 10 && state.rightScore >= 10) {
        isLeftServing = totalPoints % 2 === 0;
    } else {
        // 正常阶段，每 2 分换发球
        const serveTurn = Math.floor(totalPoints / 2);
        isLeftServing = serveTurn % 2 === 0;
    }

    // 应用手动换发球的偏移量
    if ((state.serverOffset || 0) % 2 !== 0) {
        isLeftServing = !isLeftServing;
    }

    return isLeftServing ? 'left' : 'right';
}

// 检查是否有人胜出这局
function checkGameWin() {
    if ((state.leftScore >= 11 || state.rightScore >= 11) && Math.abs(state.leftScore - state.rightScore) >= 2) {
        // 判断是谁刚刚赢得了这一局（分数大的那一方）
        // 只有当局分还没有增加过（即刚好达到赢局条件时），才增加局分
        // 并且不再自动清零比分

        // 我们需要一个标记来知道当前这一局是否已经计算过局分
        if (!state.currentSetDecided) {
            if (state.leftScore > state.rightScore) {
                state.leftSets += 1;
                state.lastSetWinner = 'left';
            } else {
                state.rightSets += 1;
                state.lastSetWinner = 'right';
            }
            state.currentSetDecided = true; // 标记本局已分出胜负
        }
    } else {
        // 如果比分回退到未分出胜负的状态（比如点错了减分），取消标记并撤销局分
        if (state.currentSetDecided) {
            if (state.lastSetWinner === 'left' && state.leftSets > 0) {
                state.leftSets -= 1;
            } else if (state.lastSetWinner === 'right' && state.rightSets > 0) {
                state.rightSets -= 1;
            }
            state.currentSetDecided = false;
            state.lastSetWinner = null;
        }
    }
}

// 带 3D 翻转动效的数字更新
function updateScoreWithFlip(el, newVal) {
    if (el.innerText === newVal.toString()) return;

    // 如果正在动画中，先清除之前的计时器防抖
    if (el.flipTimeout1) clearTimeout(el.flipTimeout1);
    if (el.flipTimeout2) clearTimeout(el.flipTimeout2);

    // 强制重置动画
    el.classList.remove('flipping');
    void el.offsetWidth; // 触发浏览器重绘

    el.classList.add('flipping');

    // 动画时长为 300ms，在 150ms（刚好翻转到 90 度不可见时）替换数字
    el.flipTimeout1 = setTimeout(() => {
        el.innerText = newVal;
        // 判断是否为两位数及以上
        if (newVal >= 10) {
            el.classList.add('two-digits');
        } else {
            el.classList.remove('two-digits');
        }
    }, 150);

    // 动画结束移除 class
    el.flipTimeout2 = setTimeout(() => {
        el.classList.remove('flipping');
    }, 300);
}

// 更新 UI
function updateUI() {
    updateScoreWithFlip(leftScoreEl, state.leftScore);
    updateScoreWithFlip(rightScoreEl, state.rightScore);

    // 初始化时也需要检查是否需要加上 two-digits 类
    if (state.leftScore >= 10) leftScoreEl.classList.add('two-digits');
    else leftScoreEl.classList.remove('two-digits');

    if (state.rightScore >= 10) rightScoreEl.classList.add('two-digits');
    else rightScoreEl.classList.remove('two-digits');

    leftSetsEl.innerText = state.leftSets;
    rightSetsEl.innerText = state.rightSets;

    // 更新队伍名称
    leftNameEl.innerText = state.leftName || '主队';
    rightNameEl.innerText = state.rightName || '客队';

    // 更新颜色类名 (大屏背景色、文字颜色等通过 CSS 类控制)
    if (state.isSwapped) {
        // 交换后：左蓝右红
        leftTeamEl.classList.remove('color-red');
        leftTeamEl.classList.add('color-blue');
        rightTeamEl.classList.remove('color-blue');
        rightTeamEl.classList.add('color-red');
    } else {
        // 默认：左红右蓝
        leftTeamEl.classList.remove('color-blue');
        leftTeamEl.classList.add('color-red');
        rightTeamEl.classList.remove('color-red');
        rightTeamEl.classList.add('color-blue');
    }

    state.server = calculateServer();

    // 更新发球方指示器 (大屏使用比分下划线)
    // 注意：state.server 记录的是逻辑上的红队(left)和蓝队(right)
    // 但是 leftScoreEl 永远在左边，rightScoreEl 永远在右边
    // 所以需要结合 isSwapped 来判断物理位置
    const isLeftServing = state.server === 'left';

    if ((!state.isSwapped && isLeftServing) || (state.isSwapped && !isLeftServing)) {
        // 物理左侧发球
        leftScoreEl.classList.add('is-serving');
        rightScoreEl.classList.remove('is-serving');
    } else {
        // 物理右侧发球
        rightScoreEl.classList.add('is-serving');
        leftScoreEl.classList.remove('is-serving');
    }

    // 同步给遥控器
    socket.emit('sync-state', { roomId, state });
}

// 监听遥控器命令
socket.on('command', (action) => {
    // 只有大屏端才处理积分逻辑，防止多台设备重复计算
    if (!isScreen) return;

    switch (action) {
        case 'left-add':
            state.leftScore++;
            checkGameWin();
            break;
        case 'left-sub':
            if (state.leftScore > 0) {
                state.leftScore--;
                checkGameWin(); // 减分时也需要检查，可能会撤销刚刚赢下的一局
            }
            break;
        case 'right-add':
            state.rightScore++;
            checkGameWin();
            break;
        case 'right-sub':
            if (state.rightScore > 0) {
                state.rightScore--;
                checkGameWin(); // 减分时也需要检查
            }
            break;
        case 'next-set':
            if (state.currentSetDecided) {
                state.leftScore = 0;
                state.rightScore = 0;
                state.currentSetDecided = false;
                state.lastSetWinner = null;
                state.serverOffset = (state.serverOffset || 0) + 1; // 下一局自动换发球方
            }
            break;
        case 'reset-match':
            performReset();
            break;
        case 'toggle-fullscreen':
            toggleFullscreen();
            break;
        case 'switch-server':
            state.serverOffset = (state.serverOffset || 0) + 1;
            break;
    }
    updateUI();
});

// 遥控器连接时同步状态
socket.on('remote-connected', () => {
    socket.emit('sync-state', { roomId, state });
});

// 监听队名更新
socket.on('update-team-names', (data) => {
    state.leftName = data.leftName;
    state.rightName = data.rightName;
    updateUI();
});

// 监听交换场地
socket.on('swap-teams', () => {
    // 只有大屏端处理状态更新
    if (!isScreen) return;

    // 交换所有状态
    const tempState = {
        leftScore: state.rightScore,
        rightScore: state.leftScore,
        leftSets: state.rightSets,
        rightSets: state.leftSets,
        leftName: state.rightName,
        rightName: state.leftName,
        server: state.server === 'left' ? 'right' : 'left',
        isSwapped: !state.isSwapped,
        currentSetDecided: state.currentSetDecided,
        lastSetWinner: state.lastSetWinner === 'left' ? 'right' : (state.lastSetWinner === 'right' ? 'left' : null),
        serverOffset: state.serverOffset
    };

    state = tempState;
    updateUI();
});

// 执行重置比赛逻辑
function performReset() {
    state = {
        leftScore: 0,
        rightScore: 0,
        leftSets: 0,
        rightSets: 0,
        server: 'left',
        leftName: '主队',
        rightName: '客队',
        isSwapped: false,
        currentSetDecided: false,
        lastSetWinner: null,
        serverOffset: 0
    };
    updateUI();

    // 重置后重新聚焦到页面
    document.body.focus();
}

// 重置比赛
resetBtn.addEventListener('click', () => {
    if (confirm('确定要重置整场比赛吗？')) {
        performReset();
    }
});

// 点击全屏区域外的交互逻辑已被清理
// 原本点击隐藏二维码的逻辑已移除，因为二维码现在常驻右下角

// 全屏切换逻辑
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);

// 键盘快捷键监听
document.addEventListener('keydown', (e) => {
    // 按 'f' 或 'F' 键切换全屏
    if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
    }
    // 按 'r' 或 'R' 键重置比赛
    if (e.key === 'r' || e.key === 'R') {
        resetBtn.click();
    }
});

// 监听全屏状态变化更新按钮文本
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        fullscreenBtn.innerText = '退出全屏 (F)';
        fullscreenBtn.title = '退出全屏 (F)';
    } else {
        fullscreenBtn.innerText = '全屏显示 (F)';
        fullscreenBtn.title = '全屏显示 (F)';
    }
});

// 全屏按钮、二维码和界面的自动隐藏逻辑 (鼠标静止 3 秒后隐藏)
let mouseTimeout;
function resetMouseTimer() {
    // 鼠标移动时，显示按钮和二维码
    topControls.classList.remove('hidden');
    qrPanel.classList.remove('hidden');
    document.body.style.cursor = 'default';

    clearTimeout(mouseTimeout);
    mouseTimeout = setTimeout(() => {
        // 只有在全屏模式下，或者不需要操作时，才隐藏按钮、二维码和鼠标
        topControls.classList.add('hidden');
        qrPanel.classList.add('hidden');
        if (document.fullscreenElement) {
            document.body.style.cursor = 'none';
        }
    }, 3000);
}

document.addEventListener('mousemove', resetMouseTimer);
document.addEventListener('click', resetMouseTimer);
// 初始化触发一次
resetMouseTimer();

init();
