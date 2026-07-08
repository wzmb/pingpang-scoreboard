const socket = io();

// 从 URL 获取房间 ID
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

const statusEl = document.getElementById('server-status');// DOM 元素
const leftScoreEl = document.getElementById('left-score-display');
const rightScoreEl = document.getElementById('right-score-display');
const leftNameDisplay = document.getElementById('left-name-display');
const rightNameDisplay = document.getElementById('right-name-display');
const currentSetDisplay = document.getElementById('current-set-display');
const setsScoreDisplay = document.getElementById('sets-score-display');

// 控制按钮元素，用于动态切换颜色
const leftAddBtn = document.getElementById('left-add');
const leftSubBtn = document.getElementById('left-sub');
const rightAddBtn = document.getElementById('right-add');
const rightSubBtn = document.getElementById('right-sub');

// 弹窗元素
const modal = document.getElementById('name-modal');
const modalLeftInput = document.getElementById('modal-left-input');
const modalRightInput = document.getElementById('modal-right-input');
const modalSaveBtn = document.getElementById('modal-save');
const modalCancelBtn = document.getElementById('modal-cancel');

// 缓存最新的状态，供弹窗使用
let currentLeftName = '红队';
let currentRightName = '蓝队';
let currentIsSwapped = false;

// 交换场地相关元素
const swapBtn = document.getElementById('swap-btn');
const swapModal = document.getElementById('swap-modal');
const swapCancelBtn = document.getElementById('swap-cancel');
const swapConfirmBtn = document.getElementById('swap-confirm');

if (!roomId) {
    statusEl.innerText = '无效的房间ID';
    statusEl.style.color = 'red';
} else {
    // 连接成功后加入房间
    socket.on('connect', () => {
        statusEl.innerText = '已连接';
        statusEl.style.color = '#2ecc71';
        socket.emit('join-remote', roomId);
    });

    socket.on('disconnect', () => {
        statusEl.innerText = '已断开';
        statusEl.style.color = '#e74c3c';
    });

    // 接收大屏同步的状态
    socket.on('state-updated', (state) => {
        leftScoreEl.innerText = state.leftScore;
        rightScoreEl.innerText = state.rightScore;

        currentLeftName = state.leftName || '红队';
        currentRightName = state.rightName || '蓝队';
        currentIsSwapped = state.isSwapped || false;

        leftNameDisplay.innerText = currentLeftName;
        rightNameDisplay.innerText = currentRightName;

        // 计算并显示当前局数 (左队胜局 + 右队胜局 + 1)
        const leftSets = state.leftSets || 0;
        const rightSets = state.rightSets || 0;
        const currentSet = leftSets + rightSets + 1;

        currentSetDisplay.innerText = `第 ${currentSet} 局`;

        // 显示大比分 (局分比)
        // 注意：因为在大屏 app.js 的 swap-teams 逻辑中，state.leftSets 和 state.rightSets 已经被互换过了！
        // 也就是说，服务器发来的 state.leftSets 永远对应着当前物理屏幕左边那支队伍的局分。
        // 所以我们不需要在这里再反转一次，直接按照物理位置 left:right 显示即可。
        setsScoreDisplay.innerText = `${leftSets}:${rightSets}`;

        // 动态更新手机端的颜色
        // state.server 记录的是逻辑上的左队(红)和右队(蓝)
        const isLeftServing = state.server === 'left';

        if (state.isSwapped) {
            // 物理交换后：左边是蓝队，右边是红队
            leftNameDisplay.className = 'team-name-btn left-name-btn color-blue';
            leftScoreEl.className = 'color-blue' + (!isLeftServing ? ' is-serving' : '');
            leftAddBtn.className = 'btn add-btn bg-blue';
            leftSubBtn.className = 'btn sub-btn bg-dark-blue';

            rightNameDisplay.className = 'team-name-btn right-name-btn color-red';
            rightScoreEl.className = 'color-red' + (isLeftServing ? ' is-serving' : '');
            rightAddBtn.className = 'btn add-btn bg-red';
            rightSubBtn.className = 'btn sub-btn bg-dark-red';
        } else {
            // 物理默认状态：左边是红队，右边是蓝队
            leftNameDisplay.className = 'team-name-btn left-name-btn color-red';
            leftScoreEl.className = 'color-red' + (isLeftServing ? ' is-serving' : '');
            leftAddBtn.className = 'btn add-btn bg-red';
            leftSubBtn.className = 'btn sub-btn bg-dark-red';

            rightNameDisplay.className = 'team-name-btn right-name-btn color-blue';
            rightScoreEl.className = 'color-blue' + (!isLeftServing ? ' is-serving' : '');
            rightAddBtn.className = 'btn add-btn bg-blue';
            rightSubBtn.className = 'btn sub-btn bg-dark-blue';
        }

        // 处理下一局按钮逻辑
        if (state.currentSetDecided) {
            leftAddBtn.innerText = '下一局';
            rightAddBtn.innerText = '下一局';
            leftAddBtn.classList.add('next-set-mode');
            rightAddBtn.classList.add('next-set-mode');
        } else {
            leftAddBtn.innerText = '+1';
            rightAddBtn.innerText = '+1';
            // className 赋值已经清除了之前的 class，这里以防万一还是 remove 一下
            leftAddBtn.classList.remove('next-set-mode');
            rightAddBtn.classList.remove('next-set-mode');
        }
    });

    // 弹窗控制逻辑
    function openModal() {
        // 动态修改 label
        const leftLabel = document.getElementById('label-left');
        const rightLabel = document.getElementById('label-right');

        if (currentIsSwapped) {
            leftLabel.innerText = "左侧队名 (蓝队)";
            rightLabel.innerText = "右侧队名 (红队)";
        } else {
            leftLabel.innerText = "左侧队名 (红队)";
            rightLabel.innerText = "右侧队名 (蓝队)";
        }

        // 弹窗里的左输入框对应屏幕左边的队伍，右输入框对应屏幕右边的队伍
        modalLeftInput.value = currentLeftName === '红队' || currentLeftName === '蓝队' ? '' : currentLeftName;
        modalRightInput.value = currentRightName === '红队' || currentRightName === '蓝队' ? '' : currentRightName;

        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
        // 隐藏移动端键盘
        modalLeftInput.blur();
        modalRightInput.blur();
    }

    function saveNames() {
        // 如果输入为空，则根据当前是否交换过场地，回退到对应的默认颜色名称
        let defaultLeft = currentIsSwapped ? '蓝队' : '红队';
        let defaultRight = currentIsSwapped ? '红队' : '蓝队';

        let leftName = modalLeftInput.value.trim() || defaultLeft;
        let rightName = modalRightInput.value.trim() || defaultRight;

        // 发送给服务器的是物理显示上的名字，服务器 app.js 在 state 中存的就是物理显示名字
        // 但是 app.js 里的 swap 逻辑是如果 swapped，会反转数据。
        // 为了避免逻辑混乱，因为 app.js 里面的队名存储就是直观对应的，所以直接把这两个名字发过去即可，大屏收到后直接覆盖当前状态
        socket.emit('update-team-names', { roomId, leftName, rightName });
        closeModal();
    }

    // 绑定点击名字打开弹窗
    leftNameDisplay.addEventListener('click', openModal);
    rightNameDisplay.addEventListener('click', openModal);

    // 绑定弹窗按钮
    modalCancelBtn.addEventListener('click', closeModal);
    modalSaveBtn.addEventListener('click', saveNames);

    // 交换场地逻辑
    swapBtn.addEventListener('click', () => {
        swapModal.classList.add('active');
    });

    swapCancelBtn.addEventListener('click', () => {
        swapModal.classList.remove('active');
    });

    swapConfirmBtn.addEventListener('click', () => {
        socket.emit('swap-teams', { roomId });
        swapModal.classList.remove('active');
    });

    // 绑定按键事件
    const actions = ['left-add', 'left-sub', 'right-add', 'right-sub'];

    // 防连击保护标志
    let isCooldown = false;

    actions.forEach(action => {
        const btn = document.getElementById(action);
        if (btn) {
            // 支持触摸和点击
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault(); // 防止双击放大等默认行为

                // 如果在冷却时间内，则忽略本次点击
                if (isCooldown) return;

                if (socket.connected) {
                    let finalAction = action;
                    // 如果当前是“下一局”状态，且点击的是加分按钮，则发送 next-set 命令
                    if (btn.classList.contains('next-set-mode') && (action === 'left-add' || action === 'right-add')) {
                        finalAction = 'next-set';
                    }
                    socket.emit('command', { roomId, action: finalAction });
                    // 触觉反馈 (如果设备支持)
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }

                    // 触发冷却
                    isCooldown = true;
                    setTimeout(() => {
                        isCooldown = false;
                    }, 400); // 400ms 冷却时间，防止疯狂连按
                }
            });
        }
    });

    // 系统控制按钮 (重置、换发球方)
    const remoteResetBtn = document.getElementById('remote-reset-btn');
    const remoteSwitchServerBtn = document.getElementById('remote-switch-server-btn');

    remoteResetBtn.addEventListener('click', () => {
        if (confirm('确定要重置整场比赛吗？')) {
            socket.emit('command', { roomId, action: 'reset-match' });
        }
    });

    remoteSwitchServerBtn.addEventListener('click', () => {
        socket.emit('command', { roomId, action: 'switch-server' });
    });
}
