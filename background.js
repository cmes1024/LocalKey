/**
 * 后台 Service Worker
 */
importScripts('crypto-utils.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 🚀 核心修复：强制允许 content.js 访问 session 存储
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

chrome.runtime.onInstalled.addListener(() => {
  console.log('密码管家扩展已安装');
  // 初始化默认配置
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          enableQuickFill: true
        }
      });
    }
  });
});

// 监听来自 content.js 或 sidepanel.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MATCHING_ACCOUNTS') {
    handleGetMatchingAccounts(message.url, sendResponse);
    return true; // 异步响应
  }
});

/**
 * 处理匹配账号请求
 */
async function handleGetMatchingAccounts(urlStr, sendResponse) {
  try {
    // 1. 检查开关 (默认开启)
    const { settings } = await chrome.storage.local.get(['settings']);
    if (settings && settings.enableQuickFill === false) {
      console.log('QuickFill is disabled in settings');
      sendResponse({ status: 'disabled' });
      return;
    }

    // 2. 检查锁定状态 (获取 Session Key 和超时设置)
    const { sessionKey, lastUnlockedTime } = await chrome.storage.session.get(['sessionKey', 'lastUnlockedTime']);
    const { lockTimeout } = await chrome.storage.local.get(['lockTimeout']);
    
    if (!sessionKey || !lastUnlockedTime) {
      console.log('Vault is locked, sessionKey missing');
      sendResponse({ status: 'locked' });
      return;
    }

    // 检查是否超时 (lockTimeout 默认为 5 分钟)
    const timeoutMin = parseInt(lockTimeout || "5");
    if (timeoutMin > 0) {
      const now = Date.now();
      const diffMin = (now - lastUnlockedTime) / (1000 * 60);
      if (diffMin > timeoutMin) {
        // 已超时，清除 Session 并返回锁定状态
        await chrome.storage.session.remove(['sessionKey', 'lastUnlockedTime']);
        sendResponse({ status: 'locked' });
        return;
      }
    }

    // 3. 解析当前 URL (归一化：去掉协议，去掉末尾斜杠，统一小写)
    const normalize = (u) => {
        try {
            const url = new URL(u);
            // 只保留 hostname + pathname，忽略协议 (http/https)
            return (url.hostname + url.pathname).replace(/\/$/, '').replace(/^www\./, '').toLowerCase();
        } catch(e) { return null; }
    };
    
    const currentPath = normalize(urlStr);
    console.log('LocalKey DEBUG: Current page path ->', currentPath);

    // 4. 读取并解密 Vault
    const { vault } = await chrome.storage.local.get(['vault']);
    if (!vault || vault.length === 0) {
      console.log('LocalKey DEBUG: Vault is empty');
      sendResponse({ status: 'empty', accounts: [] });
      return;
    }

    // 恢复 Key 格式
    const key = await crypto.subtle.importKey(
      "raw", 
      new Uint8Array(atob(sessionKey).split('').map(c => c.charCodeAt(0))),
      "AES-GCM", 
      true, 
      ["encrypt", "decrypt"]
    );

    const matches = [];
    for (const item of vault) {
      try {
        const itemPath = normalize(item.url);
        // console.log('Checking against vault item:', itemPath);

        // 路径完全匹配
        if (itemPath && itemPath === currentPath) {
          console.log('LocalKey DEBUG: Match found! Decrypting...');
          // 解密账号和密码
          const username = await self.CryptoUtils.decrypt(item.username, item.iv, key);
          const password = await self.CryptoUtils.decrypt(item.password, item.iv, key);
          matches.push({ id: item.id, username, password });
        }
      } catch (e) {
        console.error('LocalKey DEBUG: Match/Decrypt error:', e);
      }
    }

    console.log(`LocalKey DEBUG: Total matches for this page -> ${matches.length}`);
    sendResponse({ status: 'success', accounts: matches });
  } catch (error) {
    console.error('handleGetMatchingAccounts error:', error);
    sendResponse({ status: 'error', message: error.message });
  }
}
