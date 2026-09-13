// 藥物劑量計算功能

document.addEventListener('DOMContentLoaded', function() {
    // 綁定藥物稀釋計算按鈕
    const calculateDilutionBtn = document.getElementById('calculate-dilution-btn');
    if (calculateDilutionBtn) {
        calculateDilutionBtn.addEventListener('click', calculateDilution);
    }

    // 綁定安瓿劑量計算按鈕
    const calculateAmpuleBtn = document.getElementById('calculate-ampule-btn');
    if (calculateAmpuleBtn) {
        calculateAmpuleBtn.addEventListener('click', calculateAmpule);
    }
});

// 藥物稀釋計算功能
function calculateDilution() {
    // 獲取輸入值
    const totalDosage = parseFloat(document.getElementById('total-dosage').value);
    const totalUnit = document.getElementById('total-unit').value;
    const dilutionVolume = parseFloat(document.getElementById('dilution-volume').value);
    const requiredDosage = parseFloat(document.getElementById('required-dosage').value);
    const requiredUnit = document.getElementById('required-unit').value;
    
    // 檢查輸入是否有效
    if (isNaN(totalDosage) || isNaN(dilutionVolume) || isNaN(requiredDosage) || 
        totalDosage <= 0 || dilutionVolume <= 0 || requiredDosage <= 0) {
        document.getElementById('dilution-error').style.display = 'block';
        document.getElementById('dilution-result').style.display = 'none';
        return;
    }
    
    // 將單位統一為 mg
    let totalMg = totalDosage;
    if (totalUnit === 'g') {
        totalMg = totalDosage * 1000;
    }
    
    let requiredMg = requiredDosage;
    if (requiredUnit === 'g') {
        requiredMg = requiredDosage * 1000;
    }
    
    // 計算需要的體積
    const resultVolume = (requiredMg / totalMg) * dilutionVolume;
    
    // 顯示結果
    document.getElementById('dilution-error').style.display = 'none';
    document.getElementById('dilution-result').style.display = 'block';
    document.getElementById('result-volume').textContent = resultVolume.toFixed(2);
}

// 安瓿劑量計算功能
function calculateAmpule() {
    // 獲取輸入值
    const ampConcentration = parseFloat(document.getElementById('amp-concentration').value);
    const ampVolume = parseFloat(document.getElementById('amp-volume').value);
    const requiredDosage = parseFloat(document.getElementById('amp-required-dosage').value);
    
    // 檢查輸入是否有效
    if (isNaN(ampConcentration) || isNaN(ampVolume) || isNaN(requiredDosage) || 
        ampConcentration <= 0 || ampVolume <= 0 || requiredDosage <= 0) {
        document.getElementById('ampule-error').style.display = 'block';
        document.getElementById('ampule-result').style.display = 'none';
        return;
    }
    
    // 計算單位藥物的體積
    const volumePerMg = ampVolume / ampConcentration;
    
    // 計算總需要體積
    const totalVolumeNeeded = volumePerMg * requiredDosage;
    
    // 計算需要的安瓿數量
    const ampulesNeeded = Math.ceil(totalVolumeNeeded / ampVolume);
    
    // 計算最後一支安瓿需要的體積
    const lastAmpuleVolume = totalVolumeNeeded % ampVolume || ampVolume;
    
    // 顯示結果
    document.getElementById('ampule-error').style.display = 'none';
    document.getElementById('ampule-result').style.display = 'block';
    document.getElementById('amp-result-volume').textContent = totalVolumeNeeded.toFixed(2);
    document.getElementById('amp-count').textContent = ampulesNeeded;
    document.getElementById('last-amp-volume').textContent = lastAmpuleVolume.toFixed(2);
}
