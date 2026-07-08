const socket = io();

// 比赛状态
let state = {
    leftScore: 0,
    rightScore: 0,
    leftSets: 0,
    rightSets: 0,
    server: 'left', // 'left' 或 'right'
    leftName: '红队',
    rightName: '蓝队',
    isSwapped: false,
    currentSetDecided: false, // 标记当前局是否已决出胜负
    lastSetWinner: null, // 记录当前局的胜者，用于撤销局分
    serverOffset: 0, // 手动换发球方的偏移量
    matchHistory: [], // 记录每局比分
    showHistory: false // 是否显示历史记录
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
const historyBtn = document.getElementById('history-btn');
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
        qrUrlTextEl.innerHTML = `1. 连接“主端手机”Wi-Fi热点<br>2. 扫描右侧二维码，打开遥控界面<br><span class="url-link">${remoteUrl}</span>`;
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
    leftNameEl.innerText = state.leftName || '红队';
    rightNameEl.innerText = state.rightName || '蓝队';

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

    // 渲染历史记录蒙层
    renderHistory();
}

// 渲染比赛历史
function renderHistory() {
    const historyOverlay = document.getElementById('history-overlay');
    if (!historyOverlay) return;

    if (!state.showHistory) {
        historyOverlay.classList.add('hidden');
        return;
    }
    historyOverlay.classList.remove('hidden');

    const headerTr = document.getElementById('history-header');
    const row1Tr = document.getElementById('history-row-1');
    const row2Tr = document.getElementById('history-row-2');

    // 获取逻辑队名（物理左侧永远对应初始状态的左侧/红队）
    const logicalLeftName = state.isSwapped ? state.rightName : state.leftName;
    const logicalRightName = state.isSwapped ? state.leftName : state.rightName;

    // 清空现有内容，重新拼接
    let headerHTML = '<th></th>';
    let row1HTML = `<td class="team-label color-red">${logicalLeftName}</td>`;
    let row2HTML = `<td class="team-label color-blue">${logicalRightName}</td>`;

    // 渲染已完成的局
    const history = state.matchHistory || [];
    history.forEach((h, index) => {
        headerHTML += `<th>${index + 1}</th>`;

        // 判断哪方胜出
        const leftWon = h.logicalLeftScore > h.logicalRightScore;
        const rightWon = h.logicalRightScore > h.logicalLeftScore;

        const leftScoreDisplay = leftWon ? `<span class="score-winner bg-red">${h.logicalLeftScore}</span>` : h.logicalLeftScore;
        const rightScoreDisplay = rightWon ? `<span class="score-winner bg-blue">${h.logicalRightScore}</span>` : h.logicalRightScore;

        row1HTML += `<td>${leftScoreDisplay}</td>`;
        row2HTML += `<td>${rightScoreDisplay}</td>`;
    });

    // 渲染当前局
    headerHTML += `<th>${history.length + 1}</th>`;
    const currentLogicalLeftScore = state.isSwapped ? state.rightScore : state.leftScore;
    const currentLogicalRightScore = state.isSwapped ? state.leftScore : state.rightScore;

    // 如果当前局已决出胜负，也需要给当前局的胜者加背景块
    let currentLeftScoreDisplay = currentLogicalLeftScore;
    let currentRightScoreDisplay = currentLogicalRightScore;

    if (state.currentSetDecided) {
        const currentLeftWon = currentLogicalLeftScore > currentLogicalRightScore;
        const currentRightWon = currentLogicalRightScore > currentLogicalLeftScore;

        currentLeftScoreDisplay = currentLeftWon ? `<span class="score-winner bg-red">${currentLogicalLeftScore}</span>` : currentLogicalLeftScore;
        currentRightScoreDisplay = currentRightWon ? `<span class="score-winner bg-blue">${currentLogicalRightScore}</span>` : currentLogicalRightScore;
    }

    row1HTML += `<td>${currentLeftScoreDisplay}</td>`;
    row2HTML += `<td>${currentRightScoreDisplay}</td>`;

    // 渲染最后一列：当前局分
    headerHTML += `<th></th>`;
    const logicalLeftSets = state.isSwapped ? state.rightSets : state.leftSets;
    const logicalRightSets = state.isSwapped ? state.leftSets : state.rightSets;

    row1HTML += `<td class="color-red">${logicalLeftSets}</td>`;
    row2HTML += `<td class="color-blue">${logicalRightSets}</td>`;

    headerTr.innerHTML = headerHTML;
    row1Tr.innerHTML = row1HTML;
    row2Tr.innerHTML = row2HTML;
}

// 监听遥控器命令
socket.on('command', (action) => {
    // 只有大屏端才处理积分逻辑，防止多台设备重复计算
    if (!isScreen) return;

    // 任何影响比分的操作都会自动关闭历史展示
    if (action !== 'toggle-history' && action !== 'toggle-fullscreen') {
        state.showHistory = false;
    }

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
        case 'wake-screen':
            resetMouseTimer();
            break;
        case 'next-set':
            if (state.currentSetDecided) {
                // 将刚完成的这局分数记录到历史中 (永远记录逻辑红队/蓝队的得分)
                state.matchHistory.push({
                    logicalLeftScore: state.isSwapped ? state.rightScore : state.leftScore,
                    logicalRightScore: state.isSwapped ? state.leftScore : state.rightScore
                });

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
        case 'toggle-history':
            state.showHistory = !state.showHistory;
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
        serverOffset: state.serverOffset,
        matchHistory: state.matchHistory,
        showHistory: state.showHistory
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
        leftName: '红队',
        rightName: '蓝队',
        isSwapped: false,
        currentSetDecided: false,
        lastSetWinner: null,
        serverOffset: 0,
        matchHistory: [],
        showHistory: false
    };
    updateUI();

    // 重置后重新聚焦到页面
    document.body.focus();
}

// 弹窗 DOM 元素
const resetModal = document.getElementById('reset-modal');
const resetCancelBtn = document.getElementById('reset-cancel');
const resetConfirmBtn = document.getElementById('reset-confirm');

// 触发重置弹窗
resetBtn.addEventListener('click', () => {
    resetModal.classList.add('active');
});

// 触发赛况总览
historyBtn.addEventListener('click', () => {
    state.showHistory = !state.showHistory;
    updateUI();
});

// 取消重置
resetCancelBtn.addEventListener('click', () => {
    resetModal.classList.remove('active');
    document.body.focus(); // 恢复焦点以便继续使用快捷键
});

// 确认重置
resetConfirmBtn.addEventListener('click', () => {
    performReset();
    resetModal.classList.remove('active');
});

// 全屏切换逻辑
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            // 现代浏览器支持 Keyboard Lock API，锁定 ESC 键以防止其默认退出全屏
            // 这样我们可以拦截 ESC 键，用来关闭弹窗而不是退出全屏
            if (navigator.keyboard && navigator.keyboard.lock) {
                navigator.keyboard.lock(['Escape']).catch(e => console.warn('Keyboard lock failed', e));
            }
        }).catch(err => {
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
    // 按 'v' 或 'V' 键切换历史蒙层
    if (e.key === 'v' || e.key === 'V') {
        historyBtn.click();
    }
    // 按 'r' 或 'R' 键触发重置弹窗
    if (e.key === 'r' || e.key === 'R') {
        if (!resetModal.classList.contains('active')) {
            resetBtn.click();
        } else {
            // 如果弹窗已显示，再次按 R 相当于点击“确定重置”
            resetConfirmBtn.click();
        }
    }
    // 按 'Escape' 键
    if (e.key === 'Escape') {
        if (resetModal.classList.contains('active')) {
            // 如果展示了弹窗，只关闭弹窗
            e.preventDefault();
            resetCancelBtn.click();
        } else if (state.showHistory) {
            // 顺便支持：如果历史蒙层打开了，按 ESC 也能关闭历史蒙层
            e.preventDefault();
            state.showHistory = false;
            updateUI();
        } else if (document.fullscreenElement) {
            // 如果没有任何弹窗，且处于全屏状态（且被我们 Lock 了 ESC），则手动退出全屏
            document.exitFullscreen();
        }
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
        // 退出全屏时释放键盘锁定
        if (navigator.keyboard && navigator.keyboard.unlock) {
            navigator.keyboard.unlock();
        }
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
    }, 5000);
}

document.addEventListener('mousemove', resetMouseTimer);
document.addEventListener('click', resetMouseTimer);
// 初始化触发一次
resetMouseTimer();

init();
