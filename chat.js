// =============================================
// DIGIM RECRUITMENT CHATBOT — CLIENT-SIDE JS
// =============================================

// ---- Configuration ----
const WEBHOOK_URL = 'https://n8n.srv1265565.hstgr.cloud/webhook-test/web-chat'; // UPDATE THIS after creating the n8n webhook

// ---- State ----
let chatOpen = false;
let isProcessing = false;
let conversationHistory = loadHistory();
let sessionId = loadSessionId();
let userName = localStorage.getItem('digim_user_name') || '';
let userEmail = localStorage.getItem('digim_user_email') || '';

// Detect Job Context from page
const currentJobId = document.body.getAttribute('data-job-id') ||
    document.querySelector('meta[name="job-id"]')?.getAttribute('content') ||
    null;

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    // If user already registered, skip prechat form
    if (userName && userEmail) {
        showChatInterface();
    } else {
        // Hide input area and quick replies during prechat
        const inputArea = document.getElementById('chat-input-area');
        const quickReplies = document.getElementById('quick-replies');
        if (inputArea) inputArea.style.display = 'none';
        if (quickReplies) quickReplies.style.display = 'none';
    }
    setupInputListener();
});

// ---- LocalStorage Persistence ----
function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem('digim_chat_history') || '[]');
    } catch { return []; }
}

function saveHistory() {
    try {
        localStorage.setItem('digim_chat_history', JSON.stringify(conversationHistory));
    } catch { }
}

function loadSessionId() {
    let id = localStorage.getItem('digim_session_id');
    if (!id) {
        id = generateSessionId();
        localStorage.setItem('digim_session_id', id);
    }
    return id;
}

function restoreChatMessages() {
    if (conversationHistory.length === 0) return;
    conversationHistory.forEach(msg => {
        addMessage(msg.role === 'user' ? 'user' : 'bot', msg.content, true, msg.actionData);
    });
}

// ---- Toggle Chat ----
function toggleChat() {
    chatOpen = !chatOpen;
    const chatWindow = document.getElementById('chat-window');
    const chatIconOpen = document.getElementById('chat-icon-open');
    const chatIconClose = document.getElementById('chat-icon-close');
    const notifDot = document.getElementById('notification-dot');

    if (chatOpen) {
        chatWindow.classList.add('open');
        chatIconOpen.style.display = 'none';
        chatIconClose.style.display = 'block';
        notifDot.style.display = 'none';
        if (userName && userEmail) {
            document.getElementById('chat-input').focus();
        }
    } else {
        chatWindow.classList.remove('open');
        chatIconOpen.style.display = 'block';
        chatIconClose.style.display = 'none';
    }
}

// ---- Welcome Message ----
function addWelcomeMessage() {
    const welcomeText = `Hello! 👋 Welcome to **DigiM Recruitment**.

I'm your AI assistant, here to help you explore career opportunities.

I can help you with:
• Current job openings & details
• Salary and qualification info
• Interview process
• Submitting your application

How can I assist you today?`;

    addMessage('bot', welcomeText);
}

// ---- Send Message ----
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || isProcessing) return;

    // Add user message
    addMessage('user', text);
    input.value = '';
    updateSendButton();
    hideQuickReplies();

    // Show typing
    isProcessing = true;
    showTypingIndicator();

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                session_id: sessionId,
                sender_name: userName || 'Web Visitor',
                sender_email: userEmail || '',
                source: 'web_chatbot',
                page_url: window.location.href,
                current_job_id: currentJobId,
                conversation_history: conversationHistory.slice(-10)
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        removeTypingIndicator();

        // Extract the bot's reply
        const botReply = data.reply || data.response_text || data.final_message || 'Sorry, I encountered an issue. Please try again.';

        // Add message with potential action data
        addMessage('bot', botReply, false, data);

        // Store in history and persist
        conversationHistory.push(
            { role: 'user', content: text },
            { role: 'assistant', content: botReply, actionData: data }
        );
        saveHistory();

    } catch (error) {
        console.error('Chat error:', error);
        removeTypingIndicator();
        addMessage('bot', "I'm sorry, I'm having trouble connecting right now. Please try again in a moment, or reach out to us directly at **contact@digimrecruitment.com**.");
    } finally {
        isProcessing = false;
    }
}

// ---- Quick Reply ----
function sendQuickReply(text) {
    document.getElementById('chat-input').value = text;
    updateSendButton();
    sendMessage();
}

// ---- Add Message to UI ----
function addMessage(sender, text, isRestore = false, actionData = null) {
    const container = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarContent = sender === 'bot'
        ? `<svg viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="url(#mg)"/><path d="M8 10h4v10H8V10zm5 3h4v7h-4V13zm5-5h4v12h-4V8z" fill="white" opacity="0.9"/><defs><linearGradient id="mg" x1="0" y1="0" x2="30" y2="30"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg>`
        : '👤';

    let formattedText = formatMessage(text);

    // Inject Action Button if AI triggered it
    if (sender === 'bot' && actionData && actionData.next_action === 'send_form' && actionData.form_url) {
        formattedText += `
            <div class="chat-action-container">
                <a href="${actionData.form_url}" target="_blank" class="chat-form-button">
                    📝 Fill Prequalification Form
                </a>
            </div>
        `;
    }

    messageDiv.innerHTML = `
    <div class="message-avatar">${avatarContent}</div>
    <div class="message-content">
      <div class="message-bubble">${formattedText}</div>
      <span class="message-time">${timeStr}</span>
    </div>
  `;

    container.appendChild(messageDiv);
    scrollToBottom();
}

// ---- Format Message (Markdown-like) ----
function formatMessage(text) {
    return text
        // Bold: **text**
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic: *text*
        .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        // Bullet points: lines starting with • or -
        .replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>')
        // Wrap consecutive <li> in <ul>
        .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
        // Numbered lists: 1. text
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        // Line breaks
        .replace(/\n/g, '<br>');
}

// ---- Typing Indicator ----
function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typing-indicator';

    typingDiv.innerHTML = `
    <div class="message-avatar">
      <svg viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="url(#tg)"/><path d="M8 10h4v10H8V10zm5 3h4v7h-4V13zm5-5h4v12h-4V8z" fill="white" opacity="0.9"/><defs><linearGradient id="tg" x1="0" y1="0" x2="30" y2="30"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs></svg>
    </div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;

    container.appendChild(typingDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

// ---- UI Helpers ----
function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

function hideQuickReplies() {
    const qr = document.getElementById('quick-replies');
    qr.style.display = 'none';
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function setupInputListener() {
    document.getElementById('chat-input').addEventListener('input', updateSendButton);
}

function updateSendButton() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('send-btn');
    btn.disabled = !input.value.trim();
}

function clearChat() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    conversationHistory = [];
    sessionId = generateSessionId();
    userName = '';
    userEmail = '';
    localStorage.clear();
    localStorage.setItem('digim_session_id', sessionId);

    // Show pre-chat form again
    document.getElementById('chat-messages').style.display = 'none';
    document.getElementById('quick-replies').style.display = 'none';
    document.getElementById('prechat-form').style.display = 'flex';
    document.getElementById('prechat-name').value = '';
    document.getElementById('prechat-email').value = '';
}

// ---- Pre-Chat Form ----
function submitPrechat() {
    const nameInput = document.getElementById('prechat-name');
    const emailInput = document.getElementById('prechat-email');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name) { nameInput.style.borderColor = '#ef4444'; return; }
    if (!email || !email.includes('@')) { emailInput.style.borderColor = '#ef4444'; return; }

    // Check if this is a different user — clear old data
    const oldEmail = localStorage.getItem('digim_user_email');
    if (oldEmail && oldEmail !== email) {
        conversationHistory = [];
        localStorage.removeItem('digim_chat_history');
        sessionId = generateSessionId();
        localStorage.setItem('digim_session_id', sessionId);
    }

    // Save user info
    userName = name;
    userEmail = email;
    localStorage.setItem('digim_user_name', name);
    localStorage.setItem('digim_user_email', email);

    // Show chat interface
    showChatInterface();
}

function showChatInterface() {
    document.getElementById('prechat-form').style.display = 'none';
    document.getElementById('chat-messages').style.display = 'flex';
    document.getElementById('quick-replies').style.display = 'flex';
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'block';

    // Only add welcome + restore if messages area is empty
    const container = document.getElementById('chat-messages');
    if (container.children.length === 0) {
        addWelcomeMessage();
        restoreChatMessages();
    }

    document.getElementById('chat-input').focus();
}

function generateSessionId() {
    return 'web_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}


