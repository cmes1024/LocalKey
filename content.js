/**
 * 内容脚本 - 负责寻找表单并填充
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FILL_FORM') {
        const { username, password } = request.data;
        const result = fillFields(username, password);
        sendResponse({ status: result ? 'success' : 'not_found' });
    }
    return true;
});

function fillFields(user, pass) {
    // 寻找密码框
    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    if (passwordInputs.length === 0) return false;

    passwordInputs.forEach(passInput => {
        // 尝试寻找离密码框最近的文本框作为用户名框
        const form = passInput.form;
        let userInput = null;

        if (form) {
            userInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
        } else {
            // 如果不在 form 里，找前一个 input
            const inputs = Array.from(document.querySelectorAll('input'));
            const idx = inputs.indexOf(passInput);
            if (idx > 0) userInput = inputs[idx - 1];
        }

        // 填充
        if (userInput) {
            userInput.value = user;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            userInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        passInput.value = pass;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 视觉反馈
        passInput.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
        if (userInput) userInput.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
    });

    return true;
}
