        // Add this to the beginning of your diagnosis.js file or create a new file like auth.js

        document.addEventListener('DOMContentLoaded', function() {
            // Check if already authenticated
            const isAuthenticated = sessionStorage.getItem('authenticated');
            
            if (!isAuthenticated) {
                // Create login overlay
                const overlay = document.createElement('div');
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.backgroundColor = '#3498db';
                overlay.style.zIndex = '9999';
                overlay.style.display = 'flex';
                overlay.style.justifyContent = 'center';
                overlay.style.alignItems = 'center';
                
                // Create login form
                const loginForm = document.createElement('div');
                loginForm.style.backgroundColor = 'white';
                loginForm.style.padding = '30px';
                loginForm.style.borderRadius = '8px';
                loginForm.style.maxWidth = '400px';
                loginForm.style.width = '90%';
                loginForm.style.textAlign = 'center';
                loginForm.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
                
                // Add form content
                loginForm.innerHTML = `
                    <h2 style="color: #2c3e50; margin-bottom: 20px;">Nursing Diagnosis Library</h2>
                    <p style="margin-bottom: 20px;">Please enter your password to access the content:</p>
                    
                    <div style="margin-bottom: 20px;">
                        <input type="password" id="password" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;" placeholder="Enter password">
                    </div>
                    
                    <div id="error-message" style="color: #e74c3c; margin-bottom: 15px; display: none;">
                        Incorrect password. Please try again.
                    </div>
                    
                    <button id="login-button" style="background-color: #3498db; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%;">
                        Login
                    </button>
        
                    <p style="margin-top: 20px; font-size: 12px; color: #7f8c8d;">
                        This is a private medical resource. Unauthorized access is prohibited.
                    </p>
                `;
                
                // Add form to overlay
                overlay.appendChild(loginForm);
                
                // Add overlay to body
                document.body.appendChild(overlay);
                
                // Get password input and button
                const passwordInput = document.getElementById('password');
                const loginButton = document.getElementById('login-button');
                const errorMessage = document.getElementById('error-message');
                
                // Function to check password
                function checkPassword() {
                    // Change 'your-secret-password' to whatever password you want to use
                    const correctPassword = 'nursingdiagnosis';
                    
                    if (passwordInput.value === correctPassword) {
                        // Set authenticated in session storage
                        sessionStorage.setItem('authenticated', 'true');
                        
                        // Remove overlay
                        document.body.removeChild(overlay);
                    } else {
                        // Show error message
                        errorMessage.style.display = 'block';
                        
                        // Clear password field
                        passwordInput.value = '';
                        
                        // Focus on password field
                        passwordInput.focus();
                    }
                }
                
                // Add event listeners
                loginButton.addEventListener('click', checkPassword);
                
                // Allow pressing Enter key to submit
                passwordInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        checkPassword();
                    }
                });
                
                // Focus on password field when page loads
                passwordInput.focus();
            }
            
            // Optional: Add logout functionality
            // You can add this button somewhere in your existing HTML
            const logoutButton = document.createElement('button');
            logoutButton.textContent = 'Logout';
            logoutButton.style.position = 'absolute';
            logoutButton.style.top = '10px';
            logoutButton.style.right = '10px';
            logoutButton.style.backgroundColor = '#e74c3c';
            logoutButton.style.color = 'white';
            logoutButton.style.border = 'none';
            logoutButton.style.padding = '5px 10px';
            logoutButton.style.borderRadius = '4px';
            logoutButton.style.cursor = 'pointer';
            
            logoutButton.addEventListener('click', function() {
                // Clear authentication
                sessionStorage.removeItem('authenticated');
                
                // Reload page
                window.location.reload();
            });
            
            // Add logout button to header
            document.querySelector('header').appendChild(logoutButton);
        });
                
                // This JavaScript code provides the template functionality
                document.querySelector('.add-button').addEventListener('click', function() {
                    // Create modal overlay
                    const modal = document.createElement('div');
                    modal.style.position = 'fixed';
                    modal.style.top = '0';
                    modal.style.left = '0';
                    modal.style.width = '100%';
                    modal.style.height = '100%';
                    modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
                    modal.style.zIndex = '999';
                    modal.style.display = 'flex';
                    modal.style.justifyContent = 'center';
                    modal.style.alignItems = 'center';
                    
                    // Create modal content
                    const modalContent = document.createElement('div');
                    modalContent.style.backgroundColor = 'white';
                    modalContent.style.padding = '30px';
                    modalContent.style.borderRadius = '8px';
                    modalContent.style.maxWidth = '600px';
                    modalContent.style.width = '80%';
                    modalContent.style.maxHeight = '80vh';
                    modalContent.style.overflow = 'auto';
                    
                    // Add heading
                    const heading = document.createElement('h2');
                    heading.textContent = 'How to Add a New Nursing Diagnosis';
                    heading.style.marginBottom = '20px';
                    modalContent.appendChild(heading);
                    
                    // Add instructions
                    const instructions = document.createElement('div');
                    instructions.innerHTML = `
                        <p>This is a static HTML template. To add a new nursing diagnosis, follow these steps:</p>
                        
                        <ol style="margin-bottom: 20px;">
                            <li>Save this HTML file to your computer</li>
                            <li>Make a copy of the file and rename it (e.g., "anxiety-nursing-diagnosis.html")</li>
                            <li>Open the new file in a text editor or HTML editor</li>
                            <li>Replace the content in each section with information for your new diagnosis:
                                <ul style="margin-top: 10px;">
                                    <li>Update the title in the &lt;title&gt; tag</li>
                                    <li>Change "Acute Pain" to your new diagnosis name in the content section</li>
                                    <li>Update the NANDA-I definition</li>
                                    <li>Update the defining characteristics or risk factors</li>
                                    <li>Update the related factors or risk factors</li>
                                    <li>Update the NOC outcomes</li>
                                    <li>Update the client outcomes</li>
                                    <li>Update the NIC interventions</li>
                                    <li>Replace the nursing interventions and rationales</li>
                                    <li>Update the client/family teaching section</li>
                                </ul>
                            </li>
                            <li>In the sidebar navigation list, add your new diagnosis</li>
                            <li>Save the file and open it in a web browser</li>
                        </ol>
                        
                        <p>To build a complete library, repeat this process for each nursing diagnosis.</p>
                        
                        <p><strong>Pro Tip:</strong> You can also modify the CSS styles in the &lt;style&gt; section to customize colors, fonts, and layout to your preference.</p>
                    `;
                    modalContent.appendChild(instructions);
                    
                    // Add close button
                    const closeButton = document.createElement('button');
                    closeButton.textContent = 'Close';
                    closeButton.style.backgroundColor = '#3498db';
                    closeButton.style.color = 'white';
                    closeButton.style.border = 'none';
                    closeButton.style.padding = '10px 20px';
                    closeButton.style.borderRadius = '4px';
                    closeButton.style.cursor = 'pointer';
                    closeButton.style.marginTop = '20px';
                    closeButton.addEventListener('click', function() {
                        document.body.removeChild(modal);
                    });
                    modalContent.appendChild(closeButton);
                    
                    // Add modal to body
                    modal.appendChild(modalContent);
                    document.body.appendChild(modal);
                    
                    // Close modal when clicking outside
                    modal.addEventListener('click', function(e) {
                        if (e.target === modal) {
                            document.body.removeChild(modal);
                        }
                    });
                });
                
                // Add click event to "Add new diagnosis..." list item
                document.querySelectorAll('.diagnosis-nav li').forEach(item => {
                    if (item.textContent.includes('Add new diagnosis...')) {
                        item.addEventListener('click', function() {
                            document.querySelector('.add-button').click();
                        });
                    }
                });
                
                // Add click event to other diagnosis list items
                document.querySelectorAll('.diagnosis-nav li').forEach(item => {
                    if (item.textContent === 'Risk for Infection') {
                        item.addEventListener('click', function() {
                            window.location.href = 'Risk-for-infection.html';
                        });
                    }
                });
                
                // Sample search functionality
                document.querySelector('.search-box').addEventListener('input', function(e) {
                    let searchTerm = e.target.value.toLowerCase();
                    let diagnosisItems = document.querySelectorAll('.diagnosis-nav li');
                    
                    diagnosisItems.forEach(item => {
                        if (item.innerText.toLowerCase().includes(searchTerm) || searchTerm === '') {
                            item.style.display = 'block';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                });
        
                document.addEventListener('DOMContentLoaded', function() {
                    // Initialize taxonomy filters
                    initTaxonomyFilters();
                    
                    // Set initial active filters based on current page
                    setInitialActiveFilters();
                    
                    // Attach search functionality
                    initSearchFunctionality();
                    
                    // Add click events to diagnosis items
                    initDiagnosisClickEvents();
                    
                    // Add click event to "Add new diagnosis..." button
                    document.querySelector('.add-new').addEventListener('click', function() {
                        document.querySelector('.add-button').click();
                    });
                });
                
                function initTaxonomyFilters() {
                    // Domain filter change event
                    document.getElementById('domain-filter').addEventListener('change', function() {
                        const selectedDomain = this.value;
                        
                        // Hide all domain groups first
                        document.querySelectorAll('.domain-group').forEach(group => {
                            group.classList.remove('active');
                        });
                        
                        // Show selected domain or all domains
                        if (selectedDomain === 'all') {
                            document.querySelectorAll('.domain-group').forEach(group => {
                                group.classList.add('active');
                            });
                        } else {
                            document.getElementById(selectedDomain).classList.add('active');
                        }
                        
                        // Update class filter options based on selected domain
                        updateClassFilter(selectedDomain);
                    });
                    
                    // Class filter change event
                    document.getElementById('class-filter').addEventListener('change', function() {
                        const selectedClass = this.value;
                        const selectedDomain = document.getElementById('domain-filter').value;
                        
                        // Hide all class groups in the active domain first
                        if (selectedDomain !== 'all') {
                            document.querySelectorAll(`#${selectedDomain} .class-group`).forEach(group => {
                                group.classList.remove('active');
                            });
                            
                            // Show selected class or all classes in the active domain
                            if (selectedClass === 'all') {
                                document.querySelectorAll(`#${selectedDomain} .class-group`).forEach(group => {
                                    group.classList.add('active');
                                });
                            } else {
                                document.getElementById(`${selectedDomain}-${selectedClass}`).classList.add('active');
                            }
                        } else {
                            // If "All Domains" is selected, we need special handling
                            document.querySelectorAll('.class-group').forEach(group => {
                                if (selectedClass === 'all') {
                                    group.classList.add('active');
                                } else {
                                    if (group.id.endsWith(selectedClass)) {
                                        group.classList.add('active');
                                    } else {
                                        group.classList.remove('active');
                                    }
                                }
                            });
                        }
                    });
                }
                
                function updateClassFilter(selectedDomain) {
                    const classFilter = document.getElementById('class-filter');
                    
                    // Clear current options except "All Classes"
                    while (classFilter.options.length > 1) {
                        classFilter.remove(1);
                    }
                    
                    // Define class options for each domain
                    if (selectedDomain === 'all') {
                        // If "All Domains" is selected, add a representative set of classes
                        addClassOption(classFilter, 'class1', 'Class 1: Various (across domains)');
                        addClassOption(classFilter, 'class2', 'Class 2: Various (across domains)');
                        addClassOption(classFilter, 'class3', 'Class 3: Various (across domains)');
                        
                    } else if (selectedDomain === 'domain1') {
                        // Domain 1: Health Promotion
                        addClassOption(classFilter, 'class1', 'Class 1: Health awareness');
                        addClassOption(classFilter, 'class2', 'Class 2: Health management');
                        
                    } else if (selectedDomain === 'domain2') {
                        // Domain 2: Nutrition
                        addClassOption(classFilter, 'class1', 'Class 1: Ingestion');
                        addClassOption(classFilter, 'class2', 'Class 2: Digestion');
                        addClassOption(classFilter, 'class3', 'Class 3: Absorption');
                        addClassOption(classFilter, 'class4', 'Class 4: Metabolism');
                        addClassOption(classFilter, 'class5', 'Class 5: Hydration');
                        
                    } else if (selectedDomain === 'domain3') {
                        // Domain 3: Elimination and Exchange
                        addClassOption(classFilter, 'class1', 'Class 1: Urinary function');
                        addClassOption(classFilter, 'class2', 'Class 2: Gastrointestinal function');
                        addClassOption(classFilter, 'class3', 'Class 3: Integumentary function');
                        addClassOption(classFilter, 'class4', 'Class 4: Respiratory function');
                        
                    } else if (selectedDomain === 'domain4') {
                        // Domain 4: Activity/Rest
                        addClassOption(classFilter, 'class1', 'Class 1: Sleep/rest');
                        addClassOption(classFilter, 'class2', 'Class 2: Activity/exercise');
                        addClassOption(classFilter, 'class3', 'Class 3: Energy balance');
                        addClassOption(classFilter, 'class4', 'Class 4: Cardiovascular/pulmonary responses');
                        addClassOption(classFilter, 'class5', 'Class 5: Self-care');
                        
                    } else if (selectedDomain === 'domain5') {
                        // Domain 5: Perception/Cognition
                        addClassOption(classFilter, 'class1', 'Class 1: Attention');
                        addClassOption(classFilter, 'class2', 'Class 2: Orientation');
                        addClassOption(classFilter, 'class3', 'Class 3: Sensation/perception');
                        addClassOption(classFilter, 'class4', 'Class 4: Cognition');
                        addClassOption(classFilter, 'class5', 'Class 5: Communication');
                        
                    } else if (selectedDomain === 'domain6') {
                        // Domain 6: Self-perception
                        addClassOption(classFilter, 'class1', 'Class 1: Self-concept');
                        addClassOption(classFilter, 'class2', 'Class 2: Self-esteem');
                        addClassOption(classFilter, 'class3', 'Class 3: Body image');
                        
                    } else if (selectedDomain === 'domain7') {
                        // Domain 7: Role Relationship
                        addClassOption(classFilter, 'class1', 'Class 1: Caregiving roles');
                        addClassOption(classFilter, 'class2', 'Class 2: Family relationships');
                        addClassOption(classFilter, 'class3', 'Class 3: Role performance');
                        
                    } else if (selectedDomain === 'domain8') {
                        // Domain 8: Sexuality
                        addClassOption(classFilter, 'class1', 'Class 1: Sexual identity');
                        addClassOption(classFilter, 'class2', 'Class 2: Sexual function');
                        addClassOption(classFilter, 'class3', 'Class 3: Reproduction');
                        
                    } else if (selectedDomain === 'domain9') {
                        // Domain 9: Coping/Stress Tolerance
                        addClassOption(classFilter, 'class1', 'Class 1: Post-trauma responses');
                        addClassOption(classFilter, 'class2', 'Class 2: Coping responses');
                        addClassOption(classFilter, 'class3', 'Class 3: Neurobehavioral stress');
                        
                    } else if (selectedDomain === 'domain10') {
                        // Domain 10: Life Principles
                        addClassOption(classFilter, 'class1', 'Class 1: Values');
                        addClassOption(classFilter, 'class2', 'Class 2: Beliefs');
                        addClassOption(classFilter, 'class3', 'Class 3: Value/belief/action congruence');
                        
                    } else if (selectedDomain === 'domain11') {
                        // Domain 11: Safety/Protection
                        addClassOption(classFilter, 'class1', 'Class 1: Infection');
                        addClassOption(classFilter, 'class2', 'Class 2: Physical injury');
                        addClassOption(classFilter, 'class3', 'Class 3: Violence');
                        addClassOption(classFilter, 'class4', 'Class 4: Environmental hazards');
                        addClassOption(classFilter, 'class5', 'Class 5: Defensive processes');
                        addClassOption(classFilter, 'class6', 'Class 6: Thermoregulation');
                        
                    } else if (selectedDomain === 'domain12') {
                        // Domain 12: Comfort
                        addClassOption(classFilter, 'class1', 'Class 1: Physical comfort');
                        addClassOption(classFilter, 'class2', 'Class 2: Environmental comfort');
                        addClassOption(classFilter, 'class3', 'Class 3: Social comfort');
                        
                    } else if (selectedDomain === 'domain13') {
                        // Domain 13: Growth/Development
                        addClassOption(classFilter, 'class1', 'Class 1: Growth');
                        addClassOption(classFilter, 'class2', 'Class 2: Development');
                    }
                    
                    // Reset class filter to "All Classes"
                    classFilter.value = 'all';
                    
                    // Trigger change event to update visible classes
                    const event = new Event('change');
                    classFilter.dispatchEvent(event);
                }
                
                function addClassOption(selectElement, value, text) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    selectElement.appendChild(option);
                }
                
                function setInitialActiveFilters() {
                    // For this example, we're on the Acute Pain page, so we'll set Domain 12, Class 1 as active
                    document.getElementById('domain12').classList.add('active');
                    document.getElementById('domain12-class1').classList.add('active');
                    
                    // You would normally determine this dynamically based on the current page
                }
                
                function initSearchFunctionality() {
                    document.querySelector('.search-box').addEventListener('input', function(e) {
                        const searchTerm = e.target.value.toLowerCase();
                        
                        if (searchTerm === '') {
                            // If search is empty, restore the taxonomy filtering view
                            const domainFilter = document.getElementById('domain-filter');
                            const classFilter = document.getElementById('class-filter');
                            
                            // Trigger filter events to restore the view
                            domainFilter.dispatchEvent(new Event('change'));
                            classFilter.dispatchEvent(new Event('change'));
                            
                            return;
                        }
                        
                        // Show all diagnosis items for searching
                        document.querySelectorAll('.domain-group, .class-group').forEach(group => {
                            group.classList.add('active');
                        });
                        
                        // Filter diagnoses by search term
                        document.querySelectorAll('.diagnosis-nav li:not(.add-new)').forEach(item => {
                            if (item.textContent.toLowerCase().includes(searchTerm)) {
                                item.style.display = 'block';
                                
                                // Make sure parent groups are visible
                                let parent = item.closest('.class-group');
                                if (parent) {
                                    parent.classList.add('active');
                                    parent.style.display = 'block';
                                    
                                    parent = parent.closest('.domain-group');
                                    if (parent) {
                                        parent.classList.add('active');
                                        parent.style.display = 'block';
                                    }
                                }
                            } else {
                                item.style.display = 'none';
                            }
                        });
                    });
                }
                
                function initDiagnosisClickEvents() {
                    document.querySelectorAll('.diagnosis-nav li:not(.add-new)').forEach(item => {
                        item.addEventListener('click', function() {
                            if (this.hasAttribute('href')) {
                                window.location.href = this.getAttribute('href');
                            }
                        });
                    });
                }