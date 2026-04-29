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

document.addEventListener('DOMContentLoaded', async () => {
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

async function checkInitialState() {
    const result = await chrome.storage.local.get(['salt']);
    if (!result.salt) {
        document.querySelector('.welcome-text').textContent = '初始化保险库';
        document.getElementById('unlock-btn').textContent = '创建主密码';
    }
}

function initEventListeners() {
    document.getElementById('master-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlock();
    });
    document.getElementById('unlock-btn').addEventListener('click', handleUnlock);

    document.getElementById('nav-add-btn').addEventListener('click', () => {
        state.editingId = null;
        document.getElementById('add-url').value = state.currentUrl;
        document.getElementById('add-username').value = '';
        document.getElementById('add-password').value = '';
        document.getElementById('add-notes').value = '';
        document.querySelector('.view-title').textContent = '添加新账号';
        showView('add');
    });

    document.getElementById('nav-settings-btn').addEventListener('click', () => showView('settings'));
    document.getElementById('settings-back-btn').addEventListener('click', () => showView('main'));
    document.getElementById('add-back-btn').addEventListener('click', () => showView('main'));
    
    ['add-url', 'add-username', 'add-password', 'add-notes'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) handleSaveAccount();
        });
    });
    document.getElementById('save-account-btn').addEventListener('click', handleSaveAccount);

    document.getElementById('generate-pass-btn').addEventListener('click', () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let retVal = "";
        for (let i = 0; i < 16; ++i) { retVal += charset.charAt(Math.floor(Math.random() * charset.length)); }
        document.getElementById('add-password').value = retVal;
        document.getElementById('add-password').type = 'text';
    });

    document.getElementById('search-input').addEventListener('input', (e) => renderVault(e.target.value));

    document.getElementById('export-data-btn').addEventListener('click', handleExport);
    document.getElementById('import-trigger-btn').addEventListener('click', () => {
        document.getElementById('import-data-file').click();
    });
    document.getElementById('import-data-file').addEventListener('change', handleImport);
    document.getElementById('lock-vault-btn').addEventListener('click', handleLock);
    document.getElementById('reset-vault-btn').addEventListener('click', handleReset);
    
    document.getElementById('copy-template-btn').addEventListener('click', () => {
        const template = [{"url": "https://example.com", "username": "your_username", "password": "your_password", "notes": "optional"}];
        navigator.clipboard.writeText(JSON.stringify(template, null, 2));
        const btn = document.getElementById('copy-template-btn');
        const oldText = btn.textContent;
        btn.textContent = '模板已复制！';
        btn.style.color = '#10B981';
        setTimeout(() => { btn.textContent = oldText; btn.style.color = 'var(--accent-color)'; }, 2000);
    });

    chrome.tabs.onActivated.addListener(updateCurrentTabInfo);
    chrome.tabs.onUpdated.addListener((id, info) => info.url && updateCurrentTabInfo());
}

async function handleUnlock() {
    const password = document.getElementById('master-password').value;
    if (!password) return showErrorMessage('unlock-error', '请输入主密码');
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
            const decryptedPass = await CryptoUtils.decrypt(item.password.cipher, item.password.iv, state.masterKey);
            const decryptedNotes = item.notes ? await CryptoUtils.decrypt(item.notes.cipher, item.notes.iv, state.masterKey) : '';
            state.vault.push({ id: item.id, url: item.url, username: decryptedUser, password: decryptedPass, notes: decryptedNotes });
        } catch (e) {}
    }
    renderVault();
}

async function handleSaveAccount() {
    let urlInput = document.getElementById('add-url').value.trim();
    const user = document.getElementById('add-username').value;
    const pass = document.getElementById('add-password').value;
    const notes = document.getElementById('add-notes').value;
    if (!urlInput || !user || !pass) return showErrorMessage('add-error', '请完整填写');
    if (!urlInput.match(/^[a-zA-Z]+:\/\//)) urlInput = 'https://' + urlInput;
    try {
        const encryptedUser = await CryptoUtils.encrypt(user, state.masterKey);
        const encryptedPass = await CryptoUtils.encrypt(pass, state.masterKey);
        const encryptedNotes = notes ? await CryptoUtils.encrypt(notes, state.masterKey) : null;
        const result = await chrome.storage.local.get(['vault']);
        let vault = result.vault || [];
        if (state.editingId) { vault = vault.map(i => i.id === state.editingId ? { ...i, url: urlInput, username: encryptedUser, password: encryptedPass, notes: encryptedNotes } : i); }
        else { vault.push({ id: Date.now(), url: urlInput, username: encryptedUser, password: encryptedPass, notes: encryptedNotes }); }
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
            if (!Array.isArray(importedVault)) throw new Error('Format Error');
            if (confirm(`检测到 ${importedVault.length} 条记录，确定合并吗？`)) {
                const result = await chrome.storage.local.get(['vault']);
                let currentVault = result.vault || [];
                for (const item of importedVault) {
                    const encryptedUser = await CryptoUtils.encrypt(item.username, state.masterKey);
                    const encryptedPass = await CryptoUtils.encrypt(item.password, state.masterKey);
                    const encryptedNotes = item.notes ? await CryptoUtils.encrypt(item.notes, state.masterKey) : null;
                    currentVault.push({ id: Date.now() + Math.random(), url: item.url, username: encryptedUser, password: encryptedPass, notes: encryptedNotes });
                }
                await chrome.storage.local.set({ vault: currentVault });
                alert('导入成功！'); await loadVault(); showView('main');
            }
        } catch (err) { alert('导入失败'); }
    };
    reader.readAsText(file);
}

async function handleReset() {
    if (!confirm('确定销毁所有数据吗？')) return;
    await chrome.storage.local.clear(); window.location.reload();
}

function splitUrl(urlStr) {
    try { const url = new URL(urlStr); return { host: url.hostname.replace('www.', ''), path: url.pathname === '/' ? '' : url.pathname, query: url.search }; }
    catch (e) { const parts = urlStr.replace('https://', '').replace('http://', '').split('/'); return { host: parts[0], path: parts.length > 1 ? '/' + parts.slice(1).join('/') : '', query: '' }; }
}

function renderVault(filter = '') {
    const currentList = document.getElementById('current-site-list');
    const allList = document.getElementById('all-accounts-list');
    const currentSection = document.getElementById('current-site-section');
    currentList.innerHTML = ''; allList.innerHTML = '';
    const searchTerm = filter.toLowerCase().trim();
    let matchCount = 0;
    
    state.vault.forEach(item => {
        const matchesUrl = item.url.toLowerCase().includes(searchTerm);
        const matchesUser = item.username.toLowerCase().includes(searchTerm);
        const matchesNotes = item.notes && item.notes.toLowerCase().includes(searchTerm);
        if (searchTerm && !matchesUrl && !matchesUser && !matchesNotes) return;
        
        matchCount++;
        const isCurrentSite = item.url.includes(state.currentUrl) && state.currentUrl !== '';
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
            ${(parts.path || parts.query) ? `
            <div class="url-details">
                <div class="url-text-area">
                    ${parts.path ? `<div class="url-path">${parts.path}</div>` : ''}
                    ${parts.query ? `<div class="url-params">${parts.query}</div>` : ''}
                </div>
                <div class="url-actions">
                    <button class="url-mini-btn copy-link" title="复制完整链接">🔗</button>
                    <button class="url-mini-btn open-link" title="新窗口打开">🌐</button>
                </div>
            </div>` : ''}
            <div class="card-body">
                <p><span class="label-text">账号</span><span class="value-text">${item.username}</span><button class="copy-badge copy-user">复制</button></p>
                <p><span class="label-text">密码</span><span class="value-text">••••••••</span><button class="copy-badge copy-pass">复制</button></p>
                ${item.notes ? `<div class="note-box">备注: ${item.notes}</div>` : ''}
            </div>
            <div class="card-action-bar">
                <button class="bar-btn fill-btn main-fill">⚡ 快速填充</button>
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
        card.querySelector('.copy-pass').addEventListener('click', (e) => {
            e.stopPropagation(); navigator.clipboard.writeText(item.password);
            const btn = e.target; btn.textContent = '已复制'; setTimeout(() => btn.textContent = '复制', 1500);
        });
        card.querySelector('.fill-btn').addEventListener('click', () => handleFill(item));
        card.querySelector('.edit-btn').addEventListener('click', () => startEdit(item));
        card.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));

        if (isCurrentSite && !searchTerm) { currentList.appendChild(card); } else { allList.appendChild(card); }
    });

    // 动态显隐 Section 标题
    const allAccountsSection = document.getElementById('all-accounts-section');
    
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

async function handleFill(item) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        
        chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM',
            data: { username: item.username, password: item.password }
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

function showView(viewName) { Object.keys(views).forEach(n => views[n].classList.add('hidden')); views[viewName].classList.remove('hidden'); }

async function updateCurrentTabInfo() {
    try { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); if (t && t.url) { const u = new URL(t.url); state.currentUrl = u.hostname.replace('www.', ''); if (state.isUnlocked) renderVault(); } } catch (e) {}
}
