// 藥物計時器功能

// 全局變數
let timers = [];
let timerCount = 0;
const timerAudio = new Audio('bell.mp3');

document.addEventListener('DOMContentLoaded', function() {
    // 綁定新增計時器按鈕
    const addTimerBtn = document.getElementById('add-timer-btn');
    if (addTimerBtn) {
        addTimerBtn.addEventListener('click', () => createTimer());
    }
    
    // 創建初始計時器
    createTimer('011床 抗生素1', 30);
    createTimer('012床 胃藥', 20);
});

// 創建計時器
function createTimer(name = '', minutes = 30, hours = 0) {
    timerCount++;
    const id = `timer-${timerCount}`;
    
    const timerCard = document.createElement('div');
    timerCard.className = 'drtm-timer-card';
    timerCard.id = id;
    
    timerCard.innerHTML = `
        <div class="drtm-timer-header">
            <input type="text" class="timer-name" value="${name}" placeholder="床號+藥物名稱">
        </div>
        <div class="drtm-timer-form">
            <div class="time-inputs" style="display: flex">
                <div>
                    <input type="number" class="hours-input" style="width:70px; margin:8px" value="${hours}" min="0" max="99" placeholder="小時">小時
                </div>
                <div>
                    <input type="number" class="minutes-input" style="width:70px; margin:8px" value="${minutes}" min="0" max="59" placeholder="分鐘">分鐘
                </div>
            </div>
        </div>
        <div class="timer-display">00:00:00</div>
        <div class="timer-controls">
            <button class="start-btn">開始</button>
            <button class="pause-btn" disabled>暫停</button>
            <button class="reset-btn">重設</button>
        </div>
        <div class="timer-status"></div>
        <button class="drtm-delete-btn">×</button>
    `;
    
    document.getElementById('timers-container').appendChild(timerCard);
    
    const timer = {
        id,
        element: timerCard,
        display: timerCard.querySelector('.timer-display'),
        startBtn: timerCard.querySelector('.start-btn'),
        pauseBtn: timerCard.querySelector('.pause-btn'),
        resetBtn: timerCard.querySelector('.reset-btn'),
        deleteBtn: timerCard.querySelector('.drtm-delete-btn'),
        nameInput: timerCard.querySelector('.timer-name'),
        minutesInput: timerCard.querySelector('.minutes-input'),
        hoursInput: timerCard.querySelector('.hours-input'),
        status: timerCard.querySelector('.timer-status'),
        get totalSeconds() {
            return (parseInt(this.hoursInput.value) || 0) * 3600 + (parseInt(this.minutesInput.value) || 0) * 60;
        },
        remainingSeconds: 0,
        interval: null,
        isRunning: false,
        isCompleted: false
    };

    // 初始化剩餘秒數
    timer.remainingSeconds = timer.totalSeconds;
    
    // 添加事件監聽器
    timer.startBtn.addEventListener('click', () => startTimer(timer));
    timer.pauseBtn.addEventListener('click', () => pauseTimer(timer));
    timer.resetBtn.addEventListener('click', () => resetTimer(timer));
    timer.deleteBtn.addEventListener('click', () => deleteTimer(timer));
    timer.hoursInput.addEventListener('change', () => updateTimerSettings(timer));
    timer.minutesInput.addEventListener('change', () => updateTimerSettings(timer));
    
    updateTimerDisplay(timer);
    timers.push(timer);
    return timer;
}

// 更新計時器設置
function updateTimerSettings(timer) {
    // 確保分鐘在有效範圍內（0-59）
    let mins = parseInt(timer.minutesInput.value) || 0;
    if (mins > 59) {
        mins = 59;
        timer.minutesInput.value = 59;
    }
    
    // 確保小時在有效範圍內（0-99）
    let hrs = parseInt(timer.hoursInput.value) || 0;
    if (hrs > 99) {
        hrs = 99;
        timer.hoursInput.value = 99;
    }
    
    // 不允許總時間為0
    if (hrs === 0 && mins === 0) {
        mins = 1;
        timer.minutesInput.value = 1;
    }
    
    // 重置計時器
    resetTimer(timer);
}

// 開始計時器
function startTimer(timer) {
    if (timer.isRunning) return;
    
    timer.isRunning = true;
    timer.isCompleted = false;
    timer.startBtn.disabled = true;
    timer.pauseBtn.disabled = false;
    timer.element.classList.remove('notification');
    timer.status.classList.remove('completed');
    timer.status.textContent = '進行中...';
    
    timer.interval = setInterval(() => {
        timer.remainingSeconds--;
        
        if (timer.remainingSeconds <= 0) {
            completeTimer(timer);
        } else {
            updateTimerDisplay(timer);
        }
    }, 1000);
}

// 暫停計時器
function pauseTimer(timer) {
    if (!timer.isRunning) return;
    
    clearInterval(timer.interval);
    timer.isRunning = false;
    timer.startBtn.disabled = false;
    timer.pauseBtn.disabled = true;
    timer.status.textContent = '已暫停';
}

// 重置計時器
function resetTimer(timer) {
    clearInterval(timer.interval);
    timer.isRunning = false;
    timer.isCompleted = false;
    timer.remainingSeconds = timer.totalSeconds;
    timer.startBtn.disabled = false;
    timer.pauseBtn.disabled = true;
    timer.element.classList.remove('notification');
    timer.status.classList.remove('completed');
    timer.status.textContent = '';
    updateTimerDisplay(timer);
}

// 刪除計時器
function deleteTimer(timer) {
    if (timer.isRunning) {
        clearInterval(timer.interval);
    }
    
    // 從陣列中移除計時器
    const index = timers.findIndex(t => t.id === timer.id);
    if (index !== -1) {
        timers.splice(index, 1);
    }
    
    // 從 DOM 中移除計時器元素
    timer.element.remove();
}

// 完成計時器
function completeTimer(timer) {
    clearInterval(timer.interval);
    timer.isRunning = false;
    timer.isCompleted = true;
    timer.remainingSeconds = 0;
    timer.startBtn.disabled = false;
    timer.pauseBtn.disabled = true;
    timer.element.classList.add('notification');
    timer.status.classList.add('completed');
    timer.status.textContent = '滴注完成！';
    updateTimerDisplay(timer);
    playNotification();
}

// 更新計時器顯示
function updateTimerDisplay(timer) {
    const hours = Math.floor(timer.remainingSeconds / 3600);
    const minutes = Math.floor((timer.remainingSeconds % 3600) / 60);
    const seconds = timer.remainingSeconds % 60;
    
    timer.display.textContent = `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

// 播放通知聲音
function playNotification() {
    timerAudio.volume = 0.5;
    timerAudio.play().catch(e => console.log('播放聲音失敗:', e));
}
