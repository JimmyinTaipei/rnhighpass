
// 用於生成唯一ID的計數器
let templateCounter = 1;

// 預設模板
const defaultTemplates = {
    'cardiac-catheterization': {
        name: '心導管檢查',
        items: [
            '確認病人身份',
            '確認空腹時間',
            '確認抗凝藥物是否暫停',
            '確認血液檢查結果',
            '確認同意書已簽署'
        ]
    }
};

// 初始化本地存儲
function initLocalStorage() {
    if (!localStorage.getItem('savedTemplates')) {
        localStorage.setItem('savedTemplates', JSON.stringify(defaultTemplates));
    }
}

// 載入已儲存的模板
function loadSavedTemplates() {
    const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
    const select = document.getElementById('template-select');
    
    // 清空現有選項
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // 添加已儲存的模板
    for (const key in savedTemplates) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = savedTemplates[key].name;
        select.appendChild(option);
    }
}

// 檢查是否已經載入過該模板
function isTemplateLoaded(templateKey) {
    const container = document.getElementById('checklist-container');
    for (let section of container.children) {
        if (section.dataset.templateKey === templateKey) {
            return true;
        }
    }
    return false;
}

// 載入選擇的模板
function loadTemplate() {
    const select = document.getElementById('template-select');
    const selectedKey = select.value;
    
    if (!selectedKey) return;
    
    // 檢查是否已載入該模板，如果已載入則不重複添加
    if (isTemplateLoaded(selectedKey)) {
        alert('該檢查清單已經載入');
        return;
    }

    const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
    const template = savedTemplates[selectedKey];
    
    if (!template) {
        alert('找不到選擇的模板');
        return;
    }
    
    // 創建新的檢查模板
    const templateId = `template-${templateCounter++}`;
    const section = document.createElement('div');
    section.className = 'section';
    section.id = templateId;
    section.dataset.templateKey = selectedKey;
    
    let itemsHTML = '';
    template.items.forEach(item => {
        itemsHTML += `
            <div class="checklist-item">
                <label><input type="checkbox" onchange="toggleCompleted(this)"> ${item}</label>
                <div class="delete-item" onclick="deleteCheckItem(this)">×</div>
            </div>
        `;
    });

    section.innerHTML = `
        <h2 onclick="toggleSection(this)">
            <span class="toggle-icon"></span>
            <span class="title">${template.name}</span>
            <span class="controls">
                <span class="delete-btn" onclick="deleteTemplate(event, '${templateId}')">🗑️</span>
            </span>
        </h2>
        <div class="checklist">
            <div class="checklist-header">
                <div class="add-item-btn" onclick="showAddItemDialog('${templateId}')">+</div>
            </div>
            ${itemsHTML}
        </div>
    `;

    // 將新模板添加到容器中
    const container = document.getElementById('checklist-container');
    container.appendChild(section);
    
    // 展開新添加的模板
    const header = section.querySelector('h2');
    toggleSection(header);
    
    // 重置選擇框
    select.selectedIndex = 0;
}

// 保存當前選中的模板
function saveCurrentTemplate() {
    const container = document.getElementById('checklist-container');
    if (container.childElementCount === 0) {
        alert('請先載入或創建一個模板');
        return;
    }
    
    // 提示用戶選擇要保存的模板
    let templateOptions = '';
    for (let i = 0; i < container.childElementCount; i++) {
        const section = container.children[i];
        const templateName = section.querySelector('.title').textContent;
        templateOptions += `<option value="${i}">${templateName}</option>`;
    }
    
    const templateIndex = prompt('請選擇要保存的模板（請輸入編號0-' + (container.childElementCount - 1) + '）：\n' + 
        [...container.children].map((section, idx) => 
            `${idx}: ${section.querySelector('.title').textContent}`
        ).join('\n')
    );
    
    if (templateIndex === null) return;
    
    const index = parseInt(templateIndex);
    if (isNaN(index) || index < 0 || index >= container.childElementCount) {
        alert('請輸入有效的模板編號');
        return;
    }
    
    const section = container.children[index];
    const templateKey = section.dataset.templateKey;
    const templateName = section.querySelector('.title').textContent;
    
    // 獲取所有檢查項目
    const items = [];
    const checklistItems = section.querySelectorAll('.checklist-item label');
    checklistItems.forEach(label => {
        items.push(label.textContent.trim());
    });
    
    if (items.length === 0) {
        alert('請至少添加一個檢查項目');
        return;
    }
    
    // 保存到本地存儲
    const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
    savedTemplates[templateKey] = {
        name: templateName,
        items: items
    };
    
    localStorage.setItem('savedTemplates', JSON.stringify(savedTemplates));
    alert('模板已成功儲存！');
    
    // 重新載入模板列表
    loadSavedTemplates();
}

function toggleCompleted(checkbox) {
    const label = checkbox.parentElement;
    if (checkbox.checked) {
        label.classList.add('completed');
    } else {
        label.classList.remove('completed');
    }
}

function resetCheckboxes() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.parentElement.classList.remove('completed');
    });
}

function toggleSection(header) {
    header.classList.toggle('active');
}

function toggleNewTemplateForm() {
    const form = document.getElementById('new-template-form');
    form.classList.toggle('active');
    
    // 滾動到表單位置
    if (form.classList.contains('active')) {
        form.scrollIntoView({ behavior: 'smooth' });
    }
}

function addItem() {
    const container = document.getElementById('items-container');
    const itemRow = document.createElement('div');
    itemRow.className = 'item-row';
    itemRow.innerHTML = `
        <input type="text" placeholder="輸入檢查項目">
        <button type="button" onclick="removeItem(this)">×</button>
    `;
    container.appendChild(itemRow);
}

function removeItem(button) {
    const row = button.parentElement;
    row.remove();
}

function deleteCheckItem(deleteButton) {
    // 獲取要刪除的項目
    const item = deleteButton.parentElement;
    item.remove();
}

function deleteTemplate(event, templateId) {
    // 阻止事件冒泡，避免觸發折疊/展開
    event.stopPropagation();
    
    // 確認是否要刪除
    if (confirm('確定要刪除這個檢查模板嗎？')) {
        const template = document.getElementById(templateId);
        template.remove();
    }
}

function showAddItemDialog(templateId) {
    // 顯示對話框並設置當前模板ID
    document.getElementById('template-id-for-new-item').value = templateId;
    document.getElementById('new-item-text').value = '';
    document.getElementById('add-item-dialog').classList.add('active');
}

function hideAddItemDialog() {
    document.getElementById('add-item-dialog').classList.remove('active');
}

function addItemToTemplate() {
    const templateId = document.getElementById('template-id-for-new-item').value;
    const itemText = document.getElementById('new-item-text').value.trim();
    
    if (!itemText) {
        alert('請輸入檢查項目內容');
        return;
    }
    
    // 找到對應的模板並添加項目
    const template = document.getElementById(templateId);
    if (template) {
        const checklist = template.querySelector('.checklist');
        const newItem = document.createElement('div');
        newItem.className = 'checklist-item';
        newItem.innerHTML = `
            <label><input type="checkbox" onchange="toggleCompleted(this)"> ${itemText}</label>
            <div class="delete-item" onclick="deleteCheckItem(this)">×</div>
        `;
        checklist.appendChild(newItem);
    }
    
    // 隱藏對話框
    hideAddItemDialog();
}

function saveTemplate() {
    const templateName = document.getElementById('template-name').value.trim();
    const templateKey = document.getElementById('template-key').value.trim().toLowerCase();
    
    if (!templateName) {
        alert('請輸入檢查名稱');
        return;
    }
    
    if (!templateKey) {
        alert('請輸入模板識別碼');
        return;
    }
    
    if (!/^[a-z0-9-]+$/.test(templateKey)) {
        alert('模板識別碼只能包含小寫英文字母、數字和連字符');
        return;
    }

    const items = [];
    const itemInputs = document.querySelectorAll('#items-container input');
    itemInputs.forEach(input => {
        const text = input.value.trim();
        if (text) {
            items.push(text);
        }
    });

    if (items.length === 0) {
        alert('請至少添加一個檢查項目');
        return;
    }

    // 保存到本地存儲
    const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
    savedTemplates[templateKey] = {
        name: templateName,
        items: items
    };
    
    localStorage.setItem('savedTemplates', JSON.stringify(savedTemplates));
    
    // 重新載入模板列表
    loadSavedTemplates();
    
    // 清空表單
    document.getElementById('template-name').value = '';
    document.getElementById('template-key').value = '';
    document.getElementById('items-container').innerHTML = `
        <div class="item-row">
            <input type="text" placeholder="例如: 確認病人身份">
            <button type="button" onclick="removeItem(this)">×</button>
        </div>
        <div class="item-row">
            <input type="text" placeholder="例如: 確認同意書已簽署">
            <button type="button" onclick="removeItem(this)">×</button>
        </div>
    `;
    
    // 隱藏表單
    toggleNewTemplateForm();
    
    alert('模板已成功儲存！');
}

// 匯出所有模板到檔案
function exportTemplates() {
    const savedTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
    
    // 創建一個下載檔案
    const dataStr = JSON.stringify(savedTemplates, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    
    // 創建下載連結
    const exportFileDefaultName = `checklist-templates-${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    alert('模板已成功匯出！');
}

// 從檔案匯入模板
function importTemplates(files) {
    if (files.length !== 1) {
        alert('請選擇一個JSON檔案');
        return;
    }
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedTemplates = JSON.parse(e.target.result);
            
            // 檢查匯入的資料格式是否正確
            if (typeof importedTemplates !== 'object') {
                throw new Error('匯入的資料格式不正確');
            }
            
            // 確認用戶是否要合併或覆蓋現有模板
            const currentTemplates = JSON.parse(localStorage.getItem('savedTemplates')) || {};
            const choice = confirm('您要合併匯入的模板嗎？\n選擇「確定」合併模板\n選擇「取消」完全覆蓋現有模板');
            
            if (choice) {
                // 合併模板
                const mergedTemplates = { ...currentTemplates, ...importedTemplates };
                localStorage.setItem('savedTemplates', JSON.stringify(mergedTemplates));
            } else {
                // 完全覆蓋
                localStorage.setItem('savedTemplates', JSON.stringify(importedTemplates));
            }
            
            // 重新載入模板列表
            loadSavedTemplates();
            
            alert('模板已成功匯入！');
            
            // 重置輸入欄位
            document.getElementById('importFile').value = '';
        } catch (error) {
            alert('匯入失敗：' + error.message);
        }
    };
    
    reader.readAsText(file);
}

// 初始化頁面
document.addEventListener('DOMContentLoaded', function() {
    initLocalStorage();
    loadSavedTemplates();
});
