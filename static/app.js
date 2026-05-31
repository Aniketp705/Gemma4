document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uptimeClock = document.getElementById('uptime-clock');
    const connectionStatus = document.getElementById('connection-status');
    const pulseDot = document.querySelector('.pulse-dot');
    
    // Chat DOM Elements
    const systemPromptInput = document.getElementById('system-prompt');
    const chatTempSlider = document.getElementById('chat-temp');
    const tempValueSpan = document.getElementById('temp-val');
    const endpointStatusText = document.getElementById('endpoint-status');
    const endpointStatusDot = document.querySelector('.endpoint-status-dot');
    const btnClearChat = document.getElementById('btn-clear-chat');
    const chatHistoryContainer = document.getElementById('chat-history');
    const chatFormElement = document.getElementById('chat-form-element');
    const chatMessageInput = document.getElementById('chat-message-input');
    const btnSendMessage = document.getElementById('btn-send-message');
    const btnThemeToggle = document.getElementById('btn-theme-toggle');

    // Uptime variables
    let backendUptime = 0;
    let uptimeIntervalId = null;

    // Theme toggle (Hue rotate)
    const hues = [260, 320, 20, 140, 195];
    let currentHueIndex = 0;
    
    btnThemeToggle.addEventListener('click', () => {
        currentHueIndex = (currentHueIndex + 1) % hues.length;
        document.documentElement.style.setProperty('--hue', hues[currentHueIndex]);
        
        // Add a temporary animation to the theme button
        btnThemeToggle.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btnThemeToggle.style.transform = '';
        }, 150);
    });

    // Update connection status UI
    function setConnectionStatus(connected) {
        if (connected) {
            connectionStatus.textContent = 'Connected';
            pulseDot.style.backgroundColor = 'var(--success)';
            pulseDot.style.boxShadow = '0 0 10px var(--success)';
        } else {
            connectionStatus.textContent = 'Offline';
            pulseDot.style.backgroundColor = 'var(--error)';
            pulseDot.style.boxShadow = '0 0 10px var(--error)';
        }
    }

    // Refresh Telemetry Stats
    async function fetchStats() {
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error('API server error');
            const data = await res.json();
            
            // Sync uptime
            backendUptime = data.system.uptime;
            updateUptimeDisplay();
            
            // Sync status
            setConnectionStatus(true);

            // Sync Llama status badge
            if (data.system && data.system.llama_status === 'online') {
                endpointStatusText.textContent = 'Service online (port 8080)';
                endpointStatusDot.style.backgroundColor = 'var(--success)';
                endpointStatusDot.style.boxShadow = '0 0 10px var(--success)';
            } else {
                endpointStatusText.textContent = 'Service offline';
                endpointStatusDot.style.backgroundColor = 'var(--error)';
                endpointStatusDot.style.boxShadow = '0 0 10px var(--error)';
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
            setConnectionStatus(false);
            endpointStatusText.textContent = 'Service offline';
            endpointStatusDot.style.backgroundColor = 'var(--error)';
            endpointStatusDot.style.boxShadow = '0 0 10px var(--error)';
        }
    }

    // Local Uptime Incrementor (smooth counter)
    function updateUptimeDisplay() {
        const hours = Math.floor(backendUptime / 3600);
        const minutes = Math.floor((backendUptime % 3600) / 60);
        const seconds = Math.floor(backendUptime % 60);
        
        let displayStr = 'Uptime: ';
        if (hours > 0) displayStr += `${hours}h `;
        if (minutes > 0 || hours > 0) displayStr += `${minutes}m `;
        displayStr += `${seconds}s`;
        
        uptimeClock.textContent = displayStr;
    }

    // Start local uptime ticker
    function startUptimeClock() {
        if (uptimeIntervalId) clearInterval(uptimeIntervalId);
        uptimeIntervalId = setInterval(() => {
            backendUptime += 1;
            updateUptimeDisplay();
        }, 1000);
    }

    // Helper: Escape HTML strings to prevent XSS
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Chat History Array
    let conversationHistory = [];

    // Temp slider display
    chatTempSlider.addEventListener('input', () => {
        tempValueSpan.textContent = chatTempSlider.value;
    });

    // Enter to Send, Shift+Enter to newline
    chatMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            btnSendMessage.click();
        }
    });

    // Clear Chat
    btnClearChat.addEventListener('click', () => {
        conversationHistory = [];
        chatHistoryContainer.innerHTML = `
            <div class="chat-message assistant">
                <div class="message-avatar">G</div>
                <div class="message-content-wrapper">
                    <div class="message-header">Gemma Agent</div>
                    <div class="message-body">Conversation reset. Ask me anything!</div>
                </div>
            </div>
        `;
    });

    // Send Message Submit Handler
    chatFormElement.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatMessageInput.value.trim();
        if (!text) return;
        
        chatMessageInput.disabled = true;
        btnSendMessage.disabled = true;
        chatMessageInput.value = '';
        
        // Append user prompt
        appendMessage('user', text);
        conversationHistory.push({ role: 'user', content: text });
        
        // Add loading indicator
        const loadingId = appendTypingIndicator();
        scrollChatToBottom();
        
        try {
            const systemPrompt = systemPromptInput.value.trim() || "You are a helpful assistant.";
            const messagesPayload = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory
            ];
            
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messagesPayload,
                    temperature: parseFloat(chatTempSlider.value)
                })
            });
            
            removeTypingIndicator(loadingId);
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.error || 'Server error communicating with local Llama model.';
                appendMessage('assistant error-message', errMsg);
                scrollChatToBottom();
                return;
            }
            
            const data = await res.json();
            const reply = data.choices[0].message.content;
            
            appendMessage('assistant', reply);
            conversationHistory.push({ role: 'assistant', content: reply });
            scrollChatToBottom();
            
        } catch (err) {
            console.error('Failed to chat:', err);
            removeTypingIndicator(loadingId);
            appendMessage('assistant error-message', 'Failed to communicate with local service. Please make sure llama-server is running.');
            scrollChatToBottom();
        } finally {
            chatMessageInput.disabled = false;
            btnSendMessage.disabled = false;
            chatMessageInput.focus();
        }
    });

    function appendMessage(sender, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        
        const avatarChar = sender.includes('user') ? 'U' : 'G';
        const senderLabel = sender.includes('user') ? 'User' : 'Gemma Agent';
        
        let formattedContent;
        if (sender.includes('user')) {
            formattedContent = escapeHTML(content).replace(/\n/g, '<br>');
        } else {
            // Render assistant responses as markdown
            formattedContent = typeof marked !== 'undefined' ? marked.parse(content) : escapeHTML(content).replace(/\n/g, '<br>');
        }
        
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarChar}</div>
            <div class="message-content-wrapper">
                <div class="message-header">${senderLabel}</div>
                <div class="message-body">${formattedContent}</div>
            </div>
        `;
        chatHistoryContainer.appendChild(messageDiv);

        // Run syntax highlighting on code blocks
        if (sender.includes('assistant') && typeof hljs !== 'undefined') {
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

            // Add copy button overlay to pre containers
            messageDiv.querySelectorAll('pre').forEach((preBlock) => {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-code-btn';
                copyBtn.setAttribute('aria-label', 'Copy Code');
                copyBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                `;

                copyBtn.addEventListener('click', () => {
                    const codeElement = preBlock.querySelector('code');
                    if (!codeElement) return;
                    
                    navigator.clipboard.writeText(codeElement.innerText).then(() => {
                        copyBtn.classList.add('copied');
                        copyBtn.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: var(--success)">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        `;
                        setTimeout(() => {
                            copyBtn.classList.remove('copied');
                            copyBtn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            `;
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy code: ', err);
                    });
                });

                preBlock.appendChild(copyBtn);
            });
        }
    }
    
    function appendTypingIndicator() {
        const id = 'typing-' + Date.now();
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'chat-message assistant typing-message';
        indicatorDiv.id = id;
        
        indicatorDiv.innerHTML = `
            <div class="message-avatar">G</div>
            <div class="message-content-wrapper">
                <div class="message-header">Gemma Agent</div>
                <div class="message-body">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;
        chatHistoryContainer.appendChild(indicatorDiv);
        return id;
    }
    
    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
    
    function scrollChatToBottom() {
        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    }

    // Initialize application
    fetchStats();
    startUptimeClock();
    
    // Poll stats every 3 seconds
    setInterval(fetchStats, 3000);
});
