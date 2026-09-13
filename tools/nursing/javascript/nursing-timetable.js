document.addEventListener('DOMContentLoaded', function() {
    // 常量與變數
    const timelineTable = document.getElementById('timeline-table');
    const taskDetails = document.getElementById('task-details');
    let beds = new Map(); // 床位資料
    let currentTaskId = null;
    
    // 儲存健
    const STORAGE_KEY = 'nursingTimelineData';
    
    // 班別設定 - 調整順序為大夜、白班、小夜
    const shifts = {
        night: {
            name: '大夜',
            hours: generateHourLabels(23, 9) // 23:00 到 09:00
        },
        day: {
            name: '白班',
            hours: generateHourLabels(7, 17) // 07:00 到 17:00
        },
        evening: {
            name: '小夜',
            hours: generateHourLabels(15, 1) // 15:00 到 01:00
        }
    };

    //常規模板
    const nursingTemplates = {
        // TID 生命徵象模板
        'vital-tid': {
            name: 'Vital Sign (TID)',
            type: 'exam',
            description: '測量生命徵象',
            timings: {
                day: ['08:00-09:00', '12:30-13:30'], // 白班 9點和13點
                evening: ['15:30-16:30'], // 小夜 17點和21點
            }
        },
        // QID 生命徵象模板
        'vital-qid': {
            name: 'Vital Sign (QID)',
            type: 'exam',
            description: '測量生命徵象',
            timings: {
                day: ['08:00-09:00', '12:30-13:30'], // 白班 9點和13點
                evening: ['15:30-16:30', '21:00-22:00'], // 小夜 17點和21點
            }
        },
        
        // BIDAC 飯前血糖檢測
        'glucose-bidac': {
            name: 'Blood Glucose (BIDAC)',
            type: 'exam', 
            description: '飯前血糖檢測',
            timings: {
                day: ['15:30-16:00'], //晚餐前
                night: ['06:30-07:30'] //早餐前
            }
        },
        // TIDAC 飯前血糖檢測
        'glucose-tidac': {
            name: 'Blood Glucose (TIDAC)',
            type: 'exam', 
            description: '飯前血糖檢測',
            timings: {
                day: ['10:30-11:00', '15:30-16:00'], 
                night: ['06:30-07:30'] 
            }
        },
        // QIDAC 飯前血糖檢測
        'glucose-qidac': {
            name: 'Blood Glucose (QIDAC)',
            type: 'exam', 
            description: '飯前血糖檢測',
            timings: {
                day: ['10:30-11:00', '15:30-16:00'], // 早餐前、午餐前
                evening: ['20:30-21:00'], // 晚餐前
                night: ['06:30-07:30'] // 睡前點心前
            }
        },
        
        // Q8H 靜脈注射
        'iv-drip': {
            name: 'IV Drip (Q8H)',
            type: 'medication',
            description: '靜脈注射藥物',
            timings: {
                day: ['08:00-08:30', '16:00-16:30'],
                evening: ['16:00-16:30', '00:00-00:30'],
                night: ['00:00-00:30', '08:00-08:30']
            }
        },
        
        // QID 一日四次給藥
        'medication-qid': {
            name: 'Medication (QID)',
            type: 'medication',
            description: '口服藥物給藥',
            timings: {
                day: ['09:00-10:00', '12:30-13:00'],
                evening: ['17:00-18:00', '21:00-22:00'],
            }
        }
    };
    
    // 生成小時標籤 (優化處理跨日邏輯)
    function generateHourLabels(start, end) {
        const hours = [];
        
        // 處理跨日的情況
        if (end < start) {
            // 從起始時間到午夜
            for (let h = start; h < 24; h++) {
                hours.push({
                    value: h,
                    display: `${String(h).padStart(2, '0')}:00`,
                    day: 0 // 當天
                });
            }
            
            // 從午夜到結束時間
            for (let h = 0; h <= end; h++) {
                hours.push({
                    value: h + 24, // 加24小時表示隔天
                    display: `${String(h).padStart(2, '0')}:00`,
                    day: 1 // 隔天
                });
            }
        } else {
            // 不跨日的情況
            for (let h = start; h <= end; h++) {
                hours.push({
                    value: h,
                    display: `${String(h).padStart(2, '0')}:00`,
                    day: 0 // 當天
                });
            }
        }
        
        return hours;
    }
    
    // 當前班別 (預設為大夜)
    let currentShift = 'day';
    
    // 渲染時間軸表格
    function renderTimelineTable() {
        const shift = shifts[currentShift];
        const hours = shift.hours;
        
        // 清空表格
        timelineTable.innerHTML = '';
        
        // 創建表頭
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // 床號列
        const bedHeader = document.createElement('th');
        bedHeader.textContent = '床號';
        headerRow.appendChild(bedHeader);
        
        // 時間列
        hours.forEach(hour => {
            const th = document.createElement('th');
            
            // 顯示時間並標記隔天
            th.textContent = hour.display;
            
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        timelineTable.appendChild(thead);
        
        // 創建表身
        const tbody = document.createElement('tbody');
        tbody.id = 'timeline-body';
        timelineTable.appendChild(tbody);
        
        // 重新渲染所有床位行
        renderAllBeds();
    }
    
    // 渲染所有床位行
    function renderAllBeds() {
        const tbody = document.getElementById('timeline-body');
        tbody.innerHTML = '';
        
        // 按床號排序
        const sortedBeds = [...beds.entries()].sort((a, b) => {
            return a[0].localeCompare(b[0], undefined, { numeric: true });
        });
        
        // 為每個床位創建行
        sortedBeds.forEach(([bedNumber, bed]) => {
            createBedRow(bedNumber, bed.patientName);
        });
        
        // 顯示所有任務
        renderAllTasks();
    }
    
    // 創建床位行
    function createBedRow(bedNumber, patientName) {
        const tbody = document.getElementById('timeline-body');
        const shift = shifts[currentShift];
        
        // 檢查床位是否已存在
        if (!beds.has(bedNumber)) {
            beds.set(bedNumber, {
                patientName: patientName || '',
                tasks: []
            });
        } else if (patientName) {
            // 更新病患名稱
            beds.get(bedNumber).patientName = patientName;
        }
        
        // 創建行
        const row = document.createElement('tr');
        row.dataset.bedNumber = bedNumber;
        
        // 床號單元格
        const bedCell = document.createElement('td');
        bedCell.className = 'bed-number';
        bedCell.innerHTML = `${bedNumber}${patientName ? `<br>${maskMiddleChar(patientName)}` : ''}`;
        row.appendChild(bedCell);
        
        // 時間單元格
        shift.hours.forEach(hour => {
            const cell = document.createElement('td');
            cell.dataset.hour = hour.value;
            cell.dataset.day = hour.day;
            cell.className = 'time-cell';
            
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
    }
    
    // 渲染所有任務
    function renderAllTasks() {
        // 清除舊任務
        document.querySelectorAll('.task').forEach(el => el.remove());
        
        // 渲染所有床位的任務
        beds.forEach((bed, bedNumber) => {
            // 獲取當前班別中這個床位的所有任務
            const tasksInShift = bed.tasks.filter(task => {
                return isTaskInCurrentShift(task);
            });
            
            // 根據每個時間格的重疊任務數量，確定任務位置
            organizeTaskPositions(bedNumber, tasksInShift);
        });
    }
    
    // 組織任務位置，處理重疊
    function organizeTaskPositions(bedNumber, tasks) {
        if (tasks.length === 0) return;
        
        // 按照開始時間排序任務
        tasks.sort((a, b) => {
            const [aHours, aMinutes] = a.startTime.split(':').map(Number);
            const [bHours, bMinutes] = b.startTime.split(':').map(Number);
            
            // 處理跨日情況
            let aDecimal = aHours + aMinutes/60;
            let bDecimal = bHours + bMinutes/60;
            
            if (aHours < 12 && bHours >= 12) aDecimal += 24;
            if (bHours < 12 && aHours >= 12) bDecimal += 24;
            
            return aDecimal - bDecimal;
        });
        
        // 堆疊任務的算法
        // 1. 先創建"軌道"(行) - 每條軌道可以放置不重疊的任務
        const tracks = [];
        
        tasks.forEach(task => {
            // 找出可以放置該任務的第一個軌道
            let trackIndex = findAvailableTrack(tracks, task);
            
            // 如果沒有可用軌道，創建新的
            if (trackIndex === -1) {
                trackIndex = tracks.length;
                tracks.push([]);
            }
            
            // 將任務放入軌道並記錄軌道號
            tracks[trackIndex].push(task);
            task.trackIndex = trackIndex;
            
            // 渲染任務
            renderTask(bedNumber, task);
        });
    }
    
    // 找出可用的軌道（不會與現有任務重疊）
    function findAvailableTrack(tracks, newTask) {
        const [newStartHours, newStartMinutes] = newTask.startTime.split(':').map(Number);
        const [newEndHours, newEndMinutes] = newTask.endTime.split(':').map(Number);
        
        // 標準化新任務時間（處理跨日）
        let newStartDecimal = newStartHours + newStartMinutes/60;
        let newEndDecimal = newEndHours + newEndMinutes/60;
        
        // 如果結束時間小於開始時間，表示跨日
        if (newEndHours < newStartHours) {
            newEndDecimal += 24;
        }
        
        // 檢查每個軌道
        for (let i = 0; i < tracks.length; i++) {
            let canUseTrack = true;
            
            // 檢查軌道上的所有任務
            for (const existingTask of tracks[i]) {
                const [existStartHours, existStartMinutes] = existingTask.startTime.split(':').map(Number);
                const [existEndHours, existEndMinutes] = existingTask.endTime.split(':').map(Number);
                
                // 標準化現有任務時間
                let existStartDecimal = existStartHours + existStartMinutes/60;
                let existEndDecimal = existEndHours + existEndMinutes/60;
                
                // 處理跨日
                if (existEndHours < existStartHours) {
                    existEndDecimal += 24;
                }
                
                // 檢測重疊：如果新任務開始於現有任務結束前並且新任務結束於現有任務開始後
                if (newStartDecimal < existEndDecimal && newEndDecimal > existStartDecimal) {
                    canUseTrack = false;
                    break;
                }
            }
            
            if (canUseTrack) {
                return i;
            }
        }
        
        // 沒有找到可用軌道
        return -1;
    }
    
    // 檢查任務是否在當前班別時間範圍內
    function isTaskInCurrentShift(task) {
        const shift = shifts[currentShift];
        const shiftHours = shift.hours;
        
        // 取得班別的開始和結束時間值
        const shiftStart = shiftHours[0].value;
        const shiftEnd = shiftHours[shiftHours.length - 1].value;
        
        // 解析任務時間
        let [startHours, startMinutes] = task.startTime.split(':').map(Number);
        let [endHours, endMinutes] = task.endTime.split(':').map(Number);
        
        // 標準化時間 (處理跨日)
        let normalizedStartHour = startHours;
        let normalizedEndHour = endHours;
        
        // 如果任務結束時間小於開始時間，表示跨日
        if (endHours < startHours) {
            normalizedEndHour += 24;
        }
        
        // 如果班別跨日且時間在凌晨
        const isShiftCrossingDay = shiftHours.some(h => h.day === 1);
        
        if (isShiftCrossingDay) {
            // 對於大夜班和小夜班，凌晨時段需要加上24
            if (startHours < 12 && shiftStart >= 12) {
                normalizedStartHour += 24;
            }
            if (endHours < 12 && shiftStart >= 12) {
                normalizedEndHour += 24;
            }
        }
        
        // 轉換為分鐘以便比較
        const taskStartMinutes = normalizedStartHour * 60 + startMinutes;
        const taskEndMinutes = normalizedEndHour * 60 + endMinutes;
        const shiftStartMinutes = shiftStart * 60;
        const shiftEndMinutes = shiftEnd * 60;
        
        // 檢查任務是否與班別時間重疊
        return (taskStartMinutes < shiftEndMinutes && taskEndMinutes > shiftStartMinutes);
    }

    // 床號選擇彈窗功能
    function showBedSelector(templateId) {
        const template = nursingTemplates[templateId];
        if (!template) return;
        
        // 創建彈窗
        const modal = document.createElement('div');
        modal.className = 'bed-selector-modal';
        
        modal.innerHTML = `
            <div class="bed-selector-content">
                <h3>${template.name}</h3>
                <p>請輸入要套用此模板的床號和病患姓名（選填）</p>
                
                <div class="bed-input-row">
                    <label for="template-bed-number">床號</label>
                    <input type="text" id="template-bed-number" placeholder="例如: 101" required>
                </div>
                
                <div class="bed-input-row">
                    <label for="template-patient-name">病患姓名</label>
                    <input type="text" id="template-patient-name" placeholder="輸入病患姓名(選填)">
                </div>
                
                <div class="bed-selector-actions">
                    <button id="cancel-template" class="delete-btn">取消</button>
                    <button id="apply-template">套用模板</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 設定事件
        document.getElementById('cancel-template').addEventListener('click', function() {
            modal.remove();
        });
        
        document.getElementById('apply-template').addEventListener('click', function() {
            const bedNumber = document.getElementById('template-bed-number').value.trim();
            const patientName = document.getElementById('template-patient-name').value.trim();
            
            if (!bedNumber) {
                alert('請輸入床號');
                return;
            }
            
            applyTemplate(templateId, bedNumber, patientName);
            modal.remove();
        });
    }

    // 套用模板功能
    function applyTemplate(templateId, bedNumber, patientName) {
        const template = nursingTemplates[templateId];
        if (!template) return;
        
        // 獲取當前班別
        const currentShiftTimings = template.timings[currentShift];
        
        if (!currentShiftTimings || currentShiftTimings.length === 0) {
            alert(`${template.name} 在當前班別沒有設定任務時間。`);
            return;
        }
        
        // 為當前班別添加任務
        currentShiftTimings.forEach(timing => {
            const [startTime, endTime] = timing.split('-');
            addTask(bedNumber, patientName, template.type, template.description, startTime, endTime);
        });
        
        alert(`已為 ${bedNumber} 床號添加 ${template.name} 模板`);
    }

    
    // 渲染單個任務
    function renderTask(bedNumber, task) {
        // 取得床位行
        const row = document.querySelector(`tr[data-bed-number="${bedNumber}"]`);
        if (!row) return;
        
        // 計算任務位置
        const position = calculateTaskPosition(task);
        if (!position) return;
        
        // 創建任務元素
        const taskElement = document.createElement('div');
        taskElement.className = `task ${task.type}`;
        taskElement.textContent = task.description;
        taskElement.dataset.id = task.id;
        taskElement.style.position = 'absolute';
        taskElement.style.left = position.left + '%';
        taskElement.style.width = position.width + '%';
        
        // 設置垂直位置（根據軌道索引）
        const trackHeight = 25; // 每個任務軌道的高度
        const trackIndex = task.trackIndex || 0;
        taskElement.style.top = (trackIndex * trackHeight) + 'px';
        
        // 添加點擊事件
        taskElement.addEventListener('click', function(e) {
            e.stopPropagation();
            showTaskDetails(bedNumber, task.id, e);
        });

        // 添加滑鼠懸停事件
        taskElement.addEventListener('mouseenter', function() {
            // 創建時間提示元素
            const tooltip = document.createElement('div');
            tooltip.className = 'task-time-tooltip';
            tooltip.textContent = `時間: ${task.startTime} — ${task.endTime}`;
            taskElement.appendChild(tooltip);
        });

        // 添加滑鼠離開事件
        taskElement.addEventListener('mouseleave', function() {
            // 移除時間提示
            const tooltip = taskElement.querySelector('.task-time-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        });
        
        // 放置到正確的單元格
        const startCell = row.querySelector(`td[data-hour="${position.startHour}"]`);
        if (startCell) {
            startCell.style.position = 'relative';
            startCell.appendChild(taskElement);
        }
        
        task.element = taskElement;
        return taskElement;
    }

    function updateTimeIndicator() {
        // Remove any existing time indicators
        const existingIndicator = document.getElementById('current-time-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Get current time
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Format for display
        const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        
        // Check if current time is within the current shift
        const shift = shifts[currentShift];
        const shiftHours = shift.hours;
        
        // Calculate normalized hour for comparison (handling day crossing)
        let normalizedCurrentHour = currentHour;
        if (currentHour < 12 && shiftHours[0].value >= 12) {
            normalizedCurrentHour += 24; // If current time is morning but shift started last night
        }
        
        // Check if current time is within shift bounds
        const shiftStart = shiftHours[0].value;
        const shiftEnd = shiftHours[shiftHours.length - 1].value;
        
        // If current time is not in the visible timeline, don't show indicator
        if (normalizedCurrentHour < shiftStart || normalizedCurrentHour > shiftEnd) {
            return;
        }
        
        // Create the indicator container
        const indicator = document.createElement('div');
        indicator.id = 'current-time-indicator';
        indicator.style.position = 'absolute';
        indicator.style.top = '0';
        indicator.style.bottom = '0';
        indicator.style.zIndex = '100';
        indicator.style.pointerEvents = 'none'; // Prevent it from blocking interactions
        
        // Create the time label
        const timeLabel = document.createElement('div');
        timeLabel.textContent = timeString;
        timeLabel.style.position = 'absolute';
        timeLabel.style.top = '53px';
        timeLabel.style.right = '0';
        timeLabel.style.transform = 'translateX(50%)';
        timeLabel.style.backgroundColor = '#e74c3c';
        timeLabel.style.color = 'white';
        timeLabel.style.padding = '2px 6px';
        timeLabel.style.borderRadius = '4px';
        timeLabel.style.fontSize = '12px';
        timeLabel.style.fontWeight = 'bold';
        
        // Create the vertical line
        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.top = '73px'; // Start below the time label
        line.style.bottom = '0';
        line.style.width = '2px';
        line.style.backgroundColor = '#e74c3c';
        line.style.left = '0';
        
        // Add components to the indicator
        indicator.appendChild(timeLabel);
        indicator.appendChild(line);
        
        // Find the position for the indicator
        const timelineTable = document.getElementById('timeline-table');
        const timelineRect = timelineTable.getBoundingClientRect();
        
        // Find the appropriate cell for the current hour
        let startCellIndex = -1;
        for (let i = 0; i < shiftHours.length; i++) {
            if (shiftHours[i].value <= normalizedCurrentHour && 
                (i === shiftHours.length - 1 || shiftHours[i + 1].value > normalizedCurrentHour)) {
                startCellIndex = i;
                break;
            }
        }
        
        if (startCellIndex === -1) return;
        
        // Calculate the position
        const startHourValue = shiftHours[startCellIndex].value;
        const minuteOffset = (normalizedCurrentHour - startHourValue) * 60 + currentMinute;
        const cellWidth = timelineTable.querySelector('th:nth-child(2)').offsetWidth; // Width of one hour cell
        
        // Calculate the left position
        const offsetLeft = timelineTable.querySelector('th:first-child').offsetWidth; // Offset for bed number column
        const leftPosition = offsetLeft + startCellIndex * cellWidth + (minuteOffset / 60) * cellWidth;
        
        // Position the indicator
        indicator.style.left = `${leftPosition}px`;
        
        // Add the indicator to the timeline container
        document.querySelector('.timeline-container').appendChild(indicator);
    }

    function startTimeIndicator() {
        // Initial update
        updateTimeIndicator();
        
        // Update every minute
        setInterval(updateTimeIndicator, 60000);
    }

    function addTimeIndicatorStyle() {
        const style = document.createElement('style');
        style.textContent = `
            #current-time-indicator {
                transition: left 0.5s linear;
            }
        `;
        document.head.appendChild(style);
    }
    
    // 計算任務在時間軸上的位置
    function calculateTaskPosition(task) {
        const shift = shifts[currentShift];
        const hours = shift.hours;
        
        // 解析任務時間
        let [startHours, startMinutes] = task.startTime.split(':').map(Number);
        let [endHours, endMinutes] = task.endTime.split(':').map(Number);
        
        // 標準化時間 (處理跨日)
        let normalizedStartHour = startHours;
        let normalizedEndHour = endHours;
        
        // 如果任務結束時間小於開始時間，表示跨日
        if (endHours < startHours) {
            normalizedEndHour += 24;
        }
        
        // 如果班別跨日且時間在凌晨
        const isShiftCrossingDay = hours.some(h => h.day === 1);
        
        if (isShiftCrossingDay) {
            // 對於大夜班和小夜班，凌晨時段需要加上24
            if (startHours < 12 && hours[0].value >= 12) {
                normalizedStartHour += 24;
            }
            if (endHours < 12 && hours[0].value >= 12) {
                normalizedEndHour += 24;
            }
        }
        
        // 找出任務開始的時間單元格
        let startCellIndex = -1;
        for (let i = 0; i < hours.length; i++) {
            if (hours[i].value <= normalizedStartHour && 
                (i === hours.length - 1 || hours[i + 1].value > normalizedStartHour)) {
                startCellIndex = i;
                break;
            }
        }
        
        if (startCellIndex === -1) return null;
        
        // 計算開始位置的左偏移百分比
        const hourWidth = 100; // 每小時單元格的寬度百分比
        const startHourValue = hours[startCellIndex].value;
        const minuteOffset = (normalizedStartHour - startHourValue) * 60 + startMinutes;
        const leftPercent = (minuteOffset / 60) * 100;
        
        // 計算任務持續時間（以分鐘為單位）
        const taskDurationMinutes = (normalizedEndHour * 60 + endMinutes) - (normalizedStartHour * 60 + startMinutes);
        const widthPercent = (taskDurationMinutes / 60) * 100;
        
        return {
            startHour: hours[startCellIndex].value,
            left: leftPercent,
            width: Math.min(widthPercent, 100 * (hours.length - startCellIndex)) // 限制最大寬度
        };
    }
    
    // 添加新任務
    function addTask(bedNumber, patientName, taskType, description, startTime, endTime) {
        // 生成唯一ID
        const taskId = Date.now().toString();
        
        // 更新或創建床位
        if (!beds.has(bedNumber)) {
            beds.set(bedNumber, {
                patientName: patientName || '',
                tasks: []
            });
        } else if (patientName) {
            // 更新病患名稱
            const bedCell = bedRow.querySelector('.bed-number');
            bedCell.innerHTML = `${bedNumber}<br>${maskMiddleChar(patientName)}`;
        }
        
        // 創建床位行（如果不存在）
        const bedRow = document.querySelector(`tr[data-bed-number="${bedNumber}"]`);
        if (!bedRow) {
            createBedRow(bedNumber, patientName);
        } else if (patientName) {
            // 更新病患名稱
            const bedCell = bedRow.querySelector('.bed-number');
            bedCell.innerHTML = `${bedNumber}<br>${patientName}`;
        }
        
        // 創建任務對象
        const task = {
            id: taskId,
            type: taskType,
            description: description,
            startTime: startTime,
            endTime: endTime
        };
        
        // 添加到任務列表
        beds.get(bedNumber).tasks.push(task);
        
        // 重新渲染所有任務以處理重疊
        renderAllTasks();
        
        saveToLocalStorage();
        return task;
    }

    // 處理姓名中間字元遮蔽
    function maskMiddleChar(name) {
        if (!name || name.length <= 1) return name;
        
        if (name.length === 2) {
            // 對於2個字的姓名，遮蔽第二個字
            return name.charAt(0) + "Ｏ";
        } else {
            // 對於3個字或更多的姓名，遮蔽中間字元
            const middleIndex = Math.floor(name.length / 2);
            return name.substring(0, middleIndex) + "Ｏ" + name.substring(middleIndex + 1);
        }
    }
    
    // 顯示任務詳情
    function showTaskDetails(bedNumber, taskId, event) {
        const bed = beds.get(bedNumber);
        const task = bed.tasks.find(t => t.id === taskId);
        
        if (!task) return;
        
        document.getElementById('detail-bed').textContent = bedNumber;
        document.getElementById('detail-patient').textContent = bed.patientName ? maskMiddleChar(bed.patientName) : '未指定';
        document.getElementById('detail-type').textContent = getTaskTypeName(task.type);
        document.getElementById('detail-description').textContent = task.description;
        
        // 處理跨日時間顯示
        let timeDisplay = `${task.startTime} - ${task.endTime}`;
        
        // 如果結束時間小於開始時間，標記為跨日
        const [startHours] = task.startTime.split(':').map(Number);
        const [endHours] = task.endTime.split(':').map(Number);
        
        if (endHours < startHours) {
            timeDisplay += ' (跨日)';
        }
        
        document.getElementById('detail-time').textContent = timeDisplay;
        
        // 定位詳情窗
        const rect = event.target.getBoundingClientRect();
        taskDetails.style.left = `${rect.left}px`;
        taskDetails.style.top = `${rect.bottom + 10}px`;
        
        // 顯示詳情
        taskDetails.style.display = 'block';
        currentTaskId = taskId;
    }
    
    // 獲取任務類型名稱
    function getTaskTypeName(type) {
        switch(type) {
            case 'exam': return '檢查';
            case 'medication': return '給藥';
            case 'surgery': return '手術';
            case 'treatment': return '治療';
            case 'other': return '其他';
            default: return type;
        }
    }
    
    // 刪除任務
    function deleteTask(bedNumber, taskId) {
        if (!beds.has(bedNumber)) return false;
        
        const bed = beds.get(bedNumber);
        const taskIndex = bed.tasks.findIndex(t => t.id === taskId);
        
        if (taskIndex === -1) return false;
        
        // 移除任務元素
        if (bed.tasks[taskIndex].element) {
            bed.tasks[taskIndex].element.remove();
        }
        
        // 從數據中移除
        bed.tasks.splice(taskIndex, 1);
        
        // 如果床位沒有任務了，考慮刪除行
        if (bed.tasks.length === 0) {
            const row = document.querySelector(`tr[data-bed-number="${bedNumber}"]`);
            if (row) row.remove();
            beds.delete(bedNumber);
        } else {
            // 重新渲染以更新堆疊
            renderAllTasks();
        }
        
        saveToLocalStorage();
        return true;
    }
    
    // 過濾任務
    // 修改原有的 filterTasks 函數
    function filterTasks() {
        const showExam = document.getElementById('exam-filter').classList.contains('active');
        const showMedication = document.getElementById('medication-filter').classList.contains('active');
        const showSurgery = document.getElementById('surgery-filter').classList.contains('active');
        const showTreatment = document.getElementById('treatment-filter').classList.contains('active');
        const showOther = document.getElementById('other-filter').classList.contains('active');
        
        // 重新渲染所有任務以便重新計算位置
        renderAllTasks();
        
        // 隱藏被過濾的任務類型
        document.querySelectorAll('.task').forEach(task => {
            if (task.classList.contains('exam')) {
                task.style.display = showExam ? 'block' : 'none';
            } else if (task.classList.contains('medication')) {
                task.style.display = showMedication ? 'block' : 'none';
            } else if (task.classList.contains('surgery')) {
                task.style.display = showSurgery ? 'block' : 'none';
            } else if (task.classList.contains('treatment')) {
                task.style.display = showTreatment ? 'block' : 'none';
            } else if (task.classList.contains('other')) {
                task.style.display = showOther ? 'block' : 'none';
            }
        });
    }
    
    // 設置默認時間
    function setDefaultTimes() {
        const now = new Date();
        let hour = now.getHours();
        let minute = now.getMinutes();
        
        // 調整時間到當前班別範圍
        const shift = shifts[currentShift];
        const shiftHours = shift.hours;
        
        // 檢查當前時間是否在班別範圍內
        let isTimeInShift = false;
        
        // 標準化當前時間（處理跨日情況）
        let normalizedNowHour = hour;
        if (hour < 12 && shiftHours[0].value >= 12) {
            normalizedNowHour += 24; // 如果現在是凌晨且班別從昨晚開始
        }
        
        // 檢查時間是否在班別範圍內
        const shiftStart = shiftHours[0].value;
        const shiftEnd = shiftHours[shiftHours.length - 1].value;
        
        if (normalizedNowHour >= shiftStart && normalizedNowHour <= shiftEnd) {
            isTimeInShift = true;
        }
        
        // 如果不在範圍內，使用班別起始時間
        if (!isTimeInShift) {
            hour = shiftHours[0].value % 24;
            minute = 0;
        }
        
        document.getElementById('start-time').value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        // 設置結束時間為開始時間+30分鐘
        let endMinute = minute + 30;
        let endHour = hour;
        
        if (endMinute >= 60) {
            endMinute -= 60;
            endHour += 1;
            if (endHour >= 24) {
                endHour -= 24;
            }
        }
        
        document.getElementById('end-time').value = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    }


    function changeShift(shiftKey) {
        if (currentShift === shiftKey) return;
        
        // Update current shift
        currentShift = shiftKey;
        
        // Update button styles
        document.querySelectorAll('.shift-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`${shiftKey}-shift`).classList.add('active');
        
        // Re-render timeline
        renderTimelineTable();
        
        // Set default times
        setDefaultTimes();
        
        // Update time indicator for the new shift
        updateTimeIndicator();
    }
    
    // 保存到本地存儲
    function saveToLocalStorage() {
        const data = {};
        
        beds.forEach((bed, bedNumber) => {
            data[bedNumber] = {
                patientName: bed.patientName,
                tasks: bed.tasks.map(task => ({
                    id: task.id,
                    type: task.type,
                    description: task.description,
                    startTime: task.startTime,
                    endTime: task.endTime
                }))
            };
        });
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    
    // 從本地存儲載入
    function loadFromLocalStorage() {
        const dataStr = localStorage.getItem(STORAGE_KEY);
        if (!dataStr) return;
        
        try {
            const data = JSON.parse(dataStr);
            
            // 清除現有數據
            beds = new Map();
            
            // 載入數據
            Object.entries(data).forEach(([bedNumber, bedData]) => {
                // 添加到床位列表
                beds.set(bedNumber, {
                    patientName: bedData.patientName || '',
                    tasks: []
                });
                
                // 添加任務
                if (bedData.tasks) {
                    bedData.tasks.forEach(taskData => {
                        beds.get(bedNumber).tasks.push({
                            id: taskData.id || Date.now().toString(),
                            type: taskData.type,
                            description: taskData.description,
                            startTime: taskData.startTime,
                            endTime: taskData.endTime
                        });
                    });
                }
            });
            
            // 重新渲染
            renderTimelineTable();
            
        } catch (error) {
            console.error('載入數據失敗:', error);
        }
    }
    
    // 清除所有數據
    function clearAllData() {
        if (!confirm('確定要清除所有資料嗎？此操作無法還原。')) return;
        
        localStorage.removeItem(STORAGE_KEY);
        beds = new Map();
        renderTimelineTable();
        alert('所有資料已清除');
    }
    
    // 初始化
    renderTimelineTable();
    setDefaultTimes();
    loadFromLocalStorage();
    addTimeIndicatorStyle();
    startTimeIndicator();
    
    // 事件監聽器
    document.getElementById('add-task').addEventListener('click', function() {
        const bedNumber = document.getElementById('bed-number').value.trim();
        const patientName = document.getElementById('patient-name').value.trim();
        const taskType = document.getElementById('task-type').value;
        const description = document.getElementById('task-description').value.trim();
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;
        
        if (!bedNumber || !description || !startTime || !endTime) {
            alert('請填寫所有必要欄位');
            return;
        }
        
        // 檢查時間格式
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            alert('請使用有效的時間格式（HH:MM）');
            return;
        }
        
        // 檢查結束時間是否合理
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        
        // 允許跨日的情況
        let isValidTime = true;
        
        // 如果結束時間小於開始時間，但差距超過12小時，可能是輸入錯誤
        if (endHours < startHours) {
            const hourDiff = (24 + endHours) - startHours;
            if (hourDiff > 12) {
                isValidTime = false;
            }
        } else if (endHours === startHours && endMinutes <= startMinutes) {
            isValidTime = false;
        }
        
        if (!isValidTime) {
            if (!confirm('結束時間似乎早於開始時間，確定要添加此任務嗎？')) {
                return;
            }
        }
        
        addTask(bedNumber, patientName, taskType, description, startTime, endTime);
        document.getElementById('task-description').value = '';
    });

        // 為每個過濾按鈕添加點擊事件
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                this.classList.toggle('active');
                filterTasks();
            });
        });

    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const templateId = this.dataset.template;
            showBedSelector(templateId);
        });
    });
    
    document.getElementById('close-details').addEventListener('click', function() {
        taskDetails.style.display = 'none';
        currentTaskId = null;
    });
    
    document.getElementById('delete-task').addEventListener('click', function() {
        if (!currentTaskId) return;
        
        for (const [bedNumber, bed] of beds.entries()) {
            const task = bed.tasks.find(t => t.id === currentTaskId);
            if (task) {
                deleteTask(bedNumber, currentTaskId);
                break;
            }
        }
        
        taskDetails.style.display = 'none';
        currentTaskId = null;
    });
    
    document.getElementById('save-data').addEventListener('click', function() {
        saveToLocalStorage();
        alert('資料已成功儲存！');
    });
    
    document.getElementById('clear-data').addEventListener('click', clearAllData);
    
    // 過濾器事件
    document.getElementById('exam-filter').addEventListener('change', filterTasks);
    document.getElementById('medication-filter').addEventListener('change', filterTasks);
    document.getElementById('surgery-filter').addEventListener('change', filterTasks);
    document.getElementById('treatment-filter').addEventListener('change', filterTasks);
    document.getElementById('other-filter').addEventListener('change', filterTasks);
    
    // 班別切換事件 - 大夜/白班/小夜順序
    document.getElementById('night-shift').addEventListener('click', function() {
        changeShift('night');
    });
    document.getElementById('day-shift').addEventListener('click', function() {
        changeShift('day');
    });
    document.getElementById('evening-shift').addEventListener('click', function() {
        changeShift('evening');
    });
    
    // 點擊空白處關閉詳情
    document.addEventListener('click', function(e) {
        if (!taskDetails.contains(e.target) && 
            !e.target.classList.contains('task')) {
            taskDetails.style.display = 'none';
            currentTaskId = null;
        }
    });
    
    // 離開頁面前自動保存
    window.addEventListener('beforeunload', saveToLocalStorage);
});