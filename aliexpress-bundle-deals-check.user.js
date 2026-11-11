// ==UserScript==
// @name         AliExpress - בדיקת חוסכים בגדול
// @namespace    HAKOL-MILEMALA
// @version      1.9.0
// @description  זיהוי מוצר בחוסכים בגדול, הצגת מחיר וקישור בעיצוב AliExpress הרשמי
// @author       HAKOL-MILEMALA
// @homepageURL  https://github.com/HAKOL-MILEMALA/aliexpress-fast-load
// @updateURL    https://raw.githubusercontent.com/HAKOL-MILEMALA/aliexpress-fast-load/main/aliexpress-bundle-deals-check.user.js
// @downloadURL  https://raw.githubusercontent.com/HAKOL-MILEMALA/aliexpress-fast-load/main/aliexpress-bundle-deals-check.user.js
// @match        https://*.aliexpress.com/item/*
// @match        https://aliexpress.com/item/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      www.aliexpress.com
// ==/UserScript==

(function () {
    'use strict';

    const KEY = '__AE_BUNDLE_CHECK_19';
    if (window[KEY]) return;
    window[KEY] = true;

    const PREFIX = '[חוסכים בגדול]';
    const ACTION_AREA_SELECTOR = '[class*="action--stickyWrap--"]';
    const BUY_CLASS_PREFIX = 'buy-now--buynow--';
    const CART_CLASS_PREFIX = 'add-to-cart--addtocart--';

    const match = location.pathname.match(/\/item\/(\d+)/);
    if (!match) return;

    const productId = match[1];
    console.log(PREFIX, 'בודק מוצר:', productId);

    // בניית כתובת עמוד המבצעים
    function buildUrl(id) {
        const params = new URLSearchParams({
            productIds: id,
            pha_manifest: 'ssr',
            _immersiveMode: 'true',
            disableNav: 'YES',
            sourceName: 'RECOMMENDProduct',
            'utparam-url':
                `scene:pcDetailTopMoreOtherSeller|query_from:|x_object_id:${id}|_p_origin_prod:`
        });

        return (
            'https://www.aliexpress.com/ssr/300000512/BundleDeals2?' +
            params.toString()
        );
    }

    const checkUrl = buildUrl(productId);

    const state = {
        checked: false,
        found: false,
        price: '',
        error: ''
    };

    let ourWrapper = null;
    let ourLink = null;
    let ourLinkText = null;
    let currentActionArea = null;
    let currentBuyNow = null;
    let currentAddToCart = null;

    let bodyObserver = null;
    let styleObserver = null;
    let resizeObserver = null;
    let refreshQueued = false;
    let lastSpacingLog = '';

    // בדיקת נראות של כפתור
    function isVisible(element) {
        if (!element || !element.isConnected) return false;

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function normalizedText(element) {
        if (!element) return '';

        return (element.innerText || element.textContent || '')
            .replace(/[\u200e\u200f\u200b\u202a-\u202e]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function hasClassStartingWith(element, prefix) {
        return [...element.classList].some(className =>
            className.startsWith(prefix)
        );
    }

    // זיהוי כפתורי AliExpress הרשמיים בלבד.
    // חשוב: כפתור טמו משתמש באותה מחלקת Comet ובאותה מחלקת buy-now,
    // ולכן בודקים גם את הטקסט המדויק ומתעלמים מהכפתור של התוסף.
    function isOfficialButton(element, classPrefix, allowedLabels) {
        if (!(element instanceof HTMLButtonElement)) return false;
        if (element.id === 'temu-find-button-ext') return false;
        if (!element.classList.contains('comet-v2-btn')) return false;
        if (!hasClassStartingWith(element, classPrefix)) return false;

        const directLabel = element.querySelector(':scope > span') || element;
        const label = normalizedText(directLabel).toLowerCase();

        return allowedLabels.includes(label);
    }

    function findOfficialButtons() {
        const areas = document.querySelectorAll(ACTION_AREA_SELECTOR);

        for (const area of areas) {
            const children = [...area.children];

            const buyNow = children.find(element =>
                isOfficialButton(element, BUY_CLASS_PREFIX, [
                    'קנה עכשיו',
                    'buy now',
                    'buy it now'
                ])
            );

            const addToCart = children.find(element =>
                isOfficialButton(element, CART_CLASS_PREFIX, [
                    'הוסיפו לעגלה',
                    'הוסף לעגלה',
                    'add to cart'
                ])
            );

            if (buyNow && addToCart && isVisible(buyNow) && isVisible(addToCart)) {
                return { actionArea: area, buyNow, addToCart };
            }
        }

        return null;
    }

    function numberFromCss(value) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : 0;
    }

    // מדידת המרווח האמיתי בין שני כפתורי AliExpress הרשמיים.
    function measureNativeGap(buyNow, addToCart, actionArea) {
        const buyRect = buyNow.getBoundingClientRect();
        const cartRect = addToCart.getBoundingClientRect();
        const parentStyle = getComputedStyle(actionArea);

        const display = parentStyle.display;
        const flexDirection = parentStyle.flexDirection;
        const isVerticalLayout =
            (display.includes('flex') && flexDirection.startsWith('column')) ||
            display.includes('grid');

        const rowGap = isVerticalLayout
            ? numberFromCss(parentStyle.rowGap)
            : 0;

        const horizontalOverlap = Math.min(buyRect.right, cartRect.right) -
            Math.max(buyRect.left, cartRect.left);

        const buyCenter = (buyRect.left + buyRect.right) / 2;
        const cartCenter = (cartRect.left + cartRect.right) / 2;
        const centersAligned = Math.abs(buyCenter - cartCenter) <=
            Math.max(24, Math.min(buyRect.width, cartRect.width) * 0.35);

        const verticallyStacked =
            cartRect.top >= buyRect.bottom - 1 &&
            horizontalOverlap > 0 &&
            centersAligned;

        let gap;

        if (verticallyStacked) {
            gap = Math.max(0, cartRect.top - buyRect.bottom);
        } else if (rowGap > 0) {
            gap = rowGap;
        } else {
            gap = 8;
        }

        return {
            gap,
            parentGap: rowGap,
            isVerticalLayout,
            measured: verticallyStacked
        };
    }

    // מעתיקים את המראה המחושב מהכפתור הרשמי, ולא מנחשים ערכים.
    function copyOfficialAppearance(source, link, textSpan) {
        const sourceStyle = getComputedStyle(source);
        const sourceRect = source.getBoundingClientRect();

        // מעתיקים את מחלקות Comet הכלליות, אבל לא את מחלקת buy-now הייעודית.
        link.className = [...source.classList]
            .filter(className => className.startsWith('comet-v2-btn'))
            .join(' ');

        const properties = [
            'font-family',
            'font-size',
            'font-weight',
            'font-style',
            'line-height',
            'letter-spacing',
            'text-transform',
            'text-indent',
            'color',
            'background-color',
            'background-image',
            'border-top-width',
            'border-right-width',
            'border-bottom-width',
            'border-left-width',
            'border-top-style',
            'border-right-style',
            'border-bottom-style',
            'border-left-style',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'border-radius',
            'box-shadow',
            'padding-top',
            'padding-right',
            'padding-bottom',
            'padding-left',
            'box-sizing',
            'opacity',
            'transition-property',
            'transition-duration',
            'transition-timing-function',
            'transition-delay'
        ];

        for (const property of properties) {
            const value = sourceStyle.getPropertyValue(property);
            if (value) link.style.setProperty(property, value);
        }

        link.style.setProperty('display', 'flex');
        link.style.setProperty('align-items', 'center');
        link.style.setProperty('justify-content', 'center');
        link.style.setProperty('width', '100%');
        link.style.setProperty('height', 'auto');
        link.style.setProperty('min-height', `${sourceRect.height}px`);
        link.style.setProperty('max-width', '100%');
        link.style.setProperty('box-sizing', 'border-box');

        link.style.setProperty('text-align', 'center');
        link.style.setProperty('white-space', 'normal');
        link.style.setProperty('overflow-wrap', 'anywhere');
        link.style.setProperty('text-decoration', 'none');
        link.style.setProperty('cursor', state.found ? 'pointer' : 'default');
        link.style.setProperty('margin', '0');
        link.style.setProperty('direction', sourceStyle.direction || 'rtl');
        link.style.setProperty('appearance', 'none');
        link.style.setProperty('-webkit-appearance', 'none');

        textSpan.style.display = 'inline-flex';
        textSpan.style.alignItems = 'center';
        textSpan.style.justifyContent = 'center';
        textSpan.style.maxWidth = '100%';
        textSpan.style.textAlign = 'center';
    }

    // הצבת הקישור באותו רוחב ובאותו יישור של כפתור קנה עכשיו.
    // המרווח מעל ומתחת מחושב לפי המרווח המקורי בין קנה עכשיו להוסיפו לעגלה.
    function syncLayoutAndStyle(targets) {
        if (!ourWrapper || !ourLink || !ourLinkText) return;

        const { actionArea, buyNow, addToCart } = targets;
        const buyRect = buyNow.getBoundingClientRect();
        const parentStyle = getComputedStyle(actionArea);
        const gapInfo = measureNativeGap(buyNow, addToCart, actionArea);

        const previousSibling = ourWrapper.previousElementSibling;
        const previousMarginBottom = previousSibling
            ? numberFromCss(getComputedStyle(previousSibling).marginBottom)
            : 0;

        const buyMarginTop = numberFromCss(getComputedStyle(buyNow).marginTop);

        // מפחיתים את המרווחים שכבר מספקים האח הקודם וה־gap של ההורה,
        // כדי לא להכפיל רווחים.
        const marginTop = Math.max(
            0,
            gapInfo.gap - gapInfo.parentGap - previousMarginBottom
        );

        const marginBottom = Math.max(
            0,
            gapInfo.gap - gapInfo.parentGap - buyMarginTop
        );

        const isGrid = parentStyle.display.includes('grid');
        const isFlex = parentStyle.display.includes('flex');
        const isFlexRow = isFlex && !parentStyle.flexDirection.startsWith('column');
        const flexCanWrap = parentStyle.flexWrap !== 'nowrap';

        ourWrapper.style.display = 'flex';
        ourWrapper.style.alignItems = 'center';
        ourWrapper.style.justifyContent = 'center';
        ourWrapper.style.boxSizing = 'border-box';
        ourWrapper.style.maxWidth = '100%';
        ourWrapper.style.padding = '0';
        ourWrapper.style.marginTop = `${marginTop}px`;
        ourWrapper.style.marginBottom = `${marginBottom}px`;
        ourWrapper.style.marginLeft = 'auto';
        ourWrapper.style.marginRight = 'auto';
        ourWrapper.style.order = getComputedStyle(buyNow).order;

        if (isGrid) {
            ourWrapper.style.gridColumn = '1 / -1';
            ourWrapper.style.width = `${buyRect.width}px`;
            ourWrapper.style.justifySelf = 'center';
            ourWrapper.style.flex = '0 0 auto';
        } else if (isFlexRow && flexCanWrap) {
            // בפריסת שורה עם גלישה, הקישור מקבל שורה משלו מעל כפתור הקנייה.
            ourWrapper.style.width = '100%';
            ourWrapper.style.flex = '0 0 100%';
        } else {
            ourWrapper.style.width = `${buyRect.width}px`;
            ourWrapper.style.flex = '0 0 auto';
        }

        copyOfficialAppearance(buyNow, ourLink, ourLinkText);
        paintLink(state.found ? '#16a05d' : '#929292');

        const signature = [
            Math.round(gapInfo.gap * 10) / 10,
            Math.round(buyRect.width),
            Math.round(buyRect.height),
            gapInfo.measured ? 'נמדד' : 'מחושב'
        ].join('|');

        if (signature !== lastSpacingLog) {
            lastSpacingLog = signature;
            console.log(
                PREFIX,
                'סונכרן עם כפתורי AliExpress הרשמיים.',
                'רווח מקורי:', `${gapInfo.gap.toFixed(1)}px`,
                '| גודל קנה עכשיו:', `${Math.round(buyRect.width)}×${Math.round(buyRect.height)}px`,
                '| מקור הרווח:', gapInfo.measured ? 'מדידה בפועל' : 'ערך פריסה'
            );
        }
    }

    function paintLink(color) {
        if (!ourLink) return;

        ourLink.style.setProperty('background-color', color, 'important');
        ourLink.style.setProperty('background-image', 'none', 'important');
        ourLink.style.setProperty('border-color', color, 'important');
        ourLink.style.setProperty('color', '#ffffff', 'important');

        if (ourLinkText) {
            ourLinkText.style.setProperty('color', '#ffffff', 'important');
        }
    }

    function updateLink() {
        if (!ourLink || !ourLinkText) return;

        if (!state.checked) {
            ourLinkText.textContent = 'בודק חוסכים בגדול...';
            ourLink.removeAttribute('href');
            ourLink.removeAttribute('target');
            ourLink.removeAttribute('rel');
            ourLink.setAttribute('aria-disabled', 'true');
            ourLink.style.pointerEvents = 'none';
            ourLink.style.cursor = 'default';
            paintLink('#929292');
            return;
        }

        if (state.found) {
            ourLinkText.textContent =
                '✓ המוצר נמצא בחוסכים בגדול' +
                (state.price ? ' · ' + state.price : '');

            // קישור אמיתי, כך שניתן לפתוח אותו או להעתיק בקליק ימני.
            ourLink.href = checkUrl;
            ourLink.target = '_blank';
            ourLink.rel = 'noopener noreferrer';
            ourLink.removeAttribute('aria-disabled');
            ourLink.style.pointerEvents = 'auto';
            ourLink.style.cursor = 'pointer';
            ourLink.title = 'לחץ לפתיחה או קליק ימני להעתקת הקישור';
            paintLink('#16a05d');

        } else if (state.error) {
            ourLinkText.textContent = '❔ לא ניתן לבדוק כרגע';
            ourLink.removeAttribute('href');
            ourLink.removeAttribute('target');
            ourLink.removeAttribute('rel');
            ourLink.setAttribute('aria-disabled', 'true');
            ourLink.style.pointerEvents = 'none';
            ourLink.style.cursor = 'default';
            ourLink.title = state.error;
            paintLink('#929292');

        } else {
            ourLinkText.textContent = '✕ המוצר לא נמצא בחוסכים בגדול';
            ourLink.removeAttribute('href');
            ourLink.removeAttribute('target');
            ourLink.removeAttribute('rel');
            ourLink.setAttribute('aria-disabled', 'true');
            ourLink.style.pointerEvents = 'none';
            ourLink.style.cursor = 'default';
            ourLink.title = 'המוצר אינו הראשון בתוצאות הרגילות';
            paintLink('#929292');
        }
    }

    function disconnectTargetObservers() {
        if (styleObserver) {
            styleObserver.disconnect();
            styleObserver = null;
        }

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    }

    function connectTargetObservers(targets) {
        disconnectTargetObservers();

        styleObserver = new MutationObserver(scheduleRefresh);

        for (const element of [
            targets.actionArea,
            targets.buyNow,
            targets.addToCart
        ]) {
            styleObserver.observe(element, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }

        if ('ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(scheduleRefresh);
            resizeObserver.observe(targets.actionArea);
            resizeObserver.observe(targets.buyNow);
            resizeObserver.observe(targets.addToCart);
        }
    }

    function createLink(targets) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-ae-bundle-button', 'true');

        const link = document.createElement('a');
        link.setAttribute('data-ae-bundle-link', 'true');
        link.href = '#';

        const textSpan = document.createElement('span');
        textSpan.textContent = 'בודק חוסכים בגדול...';
        link.appendChild(textSpan);

        link.addEventListener('mouseenter', () => {
            if (state.found) paintLink('#12834b');
        });

        link.addEventListener('mouseleave', () => {
            paintLink(state.found ? '#16a05d' : '#929292');
        });

        wrapper.appendChild(link);

        // הצבה ישירה לפני הכפתור הרשמי, בתוך אותו אזור פעולות של AliExpress.
        targets.actionArea.insertBefore(wrapper, targets.buyNow);

        ourWrapper = wrapper;
        ourLink = link;
        ourLinkText = textSpan;
        currentActionArea = targets.actionArea;
        currentBuyNow = targets.buyNow;
        currentAddToCart = targets.addToCart;

        syncLayoutAndStyle(targets);
        updateLink();
        connectTargetObservers(targets);

        console.log(PREFIX, 'הקישור הוצב מעל כפתור AliExpress הרשמי "קנה עכשיו".');
    }

    function refresh() {
        const targets = findOfficialButtons();
        if (!targets) return;

        const mustRebuild =
            !ourWrapper ||
            !ourWrapper.isConnected ||
            currentActionArea !== targets.actionArea ||
            currentBuyNow !== targets.buyNow ||
            currentAddToCart !== targets.addToCart;

        if (mustRebuild) {
            disconnectTargetObservers();

            if (ourWrapper) ourWrapper.remove();

            ourWrapper = null;
            ourLink = null;
            ourLinkText = null;
            currentActionArea = null;
            currentBuyNow = null;
            currentAddToCart = null;

            createLink(targets);
            return;
        }

        // סנכרון חוזר אם AliExpress משנה גודל, מחלקות, צבעים או פריסה.
        syncLayoutAndStyle(targets);
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;

        requestAnimationFrame(() => {
            refreshQueued = false;
            refresh();
        });
    }

    function startWatchingButtons() {
        scheduleRefresh();

        // מעקב אחרי טעינה/החלפה של אזור הכפתורים בדף.
        bodyObserver = new MutationObserver(scheduleRefresh);
        bodyObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', scheduleRefresh, { passive: true });

        setTimeout(() => {
            if (!ourWrapper || !ourWrapper.isConnected) {
                console.warn(
                    PREFIX,
                    'לא נמצאו שני כפתורי AliExpress הרשמיים באזור הפעולות. בדוק אם האתר שינה את המחלקות או את הטקסטים.'
                );
            }
        }, 25000);
    }

    // חילוץ מחיר מכרטיס המוצר בתוצאות Bundle Deals.
    function extractPrice(card) {
        const priceElement = card.querySelector(
            '.AIC4-PI-price-text, [class*="minPrice_"], [class*="price--current"]'
        );

        if (!priceElement) return '';

        const raw = (priceElement.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        let priceMatch = raw.match(/(?:US\s*)?\$\s*([\d,]+(?:\.\d+)?)/i);
        if (priceMatch) return priceMatch[1] + '$';

        priceMatch = raw.match(/€\s*([\d,]+(?:\.\d+)?)/);
        if (priceMatch) return priceMatch[1] + '€';

        priceMatch = raw.match(/£\s*([\d,]+(?:\.\d+)?)/);
        if (priceMatch) return priceMatch[1] + '£';

        return raw;
    }

    // בדיקת המוצר הראשון בתוצאות הרגילות.
    function analyzeResponse(response) {
        const doc = new DOMParser().parseFromString(
            response.responseText || '',
            'text/html'
        );

        const firstCard = [
            ...doc.querySelectorAll('.productContainer[id]')
        ].find(card => {
            return !card.closest(
                'a[class*="prodContainer_"], [class*="pcCardContainer_"]'
            );
        });

        if (!firstCard || !firstCard.id) {
            state.error = 'לא נמצאו כרטיסי מוצרים רגילים בתשובת השרת.';
            state.checked = true;
            console.warn(PREFIX, state.error);
            updateLink();
            return;
        }

        console.log(
            PREFIX,
            'המוצר הנוכחי:', productId,
            '| המוצר הראשון הרגיל:', firstCard.id
        );

        state.found = firstCard.id === productId;
        if (state.found) state.price = extractPrice(firstCard);
        state.checked = true;

        if (state.found) {
            console.log(
                PREFIX,
                '✅ המוצר נמצא ראשון!',
                'מחיר:', state.price || 'לא זוהה'
            );
        } else {
            console.log(PREFIX, '❌ המוצר אינו הראשון בתוצאות הרגילות.');
        }

        updateLink();
    }

    // הפעלה ומעקב אחר הכפתורים הרשמיים.
    startWatchingButtons();

    // שליחת בקשת בדיקת Bundle Deals.
    GM_xmlhttpRequest({
        method: 'GET',
        url: checkUrl,
        timeout: 35000,

        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8'
        },

        onload(response) {
            if (response.status < 200 || response.status >= 300) {
                state.error = 'שגיאת שרת: HTTP ' + response.status;
                state.checked = true;
                console.error(PREFIX, state.error);
                updateLink();
                return;
            }

            try {
                analyzeResponse(response);
            } catch (error) {
                state.error = 'שגיאה בפענוח נתוני המוצר.';
                state.checked = true;
                console.error(PREFIX, error);
                updateLink();
            }
        },

        onerror(error) {
            state.error = 'שגיאת תקשורת מול AliExpress.';
            state.checked = true;
            console.error(PREFIX, error);
            updateLink();
        },

        ontimeout() {
            state.error = 'השרת לא השיב בזמן.';
            state.checked = true;
            console.warn(PREFIX, state.error);
            updateLink();
        }
    });

})();