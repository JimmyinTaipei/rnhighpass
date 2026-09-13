// 常規鬧鐘功能

// DOM 元素引用
let currentTimeDisplay, alarmTimeInput, alarmLabelInput, setAlarmButton,
    testAlarmButton, alarmsContainer, alarmModal, alarmMessage,
    stopAlarmButton, cardiacCathButton, cardiacConfirmation, 
    cardiacScheduleList, confirmCardiacButton, cancelCardiacButton, bloodTransfusionButton, bloodConfirmation, bloodScheduleList, confirmBloodButton, cancelBloodButton, clearAllButton;

// 鬧鐘數據
let alarms = [];
let activeAlarm = null;
let cardiacAlarms = [];
let bloodAlarms = [];
let alarmAudio = new Audio('bell.mp3');

document.addEventListener('DOMContentLoaded', function() {
    // 初始化 DOM 元素引用
    initDOMReferences();
    
    // 初始化事件監聽器
    initEventListeners();
    
    // 從本地存儲載入鬧鐘
    loadAlarms();
    
    // 更新鬧鐘列表
    updateAlarmsList();
    
    // 初始化鬧鐘時鐘
    updateClockDisplay();
    
    // 設置時間輸入欄位為當前時間
    setCurrentTimeToInput();
});

// 初始化 DOM 元素引用
function initDOMReferences() {
    currentTimeDisplay = document.getElementById('current-time');
    alarmTimeInput = document.getElementById('alarm-time');
    alarmLabelInput = document.getElementById('alarm-label');
    setAlarmButton = document.getElementById('set-alarm-btn');
    testAlarmButton = document.getElementById('test-alarm-btn');
    alarmsContainer = document.getElementById('alarms-container');
    alarmModal = document.getElementById('alarm-modal');
    alarmMessage = document.getElementById('alarm-message');
    stopAlarmButton = document.getElementById('stop-alarm-btn');
    cardiacCathButton = document.getElementById('cardiac-cath-btn');
    cardiacConfirmation = document.getElementById('cardiac-confirmation');
    cardiacScheduleList = document.getElementById('cardiac-schedule-list');
    confirmCardiacButton = document.getElementById('confirm-cardiac-btn');
    cancelCardiacButton = document.getElementById('cancel-cardiac-btn');
    bloodTransfusionButton = document.getElementById('blood-transfusion-btn');
    bloodConfirmation = document.getElementById('blood-confirmation');
    bloodScheduleList = document.getElementById('blood-schedule-list');
    confirmBloodButton = document.getElementById('confirm-blood-btn');
    cancelBloodButton = document.getElementById('cancel-blood-btn');
    clearAllButton = document.getElementById('clear-all-btn');
}

// 初始化事件監聽器
function initEventListeners() {
    if (setAlarmButton) setAlarmButton.addEventListener('click', setAlarm);
    if (testAlarmButton) testAlarmButton.addEventListener('click', testAlarm);
    if (stopAlarmButton) stopAlarmButton.addEventListener('click', stopAlarm);
    if (cardiacCathButton) cardiacCathButton.addEventListener('click', generateCardiacCathSchedule);
    if (confirmCardiacButton) confirmCardiacButton.addEventListener('click', confirmCardiacAlarms);
    if (cancelCardiacButton) cancelCardiacButton.addEventListener('click', cancelCardiacAlarms);
    if (bloodTransfusionButton) bloodTransfusionButton.addEventListener('click', generateBloodTransfusionSchedule);
    if (confirmBloodButton) confirmBloodButton.addEventListener('click', confirmBloodAlarms);
    if (cancelBloodButton) cancelBloodButton.addEventListener('click', cancelBloodAlarms);
    if (clearAllButton) clearAllButton.addEventListener('click', clearAllAlarms);
    
    // 為文檔添加點擊事件以確保能捕獲所有點擊
    document.addEventListener('click', function(event) {
        if (event.target && event.target.id === 'stop-alarm-btn') {
            stopAlarm();
        }
    });
}

// 更新時鐘顯示
function updateClockDisplay() {
    if (!currentTimeDisplay) return;
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    currentTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    
    // 檢查鬧鐘
    const currentTime = `${hours}:${minutes}`;
    alarms.forEach(alarm => {
        if (alarm.time === currentTime && alarm.active && !alarm.ringing) {
            alarm.ringing = true;
            activeAlarm = alarm;
            triggerAlarm(alarm);
        }
    });
    
    setTimeout(updateClockDisplay, 1000);
}

// 觸發鬧鐘
function triggerAlarm(alarm) {
    if (!alarmModal || !alarmMessage) return;
    
    alarmMessage.textContent = alarm.label || '執行護理任務的時間到了';
    alarmModal.style.display = 'block';
    alarmAudio.loop = true;
    alarmAudio.play().catch(e => console.log('播放聲音失敗:', e));
}

// 停止鬧鐘
function stopAlarm() {
    try {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
    } catch (e) {
        console.log('停止聲音失敗:', e);
    }
    
    if (alarmModal) alarmModal.style.display = 'none';
    
    if (activeAlarm) {
        activeAlarm.ringing = false;
        activeAlarm = null;
        updateAlarmsList();
        saveAlarms();
    }
}

// 設定鬧鐘
function setAlarm() {
    if (!alarmTimeInput) return;
    
    const time = alarmTimeInput.value;
    const label = alarmLabelInput.value;
    
    if (!time) {
        alert('請選擇鬧鐘時間');
        return;
    }
    
    const newAlarm = {
        id: Date.now(),
        time: time,
        label: label || '護理任務',
        active: true,
        ringing: false
    };
    
    alarms.push(newAlarm);
    saveAlarms();
    updateAlarmsList();
    
    alarmTimeInput.value = '';
    if (alarmLabelInput) alarmLabelInput.value = '';
}

// 生成心導管術後監測時間表
function generateCardiacCathSchedule() {
    if (!cardiacConfirmation || !cardiacScheduleList) return;
    
    cardiacAlarms = [];
    const now = new Date();
    
    let scheduleHTML = '';
    
    // 第1小時：每15分鐘檢查一次
    for (let i = 1; i < 4; i++) {
        const checkTime = new Date(now.getTime() + i * 15 * 60000);
        const alarmObj = {
            id: Date.now() + i,
            time: formatTime(checkTime),
            label: '心導管術後檢查 - 每15分鐘',
            active: true,
            ringing: false
        };
        cardiacAlarms.push(alarmObj);
        scheduleHTML += `<li>${formatTime(checkTime)} - 術後1小時內</li>`;
    }
    
    // 第2-3小時：每30分鐘檢查一次
    for (let i = 0; i < 4; i++) {
        const checkTime = new Date(now.getTime() + 60 * 60000 + i * 30 * 60000);
        const hourLabel = i < 2 ? '2' : '3';
        const alarmObj = {
            id: Date.now() + 100 + i,
            time: formatTime(checkTime),
            label: `心導管術後檢查 - 第 ${hourLabel} 小時`,
            active: true,
            ringing: false
        };
        cardiacAlarms.push(alarmObj);
        scheduleHTML += `<li>${formatTime(checkTime)} - 術後${hourLabel}小時</li>`;
    }
    
    // 第4-5小時：每小時檢查一次
    for (let i = 0; i < 2; i++) {
        const checkTime = new Date(now.getTime() + 3 * 60 * 60000 + i * 60 * 60000);
        const hourLabel = i + 4;
        const alarmObj = {
            id: Date.now() + 200 + i,
            time: formatTime(checkTime),
            label: `心導管術後檢查 - 第 ${hourLabel} 小時`,
            active: true,
            ringing: false
        };
        cardiacAlarms.push(alarmObj);
        scheduleHTML += `<li>${formatTime(checkTime)} - 術後${hourLabel}小時</li>`;
    }
    
    cardiacScheduleList.innerHTML = scheduleHTML;
    cardiacConfirmation.style.display = 'block';
}

// 確認添加心導管術後監測鬧鐘
function confirmCardiacAlarms() {
    alarms = [...alarms, ...cardiacAlarms];
    saveAlarms();
    updateAlarmsList();
    if (cardiacConfirmation) cardiacConfirmation.style.display = 'none';
}

// 取消添加心導管術後監測鬧鐘
function cancelCardiacAlarms() {
    if (cardiacConfirmation) cardiacConfirmation.style.display = 'none';
    cardiacAlarms = [];
}

// 生成輸血監測時間表
function generateBloodTransfusionSchedule() {
    if (!bloodConfirmation || !bloodScheduleList) return;
    
    bloodAlarms = [];
    const now = new Date();
    
    let scheduleHTML = '';
    
    // 第1小時：每15分鐘檢查一次
    for (let i = 1; i < 2; i++) {
        const checkTime = new Date(now.getTime() + i * 15 * 60000);
        const alarmObj = {
            id: Date.now() + i,
            time: formatTime(checkTime),
            label: '輸血 - 前15分鐘',
            active: true,
            ringing: false
        };
        bloodAlarms.push(alarmObj);
        scheduleHTML += `<li>${formatTime(checkTime)} - 輸血前15分鐘</li>`;
    }
    
    // 第4-5小時：每小時檢查一次
    for (let i = 0; i < 3; i++) {
        const checkTime = new Date(now.getTime() + 1 * 60 * 60000 + i * 60 * 60000);
        const hourLabel = i + 1;
        const alarmObj = {
            id: Date.now() + 200 + i,
            time: formatTime(checkTime),
            label: `輸血 - 第 ${hourLabel} 小時`,
            active: true,
            ringing: false
        };
        bloodAlarms.push(alarmObj);
        scheduleHTML += `<li>${formatTime(checkTime)} - 輸血第${hourLabel}小時</li>`;
    }
    
    bloodScheduleList.innerHTML = scheduleHTML;
    bloodConfirmation.style.display = 'block';
}

// 確認添加輸血監測鬧鐘
function confirmBloodAlarms() {
    alarms = [...alarms, ...bloodAlarms];
    saveAlarms();
    updateAlarmsList();
    if (bloodConfirmation) bloodConfirmation.style.display = 'none';
}

// 取消添加輸血監測鬧鐘
function cancelBloodAlarms() {
    if (bloodConfirmation) bloodConfirmation.style.display = 'none';
    bloodAlarms = [];
}

// 清除所有鬧鐘
function clearAllAlarms() {
    if (confirm('確定要清除所有鬧鐘嗎？')) {
        alarms = [];
        saveAlarms();
        updateAlarmsList();
    }
}

// 測試鬧鐘聲音
function testAlarm() {
    alarmAudio.loop = false;
    alarmAudio.play().catch(e => console.log('播放測試聲音失敗:', e));
    
    setTimeout(() => {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
    }, 3000);
}

// 刪除鬧鐘
function deleteAlarm(id) {
    alarms = alarms.filter(alarm => alarm.id !== id);
    saveAlarms();
    updateAlarmsList();
}

// 切換鬧鐘狀態
function toggleAlarm(id) {
    alarms = alarms.map(alarm => {
        if (alarm.id === id) {
            alarm.active = !alarm.active;
        }
        return alarm;
    });
    saveAlarms();
    updateAlarmsList();
}

// 更新鬧鐘列表
function updateAlarmsList() {
    if (!alarmsContainer) return;
    
    alarmsContainer.innerHTML = '';
    
    if (alarms.length === 0) {
        alarmsContainer.innerHTML = '<p>尚未設定任何鬧鐘</p>';
        return;
    }
    
    // 按時間排序
    alarms.sort((a, b) => {
        // 先將時間轉換為可比較的格式
        const [aHours, aMinutes] = a.time.split(':').map(Number);
        const [bHours, bMinutes] = b.time.split(':').map(Number);
        
        // 比較小時，如果相同，比較分鐘
        if (aHours !== bHours) {
            return aHours - bHours;
        }
        return aMinutes - bMinutes;
    });
    
    alarms.forEach(alarm => {
        const alarmItem = document.createElement('div');
        alarmItem.className = 'alarm-item';
        if (alarm.ringing) {
            alarmItem.style.backgroundColor = '#ffcccb';
        }
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'alarm-time';
        timeSpan.textContent = alarm.time;
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'alarm-label';
        labelSpan.textContent = alarm.label;
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-btn';
        toggleButton.textContent = alarm.active ? '停用' : '啟用';
        toggleButton.onclick = function() {
            toggleAlarm(alarm.id);
        };
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-btn';
        deleteButton.textContent = '刪除';
        deleteButton.onclick = function() {
            deleteAlarm(alarm.id);
        };
        
        alarmItem.appendChild(timeSpan);
        alarmItem.appendChild(labelSpan);
        alarmItem.appendChild(toggleButton);
        alarmItem.appendChild(deleteButton);
        
        alarmsContainer.appendChild(alarmItem);
    });
}

// 保存鬧鐘到本地存儲
function saveAlarms() {
    localStorage.setItem('nursingAlarms', JSON.stringify(alarms));
}

// 從本地存儲載入鬧鐘
function loadAlarms() {
    const savedAlarms = localStorage.getItem('nursingAlarms');
    if (savedAlarms) {
        alarms = JSON.parse(savedAlarms);
    }
}

// 設置時間輸入欄位為當前時間
function setCurrentTimeToInput() {
    if (!alarmTimeInput) return;
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    // 設置時間輸入欄位的值為當前時間（格式：HH:MM）
    alarmTimeInput.value = `${hours}:${minutes}`;
}
