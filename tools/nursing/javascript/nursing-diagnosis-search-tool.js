// Initialize data from JSON files if available, otherwise use localStorage
async function initializeDatabase() {
    try {
        // Try to load from external JSON files first
        const medicalResponse = await fetch('nursing-diagnosis-data.json');
        const linksResponse = await fetch('nursing-diagnosis-links.json');
        
        if (medicalResponse.ok && linksResponse.ok) {
            diagnosisDatabase = await medicalResponse.json();
            diagnosisLinks = await linksResponse.json();
            
            // Save to localStorage as backup
            localStorage.setItem('diagnosisDatabase', JSON.stringify(diagnosisDatabase));
            localStorage.setItem('diagnosisLinks', JSON.stringify(diagnosisLinks));
        } else {
            // Fallback to localStorage if files not available
            loadFromLocalStorage();
        }
    } catch (error) {
        console.error('Error loading JSON files:', error);
        loadFromLocalStorage();
    }
    
    // Initialize diagnosis aliases if needed
    if (!localStorage.getItem('diagnosisAliases')) {
        const initialAliases = {
            "ACS (Acute Coronary Syndrome)": "Myocardial Infarction",
            "DM": "Diabetes Mellitus",
            "HTN": "Hypertension"
        };
        localStorage.setItem('diagnosisAliases', JSON.stringify(initialAliases));
        diagnosisAliases = initialAliases;
    } else {
        diagnosisAliases = JSON.parse(localStorage.getItem('diagnosisAliases'));
    }
    
    // Initialize UI elements after data is loaded
    createExampleButtons();
}

function loadFromLocalStorage() {
    // Check if localStorage has data
    if (!localStorage.getItem('diagnosisDatabase')) {
        // Initialize with sample data
        const initialDiagnosisDatabase = {
            "Diabetes Mellitus": {
                descriptions: [
                    "Ineffective Health maintenance r/t complexity of therapeutic regimen",
                    "Imbalanced Nutrition: less than body requirements r/t inability to use glucose",
                    "Ineffective peripheral Tissue perfusion r/t impaired arterial circulation",
                    "Risk for unstable blood Glucose level",
                    "Risk for Infection: Risk factors: hyperglycemia, impaired healing",
                    "Risk for impaired Skin integrity: Risk factor: loss of pain perception in extremities"
                ]
            },
            "Pneumonia": {
                descriptions: [
                    "Ineffective Airway clearance r/t inflammation and presence of secretions",
                    "Impaired Gas exchange r/t decreased functional lung tissue",
                    "Ineffective Thermoregulation r/t infectious process",
                    "Risk for deficient Fluid volume: Risk factor: inadequate intake of fluids",
                    "Acute Pain r/t inflammatory process"
                ]
            },
            "Myocardial Infarction": {
                descriptions: [
                    "Activity intolerance r/t imbalance between oxygen supply and demand",
                    "Anxiety r/t threat of death, possible change in role status",
                    "Decreased Cardiac output r/t myocardial injury",
                    "Acute Pain r/t myocardial tissue damage from inadequate blood supply",
                    "Risk for decreased Cardiac tissue perfusion: Risk factors: coronary artery spasm, hypertension"
                ]
            }
        };
        localStorage.setItem('diagnosisDatabase', JSON.stringify(initialDiagnosisDatabase));
    }

    if (!localStorage.getItem('diagnosisLinks')) {
        // Initialize with sample data
        const initialDiagnosisLinks = {
            "Acute Pain": "nursing-diagnosis/acute-pain.html",
            "Anxiety": "nursing-diagnosis/anxiety.html",
            "Impaired Gas exchange": "nursing-diagnosis/impaired-gas-exchange.html",
            "Decreased Cardiac output": "nursing-diagnosis/decreased-cardiac-output.html",
            "Ineffective Breathing pattern": "nursing-diagnosis/ineffective-breathing-pattern.html",
            "Ineffective Airway clearance": "nursing-diagnosis/ineffective-airway-clearance.html"
        };
        localStorage.setItem('diagnosisLinks', JSON.stringify(diagnosisLinks));
    }
    
    // Load data from localStorage
    diagnosisDatabase = JSON.parse(localStorage.getItem('diagnosisDatabase'));
    diagnosisLinks = JSON.parse(localStorage.getItem('diagnosisLinks'));
}

// Load data
let diagnosisDatabase = {};
let diagnosisLinks = {};
let diagnosisAliases = {};

// DOM elements
const searchInput = document.getElementById('search');
const searchResults = document.getElementById('searchResults');
const examplesContainer = document.getElementById('examples');
const loadingIndicator = document.getElementById('loadingIndicator');
const diagnosisResult = document.getElementById('diagnosisResult');
const diagnosisTitle = document.getElementById('diagnosisTitle');
const diagnosisList = document.getElementById('diagnosisList');
const noResults = document.getElementById('noResults');
const searchTermDisplay = document.getElementById('searchTermDisplay');
const currentYear = document.getElementById('currentYear');
const openAdminBtn = document.getElementById('openAdminBtn');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const adminPanel = document.getElementById('adminPanel');
const saveMedicalDiagnosisBtn = document.getElementById('saveMedicalDiagnosisBtn');
const saveDiagnosisLinkBtn = document.getElementById('saveDiagnosisLinkBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const importDataBtn = document.getElementById('importDataBtn');

// Set the current year for the footer
currentYear.textContent = new Date().getFullYear();

// Create example buttons
function createExampleButtons() {
    examplesContainer.innerHTML = '';
    
    // Include both direct diagnoses and aliases
    const directDiagnoses = Object.keys(diagnosisDatabase);
    const aliases = Object.keys(diagnosisAliases);
    
    // Combine and sort alphabetically (prioritize direct diagnoses when duplicates exist)
    let allExamples = [...directDiagnoses];
    
    // Only add aliases that don't conflict with direct diagnoses
    aliases.forEach(alias => {
        if (!directDiagnoses.includes(alias)) {
            allExamples.push(alias);
        }
    });
    
    allExamples.sort(); // Sort alphabetically
    
    // Show only first 10 examples to avoid cluttering the UI
    const displayExamples = allExamples.slice(0, 10);
    
    displayExamples.forEach(example => {
        const button = document.createElement('button');
        
        // Style aliases differently for visual distinction
        if (diagnosisAliases[example]) {
            button.className = 'example-pill alias';
            button.title = `別名指向: ${diagnosisAliases[example]}`;
        } else {
            button.className = 'example-pill';
        }
        
        button.textContent = example;
        button.addEventListener('click', () => {
            searchInput.value = example;
            handleSelectDiagnosis(example);
        });
        examplesContainer.appendChild(button);
    });
    
    // Add a "More..." button if there are more examples
    if (allExamples.length > 10) {
        const moreButton = document.createElement('button');
        moreButton.className = 'example-pill more';
        moreButton.textContent = "More...";
        moreButton.addEventListener('click', () => {
            // Display a modal with all diagnoses instead of using search results
            showAllDiagnosesModal(allExamples);
        });
        examplesContainer.appendChild(moreButton);
    }
}

// Function to create linkable text in nursing diagnoses
function createLinkableText(diagnosisText) {
    // First, get the base diagnosis (before r/t or Risk factors)
    let baseDiagnosis = diagnosisText;
    
    if (diagnosisText.includes(' r/t ')) {
        baseDiagnosis = diagnosisText.split(' r/t ')[0];
    } else if (diagnosisText.includes('Risk factor')) {
        baseDiagnosis = diagnosisText.split('Risk factor')[0].trim();
        if (baseDiagnosis.endsWith(':')) {
            baseDiagnosis = baseDiagnosis.slice(0, -1).trim();
        }
    }
    
    // Check if we have a link for this diagnosis
    const hasLink = Object.keys(diagnosisLinks).some(key => 
        baseDiagnosis.includes(key)
    );
    
    if (hasLink) {
        // Find which diagnosis key is contained in the text
        const matchedKey = Object.keys(diagnosisLinks).find(key => 
            baseDiagnosis.includes(key)
        );
        
        // Replace the matched key with a linked version
        return diagnosisText.replace(
            matchedKey, 
            `<span class="diagnosis-link" data-link="${diagnosisLinks[matchedKey]}">${matchedKey}</span>`
        );
    }
    
    return diagnosisText;
}

// Handle search input changes with debounce for better performance
let debounceTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        const term = searchInput.value;
        
        if (term.trim() === '') {
            searchResults.classList.add('hidden');
            return;
        }
        
        // Search in both diagnoses and aliases
        const directMatches = Object.keys(diagnosisDatabase)
            .filter(diagnosis => diagnosis.toLowerCase().includes(term.toLowerCase()));
        
        const aliasMatches = Object.keys(diagnosisAliases)
            .filter(alias => alias.toLowerCase().includes(term.toLowerCase()));
        
        // Combine results while avoiding duplicates (prefer direct matches)
        let combinedResults = [...directMatches];
        aliasMatches.forEach(alias => {
            if (!directMatches.includes(alias)) {
                combinedResults.push(alias);
            }
        });
        
        // Sort results by relevance
        combinedResults.sort((a, b) => {
            // Sort by how close the match is to the beginning of the string
            const aIndex = a.toLowerCase().indexOf(term.toLowerCase());
            const bIndex = b.toLowerCase().indexOf(term.toLowerCase());
            
            // If indices are the same, prioritize direct matches
            if (aIndex === bIndex) {
                const aIsDirect = directMatches.includes(a);
                const bIsDirect = directMatches.includes(b);
                
                if (aIsDirect && !bIsDirect) return -1;
                if (!aIsDirect && bIsDirect) return 1;
            }
            
            return aIndex - bIndex;
        });
        
        // Display search results
        searchResults.innerHTML = '';
        
        if (combinedResults.length > 0) {
            combinedResults.forEach(result => {
                const resultItem = document.createElement('div');
                
                // Style based on whether it's a direct diagnosis or an alias
                if (diagnosisAliases[result]) {
                    resultItem.className = 'search-result-item alias';
                    
                    const text = document.createElement('span');
                    text.textContent = result;
                    
                    const aliasIndicator = document.createElement('span');
                    aliasIndicator.className = 'alias-indicator';
                    aliasIndicator.textContent = `→ ${diagnosisAliases[result]}`;
                    
                    resultItem.appendChild(text);
                    resultItem.appendChild(aliasIndicator);
                } else {
                    resultItem.className = 'search-result-item';
                    resultItem.textContent = result;
                }
                
                resultItem.addEventListener('click', () => handleSelectDiagnosis(result));
                searchResults.appendChild(resultItem);
            });
            
            searchResults.classList.remove('hidden');
        } else {
            searchResults.classList.add('hidden');
        }
    }, 300); // 300ms debounce
});

// Handle selection of a medical diagnosis
function handleSelectDiagnosis(diagnosis) {
    searchInput.value = diagnosis;
    searchResults.classList.add('hidden');
    
    // First, check if this is an alias and redirect accordingly
    if (diagnosisAliases[diagnosis]) {
        const targetDiagnosis = diagnosisAliases[diagnosis];
        
        // Display a message indicating the redirection
        const alertMessage = `「${diagnosis}」是「${targetDiagnosis}」的別名。正在查看「${targetDiagnosis}」。`;
        
        setTimeout(() => {
            alert(alertMessage);
            // Proceed with showing the target diagnosis
            showDiagnosis(targetDiagnosis);
        }, 100);
        
        return;
    }
    
    // If not an alias, show directly
    showDiagnosis(diagnosis);
}

// Helper function to actually display the diagnosis information
function showDiagnosis(diagnosis) {
    if (diagnosisDatabase[diagnosis]) {
        // Show the diagnosis result section
        diagnosisTitle.textContent = diagnosis;
        diagnosisList.innerHTML = '';
        
        // Add each nursing diagnosis to the list
        diagnosisDatabase[diagnosis].descriptions.forEach(description => {
            const listItem = document.createElement('li');
            listItem.className = 'diagnosis-item';
            listItem.innerHTML = createLinkableText(description);
            diagnosisList.appendChild(listItem);
        });
        
        // Add click event listeners to the diagnosis links
        const diagnosisLinkElements = document.querySelectorAll('.diagnosis-link');
        diagnosisLinkElements.forEach(link => {
            link.addEventListener('click', function() {
                const url = this.getAttribute('data-link');
                window.location.href = url;
            });
        });
        
        // Add aliases section if this diagnosis has aliases pointing to it
        const aliasesForThisDiagnosis = Object.entries(diagnosisAliases)
            .filter(([alias, target]) => target === diagnosis)
            .map(([alias]) => alias);
        
        if (aliasesForThisDiagnosis.length > 0) {
            const aliasesSection = document.createElement('div');
            aliasesSection.className = 'alias-section';
            
            const aliasesTitle = document.createElement('h4');
            aliasesTitle.className = 'alias-title';
            aliasesTitle.textContent = '別名：';
            
            const aliasesList = document.createElement('div');
            aliasesList.className = 'alias-tags';
            
            aliasesForThisDiagnosis.forEach(alias => {
                const aliasTag = document.createElement('span');
                aliasTag.className = 'alias-tag';
                aliasTag.textContent = alias;
                aliasesList.appendChild(aliasTag);
            });
            
            aliasesSection.appendChild(aliasesTitle);
            aliasesSection.appendChild(aliasesList);
            diagnosisList.parentNode.appendChild(aliasesSection);
        }
        
        diagnosisResult.classList.remove('hidden');
        noResults.classList.add('hidden');
    } else {
        // Show the no results section
        searchTermDisplay.textContent = diagnosis;
        diagnosisResult.classList.add('hidden');
        noResults.classList.remove('hidden');
    }
}

// Show all diagnoses modal
function showAllDiagnosesModal(diagnoses) {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'admin-panel';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'admin-content';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '1rem';
    
    const title = document.createElement('h3');
    title.className = 'admin-title';
    title.textContent = 'All Medical Diagnoses';
    
    const closeBtn = document.createElement('button');
    closeBtn.style.color = '#6b7280';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => document.body.removeChild(modal);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create search input for filtering diagnoses
    const searchDiv = document.createElement('div');
    searchDiv.style.marginBottom = '1rem';
    
    const searchFilter = document.createElement('input');
    searchFilter.type = 'text';
    searchFilter.className = 'form-input';
    searchFilter.placeholder = 'Filter diagnoses...';
    
    searchDiv.appendChild(searchFilter);
    
    // Create diagnoses list
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    list.style.gap = '0.5rem';
    
    // Function to render diagnoses list
    const renderList = (filter = '') => {
        list.innerHTML = '';
        const filteredDiagnoses = diagnoses.filter(d => 
            d.toLowerCase().includes(filter.toLowerCase())
        ).sort();
        
        filteredDiagnoses.forEach(d => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = d;
            item.style.border = '1px solid #e5e7eb';
            item.style.borderRadius = '0.25rem';
            item.onclick = () => {
                handleSelectDiagnosis(d);
                document.body.removeChild(modal);
            };
            list.appendChild(item);
        });
        
        if (filteredDiagnoses.length === 0) {
            const noResults = document.createElement('div');
            noResults.style.gridColumn = '1 / -1';
            noResults.style.textAlign = 'center';
            noResults.style.padding = '1rem';
            noResults.style.color = '#6b7280';
            noResults.textContent = 'No matching diagnoses found';
            list.appendChild(noResults);
        }
    };
    
    // Add event listener for search filtering
    searchFilter.addEventListener('input', () => {
        renderList(searchFilter.value);
    });
    
    // Initial render
    renderList();
    
    // Assemble modal
    modalContent.appendChild(header);
    modalContent.appendChild(searchDiv);
    modalContent.appendChild(list);
    modal.appendChild(modalContent);
    
    // Add to DOM
    document.body.appendChild(modal);
}

// Admin Panel Functions
openAdminBtn.addEventListener('click', () => {
    adminPanel.classList.remove('hidden');
    
    // Populate common nursing diagnoses dropdown
    populateCommonNursingDiagnoses();
    
    // Populate nursing links list
    updateNursingLinksList();
    
    // Populate diagnosis management list
    updateDiagnosisManagementList();
    
    // Populate target diagnosis dropdown in aliases tab
    populateTargetDiagnosisSelect();
    
    // Update aliases list
    updateAliasesList();
});

closeAdminBtn.addEventListener('click', () => {
    adminPanel.classList.add('hidden');
});

// Admin panel tabs functionality
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Hide all tab contents
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        
        // Remove active state from all tabs
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });
        
        // Set active state for clicked tab
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        
        // Show corresponding tab content
        const tabId = button.id.replace('-tab', '-tab-content');
        document.getElementById(tabId).classList.add('active');
        
        // Special handling for specific tabs
        if (button.id === 'manage-tab') {
            updateDiagnosisManagementList();
        } else if (button.id === 'links-tab') {
            updateNursingLinksList();
        }
    });
});

// Function to populate common nursing diagnoses dropdown
function populateCommonNursingDiagnoses() {
    const dropdown = document.getElementById('commonNursingDiagnoses');
    dropdown.innerHTML = '<option value="">-- 選擇常見護理診斷新增 --</option>';
    
    // Get all nursing diagnoses from links
    const nursingDiagnoses = Object.keys(diagnosisLinks).sort();
    
    nursingDiagnoses.forEach(diagnosis => {
        const option = document.createElement('option');
        option.value = diagnosis;
        option.textContent = diagnosis;
        dropdown.appendChild(option);
    });
    
    // Add event listener
    dropdown.addEventListener('change', () => {
        if (dropdown.value) {
            const textarea = document.getElementById('nursingDiagnosesInput');
            const currentText = textarea.value.trim();
            const newDiagnosis = dropdown.value;
            
            if (currentText) {
                textarea.value = currentText + '\n' + newDiagnosis;
            } else {
                textarea.value = newDiagnosis;
            }
        }
    });
}

// Function to update nursing links list
function updateNursingLinksList() {
    const container = document.getElementById('nursingLinksContainer');
    container.innerHTML = '';
    
    const links = Object.entries(diagnosisLinks).sort((a, b) => a[0].localeCompare(b[0]));
    
    if (links.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 0.5rem; color: #6b7280;">No nursing diagnosis links defined</p>';
        return;
    }
    
    links.forEach(([diagnosis, url]) => {
        const item = document.createElement('div');
        item.className = 'link-item';
        
        const diagnosisText = document.createElement('span');
        diagnosisText.textContent = diagnosis;
        diagnosisText.className = 'link-text';
        diagnosisText.title = diagnosis;
        
        const urlText = document.createElement('span');
        urlText.textContent = url;
        urlText.className = 'link-url';
        urlText.title = url;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete this link';
        deleteBtn.onclick = () => {
            if (confirm(`Are you sure you want to delete the link for "${diagnosis}"?`)) {
                delete diagnosisLinks[diagnosis];
                localStorage.setItem('diagnosisLinks', JSON.stringify(diagnosisLinks));
                updateNursingLinksList();
            }
        };
        
        item.appendChild(diagnosisText);
        item.appendChild(urlText);
        item.appendChild(deleteBtn);
        container.appendChild(item);
    });
}

// Function to update diagnosis management list
function updateDiagnosisManagementList() {
    const container = document.getElementById('diagnosisList');
    const searchInput = document.getElementById('diagnosisSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    container.innerHTML = '';
    
    // Get all medical diagnoses and filter by search term if needed
    let diagnoses = Object.keys(diagnosisDatabase)
        .filter(d => !searchTerm || d.toLowerCase().includes(searchTerm))
        .sort();
    
    if (diagnoses.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 1rem; color: #6b7280;">No medical diagnoses found</p>';
        return;
    }
    
    diagnoses.forEach(diagnosis => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        
        const header = document.createElement('div');
        header.className = 'admin-item-header';
        
        const title = document.createElement('h4');
        title.className = 'admin-item-title';
        title.textContent = diagnosis;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'admin-item-buttons';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary';
        editBtn.style.padding = '0.25rem 0.5rem';
        editBtn.style.fontSize = '0.875rem';
        editBtn.textContent = '編輯';
        editBtn.onclick = () => showEditDiagnosisModal(diagnosis);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.style.padding = '0.25rem 0.5rem';
        deleteBtn.style.fontSize = '0.875rem';
        deleteBtn.textContent = '刪除';
        deleteBtn.onclick = () => {
            if (confirm(`確定要刪除「${diagnosis}」嗎？`)) {
                delete diagnosisDatabase[diagnosis];
                localStorage.setItem('diagnosisDatabase', JSON.stringify(diagnosisDatabase));
                updateDiagnosisManagementList();
                createExampleButtons();
            }
        };
        
        buttonContainer.appendChild(editBtn);
        buttonContainer.appendChild(deleteBtn);
        
        header.appendChild(title);
        header.appendChild(buttonContainer);
        
        // Show a preview of nursing diagnoses
        const preview = document.createElement('div');
        preview.className = 'admin-item-preview';
        
        const nursingDiagnoses = diagnosisDatabase[diagnosis].descriptions;
        if (nursingDiagnoses && nursingDiagnoses.length > 0) {
            preview.textContent = `${nursingDiagnoses.length} 個相關護理診斷`;
        } else {
            preview.textContent = '沒有相關護理診斷';
        }
        
        item.appendChild(header);
        item.appendChild(preview);
        container.appendChild(item);
    });
    
    // Add search functionality
    if (searchInput) {
        searchInput.addEventListener('input', updateDiagnosisManagementList);
    }
}

// Function to show edit diagnosis modal
function showEditDiagnosisModal(diagnosis) {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'admin-panel';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'admin-content';
    
    // Create header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '1rem';
    
    const title = document.createElement('h3');
    title.className = 'admin-title';
    title.textContent = `編輯診斷: ${diagnosis}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.style.color = '#6b7280';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => document.body.removeChild(modal);
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create form
    const form = document.createElement('div');
    form.className = 'form-grid';
    
    const diagnosisNameDiv = document.createElement('div');
    const diagnosisNameLabel = document.createElement('label');
    diagnosisNameLabel.className = 'form-label';
    diagnosisNameLabel.textContent = '醫學診斷名稱：';
    
    const diagnosisNameInput = document.createElement('input');
    diagnosisNameInput.type = 'text';
    diagnosisNameInput.className = 'form-input';
    diagnosisNameInput.value = diagnosis;
    
    diagnosisNameDiv.appendChild(diagnosisNameLabel);
    diagnosisNameDiv.appendChild(diagnosisNameInput);
    
    const nursingDiagnosesDiv = document.createElement('div');
    const nursingDiagnosesLabel = document.createElement('label');
    nursingDiagnosesLabel.className = 'form-label';
    nursingDiagnosesLabel.textContent = '相關的護理診斷：';
    
    // Add dropdown for common nursing diagnoses
    const commonDiagnosesSelect = document.createElement('select');
    commonDiagnosesSelect.className = 'form-select';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- 選擇常見護理診斷新增 --';
    commonDiagnosesSelect.appendChild(defaultOption);
    
    // Get all nursing diagnoses from links
    const nursingDiagnosesOptions = Object.keys(diagnosisLinks).sort();
    
    nursingDiagnosesOptions.forEach(nd => {
        const option = document.createElement('option');
        option.value = nd;
        option.textContent = nd;
        commonDiagnosesSelect.appendChild(option);
    });
    
    const nursingDiagnosesTextarea = document.createElement('textarea');
    nursingDiagnosesTextarea.className = 'form-textarea';
    nursingDiagnosesTextarea.style.height = '12rem';
    nursingDiagnosesTextarea.value = diagnosisDatabase[diagnosis].descriptions.join('\n');
    
    // Add event listener to dropdown
    commonDiagnosesSelect.addEventListener('change', () => {
        if (commonDiagnosesSelect.value) {
            const currentText = nursingDiagnosesTextarea.value.trim();
            const newDiagnosis = commonDiagnosesSelect.value;
            
            if (currentText) {
                nursingDiagnosesTextarea.value = currentText + '\n' + newDiagnosis;
            } else {
                nursingDiagnosesTextarea.value = newDiagnosis;
            }
            
            // Reset dropdown
            commonDiagnosesSelect.value = '';
        }
    });
    
    nursingDiagnosesDiv.appendChild(nursingDiagnosesLabel);
    nursingDiagnosesDiv.appendChild(commonDiagnosesSelect);
    nursingDiagnosesDiv.appendChild(nursingDiagnosesTextarea);
    
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'form-actions';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'btn btn-primary';
    saveButton.textContent = '儲存變更';
    saveButton.onclick = () => {
        const newDiagnosisName = diagnosisNameInput.value.trim();
        const nursingDiagnoses = nursingDiagnosesTextarea.value.trim();
        
        if (newDiagnosisName && nursingDiagnoses) {
            // Split nursing diagnoses by new line
            const descriptions = nursingDiagnoses.split('\n').filter(desc => desc.trim() !== '');
            
            // If diagnosis name changed
            if (newDiagnosisName !== diagnosis) {
                // Create new entry with new name
                diagnosisDatabase[newDiagnosisName] = {
                    descriptions: descriptions
                };
                
                // Remove old entry
                delete diagnosisDatabase[diagnosis];
            } else {
                // Update existing entry
                diagnosisDatabase[diagnosis].descriptions = descriptions;
            }
            
            // Save to localStorage
            localStorage.setItem('diagnosisDatabase', JSON.stringify(diagnosisDatabase));
            
            // Update UI
            updateDiagnosisManagementList();
            createExampleButtons();
            
            // Close modal
            document.body.removeChild(modal);
            
            alert(`診斷「${newDiagnosisName}」已儲存！`);
        } else {
            alert('請填寫所有欄位！');
        }
    };
    
    buttonDiv.appendChild(saveButton);
    
    // Assemble the form
    form.appendChild(diagnosisNameDiv);
    form.appendChild(nursingDiagnosesDiv);
    form.appendChild(buttonDiv);
    
    // Assemble the modal
    modalContent.appendChild(header);
    modalContent.appendChild(form);
    modal.appendChild(modalContent);
    
    // Add to DOM
    document.body.appendChild(modal);
}

// Save medical diagnosis
saveMedicalDiagnosisBtn.addEventListener('click', () => {
    const medicalDiagnosis = document.getElementById('medicalDiagnosisInput').value.trim();
    const nursingDiagnoses = document.getElementById('nursingDiagnosesInput').value.trim();
    
    if (medicalDiagnosis && nursingDiagnoses) {
        // Split nursing diagnoses by new line
        const descriptions = nursingDiagnoses.split('\n').filter(desc => desc.trim() !== '');
        
        // Check if diagnosis already exists
        if (diagnosisDatabase[medicalDiagnosis] && !confirm(`醫學診斷「${medicalDiagnosis}」已存在。要覆蓋嗎？`)) {
            return;
        }
        
        // Add or update the diagnosis in the database
        diagnosisDatabase[medicalDiagnosis] = {
            descriptions: descriptions
        };
        
        // Save to localStorage
        localStorage.setItem('diagnosisDatabase', JSON.stringify(diagnosisDatabase));
        
        // Update example buttons
        createExampleButtons();
        
        // Clear inputs
        document.getElementById('medicalDiagnosisInput').value = '';
        document.getElementById('nursingDiagnosesInput').value = '';
        
        alert(`醫學診斷「${medicalDiagnosis}」已儲存！`);
    } else {
        alert('請填寫所有欄位！');
    }
});

// Save diagnosis link
saveDiagnosisLinkBtn.addEventListener('click', () => {
    const nursingDiagnosis = document.getElementById('nursingDiagnosisInput').value.trim();
    const diagnosisLink = document.getElementById('diagnosisLinkInput').value.trim();
    
    if (nursingDiagnosis && diagnosisLink) {
        // Check if link already exists
        if (diagnosisLinks[nursingDiagnosis] && 
            !confirm(`護理診斷「${nursingDiagnosis}」已有連結。要覆蓋嗎？`)) {
            return;
        }
        
        // Add or update the diagnosis link
        diagnosisLinks[nursingDiagnosis] = diagnosisLink;
        
        // Save to localStorage
        localStorage.setItem('diagnosisLinks', JSON.stringify(diagnosisLinks));
        
        // Update the links list
        updateNursingLinksList();
        
        // Clear inputs
        document.getElementById('nursingDiagnosisInput').value = '';
        document.getElementById('diagnosisLinkInput').value = '';
        
        alert(`護理診斷「${nursingDiagnosis}」連結已儲存！`);
    } else {
        alert('請填寫所有欄位！');
    }
});

// Populate target diagnosis dropdown in aliases tab
function populateTargetDiagnosisSelect() {
    const select = document.getElementById('targetDiagnosisSelect');
    select.innerHTML = '<option value="">-- 選擇相關醫學診斷 --</option>';
    
    const diagnoses = Object.keys(diagnosisDatabase).sort();
    diagnoses.forEach(diagnosis => {
        const option = document.createElement('option');
        option.value = diagnosis;
        option.textContent = diagnosis;
        select.appendChild(option);
    });
}

// Function to update aliases list
function updateAliasesList() {
    const container = document.getElementById('aliasesContainer');
    container.innerHTML = '';
    
    const aliases = Object.entries(diagnosisAliases).sort((a, b) => a[0].localeCompare(b[0]));
    
    if (aliases.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 0.5rem; color: #6b7280;">沒有定義的診斷別名</p>';
        return;
    }
    
    aliases.forEach(([alias, target]) => {
        const item = document.createElement('div');
        item.className = 'link-item';
        
        const aliasText = document.createElement('span');
        aliasText.textContent = alias;
        aliasText.className = 'link-text';
        aliasText.title = alias;
        
        const targetText = document.createElement('span');
        targetText.textContent = `→ ${target}`;
        targetText.style.color = '#3b82f6';
        targetText.style.fontSize = '0.875rem';
        targetText.style.marginLeft = '0.5rem';
        targetText.title = `Points to: ${target}`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete this alias';
        deleteBtn.onclick = () => {
            if (confirm(`確定要刪除別名「${alias}」嗎？`)) {
                delete diagnosisAliases[alias];
                localStorage.setItem('diagnosisAliases', JSON.stringify(diagnosisAliases));
                updateAliasesList();
            }
        };
        
        item.appendChild(aliasText);
        item.appendChild(targetText);
        item.appendChild(deleteBtn);
        container.appendChild(item);
    });
}

// Save alias
document.getElementById('saveAliasBtn').addEventListener('click', () => {
    const alias = document.getElementById('aliasInput').value.trim();
    const target = document.getElementById('targetDiagnosisSelect').value;
    
    if (alias && target) {
        // Check if alias already exists
        if (diagnosisAliases[alias] && 
            !confirm(`別名「${alias}」已存在。要覆蓋嗎？`)) {
            return;
        }
        
        // Add or update the alias
        diagnosisAliases[alias] = target;
        
        // Save to localStorage
        localStorage.setItem('diagnosisAliases', JSON.stringify(diagnosisAliases));
        
        // Update the aliases list
        updateAliasesList();
        
        // Update example buttons (to include aliases)
        createExampleButtons();
        
        // Clear inputs
        document.getElementById('aliasInput').value = '';
        document.getElementById('targetDiagnosisSelect').value = '';
        
        alert(`診斷別名「${alias}」已儲存！`);
    } else {
        alert('請填寫所有欄位！');
    }
});

// Export data
exportDataBtn.addEventListener('click', () => {
    const exportData = {
        diagnosisDatabase: diagnosisDatabase,
        diagnosisLinks: diagnosisLinks,
        diagnosisAliases: diagnosisAliases
    };
    
    const exportString = JSON.stringify(exportData, null, 2);
    
    // Create a temporary textarea to copy the data
    const textarea = document.createElement('textarea');
    textarea.value = exportString;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    // Create and download a JSON file
    const blob = new Blob([exportString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nursing-diagnosis-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('資料已匯出並複製到剪貼簿！檔案也已下載。');
});

// Choose file button
document.getElementById('chooseFileBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
});

// File input change handler
document.getElementById('importFileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('importDataInput').value = e.target.result;
        };
        reader.readAsText(file);
    }
});

// Import data
importDataBtn.addEventListener('click', () => {
    const importDataString = document.getElementById('importDataInput').value.trim();
    
    if (importDataString) {
        try {
            const importData = JSON.parse(importDataString);
            
            if (importData.diagnosisDatabase && importData.diagnosisLinks) {
                if (confirm('這會覆蓋目前所有資料。確定要匯入嗎？')) {
                    diagnosisDatabase = importData.diagnosisDatabase;
                    diagnosisLinks = importData.diagnosisLinks;
                    
                    // Import aliases if available
                    if (importData.diagnosisAliases) {
                        diagnosisAliases = importData.diagnosisAliases;
                        localStorage.setItem('diagnosisAliases', JSON.stringify(diagnosisAliases));
                    }
                    
                    // Save to localStorage
                    localStorage.setItem('diagnosisDatabase', JSON.stringify(diagnosisDatabase));
                    localStorage.setItem('diagnosisLinks', JSON.stringify(diagnosisLinks));
                    
                    // Update UI
                    createExampleButtons();
                    updateNursingLinksList();
                    updateDiagnosisManagementList();
                    updateAliasesList();
                    
                    // Clear input
                    document.getElementById('importDataInput').value = '';
                    document.getElementById('importFileInput').value = '';
                    
                    alert('資料匯入成功！');
                }
            } else {
                alert('匯入資料格式無效。');
            }
        } catch (error) {
            alert('解析匯入資料時發生錯誤: ' + error.message);
        }
    } else {
        alert('請輸入匯入資料或選擇檔案。');
    }
});

// Close search results when clicking outside
document.addEventListener('click', (event) => {
    if (!searchInput.contains(event.target) && !searchResults.contains(event.target)) {
        searchResults.classList.add('hidden');
    }
});

// Initialize data and UI
document.addEventListener('DOMContentLoaded', initializeDatabase);