        // 初始化應用程式
        document.addEventListener('DOMContentLoaded', function() {
            // 從本地存儲加載數據
            loadPatientsFromStorage();
            
            // 添加模板選擇區
            addTemplateSelectors();
            
            // 新增病患按鈕事件（覆蓋原來的函數）
            document.getElementById('add-patient-btn').addEventListener('click', addNewPatient);

            // 添加主題樣式
            addThemeStyles();
            
            // 獲取當前班別並設置主題
            const currentShift = document.querySelector('.shift-btn.active').dataset.shift || 'D';
            updateThemeForShift(currentShift);
            updateCurrentShiftIndicator(currentShift);
            
            // 設置班別按鈕
            setupShiftButtons();

            addCollapsibleStyles();

            expandedCategories = {};

            // 添加班別特定樣式
            addShiftSpecificStyles();
            
            // 班別切換事件
            document.querySelectorAll('.shift-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    updateAllChecklistsForShift(this.dataset.shift);
                });
            });
        });

        //全局變量來存儲各病患各類別的展開狀態
        let expandedCategories = {};
        
        // 定義護理檢查項目
        const nursingTasksByShift = {
            'D': [ // 白班特定項目
                { category: '必填紀錄', items: [
                    '9點Vital Sign',
                    '13點Vital Sign',
                    '每日評估',
                    '跌倒評估',
                    '護理計劃'
                ]},
                { category: '需檢查', items: [
                    '疼痛評估',
                    '傷口紀錄',
                    '壓傷評估(每週五)',
                    '出院準備評估(每週五)',
                    '管路管理與評估',
                ]},
                { category: 'Care與換藥', items: [
                    '晨間護理',
                    '傷口換藥'
                ]},
                { category: '護理紀錄', items: [
                    '護理計劃',
                    '護理評值',
                    '高風險用藥紀錄',
                    '檢查紀錄'
                ]},
                { category: '檢查與手術', items: [
                    '晨間X-ray準備',
                    '檢查前禁食確認'
                ]},
                { category: '藥物提醒', items: [
                    '9點藥物',
                    '13點藥物',
                    '更換點滴(視需要)'
                ]},
                { category: '出入院護理', items: [
                ]},
                { category: '其他', items: [
                    '計價',
                    '白班交班單'
                ]}
            ],
            'N': [ // 小夜特定項目
                { category: '必填紀錄', items: [
                    '17點Vital Sign',
                    '病患交班',
                    '管路評估',
                    '護理紀錄撰寫'
                ]},
                { category: '需檢查', items: [
                    '晚間疼痛評估',
                    '傷口觀察',
                    '管路滲漏檢查',
                    '晚間輸入輸出 I/O',
                    '晚餐前血糖值'
                ]},
                { category: 'Care與換藥', items: [
                    '晚間護理',
                    '傷口換藥',
                    '點滴部位評估',
                    '床單更換'
                ]},
                { category: '護理紀錄', items: [
                    '護理問題處理',
                    '護理進展紀錄',
                    '高風險用藥紀錄'
                ]},
                { category: '檢查與手術', items: [
                    '術後觀察',
                    '檢查結果追蹤'
                ]},
                { category: '藥物提醒', items: [
                    '17點口服藥',
                    '21點口服藥',
                    '點滴更換(視需要)'
                ]},
                { category: '出入院護理', items: [
                ]},
                { category: '其他', items: [
                    '計價',
                    '小夜交班單'
                ]}
            ],
            'E': [ // 大夜特定項目
                { category: '每日必填', items: [
                    '夜間Vital Sign',
                    '病患交班',
                    '夜間巡視記錄'
                ]},
                { category: '需檢查', items: [
                    '夜間疼痛評估',
                    '睡眠品質評估',
                    '約束帶評估(若有使用)',
                    '夜間輸入輸出 I/O',
                    '凌晨血糖值(若需要)'
                ]},
                { category: 'Care與換藥', items: [
                    '夜間護理',
                    '管路照護',
                    '體位變換'
                ]},
                { category: '護理紀錄', items: [
                    '護理問題更新',
                    '夜間事件記錄',
                    '特殊狀況處理'
                ]},
                { category: '檢查與手術', items: [
                    '術前準備(隔日手術)',
                    '凌晨抽血準備'
                ]},
                { category: '藥物提醒', items: [
                    '夜間藥物',
                    '點滴更換(視需要)'
                ]},
                { category: '出入院護理', items: [
                ]},
                { category: '其他', items: [
                    '計價',
                    '大夜交班單'
                ]}
            ]
        };

        // 定義護理模板任務集
        const nursingTemplates = {
            'NG': [
                { task: 'NG灌食紀錄', category: '需檢查' },
                { task: 'NG Care', category: 'Care與換藥' },
                { task: 'NG藥物灌注', category: '藥物提醒' },
                { task: 'NG管滲漏評估', category: '需檢查' }
            ],
            'Foley': [
                { task: 'Foley Care', category: 'Care與換藥' },
                { task: '尿液外觀評估', category: '需檢查' },
                { task: '每班I/O紀錄', category: '需檢查' }
            ],
            'CVC': [
                { task: 'CVC Care', category: 'Care與換藥' },
            ],
            '傷口': [
                { task: '傷口換藥', category: 'Care與換藥' },
                { task: '傷口滲液評估', category: '需檢查' },
                { task: '傷口紀錄', category: '需檢查' },
                { task: '傷口照片上傳', category: '護理紀錄' }
            ],
            '血糖': [
                { task: '飯前血糖測量', category: '需檢查' },
                { task: '飯後血糖測量', category: '需檢查' },
                { task: '血糖紀錄', category: '護理紀錄' },
                { task: '胰島素注射', category: '藥物提醒' }
            ],
            
            'I/O': [
                { task: '每班I/O紀錄', category: '需檢查' },
                { task: '加總I/O', category: '護理紀錄' },
            ],
            '輸血': [
                { task: '每班I/O紀錄', category: '需檢查' },
                { task: '24小時加總I/O', category: '護理紀錄' },
            ],
            '門診轉入': [
                { task: '入院護理摘要', category: '出入院護理' }
            ],
            '急診轉入': [
                { task: '入院護理摘要', category: '出入院護理' },
                { task: '身高體重', category: '出入院護理' },
                { task: '聯絡當科', category: '出入院護理' },
                { task: 'Vital Sign', category: '出入院護理' },
                { task: '入院護理評估', category: '出入院護理' },
                { task: '新增跌倒評估', category: '出入院護理' },
                { task: '新增壓傷、傷口評估', category: '出入院護理' },
                { task: '新增護理計劃', category: '出入院護理' },
                { task: '新增衛教指導', category: '出入院護理' },
            ],
            '加護病房': [
                { task: '入院護理摘要', category: '出入院護理' }
            ],
            '普通病房': [
                { task: '入院護理摘要', category: '出入院護理' }
            ],
            '出院': [
                { task: '出院護理摘要', category: '出入院護理' },
                { task: '退藥、還自備藥', category: '出入院護理' },
                { task: '拔手圈', category: '出入院護理' },
                { task: '拔IC與管路(如有需要)', category: '出入院護理' },
            ],
            '轉出': [
                { task: '出院護理摘要', category: '出入院護理' },
                
            ],
            '死亡': [
                { task: '出院病歷摘要', category: '出入院護理' },
                { task: '貼EKG紙', category: '出入院護理' },
                { task: '遺體通知單', category: '出入院護理' },
                { task: '拔IC與管路(如有需要)', category: '出入院護理' },
                { task: '確認診斷書份數', category: '出入院護理' },
            ]
        };

        // 修改addNewPatient函數的對應部分
        function addNewPatient() {
            // 原有代碼保持不變，直到創建病患對象的部分
            const nameInput = document.getElementById('patient-name');
            const idInput = document.getElementById('patient-id');
            const diagnosisInput = document.getElementById('patient-diagnosis');
            
            const name = nameInput.value.trim();
            const id = idInput.value.trim();
            const diagnosis = diagnosisInput.value.trim();
            
            if (!id) {
                alert('請輸入病床號');
                return;
            }
            
            // 創建基本病患對象，為每個班別創建對應的checklist
            const patient = {
                id: Date.now().toString(),
                name: name,
                bedId: id,
                diagnosis: diagnosis,
                checklists: {
                    'D': createNewChecklist('D'), // 白班特定checklist
                    'N': createNewChecklist('N'), // 小夜特定checklist
                    'E': createNewChecklist('E')  // 大夜特定checklist
                }
            };
            
            // 獲取選擇的模板
            const selectedTemplateButtons = document.querySelectorAll('.template-btn.active');
            const selectedTemplates = Array.from(selectedTemplateButtons).map(btn => btn.dataset.template);
            
            // 添加模板任務
            if (selectedTemplates.length > 0) {
                addTemplateTasksToPatient(patient, selectedTemplates);
            }
            
            // 其餘代碼不變...
            // 添加到本地存儲
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            patients.push(patient);
            localStorage.setItem('patients', JSON.stringify(patients));
            
            // 重新加載病患列表
            loadPatientsFromStorage();
            
            // 清空輸入欄位和選擇的模板
            nameInput.value = '';
            idInput.value = '';
            diagnosisInput.value = '';
            document.querySelectorAll('.template-btn.active').forEach(btn => btn.classList.remove('active'));
            updateSelectedTemplates();
            
            // 聚焦回病患姓名輸入框
            nameInput.focus();
        }

        // 創建新的檢查清單
        function createNewChecklist(shift = 'D') {
            const checklist = [];
            const tasksByShift = nursingTasksByShift[shift] || nursingTasksByShift['D'];
            
            tasksByShift.forEach(category => {
                category.items.forEach(task => {
                    checklist.push({
                        task: task,
                        category: category.category,
                        completed: false,
                        time: null,
                        isCustom: false
                    });
                });
            });
            
            return checklist;
        }
        
        // 從本地存儲加載病患
        // 載入現有病患時確保他們有班別特定的checklist
        function loadPatientsFromStorage() {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const container = document.getElementById('patients-container');
            const currentShift = document.querySelector('.shift-btn.active').dataset.shift;
            
            container.innerHTML = '';
            
            if (patients.length === 0) {
                container.innerHTML = '<p>尚未新增病患</p>';
                return;
            }
            
            patients.forEach(patient => {
                // 確保病患有所有班別的清單，且是班別特定的清單
                if (!patient.checklists) {
                    patient.checklists = {
                        'D': createNewChecklist('D'),
                        'N': createNewChecklist('N'),
                        'E': createNewChecklist('E')
                    };
                } else {
                    // 檢查各班別清單是否需要升級為班別特定清單
                    ['D', 'N', 'E'].forEach(shift => {
                        // 如果沒有特定班別的清單，創建一個
                        if (!patient.checklists[shift]) {
                            patient.checklists[shift] = createNewChecklist(shift);
                        }
                    });
                }
                
                // 確保每個任務項目有isCustom屬性
                Object.keys(patient.checklists).forEach(shift => {
                    patient.checklists[shift].forEach(item => {
                        if (item.isCustom === undefined) {
                            item.isCustom = false;
                        }
                    });
                });
                
                const patientCard = createPatientCard(patient, currentShift);
                container.appendChild(patientCard);
            });
            
            // 更新本地存儲
            localStorage.setItem('patients', JSON.stringify(patients));
        }
        
        // 創建病患卡片
        function createPatientCard(patient, shift) {
            const card = document.createElement('div');
            card.className = 'patient-card';
            card.dataset.patientId = patient.id;
            
            const checklist = patient.checklists[shift] || createNewChecklist();
            const completedCount = checklist.filter(item => item.completed).length;
            const totalCount = checklist.length;
            const progressPercentage = Math.round((completedCount / totalCount) * 100);
            
            card.innerHTML = `
                <button class="delete-btn" onclick="deletePatient('${patient.id}')">✕</button>
                <div class="patient-info">
                    <h3>${patient.bedId}  ${patient.name ? maskMiddleChar(patient.name) : ' '}</h3>
                    <div>診斷：${patient.diagnosis || '無'}</div>
                </div>
                <div class="checklist-container">
                    <ul class="checklist" id="checklist-${patient.id}"></ul>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${progressPercentage}%"></div>
                </div>
                <div class="statistics">
                    <span>完成: ${completedCount}/${totalCount}</span>
                    <span>${progressPercentage}%</span>
                </div>
            `;
            
            setTimeout(() => {
                const checklistEl = document.getElementById(`checklist-${patient.id}`);
                renderChecklist(checklistEl, checklist, patient.id, shift);
                
                // 添加模板按鈕
                addTemplateButtonsToPatientCard(card, patient.id);
            }, 0);
            
            return card;
        }
        
        // 渲染檢查清單
        function renderChecklist(container, checklist, patientId, shift) {
            // 按類別分組
            const categories = {};
            checklist.forEach(item => {
                if (!categories[item.category]) {
                    categories[item.category] = [];
                }
                categories[item.category].push(item);
            });
            
            // 清空容器
            container.innerHTML = '';
            
            // 為每個類別渲染項目
            Object.keys(categories).forEach(category => {
                // 創建類別容器
                const categoryContainer = document.createElement('div');
                categoryContainer.className = 'checklist-category-container';
                container.appendChild(categoryContainer);
                
                // 確定此類別是否應該展開
                const isExpanded = expandedCategories[patientId]?.[shift]?.[category] === true;
                
                // 創建類別標題（可點擊）
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'checklist-category' + (isExpanded ? '' : ' collapsed');
                categoryHeader.innerHTML = `
                    <span class="category-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
                    <span class="category-title">${category}</span>
                    <span class="category-count">${categories[category].filter(item => item.completed).length}/${categories[category].length}</span>
                    <button class="add-task-btn" onclick="showAddTaskInput('${patientId}', '${shift}', '${category}')">+</button>
                `;
                categoryContainer.appendChild(categoryHeader);
                
                // 添加類別標題點擊事件
                categoryHeader.addEventListener('click', function(e) {
                    // 如果點擊的是添加按鈕，不切換展開/收合狀態
                    if (e.target.className === 'add-task-btn') {
                        e.stopPropagation();
                        return;
                    }
                    
                    // 切換展開/收合狀態
                    this.classList.toggle('collapsed');
                    const isNowExpanded = !this.classList.contains('collapsed');
                    
                    // 儲存展開狀態
                    if (!expandedCategories[patientId]) expandedCategories[patientId] = {};
                    if (!expandedCategories[patientId][shift]) expandedCategories[patientId][shift] = {};
                    expandedCategories[patientId][shift][category] = isNowExpanded;
                    
                    // 更新 UI
                    const itemsContainer = this.nextElementSibling;
                    itemsContainer.classList.toggle('hidden');
                    
                    // 更新箭頭圖標
                    const toggleIcon = this.querySelector('.category-toggle-icon');
                    toggleIcon.textContent = isNowExpanded ? '▼' : '▶';
                });
                
                // 創建任務項目容器（根據展開狀態決定是否隱藏）
                const itemsContainer = document.createElement('div');
                itemsContainer.className = 'checklist-items-container' + (isExpanded ? '' : ' hidden');
                categoryContainer.appendChild(itemsContainer);
                
                // 添加任務輸入欄位（初始為隱藏）
                const taskInputContainer = document.createElement('div');
                taskInputContainer.className = 'task-input-container hidden';
                taskInputContainer.id = `task-input-${patientId}-${category.replace(/\s+/g, '-')}`;
                taskInputContainer.innerHTML = `
                    <input type="text" class="task-input" placeholder="輸入新任務">
                    <button class="add-task-confirm" onclick="addCustomTask('${patientId}', '${shift}', '${category}')">新增</button>
                `;
                
                // 為新任務輸入框添加Enter鍵事件
                taskInputContainer.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustomTask(patientId, shift, category);
                    }
                });
                
                itemsContainer.appendChild(taskInputContainer);
                
                // 添加任務項目
                categories[category].forEach((item, index) => {
                    const itemElement = document.createElement('li');
                    itemElement.className = 'checklist-item' + (item.completed ? ' completed' : '');
                    
                    // 添加點擊事件到整個項目
                    itemElement.addEventListener('click', function(e) {
                        // 確保不是點擊刪除按鈕
                        if (e.target.className !== 'delete-task-btn') {
                            const checkbox = this.querySelector('input[type="checkbox"]');
                            checkbox.checked = !checkbox.checked;
                            toggleTaskCompletion(patientId, shift, item.task, checkbox.checked);
                        }
                    });
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = item.completed;
                    checkbox.onclick = function(e) {
                        // 阻止事件傳播，避免觸發項目的點擊事件
                        e.stopPropagation();
                        toggleTaskCompletion(patientId, shift, item.task, this.checked);
                    };
                    
                    const label = document.createElement('label');
                    label.textContent = item.task;
                    
                    const time = document.createElement('span');
                    time.className = 'time';
                    time.textContent = item.time || '';
                    
                    // 為所有項目添加刪除按鈕，無論是否為自定義項目或已完成項目
                    const deleteTaskBtn = document.createElement('button');
                    deleteTaskBtn.textContent = '✕';
                    deleteTaskBtn.className = 'delete-task-btn';
                    deleteTaskBtn.style.fontSize = '12px';
                    deleteTaskBtn.style.padding = '3px 6px';
                    deleteTaskBtn.style.marginLeft = '5px';
                    deleteTaskBtn.style.backgroundColor = '#D1D5DD';
                    deleteTaskBtn.onclick = function(e) {
                        e.stopPropagation();
                        deleteTask(patientId, shift, item.task, true); // 假設所有任務都可刪除
                    };
                    time.appendChild(deleteTaskBtn);
                    
                    itemElement.appendChild(checkbox);
                    itemElement.appendChild(label);
                    itemElement.appendChild(time);
                    itemsContainer.appendChild(itemElement);
                });
            });
        }

        // 顯示添加任務輸入框
        function showAddTaskInput(patientId, shift, category) {
            const inputContainerId = `task-input-${patientId}-${category.replace(/\s+/g, '-')}`;
            const inputContainer = document.getElementById(inputContainerId);
            
            if (inputContainer) {
                // 如果任務輸入框被隱藏，則先確保類別是展開的
                if (inputContainer.classList.contains('hidden')) {
                    const categoryHeader = inputContainer.closest('.checklist-category-container').querySelector('.checklist-category');
                    const itemsContainer = inputContainer.closest('.checklist-items-container');
                    
                    if (categoryHeader.classList.contains('collapsed')) {
                        // 手動展開類別
                        categoryHeader.classList.remove('collapsed');
                        itemsContainer.classList.remove('hidden');
                        categoryHeader.querySelector('.category-toggle-icon').textContent = '▼';
                        
                        // 更新展開狀態
                        if (!expandedCategories[patientId]) expandedCategories[patientId] = {};
                        if (!expandedCategories[patientId][shift]) expandedCategories[patientId][shift] = {};
                        expandedCategories[patientId][shift][category] = true;
                    }
                }
                
                inputContainer.classList.toggle('hidden');
                if (!inputContainer.classList.contains('hidden')) {
                    inputContainer.querySelector('input').focus();
                }
            }
        }
        // 新增自訂任務
        function addCustomTask(patientId, shift, category) {
            const inputContainerId = `task-input-${patientId}-${category.replace(/\s+/g, '-')}`;
            const inputContainer = document.getElementById(inputContainerId);
            const taskInput = inputContainer.querySelector('input');
            const taskName = taskInput.value.trim();
            
            if (!taskName) {
                return;
            }
            
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const patientIndex = patients.findIndex(p => p.id === patientId);
            
            if (patientIndex !== -1) {
                const patient = patients[patientIndex];
                const checklist = patient.checklists[shift];
                
                // 檢查是否重複
                const isDuplicate = checklist.some(item => item.task === taskName);
                if (isDuplicate) {
                    alert('此任務已存在！');
                    return;
                }
                
                // 新增任務
                checklist.push({
                    task: taskName,
                    category: category,
                    completed: false,
                    time: null,
                    isCustom: true
                });
                
                // 更新本地存儲
                localStorage.setItem('patients', JSON.stringify(patients));
                
                // 更新UI
                taskInput.value = '';
                inputContainer.classList.add('hidden');
                
                // 確保類別保持展開狀態
                if (!expandedCategories[patientId]) expandedCategories[patientId] = {};
                if (!expandedCategories[patientId][shift]) expandedCategories[patientId][shift] = {};
                expandedCategories[patientId][shift][category] = true;
                
                updatePatientCard(patient, shift);
            }
        }
        // 刪除自訂任務
        function deleteCustomTask(patientId, shift, taskName) {
            if (confirm('確定要刪除此任務嗎？')) {
                const patients = JSON.parse(localStorage.getItem('patients') || '[]');
                const patientIndex = patients.findIndex(p => p.id === patientId);
                
                if (patientIndex !== -1) {
                    const patient = patients[patientIndex];
                    
                    // 找出任務所屬的類別
                    const taskItem = patient.checklists[shift].find(item => item.task === taskName);
                    const category = taskItem ? taskItem.category : null;
                    
                    // 刪除任務
                    patient.checklists[shift] = patient.checklists[shift].filter(item => item.task !== taskName);
                    
                    // 更新本地存儲
                    localStorage.setItem('patients', JSON.stringify(patients));
                    
                    // 更新UI
                    updatePatientCard(patient, shift);
                }
            }
        }
        // 切換任務完成狀態
        function toggleTaskCompletion(patientId, shift, taskName, isCompleted) {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const patientIndex = patients.findIndex(p => p.id === patientId);
            
            if (patientIndex !== -1) {
                const patient = patients[patientIndex];
                const checklist = patient.checklists[shift];
                
                const taskIndex = checklist.findIndex(item => item.task === taskName);
                if (taskIndex !== -1) {
                    const category = checklist[taskIndex].category;
                    checklist[taskIndex].completed = isCompleted;
                    checklist[taskIndex].time = isCompleted ? getCurrentTime() : null;
                    
                    // 更新本地存儲
                    localStorage.setItem('patients', JSON.stringify(patients));
                    
                    // 更新 UI：只更新該項目和統計信息，不重新渲染整個卡片
                    updateTaskUI(patientId, taskName, isCompleted);
                    updateCategoryStatistics(patientId, category, shift);
                    updatePatientProgress(patient, shift);
                }
            }
        }


        // 更新病患卡片
        function updatePatientCard(patient, shift) {
            // 如果是添加或刪除任務時調用此函數，則需要重新渲染整個清單
            const card = document.querySelector(`.patient-card[data-patient-id="${patient.id}"]`);
            if (card) {
                const checklist = patient.checklists[shift];
                const checklistEl = document.getElementById(`checklist-${patient.id}`);
                
                // 重新渲染清單
                renderChecklist(checklistEl, checklist, patient.id, shift);
                
                // 更新進度條
                const completedCount = checklist.filter(item => item.completed).length;
                const totalCount = checklist.length;
                const progressPercentage = Math.round((completedCount / totalCount) * 100);
                
                card.querySelector('.progress').style.width = `${progressPercentage}%`;
                card.querySelector('.statistics').innerHTML = `
                    <span>完成: ${completedCount}/${totalCount}</span>
                    <span>${progressPercentage}%</span>
                `;
            }
        }
        // 獲取當前時間
        function getCurrentTime() {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        }
        
        // 刪除病患
        function deletePatient(patientId) {
            if (confirm('確定要刪除此病患嗎？此操作無法復原。')) {
                const patients = JSON.parse(localStorage.getItem('patients') || '[]');
                const updatedPatients = patients.filter(p => p.id !== patientId);
                
                localStorage.setItem('patients', JSON.stringify(updatedPatients));
                
                // 重新加載病患列表
                loadPatientsFromStorage();
            }
        }
        
        // 更新所有清單的班別
        function updateAllChecklistsForShift(shift) {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            loadPatientsFromStorage();
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

        // 更新已選擇的模板顯示
        function updateSelectedTemplates() {
            const selectedButtons = document.querySelectorAll('.template-btn.active');
            const templateList = document.getElementById('template-list');
            
            const templates = Array.from(selectedButtons).map(btn => btn.textContent);
            templateList.textContent = templates.length > 0 ? templates.join(', ') : '無';
        }

        // 添加模板任務到病患的檢查清單
        function addTemplateTasksToPatient(patient, selectedTemplates) {
            // 只添加到當前選中的班別
            const currentShift = document.querySelector('.shift-btn.active').dataset.shift;
            const checklist = patient.checklists[currentShift];
            
            selectedTemplates.forEach(templateName => {
                const template = nursingTemplates[templateName];
                
                template.forEach(templateItem => {
                    // 檢查任務是否已存在
                    const taskExists = checklist.some(item => item.task === templateItem.task);
                    
                    if (!taskExists) {
                        checklist.push({
                            task: templateItem.task,
                            category: templateItem.category,
                            completed: false,
                            time: null,
                            isCustom: true
                        });
                    }
                });
            });
            
            return patient;
        }
        function addTemplateSelectors() {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group template-selectors';
            
            // 獲取當前班別
            const currentShift = document.querySelector('.shift-btn.active').dataset.shift;
            const shiftName = shiftThemes[currentShift].name;
            const shiftIcon = shiftThemes[currentShift].icon;
            
            formGroup.innerHTML = `
                <label>快速添加${shiftIcon} <span class="current-shift-name">${shiftName}</span> 護理模板：</label>
                <div class="template-buttons" style ="flex-direction: column">
                    <div class="selected-templates">
                        常見常規
                        <button type="button" class="template-btn" data-template="傷口">傷口</button>
                        <button type="button" class="template-btn" data-template="血糖">血糖</button>
                        <button type="button" class="template-btn" data-template="I/O">I/O</button>
                        <button type="button" class="template-btn" data-template="輸血">輸血</button>
                    </div>
                    <div class="selected-templates">
                        管路
                        <button type="button" class="template-btn" data-template="NG">NG</button>
                        <button type="button" class="template-btn" data-template="Foley">Foley</button>
                        <button type="button" class="template-btn" data-template="CVC">CVC</button>
                    </div>
                    <div class="selected-templates">
                        出入院護理
                        <button type="button" class="template-btn" data-template="門診轉入">門診轉入</button>
                        <button type="button" class="template-btn" data-template="急診轉入">急診轉入</button>
                        <button type="button" class="template-btn" data-template="加護病房">加護病房</button>
                        <button type="button" class="template-btn" data-template="普通病房">普通病房</button>
                        <button type="button" class="template-btn" data-template="出院">出院</button>
                        <button type="button" class="template-btn" data-template="轉出">轉出</button>
                        <button type="button" class="template-btn" data-template="死亡">死亡</button>
                    </div>
                </div>
                <div class="selected-templates" id="selected-templates">
                    已選擇: <span id="template-list"></span>
                </div>
            `;
            
            // 插入到表單中
            const addPatientBtn = document.getElementById('add-patient-btn');
            addPatientBtn.parentNode.insertBefore(formGroup, addPatientBtn);
            
            // 為模板按鈕添加事件
            document.querySelectorAll('.template-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    this.classList.toggle('active');
                    updateSelectedTemplates();
                });
            });
        }
        // 在病患卡片中添加模板按鈕
        function addTemplateButtonsToPatientCard(patientCard, patientId) {
            const currentShift = document.querySelector('.shift-btn.active').dataset.shift;
            const shiftName = shiftThemes[currentShift].name;
            const shiftIcon = shiftThemes[currentShift].icon;
            
            const templateContainer = document.createElement('div');
            templateContainer.className = 'patient-templates';
            templateContainer.innerHTML = `
                <div class="template-header">
                    快速添加${shiftIcon} <span class="current-shift-name">${shiftName}</span> 模板
                </div>
                <div class="template-buttons">
                    <button type="button" class="template-btn small" data-template="NG" onclick="addTemplateToExistingPatient('${patientId}', 'NG')">+NG</button>
                    <button type="button" class="template-btn small" data-template="Foley" onclick="addTemplateToExistingPatient('${patientId}', 'Foley')">+Foley</button>
                    <button type="button" class="template-btn small" data-template="CVC" onclick="addTemplateToExistingPatient('${patientId}', 'CVC')">+CVC</button>
                    <button type="button" class="template-btn small" data-template="傷口" onclick="addTemplateToExistingPatient('${patientId}', '傷口')">+傷口</button>
                    <button type="button" class="template-btn small" data-template="血糖" onclick="addTemplateToExistingPatient('${patientId}', '血糖')">+血糖</button>
                    <button type="button" class="template-btn small" data-template="I/O" onclick="addTemplateToExistingPatient('${patientId}', 'I/O')">+I/O</button>
                    <button type="button" class="template-btn small" data-template="輸血" onclick="addTemplateToExistingPatient('${patientId}', '輸血')">+輸血</button>
                    <button type="button" class="template-btn small" data-template="出院" onclick="addTemplateToExistingPatient('${patientId}', '出院')">+出院</button>
                    <button type="button" class="template-btn small" data-template="轉出" onclick="addTemplateToExistingPatient('${patientId}', '轉出')">+轉出</button>
                    <button type="button" class="template-btn small" data-template="死亡" onclick="addTemplateToExistingPatient('${patientId}', '死亡')">+死亡</button>
                </div>
            `;
            
            const patientInfo = patientCard.querySelector('.patient-info');
            patientInfo.appendChild(templateContainer);
        }

        // 為已存在的病患添加模板任務
        function addTemplateToExistingPatient(patientId, templateName) {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const patientIndex = patients.findIndex(p => p.id === patientId);
            
            if (patientIndex !== -1) {
                const patient = patients[patientIndex];
                const currentShift = document.querySelector('.shift-btn.active').dataset.shift;
                
                // 僅添加到當前班別
                const template = nursingTemplates[templateName];
                const checklist = patient.checklists[currentShift];
                
                let tasksAdded = 0;
                
                template.forEach(templateItem => {
                    // 檢查任務是否已存在
                    const taskExists = checklist.some(item => item.task === templateItem.task);
                    
                    if (!taskExists) {
                        checklist.push({
                            task: templateItem.task,
                            category: templateItem.category,
                            completed: false,
                            time: null,
                            isCustom: true // 標記為自定義任務，以便可以刪除
                        });
                        tasksAdded++;
                    }
                });
                
                // 更新本地存儲
                localStorage.setItem('patients', JSON.stringify(patients));
                
                // 更新UI
                updatePatientCard(patient, currentShift);
                
                // 顯示添加結果
                if (tasksAdded > 0) {
                    alert(`成功為病患添加${tasksAdded}個${templateName}相關任務`);
                } else {
                    alert(`病患已有所有${templateName}相關任務，未添加新任務`);
                }
            }
        }
        // 添加必要的CSS樣式
        const styleElement = document.createElement('style');
        styleElement.textContent = `
        .template-selectors {
            margin-top: 15px;
            border-top: 1px solid #E3E6EC;
            padding-top: 15px;
        }

        .template-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 5px;
        }

        .template-btn {
            background-color: #E3E6EC;
            color: #444441;
            padding: 8px 12px;
            border-radius: 4px;
        }

        .template-btn.active {
            background-color: #2C5A96;
            color: white;
        }

        .template-btn.small {
            font-size: 12px;
            padding: 4px 8px;
        }

        .selected-templates {
            margin-top: 10px;
            font-size: 14px;
            color: #6B6A64;
        }

        .patient-templates {
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px dashed #E3E6EC;
        }
        `;
        document.head.appendChild(styleElement);

        // 定義班別主題顏色
        const shiftThemes = {
            'D': { // 白班主題
                name: '白班',
                primaryColor: '#2C5A96', // 藍色
                secondaryColor: '#1F4474',
                headerBg: '#D7E1F2',
                cardBorder: '#B6CCF0',
                cardHeader: '#EDF2FA',
                progressBar: '#2C5A96',
                buttonColor: '#2C5A96',
                icon: '☀️' // 太陽圖示
            },
            'N': { // 小夜主題
                name: '小夜',
                primaryColor: '#AD5C28', // 橙色
                secondaryColor: '#8A4A20',
                headerBg: '#F9EBE3',
                cardBorder: '#F8D2B5',
                cardHeader: '#FDF4EE',
                progressBar: '#AD5C28',
                buttonColor: '#AD5C28',
                icon: '🌆' // 黃昏圖示
            },
            'E': { // 大夜主題
                name: '大夜',
                primaryColor: '#444441', // 深藍色/深灰色
                secondaryColor: '#26262B',
                headerBg: '#ECEEF3',
                cardBorder: '#D1D5DD',
                cardHeader: '#F1F3F8',
                progressBar: '#444441',
                buttonColor: '#444441',
                icon: '🌙' // 月亮圖示
            }
        };

        // 根據班別更新主題
        function updateThemeForShift(shift) {
            const theme = shiftThemes[shift];
            
            if (!theme) return;
            
            // 更新CSS變數
            document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
            document.documentElement.style.setProperty('--secondary-color', theme.secondaryColor);
            document.documentElement.style.setProperty('--header-bg', theme.headerBg);
            document.documentElement.style.setProperty('--card-border', theme.cardBorder);
            document.documentElement.style.setProperty('--card-header', theme.cardHeader);
            document.documentElement.style.setProperty('--progress-bar', theme.progressBar);
            document.documentElement.style.setProperty('--button-color', theme.buttonColor);
            
            // 更新頁面頂部顏色和標題
            const header = document.querySelector('.header');
            if (header) {
                // 更新頁面標題，添加班別圖示
                const titleElement = header.querySelector('h1');
                if (titleElement) {
                    titleElement.innerHTML = `護理工作檢查清單 <span class="shift-indicator">${theme.icon} ${theme.name}</span>`;
                }
            }
            
            // 更新班別選擇器按鈕樣式
            document.querySelectorAll('.shift-btn').forEach(btn => {
                // 移除所有其他班別的類別
                btn.classList.remove('shift-d', 'shift-n', 'shift-e');
                
                // 添加當前班別的類別
                btn.classList.add(`shift-${shift.toLowerCase()}`);
                
                // 如果是活動班別，添加圖示
                if (btn.dataset.shift === shift) {
                    btn.innerHTML = `${shiftThemes[btn.dataset.shift].icon} ${btn.textContent.replace(/[☀️🌆🌙 ]/g, '')}`;
                } else {
                    btn.textContent = btn.textContent.replace(/[☀️🌆🌙 ]/g, '');
                }
            });
            
            // 更新所有病患卡片的樣式
            document.querySelectorAll('.patient-card').forEach(card => {
                // 設置卡片邊框顏色
                card.style.borderColor = theme.cardBorder;
                
                // 設置卡片頭部背景
                const patientInfo = card.querySelector('.patient-info');
                if (patientInfo) {
                    patientInfo.style.backgroundColor = theme.cardHeader;
                }
                
                // 更新進度條顏色
                const progress = card.querySelector('.progress');
                if (progress) {
                    progress.style.backgroundColor = theme.progressBar;
                }
            });
        }
        function addThemeStyles() {
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                :root {
                    --primary-color: #2C5A96;
                    --secondary-color: #1F4474;
                    --header-bg: #D7E1F2;
                    --card-border: #B6CCF0;
                    --card-header: #EDF2FA;
                    --progress-bar: #2C5A96;
                    --button-color: #2C5A96;
                }
                
                .header {
                    background-color: var(--header-bg);
                    transition: background-color 0.3s ease;
                    border-radius: 8px;
                    padding: 15px;
                    margin-top: 60px;
                }
                
                .shift-indicator {
                    font-size: 0.8em;
                    background-color: var(--primary-color);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    margin-left: 10px;
                    vertical-align: middle;
                }
                
                .shift-btn {
                    background-color: #E3E6EC;
                    color: #444441;
                    transition: all 0.3s ease;
                    margin-right: 5px;
                }
                
                .shift-btn.active {
                    background-color: var(--primary-color);
                    color: white;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                }
                
                /* 班別特定的按鈕樣式 */
                .shift-btn.shift-d {
                    border-bottom: 3px solid ${shiftThemes['D'].primaryColor};
                }
                
                .shift-btn.shift-n {
                    border-bottom: 3px solid ${shiftThemes['N'].primaryColor};
                }
                
                .shift-btn.shift-e {
                    border-bottom: 3px solid ${shiftThemes['E'].primaryColor};
                }
                
                .patient-card {
                    border: 1px solid var(--card-border);
                    border-top: 3px solid var(--primary-color);
                    transition: border-color 0.3s ease;
                }
                
                .patient-info {
                    background-color: var(--card-header);
                    transition: background-color 0.3s ease;
                    margin: -15px -15px 15px -15px;
                    padding: 15px;
                    border-radius: 8px 8px 0 0;
                }
                
                .progress {
                    background-color: var(--progress-bar);
                    transition: background-color 0.3s ease;
                }
                
                button:not(.shift-btn):not(.delete-btn):not(.template-btn) {
                    background-color: var(--button-color);
                    transition: background-color 0.3s ease;
                }
                
                button:not(.shift-btn):not(.delete-btn):not(.template-btn):hover {
                    background-color: var(--secondary-color);
                }
                
                .checklist-category {
                    color: var(--primary-color);
                    transition: color 0.3s ease;
                    border-bottom: 1px solid var(--card-border);
                    padding-bottom: 5px;
                }
                
                /* 添加頁面頂部班別指示器 */
                .current-shift-indicator {
                    position: fixed;
                    top: 0;
                    right: 20px;
                    background-color: var(--primary-color);
                    color: white;
                    padding: 5px 15px;
                    border-radius: 0 0 8px 8px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                    z-index: 1000;
                    transition: background-color 0.3s ease;
                }
            `;
            document.head.appendChild(styleElement);
            
            // 創建頁面頂部班別指示器
            const currentShiftIndicator = document.createElement('div');
            currentShiftIndicator.className = 'current-shift-indicator';
            document.body.appendChild(currentShiftIndicator);
        }
        
        // 更新頁面頂部班別指示器
        function updateCurrentShiftIndicator(shift) {
            const indicator = document.querySelector('.current-shift-indicator');
            if (indicator) {
                const theme = shiftThemes[shift];
                indicator.innerHTML = `${theme.icon} 當前班別: ${theme.name}`;
                indicator.style.backgroundColor = theme.primaryColor;
            }
        }
        
        // 修改班別切換事件
        function setupShiftButtons() {
            document.querySelectorAll('.shift-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const shift = this.dataset.shift;
                    
                    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    
                    // 更新主題
                    updateThemeForShift(shift);
                    
                    // 更新頁面頂部指示器
                    updateCurrentShiftIndicator(shift);
                    
                    // 更新病患清單
                    updateAllChecklistsForShift(shift);
                    
                    // 更新模板選擇器的班別標識
                    updateTemplateSelectorsShift(shift);
                });
            });
        }

        // 添加輔助函數來查找包含特定文本的元素
        Element.prototype.contains = function(text) {
            return this.textContent.includes(text);
        };

        // 添加收合功能相關的CSS樣式
        function addCollapsibleStyles() {
            const styleElement = document.createElement('style');
            styleElement.textContent = `
            /* 收合功能相關樣式 */
            .checklist-category-container {
                margin-bottom: 10px;
                border-radius: 4px;
                overflow: hidden;
            }

            .checklist-category {
                display: flex;
                align-items: center;
                padding: 8px 10px;
                background-color: #F7F8FB;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.2s;
                position: relative;
                border-left: 3px solid var(--primary-color, #6592CD);
            }

            .checklist-category:hover {
                background-color: #ECEEF3;
            }

            .category-toggle-icon {
                font-size: 10px;
                margin-right: 8px;
                color: #444441;
                transition: transform 0.2s;
            }

            .category-title {
                flex-grow: 1;
                font-weight: 600;
                color: #444441;
            }

            .category-count {
                margin-right: 10px;
                color: #6B6A64;
                font-size: 0.9em;
            }

            .checklist-items-container {
                padding: 0;
                max-height: 1000px;
                transition: max-height 0.3s ease-in-out;
                overflow: hidden;
            }

            .checklist-items-container.hidden {
                max-height: 0;
            }

            /* 確保任務項目列表的樣式保持不變 */
            .checklist-items-container .checklist-item {
                margin-left: 10px;
                padding: 8px 10px;
            }

            /* 添加任務按鈕樣式調整 */
            .checklist-category .add-task-btn {
                margin-left: 5px;
                background-color: transparent;
                color: white;
                padding: 2px 6px;
                font-size: 14px;
                line-height: 1;
                height: 24px;
                width: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .checklist-category .add-task-btn:hover {
                background-color: rgba(0, 0, 0, 0.1);
                color: #444441;
            }


            `;
            document.head.appendChild(styleElement);
        }

        // 添加一個函數，用於打開特定類別
        function updatePatientCard(patient, shift) {
            // 如果是添加或刪除任務時調用此函數，則需要重新渲染整個清單
            const card = document.querySelector(`.patient-card[data-patient-id="${patient.id}"]`);
            if (card) {
                const checklist = patient.checklists[shift];
                const checklistEl = document.getElementById(`checklist-${patient.id}`);
                
                // 重新渲染清單
                renderChecklist(checklistEl, checklist, patient.id, shift);
                
                // 更新進度條
                const completedCount = checklist.filter(item => item.completed).length;
                const totalCount = checklist.length;
                const progressPercentage = Math.round((completedCount / totalCount) * 100);
                
                card.querySelector('.progress').style.width = `${progressPercentage}%`;
                card.querySelector('.statistics').innerHTML = `
                    <span>完成: ${completedCount}/${totalCount}</span>
                    <span>${progressPercentage}%</span>
                `;
            }
        }
        // 添加一個函數，根據完成進度自動展開未完成任務較多的類別
        function autoExpandCategories(patientId, shift) {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const patient = patients.find(p => p.id === patientId);
            
            if (patient) {
                const checklist = patient.checklists[shift];
                
                // 按類別分組
                const categories = {};
                checklist.forEach(item => {
                    if (!categories[item.category]) {
                        categories[item.category] = {
                            total: 0,
                            completed: 0
                        };
                    }
                    categories[item.category].total++;
                    if (item.completed) {
                        categories[item.category].completed++;
                    }
                });
                
                // 計算每個類別的完成率
                const categoryCompletionRates = {};
                Object.keys(categories).forEach(category => {
                    const { total, completed } = categories[category];
                    categoryCompletionRates[category] = completed / total;
                });
                
                // 展開完成率低於50%的類別
                Object.keys(categoryCompletionRates).forEach(category => {
                    if (categoryCompletionRates[category] < 0.5) {
                        expandCategory(patientId, category);
                    }
                });
            }
        }

        function updateTaskUI(patientId, taskName, isCompleted) {
            const patientCard = document.querySelector(`.patient-card[data-patient-id="${patientId}"]`);
            if (patientCard) {
                // 找到該任務項
                const taskItems = patientCard.querySelectorAll('.checklist-item');
                for (let item of taskItems) {
                    const label = item.querySelector('label');
                    if (label && label.textContent === taskName) {
                        // 更新 checkbox 狀態
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (checkbox) checkbox.checked = isCompleted;
                        
                        // 更新 CSS 類
                        if (isCompleted) {
                            item.classList.add('completed');
                        } else {
                            item.classList.remove('completed');
                        }
                        
                        // 更新時間，但保留刪除按鈕
                        const timeSpan = item.querySelector('.time');
                        if (timeSpan) {
                            // 保存當前刪除按鈕(如果存在)
                            const deleteBtn = timeSpan.querySelector('.delete-task-btn');
                            
                            // 設置新的時間文本
                            timeSpan.textContent = isCompleted ? getCurrentTime() : '';
                            
                            // 如果之前有刪除按鈕，則重新添加
                            if (deleteBtn) {
                                timeSpan.appendChild(deleteBtn);
                            } else {
                                // 如果之前沒有刪除按鈕，創建一個新的
                                const newDeleteBtn = document.createElement('button');
                                newDeleteBtn.textContent = '✕';
                                newDeleteBtn.className = 'delete-task-btn';
                                newDeleteBtn.style.fontSize = '12px';
                                newDeleteBtn.style.padding = '3px 6px';
                                newDeleteBtn.style.marginLeft = '5px';
                                newDeleteBtn.style.backgroundColor = '#D1D5DD';
                                
                                // 為新按鈕添加點擊事件
                                newDeleteBtn.onclick = function(e) {
                                    e.stopPropagation();
                                    // 獲取當前班別
                                    const shift = document.querySelector('.shift-btn.active').dataset.shift;
                                    deleteTask(patientId, shift, taskName, true); // 假設所有任務都可刪除
                                };
                                
                                timeSpan.appendChild(newDeleteBtn);
                            }
                        }
                        
                        break;
                    }
                }
            }
        }
        
        // 新增函數：更新類別統計信息
        function updateCategoryStatistics(patientId, category, shift) {
            const patients = JSON.parse(localStorage.getItem('patients') || '[]');
            const patient = patients.find(p => p.id === patientId);
            
            if (patient) {
                const checklist = patient.checklists[shift];
                const categoryItems = checklist.filter(item => item.category === category);
                const completedCount = categoryItems.filter(item => item.completed).length;
                
                // 更新 UI
                const patientCard = document.querySelector(`.patient-card[data-patient-id="${patientId}"]`);
                if (patientCard) {
                    const categoryHeaders = patientCard.querySelectorAll('.checklist-category');
                    for (let header of categoryHeaders) {
                        const titleEl = header.querySelector('.category-title');
                        if (titleEl && titleEl.textContent === category) {
                            const countEl = header.querySelector('.category-count');
                            if (countEl) {
                                countEl.textContent = `${completedCount}/${categoryItems.length}`;
                            }
                            break;
                        }
                    }
                }
            }
        }

        // 新增函數：更新病患進度條
        function updatePatientProgress(patient, shift) {
            const patientCard = document.querySelector(`.patient-card[data-patient-id="${patient.id}"]`);
            if (patientCard) {
                const checklist = patient.checklists[shift];
                const completedCount = checklist.filter(item => item.completed).length;
                const totalCount = checklist.length;
                const progressPercentage = Math.round((completedCount / totalCount) * 100);
                
                patientCard.querySelector('.progress').style.width = `${progressPercentage}%`;
                patientCard.querySelector('.statistics').innerHTML = `
                    <span>完成: ${completedCount}/${totalCount}</span>
                    <span>${progressPercentage}%</span>
                `;
            }
        }

        function deleteTask(patientId, shift, taskName, isCustom) {
            // 不同的確認消息，區分預設和自定義任務
            const confirmMessage = isCustom 
                ? '確定要刪除此任務嗎？'
                : '確定要刪除預設任務嗎？這可能會影響工作流程。';
            
            if (confirm(confirmMessage)) {
                const patients = JSON.parse(localStorage.getItem('patients') || '[]');
                const patientIndex = patients.findIndex(p => p.id === patientId);
                
                if (patientIndex !== -1) {
                    const patient = patients[patientIndex];
                    
                    // 找出任務所屬的類別
                    const taskItem = patient.checklists[shift].find(item => item.task === taskName);
                    const category = taskItem ? taskItem.category : null;
                    
                    // 刪除任務
                    patient.checklists[shift] = patient.checklists[shift].filter(item => item.task !== taskName);
                    
                    // 更新本地存儲
                    localStorage.setItem('patients', JSON.stringify(patients));
                    
                    // 更新UI
                    updatePatientCard(patient, shift);
                }
            }
        }

        function updateTemplateSelectorsShift(shift) {
            const shiftName = shiftThemes[shift].name;
            const shiftIcon = shiftThemes[shift].icon;
            
            // 更新新增病患表單中的模板選擇器
            const templateSelectorLabel = document.querySelector('.template-selectors label');
            if (templateSelectorLabel) {
                templateSelectorLabel.innerHTML = `快速添加${shiftIcon} <span class="current-shift-name">${shiftName}</span> 護理模板：`;
            }
            
            // 更新所有病患卡片中的模板標題
            document.querySelectorAll('.patient-templates .template-header').forEach(header => {
                header.innerHTML = `快速添加${shiftIcon} <span class="current-shift-name">${shiftName}</span> 模板`;
            });
        }

        // 添加班別特定的樣式
        function addShiftSpecificStyles() {
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                .current-shift-name {
                    font-weight: bold;
                    display: inline-block;
                }
                
                .template-header {
                    margin-bottom: 8px;
                    font-size: 14px;
                    color: var(--primary-color);
                }
            `;
            document.head.appendChild(styleElement);
        }
        document.addEventListener('DOMContentLoaded', function() {
            setupMobileNavigation();
            enhanceMobileChecklist();
        });
        
        function setupMobileNavigation() {
            const navToggle = document.getElementById('nav-toggle');
            const navLinks = document.getElementById('nav-links');
            
            if (navToggle && navLinks) {
                navToggle.addEventListener('click', function() {
                    navLinks.classList.toggle('active');
                });
                
                // 點擊導航鏈接後自動收起菜單
                navLinks.querySelectorAll('a').forEach(link => {
                    link.addEventListener('click', function() {
                        if (window.innerWidth <= 768) {
                            navLinks.classList.remove('active');
                        }
                    });
                });
            }
        }
        
        function enhanceMobileChecklist() {
            // 增大檢查清單項的點擊區域
            document.querySelectorAll('.checklist-item').forEach(item => {
                // 確保標籤和複選框都有足夠大的點擊區域
                const checkbox = item.querySelector('input[type="checkbox"]');
                const label = item.querySelector('label');
                
                if (checkbox && label) {
                    // 手機版優化：將標籤點擊事件與整個項目點擊事件分開處理
                    label.addEventListener('click', function(e) {
                        if (window.innerWidth <= 768) {
                            e.stopPropagation();
                            checkbox.checked = !checkbox.checked;
                            
                            // 手動觸發變更事件
                            const patientId = item.closest('.patient-card').dataset.patientId;
                            const shift = document.querySelector('.shift-btn.active').dataset.shift;
                            const taskName = label.textContent;
                            toggleTaskCompletion(patientId, shift, taskName, checkbox.checked);
                        }
                    });
                }
            });
            
            // 優化類別切換按鈕的點擊區域
            document.querySelectorAll('.checklist-category').forEach(category => {
                const toggleIcon = category.querySelector('.category-toggle-icon');
                if (toggleIcon) {
                    toggleIcon.style.minWidth = '20px';
                    toggleIcon.style.minHeight = '20px';
                    toggleIcon.style.display = 'flex';
                    toggleIcon.style.alignItems = 'center';
                    toggleIcon.style.justifyContent = 'center';
                }
            });
        }
        
        // 添加雙擊/長按刪除任務功能 (更適合手機操作)
        function setupTouchInteractions() {
            // 長按任務項目顯示刪除選項
            document.querySelectorAll('.checklist-item').forEach(item => {
                let longPressTimer;
                const longPressDuration = 500; // 500毫秒
                
                item.addEventListener('touchstart', function(e) {
                    longPressTimer = setTimeout(() => {
                        // 顯示刪除確認
                        const taskName = item.querySelector('label').textContent;
                        const patientId = item.closest('.patient-card').dataset.patientId;
                        const shift = document.querySelector('.shift-btn.active').dataset.shift;
                        const isCustom = true; // 假設所有可刪除的任務都是自定義的
                        
                        if (confirm(`確定要刪除 "${taskName}" 任務嗎？`)) {
                            deleteTask(patientId, shift, taskName, isCustom);
                        }
                    }, longPressDuration);
                });
                
                ['touchend', 'touchcancel', 'touchmove'].forEach(eventType => {
                    item.addEventListener(eventType, function() {
                        clearTimeout(longPressTimer);
                    });
                });
            });
        }