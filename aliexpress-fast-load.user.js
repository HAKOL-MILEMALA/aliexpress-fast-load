// ==UserScript==
// @name         AliExpress - טעינה מהירה
// @namespace    https://github.com/HAKOL-MILEMALA/
// @version      2.0
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

    function injectStyles() {
        if (document.getElementById('super-load-custom-styles')) return;

        const style = document.createElement('style');
        style.id = 'super-load-custom-styles';
        style.innerHTML = `
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
            /* מחלקה להסתרת החלון הקופץ בזמן עיבוד של טעינה מהירה בלבד */
            body.super-loading-active .get-link-pro-balloon {
                opacity: 0 !important;
                pointer-events: none !important;
                transform: scale(0.9) !important;
                transition: none !important;
                z-index: -9999 !important;
            }
            /* עיצוב בועת ההתראה (Toast) */
            #super-toast-notification {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background-color: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 10000;
                opacity: 0;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                gap: 8px;
                direction: rtl;
            }
            #super-toast-notification.show {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    function showToast(message, isError = false) {
        let toast = document.getElementById('super-toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'super-toast-notification';
            document.body.appendChild(toast);
        }

        toast.style.backgroundColor = isError ? '#e74c3c' : '#2ecc71';
        toast.innerHTML = isError ? `<span>❌</span><span>${message}</span>` : `<span>✅</span><span>${message}</span>`;

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function triggerRealClick(element) {
        const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    }

    function extractValidLink(balloon) {
        const formItems = balloon.querySelectorAll('.next-form-item');

        for (let item of formItems) {
            const label = item.querySelector('.next-form-item-label');
            const labelText = label ? label.textContent.trim() : '';

            if (labelText.includes('קישור למעקב') || labelText.includes('Tracking link')) {
                const input = item.querySelector('input');
                if (input) {
                    const val = (input.value || input.getAttribute('value') || '').trim();
                    if (val.startsWith('http') && (val.includes('/e/_') || val.length > 25)) {
                        return val;
                    }
                }
            }
        }
        return null;
    }

    function handleLinkAction(mainOriginalBtn, actionType, btnHelper = null) {
        if (isChecking) return;
        isChecking = true;

        if (actionType === 'redirect') {
            document.body.classList.add('super-loading-active');
            if (btnHelper) {
                btnHelper.innerHTML = '<div class="super-spinner"></div><span>טוען...</span>';
            }
            triggerRealClick(mainOriginalBtn);
        }

        let noBalloonAttempts = 0;

        const checkInterval = setInterval(() => {
            const balloon = document.querySelector('.get-link-pro-balloon');

            if (balloon) {
                // איפוס מונה היעדר החלון - כל עוד החלון פתוח הלולאה תמשיך לרוץ ללא הגבלת זמן
                noBalloonAttempts = 0;

                const finalLink = extractValidLink(balloon);

                if (finalLink) {
                    clearInterval(checkInterval);
                    document.body.classList.remove('super-loading-active');
                    isChecking = false;

                    if (actionType === 'redirect') {
                        window.location.href = finalLink;
                    } else if (actionType === 'copy') {
                        navigator.clipboard.writeText(finalLink).then(() => {
                            showToast('הקישור הועתק בהצלחה!');
                        }).catch(err => {
                            console.error('שגיאה בהעתקת הקישור: ', err);
                            showToast('שגיאה בהעתקה', true);
                        });
                    }
                    return;
                }
            } else {
                // המעקב ייפסק רק אם החלון נסגר או לא נפתח בכלל במשך 5 שניות
                noBalloonAttempts++;
                if (noBalloonAttempts > 50) {
                    clearInterval(checkInterval);
                    document.body.classList.remove('super-loading-active');
                    isChecking = false;

                    if (actionType === 'redirect' && btnHelper) {
                        btnHelper.innerHTML = '<span>❌</span>';
                        setTimeout(() => {
                            btnHelper.innerHTML = '<span>⚡</span><span>טען</span>';
                        }, 2000);
                    }
                }
            }
        }, 100);
    }

    function injectMainButton() {
        const mainOriginalBtn = document.querySelector('.get-link-pro-button');

        if (mainOriginalBtn && !document.querySelector('#super-quick-load-btn')) {
            injectStyles();

            const container = mainOriginalBtn.closest('.block-share-flex') || mainOriginalBtn.parentElement;
            if (container) {
                container.style.display = 'flex';
                container.style.gap = '8px';
                container.style.alignItems = 'center';
            }

            mainOriginalBtn.addEventListener('click', function(e) {
                if(!e.isTrusted) return;
                handleLinkAction(mainOriginalBtn, 'copy');
            });

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
            newBtn.style.display = 'inline-flex';
            newBtn.style.alignItems = 'center';
            newBtn.style.justifyContent = 'center';
            newBtn.style.whiteSpace = 'nowrap';
            newBtn.style.transition = 'all 0.15s ease';

            const btnHelper = document.createElement('span');
            btnHelper.className = 'next-btn-helper';
            btnHelper.style.display = 'flex';
            btnHelper.style.alignItems = 'center';
            btnHelper.style.gap = '6px';

            btnHelper.innerHTML = '<span>⚡</span><span>טען</span>';
            newBtn.appendChild(btnHelper);

            newBtn.onclick = function(e) {
                e.preventDefault();
                handleLinkAction(mainOriginalBtn, 'redirect', btnHelper);
            };

            if (mainOriginalBtn.parentNode) {
                mainOriginalBtn.parentNode.insertBefore(newBtn, mainOriginalBtn.nextSibling);
            }
        }
    }

    function initObserver() {
        if (!document.body) {
            setTimeout(initObserver, 100);
            return;
        }

        const observer = new MutationObserver(() => { injectMainButton(); });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(injectMainButton, 500);
    }

    initObserver();
})();
