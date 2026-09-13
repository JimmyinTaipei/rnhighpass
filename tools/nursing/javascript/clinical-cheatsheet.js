function openTab(tabName) {
    // Hide all tab contents
    var tabContents = document.getElementsByClassName("tab-content");
    for (var i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
    }
    
    // Deactivate all tabs
    var tabs = document.getElementsByClassName("tab");
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
    }
    
    // Show the selected tab content
    document.getElementById(tabName).classList.add("active");
    
    // Activate the clicked tab
    var activeTab = document.querySelector(`.tab[onclick="openTab('${tabName}')"]`);
    activeTab.classList.add("active");
}

function updateScore() {
    // Clear previously selected rows
    document.querySelectorAll('td.selected-cell').forEach(cell => {
        cell.classList.remove('selected-cell');
    });
    
    // Get selected values
    const eyeValue = document.querySelector('input[name="eye"]:checked')?.value;
    const verbalValue = document.querySelector('input[name="verbal"]:checked')?.value;
    const motorValue = document.querySelector('input[name="motor"]:checked')?.value;
    
    // Highlight selected cells
    if (eyeValue) {
        document.querySelector(`#eye${eyeValue}`).closest('td').classList.add('selected-cell');
    }
    if (verbalValue) {
        document.querySelector(`#verbal${verbalValue}`).closest('td').classList.add('selected-cell');
    }
    if (motorValue) {
        document.querySelector(`#motor${motorValue}`).closest('td').classList.add('selected-cell');
    }
    
    // Update score display
    document.getElementById('eyeScore').textContent = eyeValue || '-';
    document.getElementById('verbalScore').textContent = verbalValue || '-';
    document.getElementById('motorScore').textContent = motorValue || '-';
    
    // Check if any special conditions are selected
    const closeEyes = document.getElementById('closeEyes')?.checked;
    const endotracheal = document.getElementById('endotracheal')?.checked;
    const tracheostomy = document.getElementById('tracheostomy')?.checked;
    const aphasia = document.getElementById('aphasia')?.checked;
    
    // If any special condition is checked, don't calculate the total score
    if (closeEyes || endotracheal || tracheostomy || aphasia) {
        document.getElementById('totalScore').textContent = 'NT';
        
        // Create message about which components can't be assessed
        let message = '部分評估無法執行: <br>';
        if (closeEyes) {
            message += '• 眼睛腫脹無法睜開 (Eyes swollen shut) <br>';
        }
        if (endotracheal || tracheostomy) {
            message += '• 氣管' + (endotracheal ? '插管' : '切開') + '無法正常發聲 <br>';
        }
        if (aphasia) {
            message += '• 失語症 (Aphasia) <br>';
        }
        message += '<br>無法計算總分 (Unable to calculate total score)';
        
        document.getElementById('interpretation').innerHTML = message;
    } 
    // Otherwise calculate normally if all scores are selected
    else if (eyeValue && verbalValue && motorValue) {
        const totalScore = parseInt(eyeValue) + parseInt(verbalValue) + parseInt(motorValue);
        document.getElementById('totalScore').textContent = totalScore;
        
        // Update interpretation
        let interpretation = '';
        if (totalScore >= 13) {
            interpretation = '輕度腦損傷 <br> Mild brain injury';
        } else if (totalScore >= 9) {
            interpretation = '中度腦損傷 <br> Moderate brain injury';
        } else if (totalScore >= 3) {
            interpretation = '重度腦損傷 <br> Severe brain injury';
        }
        
        document.getElementById('interpretation').innerHTML = interpretation;
    } else {
        document.getElementById('totalScore').textContent = '-';
        document.getElementById('interpretation').innerHTML = '請選擇各項目分數以計算 GCS 評分 <br> Please select scores for all items to calculate GCS';
    }
}
function resetGCS() {
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    
    // Reset special condition checkboxes
    document.getElementById('closeEyes').checked = false;
    document.getElementById('endotracheal').checked = false;
    document.getElementById('tracheostomy').checked = false;
    document.getElementById('aphasia').checked = false;
    
    document.querySelectorAll('td.selected-cell').forEach(cell => {
        cell.classList.remove('selected-cell');
    });
    
    document.getElementById('eyeScore').textContent = '-';
    document.getElementById('verbalScore').textContent = '-';
    document.getElementById('motorScore').textContent = '-';
    document.getElementById('totalScore').textContent = '-';
    document.getElementById('interpretation').innerHTML = '請選擇各項目分數以計算 GCS 評分 <br> Please select scores for all items to calculate GCS';
}

function resetMuscle() {
    document.querySelectorAll('.power-input').forEach(input => {
        input.value = '';
    });
}

// Pupil Assessment Functions
function updatePupilSize(side, size) {
    const percentage = parseInt(size) * 10 + 10; // Calculate percentage (1mm = 20%, 9mm = 100%)
    const pupilInner = document.getElementById(side + 'PupilInner');
    
    pupilInner.style.width = percentage + '%';
    pupilInner.style.height = percentage + '%';
    
    // Update size display
    document.getElementById(side + 'SizeValue').textContent = size + 'mm';
    document.getElementById('record' + side.charAt(0).toUpperCase() + side.slice(1) + 'Size').textContent = size + 'mm';
    
    // Update reactivity display based on selected radio
    const reactivity = document.querySelector('input[name="' + side + 'Reactivity"]:checked').value;
    updatePupilReactivity(side, reactivity);
    
    // Check pupil equality
    checkPupilEquality();
}

function updatePupilReactivity(side, reactivity) {
    let reactivityText = '';
    switch(reactivity) {
        case 'brisk':
            reactivityText = '活潑 (Brisk)';
            break;
        case 'sluggish':
            reactivityText = '遲緩 (Sluggish)';
            break;
        case 'fixed':
            reactivityText = '固定 (Fixed)';
            break;
    }
    
    document.getElementById('record' + side.charAt(0).toUpperCase() + side.slice(1) + 'Reactivity').textContent = reactivityText;
}

function checkPupilEquality() {
    const leftSize = document.getElementById('leftPupilSize').value;
    const rightSize = document.getElementById('rightPupilSize').value;
    
    if (leftSize === rightSize) {
        document.getElementById('pupilEquality').textContent = '瞳孔等大 (Equal)';
    } else {
        document.getElementById('pupilEquality').textContent = '瞳孔不等大 (Unequal)';
    }
}

function resetPupils() {
    // Reset left pupil
    document.getElementById('leftPupilSize').value = 4;
    document.getElementById('leftBrisk').checked = true;
    updatePupilSize('left', 4);
    
    // Reset right pupil
    document.getElementById('rightPupilSize').value = 4;
    document.getElementById('rightBrisk').checked = true;
    updatePupilSize('right', 4);
    
    // Update equality
    document.getElementById('pupilEquality').textContent = '瞳孔等大 (Equal)';
}


// Add event listeners for pupil reactivity
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for left pupil reactivity
    document.querySelectorAll('input[name="leftReactivity"]').forEach(radio => {
        radio.addEventListener('change', function() {
            updatePupilReactivity('left', this.value);
        });
    });
    
    // Add event listeners for right pupil reactivity
    document.querySelectorAll('input[name="rightReactivity"]').forEach(radio => {
        radio.addEventListener('change', function() {
            updatePupilReactivity('right', this.value);
        });
    });
    
    // Initialize pupil sizes
    updatePupilSize('left', 4);
    updatePupilSize('right', 4);
    
    // Setup mobile menu functionality
    setupMobileMenu();
});

// 6P Assessment Functions
function resetSixP() {
    document.querySelectorAll('.sixp-select').forEach(select => {
        select.value = '';
    });
}

// Mobile menu functionality
function setupMobileMenu() {
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    
    if (navToggle && navLinks) {
        // Bind menu toggle event
        navToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
        
        // Close menu when links are clicked (on mobile)
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    navLinks.classList.remove('active');
                }
            });
        });
    }
}