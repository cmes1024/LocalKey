/**
 * 侧边栏逻辑 - 进阶版 (支持 Favicon 与 自动填充)
 */

const state = {
    isUnlocked: false,
    currentUrl: '',
    masterKey: null,
    vault: [],
    editingId: null
};

const views = {
    unlock: document.getElementById('unlock-view'),
    main: document.getElementById('main-view'),
    add: document.getElementById('add-view'),
    settings: document.getElementById('settings-view')
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 允许 content.js 访问 session storage 获取密钥
    if (chrome.storage.session.setAccessLevel) {
        chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    }
    await initTheme(); // 🚀 初始化主题
    await checkInitialState();
    initEventListeners();
    updateCurrentTabInfo();
});

function showErrorMessage(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 3000);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function checkInitialState() {
    const local = await chrome.storage.local.get(['salt', 'lockTimeout']);
    if (!local.salt) {
        document.querySelector('.welcome-text').textContent = '初始化管理空间';
        document.getElementById('unlock-btn').textContent = '创建管理密码';
        return;
    }

    // 设置下拉框初始值
    const timeoutSelect = document.getElementById('lock-timeout-select');
    if (timeoutSelect) timeoutSelect.value = local.lockTimeout || "5";

    // 🚀 核心：尝试从 Session 自动解锁
    const session = await chrome.storage.session.get(['sessionKey', 'lastUnlockedTime']);
    if (session.sessionKey && session.lastUnlockedTime) {
        const timeoutMin = parseInt(local.lockTimeout || "5");
        const now = Date.now();
        const diff = (now - session.lastUnlockedTime) / (1000 * 60);

        if (timeoutMin > 0 && diff < timeoutMin) {
            try {
                // 恢复密钥 (兼容数组格式)
                let keyData;
                if (Array.isArray(session.sessionKey)) {
                    keyData = new Uint8Array(session.sessionKey);
                } else {
                    keyData = new Uint8Array(atob(session.sessionKey).split('').map(c => c.charCodeAt(0)));
                }
                
                state.masterKey = await crypto.subtle.importKey(
                    "raw", keyData, "AES-GCM", true, ["encrypt", "decrypt"]
                );
                state.isUnlocked = true;
                showView('main');
                await loadVault();
                return;
            } catch (e) { console.error('自动解锁失败', e); }
        }
    }
}

function initEventListeners() {
    document.getElementById('master-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlock();
    });
    document.getElementById('unlock-btn').addEventListener('click', handleUnlock);

    document.getElementById('nav-add-btn').addEventListener('click', () => {
        state.editingId = null;
        document.getElementById('add-url').value = state.fullUrlWithoutParams || '';
        document.getElementById('add-username').value = '';
        document.getElementById('add-password').value = '';
        document.getElementById('add-notes').value = '';
        document.querySelector('.view-title').textContent = '记录新账号';
        showView('add');
    });

    document.getElementById('nav-settings-btn').addEventListener('click', () => showView('settings'));
    document.getElementById('settings-back-btn').addEventListener('click', () => showView('main'));
    document.getElementById('add-back-btn').addEventListener('click', () => showView('main'));
    
    document.getElementById('save-account-btn').addEventListener('click', handleSaveAccount);

    document.getElementById('generate-pass-btn').addEventListener('click', () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let retVal = "";
        for (let i = 0; i < 16; ++i) { retVal += charset.charAt(Math.floor(Math.random() * charset.length)); }
        document.getElementById('add-password').value = retVal;
        document.getElementById('add-password').type = 'text';
    });

    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
        renderVault(val);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        searchInput.focus();
        renderVault();
    });

    document.getElementById('export-data-btn').addEventListener('click', handleExport);
    document.getElementById('import-trigger-btn').addEventListener('click', () => {
        document.getElementById('import-data-file').click();
    });
    document.getElementById('import-data-file').addEventListener('change', handleImport);
    document.getElementById('lock-vault-btn').addEventListener('click', handleLock);
    document.getElementById('reset-vault-btn').addEventListener('click', handleReset);
    
    // ⚡ 快捷填充与快捷键设置开关
    const quickFillToggle = document.getElementById('quick-fill-toggle');
    const hotkeyToggle = document.getElementById('hotkey-toggle');
    
    chrome.storage.local.get(['settings'], (result) => {
        if (result.settings) {
            quickFillToggle.checked = result.settings.enableQuickFill !== false;
            hotkeyToggle.checked = result.settings.enableHotkeys !== false;
        }
        syncHotkeyToggleState();
    });

    function syncHotkeyToggleState() {
        const isQuickFillEnabled = quickFillToggle.checked;
        hotkeyToggle.disabled = !isQuickFillEnabled;
        const parent = hotkeyToggle.closest('.settings-item');
        if (parent) {
            parent.style.opacity = isQuickFillEnabled ? '1' : '0.5';
            parent.style.filter = isQuickFillEnabled ? 'none' : 'grayscale(0.5)';
        }
    }

    quickFillToggle.addEventListener('change', async (e) => {
        const { settings = {} } = await chrome.storage.local.get(['settings']);
        settings.enableQuickFill = e.target.checked;
        await chrome.storage.local.set({ settings });
        syncHotkeyToggleState();
        showToast(`快捷显示已${e.target.checked ? '开启' : '关闭'}`);
    });

    hotkeyToggle.addEventListener('change', async (e) => {
        const { settings = {} } = await chrome.storage.local.get(['settings']);
        settings.enableHotkeys = e.target.checked;
        await chrome.storage.local.set({ settings });
        showToast(`快捷键填充已${e.target.checked ? '开启' : '关闭'}`);
        renderVault(); // 刷新以显示/隐藏角标
    });
    
    document.getElementById('copy-template-btn').addEventListener('click', () => {
        const template = [{"url": "https://example.com", "username": "your_username", "password": "your_password", "loginType": "password", "notes": "optional"}];
        navigator.clipboard.writeText(JSON.stringify(template, null, 2));
        const btn = document.getElementById('copy-template-btn');
        const oldText = btn.textContent;
        btn.textContent = '模板已复制！';
        btn.style.color = '#10B981';
        setTimeout(() => { btn.textContent = oldText; btn.style.color = 'var(--accent-color)'; }, 2000);
    });

    document.getElementById('lock-timeout-select').addEventListener('change', async (e) => {
        await chrome.storage.local.set({ lockTimeout: e.target.value });
        showToast('自动锁定设置已更新');
    });

    chrome.tabs.onActivated.addListener(updateCurrentTabInfo);
    chrome.tabs.onUpdated.addListener((id, info) => info.url && updateCurrentTabInfo());

    // ⚡ 全局快捷键监听 (Alt + 1-9)
    window.addEventListener('keydown', async (e) => {
        if (e.altKey && e.key >= '1' && e.key <= '9') {
            const { settings } = await chrome.storage.local.get(['settings']);
            const quickFillEnabled = settings ? (settings.enableQuickFill !== false) : true;
            const hotkeysEnabled = settings ? (settings.enableHotkeys !== false) : true;
            
            if (!quickFillEnabled || !hotkeysEnabled) return;
            
            const index = parseInt(e.key) - 1;
            const currentList = document.getElementById('current-site-list');
            const cards = currentList.querySelectorAll('.account-card');
            if (cards[index]) {
                const fillBtn = cards[index].querySelector('.main-fill');
                if (fillBtn) fillBtn.click();
            }
        }
    });
}

async function handleUnlock() {
    const password = document.getElementById('master-password').value;
    if (!password) return showErrorMessage('unlock-error', '请输入管理密码');
    const storage = await chrome.storage.local.get(['salt']);
    try {
        if (!storage.salt) {
            const salt = CryptoUtils.generateSalt();
            const saltBase64 = btoa(String.fromCharCode(...salt));
            await chrome.storage.local.set({ salt: saltBase64, vault: [] });
            state.masterKey = await CryptoUtils.deriveKey(password, salt);
        } else {
            const salt = new Uint8Array(atob(storage.salt).split('').map(c => c.charCodeAt(0)));
            state.masterKey = await CryptoUtils.deriveKey(password, salt);
        }

        // 🚀 核心：将密钥存入 Session 存储 (改用数组格式，杜绝编码乱码)
        const exportedKey = await crypto.subtle.exportKey("raw", state.masterKey);
        await chrome.storage.session.set({ 
            sessionKey: Array.from(new Uint8Array(exportedKey)), 
            lastUnlockedTime: Date.now() 
        });

        state.isUnlocked = true; showView('main'); await loadVault();
    } catch (e) { showErrorMessage('unlock-error', '解锁失败'); }
}

async function loadVault() {
    const result = await chrome.storage.local.get(['vault']);
    const encryptedVault = result.vault || [];
    state.vault = [];
    for (const item of encryptedVault) {
        try {
            const decryptedUser = await CryptoUtils.decrypt(item.username.cipher, item.username.iv, state.masterKey);
            const decryptedPass = item.password ? await CryptoUtils.decrypt(item.password.cipher, item.password.iv, state.masterKey) : '';
            const decryptedNotes = item.notes ? await CryptoUtils.decrypt(item.notes.cipher, item.notes.iv, state.masterKey) : '';
            state.vault.push({ id: item.id, url: item.url, username: decryptedUser, password: decryptedPass, notes: decryptedNotes, loginType: item.loginType || (item.password ? 'password' : 'code') });
        } catch (e) {}
    }
    renderVault();
}

async function handleSaveAccount() {
    let urlInput = document.getElementById('add-url').value.trim();
    const user = document.getElementById('add-username').value;
    const pass = document.getElementById('add-password').value;
    const notes = document.getElementById('add-notes').value;
    if (!urlInput || !user) return showErrorMessage('add-error', '请填写网址和账号');
    if (!urlInput.match(/^[a-zA-Z]+:\/\//)) urlInput = 'https://' + urlInput;
    try {
        const encryptedUser = await CryptoUtils.encrypt(user, state.masterKey);
        const encryptedPass = pass ? await CryptoUtils.encrypt(pass, state.masterKey) : null;
        const encryptedNotes = notes ? await CryptoUtils.encrypt(notes, state.masterKey) : null;
        const result = await chrome.storage.local.get(['vault']);
        let vault = result.vault || [];
        if (state.editingId) { vault = vault.map(i => i.id === state.editingId ? { ...i, url: urlInput, username: encryptedUser, password: encryptedPass, notes: encryptedNotes, loginType: pass ? 'password' : 'code' } : i); }
        else { vault.push({ id: Date.now(), url: urlInput, username: encryptedUser, password: encryptedPass, notes: encryptedNotes, loginType: pass ? 'password' : 'code' }); }
        await chrome.storage.local.set({ vault }); state.editingId = null; await loadVault(); showView('main');
    } catch (e) { showErrorMessage('add-error', '保存失败'); }
}

function handleLock() {
    state.isUnlocked = false; state.masterKey = null; state.vault = [];
    document.getElementById('master-password').value = '';
    showView('unlock');
}

async function handleExport() {
    if (!confirm('导出数据将以明文 JSON 格式下载。继续吗？')) return;
    const dataStr = JSON.stringify(state.vault, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `vault-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedVault = JSON.parse(event.target.result);
            if (!Array.isArray(importedVault)) throw new Error('格式错误：导入文件必须是 JSON 数组');
            
            if (confirm(`检测到 ${importedVault.length} 条记录，确定开始合并导入吗？`)) {
                const result = await chrome.storage.local.get(['vault']);
                let currentVault = result.vault || [];
                
                let successCount = 0;
                let skipCount = 0;
                let errorCount = 0;

                // 预处理当前已有的账号用于去重对比 (使用 state.vault，它是解密后的)
                const normalize = (u) => {
                    try {
                        const url = new URL(u.startsWith('http') ? u : 'https://' + u);
                        return (url.hostname + url.pathname).toLowerCase().replace(/\/$/, '').replace(/^www\./, '');
                    } catch(e) { return u.toLowerCase().trim(); }
                };

                for (const item of importedVault) {
                    try {
                        if (!item.url || !item.username) {
                            errorCount++;
                            continue;
                        }

                        // 🔍 去重校验：检查 state.vault 中是否已存在相同网址和账号
                        const isDuplicate = state.vault.some(existing => 
                            normalize(existing.url) === normalize(item.url) && 
                            existing.username.trim() === item.username.trim()
                        );

                        if (isDuplicate) {
                            skipCount++;
                            continue;
                        }

                        // 执行加密并存入
                        const encryptedUser = await CryptoUtils.encrypt(item.username, state.masterKey);
                        const encryptedPass = item.password ? await CryptoUtils.encrypt(item.password, state.masterKey) : null;
                        const encryptedNotes = item.notes ? await CryptoUtils.encrypt(item.notes, state.masterKey) : null;
                        
                        currentVault.push({ 
                            id: Date.now() + Math.random(), 
                            url: item.url, 
                            username: encryptedUser, 
                            password: encryptedPass, 
                            notes: encryptedNotes 
                        });
                        successCount++;
                    } catch (err) {
                        console.error('单条记录导入失败:', err);
                        errorCount++;
                    }
                }

                await chrome.storage.local.set({ vault: currentVault });
                
                // 最终结果提示
                let report = `导入完成！\n\n✅ 成功新增: ${successCount} 条`;
                if (skipCount > 0) report += `\n⏭️ 自动跳过 (重复): ${skipCount} 条`;
                if (errorCount > 0) report += `\n❌ 导入失败 (格式错): ${errorCount} 条`;
                
                alert(report);
                await loadVault(); 
                showView('main');
            }
        } catch (err) { 
            alert('导入失败：' + err.message); 
        } finally {
            e.target.value = ''; // 重置 input 方便下次选择
        }
    };
    reader.readAsText(file);
}

async function handleReset() {
    if (!confirm('确定销毁所有数据吗？')) return;
    await chrome.storage.local.clear(); window.location.reload();
}

function splitUrl(urlStr) {
    try { const url = new URL(urlStr); return { host: url.hostname.replace(/^www\./, ''), path: url.pathname === '/' ? '' : url.pathname, query: url.search }; }
    catch (e) { const parts = urlStr.replace('https://', '').replace('http://', '').split('/'); return { host: parts[0], path: parts.length > 1 ? '/' + parts.slice(1).join('/') : '', query: '' }; }
}

function renderVault(filter = '') {
    const currentList = document.getElementById('current-site-list');
    const allList = document.getElementById('all-accounts-list');
    const currentSection = document.getElementById('current-site-section');
    currentList.innerHTML = ''; allList.innerHTML = '';
    const searchTerm = filter.toLowerCase().trim();
    let matchCount = 0;
    let currentCount = 0;
    let allCount = 0;
    
    state.vault.forEach(item => {
        const matchesUrl = item.url.toLowerCase().includes(searchTerm);
        const matchesUser = item.username.toLowerCase().includes(searchTerm);
        const matchesNotes = item.notes && item.notes.toLowerCase().includes(searchTerm);
        if (searchTerm && !matchesUrl && !matchesUser && !matchesNotes) return;
        
        matchCount++;
        
        // 🚀 核心匹配逻辑：彻底忽略协议 (http/https) 和端口，精确匹配域名和路径
        let isCurrentSite = false;
        if (state.currentUrl !== '') {
            try {
                let urlToParse = item.url.trim();
                if (!urlToParse.match(/^[a-zA-Z]+:\/\//)) urlToParse = 'https://' + urlToParse;
                const u = new URL(urlToParse);
                const itemHost = u.hostname.replace(/^www\./, '').toLowerCase();
                const itemPath = u.pathname.toLowerCase().replace(/\/$/, '');
                
                // 1. 域名校验: 精确匹配或子域名匹配
                const hostMatch = state.currentUrl === itemHost || state.currentUrl.endsWith('.' + itemHost);
                if (hostMatch) {
                    // 2. 路径校验：如果配置了具体路径（非根目录），则当前路径必须匹配该路径
                    if (itemPath && itemPath !== '' && itemPath !== '/') {
                        isCurrentSite = state.currentPath === itemPath || state.currentPath.startsWith(itemPath + '/');
                    } else {
                        isCurrentSite = true;
                    }
                }
            } catch(e) {
                // 如果 URL 格式不规范，尝试简单的包含匹配，并忽略 http/https 差异
                const cleanItemUrl = item.url.toLowerCase().replace(/^https?:\/\//, '');
                const cleanCurrentHost = state.currentUrl.replace(/^https?:\/\//, '');
                isCurrentSite = cleanItemUrl.includes(cleanCurrentHost);
            }
        }

        const parts = splitUrl(item.url);
        
        // 使用 Chrome 内置的 Favicon 解析服务 (最稳定、最原生)
        const cleanHost = parts.host;
        const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=64`;

        const card = document.createElement('div');
        card.className = `account-card ${isCurrentSite ? 'card-highlight' : ''}`;
        card.innerHTML = `
            <div class="card-top">
                <img class="site-icon" src="${faviconUrl}" onerror="this.src='icons/icon16.png'">
                <div class="url-host">${parts.host}</div>
            </div>
            <div class="url-details">
                <div class="url-text-area">
                    ${parts.path ? `<div class="url-path">${parts.path}</div>` : ''}
                    ${parts.query ? `<div class="url-params">${parts.query}</div>` : ''}
                </div>
                <div class="url-actions">
                    <button class="url-mini-btn copy-link" title="复制完整链接">🔗</button>
                    <button class="url-mini-btn open-link" title="新窗口打开">🌐</button>
                </div>
            </div>
            <div class="card-body">
                <p><span class="label-text">账号</span><span class="value-text">${item.username}</span><button class="copy-badge copy-user">复制</button></p>
                <p><span class="label-text">密码</span><span class="value-text">${item.loginType === 'code' ? '（验证码/扫码登录）' : '••••••••'}</span>${item.loginType !== 'code' ? '<button class="copy-badge copy-pass">复制</button>' : ''}</p>
                ${item.notes ? `<div class="note-box">备注: ${item.notes}</div>` : ''}
            </div>
            <div class="card-action-bar">
                <button class="bar-btn fill-btn main-fill">
                    ${item.loginType === 'code' ? '📱 填充手机号' : '⚡ 快速填充'}
                    ${(() => {
                        // 异步获取设置同步比较难，这里通过 DOM 状态或重新读取
                        const hotkeyToggle = document.getElementById('hotkey-toggle');
                        const showBadge = hotkeyToggle ? hotkeyToggle.checked : true;
                        return (showBadge && isCurrentSite && !searchTerm && currentCount < 9) 
                            ? `<span class="shortcut-badge">Alt+${currentCount + 1}</span>` 
                            : '';
                    })()}
                </button>
                <div class="side-actions">
                    <button class="bar-btn edit-btn" title="编辑">✏️</button>
                    <button class="bar-btn delete-btn" title="删除">🗑️</button>
                </div>
            </div>
        `;

        // 链接相关操作
        if (card.querySelector('.copy-link')) {
            card.querySelector('.copy-link').addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.url);
                showToast('链接已复制');
            });
            card.querySelector('.open-link').addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.tabs.create({ url: item.url });
            });
        }

        card.querySelector('.copy-user').addEventListener('click', (e) => {
            e.stopPropagation(); navigator.clipboard.writeText(item.username);
            const btn = e.target; btn.textContent = '已复制'; setTimeout(() => btn.textContent = '复制', 1500);
        });
        card.querySelector('.copy-pass')?.addEventListener('click', (e) => {
            e.stopPropagation(); navigator.clipboard.writeText(item.password);
            const btn = e.target; btn.textContent = '已复制'; setTimeout(() => btn.textContent = '复制', 1500);
        });
        card.querySelector('.fill-btn').addEventListener('click', () => handleFill(item));
        card.querySelector('.edit-btn').addEventListener('click', () => startEdit(item));
        card.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));

        if (isCurrentSite && !searchTerm) { 
            currentList.appendChild(card); 
            currentCount++;
        } else { 
            allList.appendChild(card); 
            allCount++;
        }
    });

    // 动态显隐 Section 标题
    const allAccountsSection = document.getElementById('all-accounts-section');
    
    // 🚀 更新统计数字
    document.getElementById('current-count').textContent = currentCount;
    document.getElementById('all-count').textContent = allCount;

    if (searchTerm) {
        currentSection.classList.add('hidden');
        allAccountsSection.classList.remove('hidden');
        if (matchCount === 0) allList.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-secondary);">没有找到匹配项</div>`;
    } else {
        // 判断当前网站是否有账号
        if (currentList.children.length > 0) {
            currentSection.classList.remove('hidden');
        } else {
            currentSection.classList.add('hidden');
        }

        // 判断所有账号是否有数据
        if (allList.children.length > 0) {
            allAccountsSection.classList.remove('hidden');
        } else {
            allAccountsSection.classList.add('hidden');
        }
    }
}

// 显示轻量级通知
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function handleFill(item) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        
        chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM',
            data: { username: item.username, password: item.loginType === 'code' ? '' : item.password }
        }, (response) => {
            if (chrome.runtime.lastError) {
                alert('填充失败：请刷新网页后再试（如果是新安装的插件）');
                return;
            }
            if (response && response.status === 'not_found') {
                alert('未在当前网页找到密码输入框');
            }
        });
    } catch (e) {
        console.error('Fill error:', e);
    }
}

function startEdit(item) {
    state.editingId = item.id;
    document.getElementById('add-url').value = item.url; document.getElementById('add-username').value = item.username;
    document.getElementById('add-password').value = item.password; document.getElementById('add-notes').value = item.notes || '';
    document.querySelector('.view-title').textContent = '编辑账号'; showView('add');
}

async function deleteItem(id) { if (confirm('确定删除吗？')) { const r = await chrome.storage.local.get(['vault']); await chrome.storage.local.set({ vault: (r.vault || []).filter(i => i.id !== id) }); await loadVault(); } }

async function handleLock() {
    state.isUnlocked = false;
    state.masterKey = null;
    await chrome.storage.session.remove(['sessionKey', 'lastUnlockedTime']);
    showView('unlock');
    showToast('已锁定');
}

function showView(viewName) { Object.keys(views).forEach(n => views[n].classList.add('hidden')); views[viewName].classList.remove('hidden'); }

async function updateCurrentTabInfo() {
    try { 
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); 
        if (t && t.url && t.url.startsWith('http')) { 
            const u = new URL(t.url); 
            state.currentUrl = u.hostname.replace(/^www\./, '').toLowerCase(); 
            state.currentPath = u.pathname.toLowerCase().replace(/\/$/, '');
            // 🚀 获取不带参数的完整路径
            state.fullUrlWithoutParams = u.origin + u.pathname;
            if (state.isUnlocked) renderVault(); 
        } 
    } catch (e) {}
}

/**
 * 🌓 主题管理 (纯手动模式)
 */
async function initTheme() {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'dark'; // 默认深色
    applyTheme(theme);

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

async function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';

    applyTheme(next);
    await chrome.storage.local.set({ theme: next });
    showToast(`已切换至${next === 'dark' ? '深色' : '浅色'}模式`);
}
