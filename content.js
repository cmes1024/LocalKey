/**
 * LocalKey QuickFill - 精准路径匹配版
 */

(function() {
    let lastDataHash = '';

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'FILL_FORM') {
            fillFields(request.data.username, request.data.password);
            sendResponse({ status: 'success' });
        }
    });

    setInterval(async () => {
        try {
            const root = document.getElementById('lk-root');
            const { settings } = await chrome.storage.local.get(['settings']);
            const session = await chrome.storage.session.get(['sessionKey']);
            const quickFillEnabled = settings ? (settings.enableQuickFill !== false) : true;
            const hotkeysEnabled = settings ? (settings.enableHotkeys !== false) : true;
            
            if (!quickFillEnabled || !session.sessionKey) {
                if (root) { root.remove(); lastDataHash = ''; }
                return;
            }

            const { vault } = await chrome.storage.local.get(['vault']);
            if (!vault || vault.length === 0) {
                if (root) { root.remove(); lastDataHash = ''; }
                return;
            }

            // 🚀 核心匹配逻辑：只对域名和路径进行匹配，完全忽略 URL 参数 (?...)
            const currentHost = window.location.hostname.replace('www.', '').toLowerCase();
            // 归一化路径：去掉末尾斜杠
            const currentPath = window.location.pathname.toLowerCase().replace(/\/$/, '');

            const matches = vault.filter(item => {
                if (!item.url) return false;
                
                try {
                    // 归一化存储的 URL：去掉协议和 www
                    let urlToParse = item.url.trim();
                    if (!urlToParse.match(/^[a-zA-Z]+:\/\//)) urlToParse = 'https://' + urlToParse;
                    const u = new URL(urlToParse);
                    
                    const itemHost = u.hostname.replace('www.', '').toLowerCase();
                    const itemPath = u.pathname.toLowerCase().replace(/\/$/, '');

                    // 1. 域名校验
                    const hostMatch = currentHost === itemHost || currentHost.endsWith('.' + itemHost);
                    if (!hostMatch) return false;

                    // 2. 路径校验：如果配置了具体路径（非根目录），则当前路径必须匹配该路径
                    if (itemPath && itemPath !== '' && itemPath !== '/') {
                        // 当前路径必须完全匹配或作为父级路径匹配
                        return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
                    }

                    return true; 
                } catch (e) {
                    // 如果 URL 格式不规范，尝试简单的包含匹配
                    return item.url.toLowerCase().includes(currentHost);
                }
            });

            if (matches.length === 0) {
                if (root) { root.remove(); lastDataHash = ''; }
                return;
            }

            const currentHash = matches.length + '-' + hotkeysEnabled + '-' + matches.map(m => m.username.cipher.substring(0, 10)).join('|');

            if (!root || lastDataHash !== currentHash) {
                lastDataHash = currentHash;
                if (root) root.remove();
                renderUI(matches, session.sessionKey, hotkeysEnabled);
            }
        } catch (e) {}
    }, 1000);

    // ⚡ 注册键盘快捷键监听 (Alt + 1-9)
    window.addEventListener('keydown', async (e) => {
        if (e.altKey && e.key >= '1' && e.key <= '9') {
            const { settings } = await chrome.storage.local.get(['settings']);
            const quickFillEnabled = settings ? (settings.enableQuickFill !== false) : true;
            const hotkeysEnabled = settings ? (settings.enableHotkeys !== false) : true;
            
            if (!quickFillEnabled || !hotkeysEnabled) return;

            const index = parseInt(e.key) - 1;
            const root = document.getElementById('lk-root');
            if (root) {
                const items = root.querySelectorAll('.lk-drawer-item');
                if (items[index]) {
                    const fillBtn = items[index].querySelector('.lk-fill-trigger');
                    if (fillBtn) fillBtn.click();
                }
            }
        }
    });

    async function renderUI(matches, sessionKey, hotkeysEnabled) {
        try {
            let keyData = Array.isArray(sessionKey) ? new Uint8Array(sessionKey) : Uint8Array.from(atob(sessionKey), c => c.charCodeAt(0));
            const cryptoKey = await crypto.subtle.importKey("raw", keyData, "AES-GCM", true, ["decrypt"]);

            const root = document.createElement('div');
            root.id = 'lk-root';
            root.style.cssText = `
                position: fixed; right: 0; top: 50%; transform: translateY(-50%);
                z-index: 2147483647; display: flex; flex-direction: column; gap: 8px;
                align-items: flex-end; pointer-events: none;
            `;

            // 🚀 并行解密所有匹配项，确保渲染顺序正确
            const decryptedItems = await Promise.all(matches.map(async (item) => {
                try {
                    const username = await CryptoUtils.decrypt(item.username.cipher, item.username.iv, cryptoKey);
                    const password = await CryptoUtils.decrypt(item.password.cipher, item.password.iv, cryptoKey);
                    return { ...item, username: username, password: password };
                } catch (e) { return null; }
            }));

            decryptedItems.filter(i => i && i.username).forEach((item, idx) => {
                const drawerItem = document.createElement('div');
                drawerItem.className = 'lk-drawer-item';
                drawerItem.style.cssText = `
                    position: relative; right: -35px; cursor: pointer; user-select: none;
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: auto;
                `;

                const container = document.createElement('div');
                container.style.cssText = `
                    display: flex; align-items: center; height: 34px; width: 70px;
                    background: rgba(15, 23, 40, 0.85);
                    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                    border-radius: 8px 0 0 8px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-right: none;
                    box-shadow: -2px 2px 10px rgba(0,0,0,0.2);
                `;

                const tooltip = document.createElement('div');
                tooltip.style.cssText = `
                    position: absolute; right: 80px; top: 50%; transform: translateY(-50%);
                    background: rgba(15, 23, 40, 0.95); color: white; padding: 5px 10px;
                    border-radius: 6px; font-size: 11px; font-weight: 500;
                    white-space: nowrap; pointer-events: none; opacity: 0;
                    transition: 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.08);
                `;
                drawerItem.appendChild(tooltip);

                const left = document.createElement('div');
                left.style.cssText = `
                    width: 35px; height: 100%; display: flex; align-items: center; justify-content: center;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white; font-size: 14px; font-weight: 900; flex-shrink: 0;
                    border-radius: 8px 0 0 8px; position: relative;
                `;
                
                // 🚀 显示账号首字母，如果有快捷键则显示小角标
                left.innerText = item.username.charAt(0).toUpperCase();
                if (hotkeysEnabled && idx < 9) {
                    const badge = document.createElement('div');
                    badge.style.cssText = `
                        position: absolute; top: 1px; left: 1px;
                        font-size: 8px; line-height: 1; padding: 1px 2px;
                        background: rgba(0,0,0,0.4); border-radius: 2px;
                        font-weight: 600; color: white; pointer-events: none;
                    `;
                    badge.innerText = idx + 1;
                    left.appendChild(badge);
                }
                
                left.onmouseenter = () => { tooltip.innerText = item.username; tooltip.style.opacity = '1'; tooltip.style.right = '85px'; };
                left.onmouseleave = () => { tooltip.style.opacity = '0'; tooltip.style.right = '80px'; };

                const right = document.createElement('div');
                right.className = 'lk-fill-trigger';
                right.style.cssText = `
                    width: 35px; height: 100%; display: flex; align-items: center; justify-content: center;
                    color: rgba(255,255,255,0.6); flex-shrink: 0;
                `;
                right.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
                right.onmouseenter = () => { 
                    tooltip.innerText = hotkeysEnabled ? `快速填充 (Alt+${idx+1})` : '快速填充'; 
                    tooltip.style.opacity = '1'; tooltip.style.right = '85px'; 
                };
                right.onmouseleave = () => { tooltip.style.opacity = '0'; tooltip.style.right = '80px'; };

                container.appendChild(left);
                container.appendChild(right);
                drawerItem.appendChild(container);

                drawerItem.onmouseenter = () => {
                    drawerItem.style.right = '0px';
                    container.style.boxShadow = '-5px 5px 15px rgba(99, 102, 241, 0.2)';
                    container.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                    container.style.borderRight = 'none';
                };
                drawerItem.onmouseleave = () => {
                    drawerItem.style.right = '-35px';
                    container.style.boxShadow = '-2px 2px 10px rgba(0,0,0,0.2)';
                    container.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                    container.style.borderRight = 'none';
                    tooltip.style.opacity = '0';
                };

                right.onclick = (e) => {
                    e.stopPropagation();
                    right.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    fillFields(item.username, item.password);
                    setTimeout(() => {
                        right.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
                    }, 1500);
                };

                root.appendChild(drawerItem);
            });
            document.body.appendChild(root);
        } catch (e) { console.error('LocalKey UI Render Error:', e); }
    }

    function fillFields(user, pass) {
        const passInput = document.querySelector('input[type="password"]');
        const userInput = document.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]');
        if (userInput) { userInput.value = user; userInput.dispatchEvent(new Event('input', { bubbles: true })); }
        if (passInput) { passInput.value = pass; passInput.dispatchEvent(new Event('input', { bubbles: true })); }
    }
})();
