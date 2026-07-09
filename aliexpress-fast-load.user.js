// ==UserScript==
// @name         AliExpress - טעינה מהירה
// @namespace    https://github.com/HAKOL-MILEMALA/
// @version      1.0
// @description  הוספת כפתור טעינה מהירה בעיצוב נקי, כולל ספינר מובנה והעלמת החלון הקופץ ברקע בעליאקספרס
// @author       Anonymous
// @match        *://*.aliexpress.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://github.com/HAKOL-MILEMALA/aliexpress-fast-load/raw/refs/heads/main/aliexpress-fast-load.user.js
// @downloadURL  https://github.com/HAKOL-MILEMALA/aliexpress-fast-load/raw/refs/heads/main/aliexpress-fast-load.user.js
// ==/UserScript==

(function() {
    'use strict';

    let isChecking = false;

    // הזרקת סגנונות האנימציה של הספינר וסגנונות ההסתרה לחלון
    function injectStyles() {
        if (document.getElementById('super-load-custom-styles')) return;

        const style = document.createElement('style');
        style.id = 'super-load-custom-styles';
        style.innerHTML = `
            /* ספינר אנימציה */
            @keyframes superBtnRotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .super-spinner {
                animation: superBtnRotate 0.8s linear infinite;
                display: inline-block;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #ffffff;
                box-sizing: border-box;
            }

            /* מחלקה זמנית שמסתירה את החלון המקורי בזמן שהסקריפט רץ */
            body.super-loading-active .get-link-pro-balloon {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: scale(0.9) !important;
                transition: none !important;
                z-index: -9999 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function injectMainButton() {
        const mainOriginalBtn = document.querySelector('.get-link-pro-button');

        if (mainOriginalBtn && !document.querySelector('#super-quick-load-btn')) {

            injectStyles();

            const container = mainOriginalBtn.parentElement;

            if (container && container.style.display !== 'flex') {
                container.style.display = 'flex';
                container.style.gap = '8px';
                container.style.alignItems = 'center';
                container.style.width = '100%';
            }

            if (mainOriginalBtn.style.flex !== '1') {
                mainOriginalBtn.style.flex = '1';
            }

            const newBtn = document.createElement('button');
            newBtn.id = 'super-quick-load-btn';
            newBtn.type = 'button';
            newBtn.className = 'next-btn next-medium next-btn-primary';

            newBtn.style.backgroundColor = '#006BFF';
            newBtn.style.color = '#ffffff';
            newBtn.style.border = 'none';
            newBtn.style.borderRadius = '12px';
            newBtn.style.padding = '0 16px';
            newBtn.style.cursor = 'pointer';
            newBtn.style.height = '32px';
            newBtn.style.boxSizing = 'border-box';
            newBtn.style.display = 'inline-flex';
            newBtn.style.alignItems = 'center';
            newBtn.style.justifyContent = 'center';
            newBtn.style.flexShrink = '0';
            newBtn.style.whiteSpace = 'nowrap';
            newBtn.style.transition = 'all 0.15s ease';

            const btnHelper = document.createElement('span');
            btnHelper.className = 'next-btn-helper';
            btnHelper.style.display = 'flex';
            btnHelper.style.alignItems = 'center';
            btnHelper.style.gap = '6px';
            btnHelper.style.lineHeight = '1';

            const defaultHTML = '<span>⚡</span><span>טען</span>';
            const loadingHTML = '<div class="super-spinner"></div><span>טוען...</span>';

            btnHelper.innerHTML = defaultHTML;
            newBtn.appendChild(btnHelper);

            newBtn.onclick = function() {
                if (isChecking) return;
                isChecking = true;

                // הפעלת מצב ההסתרה לפני הלחיצה!
                document.body.classList.add('super-loading-active');

                btnHelper.innerHTML = loadingHTML;
                mainOriginalBtn.click();

                let attempts = 0;
                const checkInterval = setInterval(() => {
                    attempts++;
                    const balloon = document.querySelector('.get-link-pro-balloon');

                    if (balloon) {
                        const allInputs = Array.from(balloon.querySelectorAll('input'));
                        const linkInput = allInputs.find(input => input.value && input.value.includes('http'));

                        if (linkInput) {
                            clearInterval(checkInterval);
                            window.location.href = linkInput.value.trim();
                        }
                    }

                    if (attempts > 50) {
                        clearInterval(checkInterval);

                        // במקרה של שגיאה - מחזירים את התצוגה הרגילה ליתר ביטחון
                        document.body.classList.remove('super-loading-active');

                        btnHelper.innerHTML = '<span>❌</span>';
                        setTimeout(() => {
                            btnHelper.innerHTML = defaultHTML;
                            isChecking = false;
                        }, 2000);
                    }
                }, 100);
            };

            mainOriginalBtn.parentNode.insertBefore(newBtn, mainOriginalBtn.nextSibling);
        }
    }

    const observer = new MutationObserver(() => { injectMainButton(); });
    observer.observe(document.body, { childList: true, subtree: true });
})();
