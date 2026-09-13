// mobile-menu.js - 將這個文件保存到您的javascript目錄

document.addEventListener('DOMContentLoaded', function() {
    setupMobileMenu();
});

/**
 * 設置移動端菜單功能
 */
function setupMobileMenu() {
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    
    if (navToggle && navLinks) {
        // 綁定菜單切換事件
        navToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
        
        // 點擊鏈接後自動收起菜單
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    navLinks.classList.remove('active');
                }
            });
        });
    } else {
        // 如果找不到現有菜單元素，創建新的菜單
        createMobileMenu();
    }
}

/**
 * 如果頁面中沒有移動菜單，創建一個新的
 */
function createMobileMenu() {
    // 找到頁面頭部
    const header = document.querySelector('header') || document.querySelector('.header');
    
    if (!header) return;
    
    // 創建新的導航容器
    const navigationContainer = document.createElement('div');
    navigationContainer.className = 'navigation-container';
    
    // 獲取現有導航的鏈接
    const existingLinks = [];
    const existingNav = document.querySelector('.navigation');
    
    if (existingNav) {
        const links = existingNav.querySelectorAll('a');
        links.forEach(link => {
            existingLinks.push({
                href: link.getAttribute('href'),
                text: link.textContent
            });
        });
    } else {
        // 默認鏈接，如果沒有找到現有導航
        existingLinks.push(
            { href: "user-guide.html", text: "使用說明" },
            { href: "index.html", text: "護理工作時間表" },
            { href: "nursing-checklist.html", text: "護理工作Checklist" },
            { href: "nursing-clinical-tools.html", text: "護理臨床小工具" },
            { href: "surgery-and-exam-checklist.html", text: "手術與檢查Checklist" },
            { href: "clinical-cheatsheet.html", text: "臨床懶人包" },
            { href: "nursing-diagnosis-search-tool.html", text: "護理診斷查詢工具" },
            { href: "nursing-kardex.html", text: "交班單（prototype）" }
        );
    }
    
    // 創建導航結構
    const newNav = document.createElement('div');
    newNav.className = 'navigation';
    
    // 創建漢堡菜單按鈕
    const navToggle = document.createElement('div');
    navToggle.className = 'nav-toggle';
    navToggle.id = 'nav-toggle';
    navToggle.innerHTML = '<span></span><span></span><span></span>';
    
    // 創建導航鏈接容器
    const navLinks = document.createElement('div');
    navLinks.className = 'nav-links';
    navLinks.id = 'nav-links';
    
    // 添加鏈接
    existingLinks.forEach(link => {
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.text;
        navLinks.appendChild(a);
    });
    
    // 組裝新導航
    newNav.appendChild(navToggle);
    newNav.appendChild(navLinks);
    navigationContainer.appendChild(newNav);
    
    // 插入到header開頭
    header.insertBefore(navigationContainer, header.firstChild);
    
    // 添加菜單切換事件
    navToggle.addEventListener('click', function() {
        navLinks.classList.toggle('active');
    });
    
    // 點擊鏈接後自動收起菜單
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                navLinks.classList.remove('active');
            }
        });
    });
    
    // 如果存在舊的導航，移除它
    if (existingNav && existingNav !== newNav) {
        existingNav.remove();
    }
}