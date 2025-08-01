class LocalPromptBridge {
    constructor() {
        this.socket = null;
        this.recognition = null;
        this.isListening = false;
        this.init();
    }

    init() {
        this.connectSocket();
        this.setupEventListeners();
        this.setupSpeechRecognition();
    }

    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateServerStatus('online');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateServerStatus('offline');
        });

        this.socket.on('websim-status', (data) => {
            this.updateWebsimStatus(data.ready ? 'online' : 'connecting');
            this.showStatus(data.message, data.ready ? 'success' : 'error');
        });

        this.socket.on('server-info', (data) => {
            document.getElementById('desktop-url').textContent = `http://localhost:${data.port}`;
            document.getElementById('mobile-url').textContent = `http://${data.ip}:${data.port}`;
            document.getElementById('client-count').textContent = data.clients;
        });

        this.socket.on('prompt-result', (data) => {
            this.showStatus(data.message, data.success ? 'success' : 'error');
            this.setButtonLoading('send-btn', false);
        });

        this.socket.on('prompt-sent', (data) => {
            this.addPromptToHistory(data.prompt, data.timestamp);
        });

        this.socket.on('client-count', (count) => {
            document.getElementById('client-count').textContent = count;
        });
    }

    setupEventListeners() {
        const sendBtn = document.getElementById('send-btn');
        const voiceBtn = document.getElementById('voice-btn');
        const promptInput = document.getElementById('prompt-input');
        const downloadBtn = document.getElementById('download-btn');

        sendBtn.addEventListener('click', () => {
            this.sendPrompt();
        });

        voiceBtn.addEventListener('click', () => {
            this.toggleVoiceRecognition();
        });

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.sendPrompt();
            }
        });

        downloadBtn.addEventListener('click', () => {
            this.downloadApp();
        });
    }

    setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                this.setButtonListening('voice-btn', true);
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                document.getElementById('prompt-input').value = transcript;
                this.showStatus('Voice input captured successfully!', 'success');
            };

            this.recognition.onerror = (event) => {
                this.showStatus(`Voice recognition error: ${event.error}`, 'error');
                this.setButtonListening('voice-btn', false);
                this.isListening = false;
            };

            this.recognition.onend = () => {
                this.setButtonListening('voice-btn', false);
                this.isListening = false;
            };
        } else {
            document.getElementById('voice-btn').style.display = 'none';
        }
    }

    sendPrompt() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput.value.trim();

        if (!prompt) {
            this.showStatus('Please enter a prompt', 'error');
            return;
        }

        this.setButtonLoading('send-btn', true);
        this.socket.emit('send-prompt', { prompt });
        promptInput.value = '';
    }

    toggleVoiceRecognition() {
        if (!this.recognition) {
            this.showStatus('Speech recognition not supported', 'error');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    updateServerStatus(status) {
        const indicator = document.getElementById('server-status');
        indicator.className = `status-indicator ${status}`;
    }

    updateWebsimStatus(status) {
        const indicator = document.getElementById('websim-status');
        indicator.className = `status-indicator ${status}`;
    }

    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    setButtonListening(buttonId, listening) {
        const button = document.getElementById(buttonId);
        if (listening) {
            button.classList.add('listening');
        } else {
            button.classList.remove('listening');
        }
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('status-message');
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;
        
        setTimeout(() => {
            statusElement.classList.remove(type);
        }, 5000);
    }

    addPromptToHistory(prompt, timestamp) {
        const historyContainer = document.getElementById('prompt-history');
        const noPrompts = historyContainer.querySelector('.no-prompts');
        
        if (noPrompts) {
            noPrompts.remove();
        }

        const promptItem = document.createElement('div');
        promptItem.className = 'prompt-item';
        promptItem.innerHTML = `
            <div class="prompt-text">${this.escapeHtml(prompt)}</div>
            <div class="prompt-time">${new Date(timestamp).toLocaleString()}</div>
        `;

        historyContainer.insertBefore(promptItem, historyContainer.firstChild);

        // Keep only last 10 prompts
        const items = historyContainer.querySelectorAll('.prompt-item');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadApp() {
        // Create a simple download link for the app files
        this.showStatus('Preparing download...', 'success');
        
        // In a real scenario, you'd want to create a proper zip file
        // For now, we'll provide instructions
        const instructions = `
To download and set up the Local Prompt Bridge:

1. Download Node.js from nodejs.org
2. Create a new folder for the app
3. Copy all the files from this project
4. Run: npm install
5. Run: npm start
6. Access from any device on your network!

Files needed:
- package.json
- server.js
- index.html (in public folder)
- style.css (in public folder)  
- client.js (in public folder)
        `.trim();
        
        const blob = new Blob([instructions], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'setup-instructions.txt';
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LocalPromptBridge();
});

