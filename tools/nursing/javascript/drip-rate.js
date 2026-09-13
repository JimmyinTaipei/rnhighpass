// 點滴速率計算功能

// 全局變數
let flashInterval;
let isFlashing = false;

document.addEventListener('DOMContentLoaded', function() {
    // 綁定點滴速率計算按鈕
    const calculateBtn = document.getElementById('calculate-drip-rate-btn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateDripRate);
    }

    // 綁定閃爍開始/停止按鈕
    const startFlashBtn = document.getElementById('startFlashBtn');
    if (startFlashBtn) {
        startFlashBtn.addEventListener('click', toggleFlash);
    }

    // 綁定測試聲音按鈕
    const testSoundBtn = document.getElementById('testSoundBtn');
    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', playTestSound);
    }
});

// 播放選定的聲音
function playSound() {
    if (!document.getElementById('soundEnabled')?.checked) return;
    
    const volume = parseFloat(document.getElementById('volume').value) || 0.5;
    const soundType = document.getElementById('soundType').value;
    
    switch(soundType) {
        case 'beep':
            generateBeep(880, 100, volume);
            break;
        case 'drop':
            generateDropSound(volume);
            break;
        case 'click':
            generateClickSound(volume);
            break;
        default:
            generateBeep(880, 100, volume);
    }
}

// 測試聲音
function playTestSound() {
    playSound();
}

// 計算點滴速率
function calculateDripRate() {
    // 獲取輸入值
    const totalVolume = parseFloat(document.getElementById('totalVolume').value);
    const hours = parseFloat(document.getElementById('hours').value) || 0;
    const minutes = parseFloat(document.getElementById('minutes').value) || 0;
    const dropFactor = parseFloat(document.getElementById('dropFactor').value);
    
    // 確認有效的輸入
    if (totalVolume <= 0 || (hours <= 0 && minutes <= 0)) {
        alert('請輸入有效的數值');
        return;
    }
    
    // 計算總分鐘數
    const totalMinutes = (hours * 60) + minutes;
    
    // 計算流速 (mL/hr)
    const flowRate = (totalVolume / totalMinutes) * 60;
    
    // 計算滴速 (gtt/min)
    const dripRate = (flowRate / 60) * dropFactor;
    
    // 計算每滴的間隔時間 (秒)
    const dripInterval = 60 / dripRate;
    
    // 計算一秒幾滴
    const dropsPerSecond = dripRate / 60;
    
    // 顯示結果
    document.getElementById('flowRate').textContent = flowRate.toFixed(2) + ' mL/hr';
    document.getElementById('dripRate').textContent = dripRate.toFixed(2) + ' gtts/min';
    document.getElementById('dripInterval').textContent = dripInterval.toFixed(2) + ' 秒/滴';
    document.getElementById('dropsPerSecond').textContent = dropsPerSecond.toFixed(3) + ' 滴/秒';
    
    // 顯示結果區域和閃爍指示器
    document.getElementById('drip-result').style.display = 'block';
    document.getElementById('flashIndicator').style.display = 'block';
    
    // 更新閃爍信息
    document.getElementById('flashInfo').textContent = `指示燈將每 ${dripInterval.toFixed(2)} 秒閃爍一次`;
    
    // 停止已有的閃爍
    stopFlash();
}

// 切換閃爍
function toggleFlash() {
    if (isFlashing) {
        stopFlash();
    } else {
        startFlash();
    }
}

// 開始閃爍
function startFlash() {
    const dripIntervalText = document.getElementById('dripInterval').textContent;
    const dripInterval = parseFloat(dripIntervalText);
    
    if (isNaN(dripInterval)) {
        alert('請先計算點滴速率');
        return;
    }
    
    isFlashing = true;
    document.getElementById('startFlashBtn').textContent = '停止';
    
    // 計算閃爍間隔 (毫秒) - 使用點滴間隔
    const flashIntervalTime = dripInterval * 1000;
    
    const flashCircle = document.getElementById('flashCircle');
    
    // 清除可能已存在的間隔
    if (flashInterval) {
        clearInterval(flashInterval);
    }
    
    // 立即觸發第一次閃爍
    flashOnce();
    
    // 設置定時器，按照點滴間隔時間閃爍
    flashInterval = setInterval(flashOnce, flashIntervalTime);
    
    function flashOnce() {
        // 閃爍效果
        flashCircle.classList.add('active');

        // 播放聲音
        playSound();
        
        // 200毫秒後恢復
        setTimeout(() => {
            flashCircle.classList.remove('active');
        }, 200);
    }
}

// 停止閃爍
function stopFlash() {
    if (flashInterval) {
        clearInterval(flashInterval);
        document.getElementById('flashCircle').classList.remove('active');
        document.getElementById('startFlashBtn').textContent = '開始';
        isFlashing = false;
    }
}
