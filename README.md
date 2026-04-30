# 🔐 LocalKey (密码管家): 隐私优先的侧边栏密码管家

> **数据主权，回归本地。**  
> LocalKey 是一款基于 Chrome Manifest V3 构建的开源密码管理器。它摒弃了繁琐的弹窗，通过常驻侧边栏（Side Panel）提供“伴随式”的安全密码管理体验。

---

## ✨ 为什么选择 LocalKey？

与传统的密码管理器不同，LocalKey 坚持 **Local-First (本地优先)** 与 **Zero-Knowledge (零知识)** 架构：

- **🛡️ 纯本地加密**：所有数据均通过 AES-256-GCM 高强度加密存储在您的浏览器本地 (`chrome.storage.local`)。绝不上传云端，不连接任何第三方服务器。
- **📟 智能侧边栏 (Side Panel)**：采用 Chrome 最新的侧边栏 API，不遮挡主网页内容，随开随用，像工具箱一样常驻右侧。
- **🧠 上下文感知**：它能“听懂”您的浏览器标签。当你切换网站时，侧边栏会自动置顶显示该网站对应的账号，无需手动搜索。
- **💎 极简美学**：基于现代 UI 设计规范，支持深色模式与毛玻璃特效，提供极致的视觉享受。

---

## 🚀 核心功能

### 1. 安全堡垒
- **主密码保护**：所有操作均受主密码保护，主密码不存储，仅保存哈希值用于校验。
- **内存即焚**：解密后的明文仅存在于内存中，侧边栏关闭或超时后立即销毁。
- **健康体检**：自动扫描并标记弱密码或重复使用的密码，防患于未然。

### 2. 高效操作
- **自动填充**：一键将账号密码填充至网页表单，告别繁琐输入。
- **密码生成器**：内置随机密码生成器，自定义长度与字符复杂度。
- **快捷唤醒**：支持 `Cmd/Ctrl + Shift + P` 全局快捷键，瞬时调起侧边栏。

### 3. 数据自由
- **灵活备份**：支持加密 JSON 备份或明文 CSV 导出，您的数据永远属于您。
- **图标自动抓取**：基于域名自动获取 Favicon，一眼定位目标账号。

---

## 🎨 界面预览

| 解锁界面 | 主列表 (智能匹配) | 密码生成器 |
| :--- | :--- | :--- |
| ![Unlock](https://via.placeholder.com/150x300?text=Lock+Screen) | ![Main](https://via.placeholder.com/150x300?text=Dashboard) | ![Generator](https://via.placeholder.com/150x300?text=Settings) |
> *(提示：请在 /icons 目录下查看实际图标设计)*

---

## 🛠️ 技术架构

- **标准**：Chrome Extension Manifest V3
- **安全核心**：Web Crypto API (`window.crypto.subtle`)
- **UI 方案**：HTML5 + Vanilla CSS (Glassmorphism) + JavaScript
- **存储**：`chrome.storage.local`

---

## 📥 安装与开发

1. 克隆本仓库到本地：
   ```bash
   git clone https://github.com/your-username/LocalKey.git
   ```
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
3. 开启右上角的 **“开发者模式”**。
4. 点击 **“加载已解压的扩展程序”**，选择项目根目录。
5. 建议通过快捷键 `Cmd/Ctrl + Shift + P` 快速固定并开启侧边栏。

---

## ⚖️ 隐私声明

**LocalKey 没有任何后端服务器。**  
我们无法获取、存储、查看或分享您的任何个人数据或密码。所有解密过程均在您的浏览器沙盒中完成。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 协议。