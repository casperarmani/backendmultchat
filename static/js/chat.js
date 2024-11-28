// Chat functionality
let chatHistory = [];
let analysisHistory = [];

async function initChat() {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');

    // Load initial histories
    await Promise.all([
        loadChatHistory(),
        loadAnalysisHistory()
    ]);

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = messageInput.value.trim();
        const videos = Array.from(videoUpload.files);
        
        if (!message && !videos.length) {
            return;
        }

        try {
            messageInput.disabled = true;
            uploadStatus.textContent = videos.length ? 'Uploading...' : '';

            const response = await api.sendMessage(message, videos);
            
            // Clear inputs
            messageInput.value = '';
            videoUpload.value = '';
            uploadStatus.textContent = '';

            // Reload histories
            await Promise.all([
                loadChatHistory(),
                loadAnalysisHistory()
            ]);
        } catch (error) {
            utils.showError('Failed to send message');
        } finally {
            messageInput.disabled = false;
        }
    });
}

async function loadChatHistory() {
    try {
        const response = await api.getChatHistory();
        chatHistory = response.history || [];
        renderChatHistory();
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

async function loadAnalysisHistory() {
    try {
        const response = await api.getVideoAnalysisHistory();
        analysisHistory = response.history || [];
        renderAnalysisHistory();
    } catch (error) {
        console.error('Failed to load analysis history:', error);
    }
}

function renderChatHistory() {
    const chatContainer = document.getElementById('chat-history');
    chatContainer.innerHTML = '';

    // Sort messages in reverse chronological order
    const sortedMessages = [...chatHistory].sort((a, b) => {
        return new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP);
    });

    sortedMessages.forEach(message => {
        // Log raw message object to inspect structure
        console.log('Raw message object:', message);
        
        // Log timestamp-specific information
        console.log('Timestamp details:', {
            rawTimestamp: message.TIMESTAMP,
            timestampType: typeof message.TIMESTAMP,
            isISOString: typeof message.TIMESTAMP === 'string' && !isNaN(Date.parse(message.TIMESTAMP)),
            parsedDate: new Date(message.TIMESTAMP),
            messageType: message.chat_type
        });
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.chat_type}`;
        const formattedDate = utils.formatDate(message.TIMESTAMP);
        
        // Log formatted date result
        console.log('Formatted date result:', {
            originalTimestamp: message.TIMESTAMP,
            formattedResult: formattedDate
        });
        
        messageDiv.innerHTML = `
            <div class="message-content">${utils.sanitizeHTML(message.message)}</div>
            <div class="message-timestamp" title="${formattedDate}">${formattedDate}</div>
        `;
        chatContainer.appendChild(messageDiv);
    });
}

function renderAnalysisHistory() {
    const analysisContainer = document.getElementById('analysis-history');
    analysisContainer.innerHTML = '';

    analysisHistory.forEach(analysis => {
        const analysisDiv = document.createElement('div');
        analysisDiv.className = 'analysis-item';
        analysisDiv.innerHTML = `
            <h4>${utils.sanitizeHTML(analysis.upload_file_name)}</h4>
            <div class="analysis-details">
                ${analysis.video_duration ? `<p>Duration: ${analysis.video_duration}</p>` : ''}
                ${analysis.video_format ? `<p>Format: ${analysis.video_format}</p>` : ''}
            </div>
            <div class="analysis-content">${utils.sanitizeHTML(analysis.analysis)}</div>
            <div class="analysis-timestamp">${utils.formatDate(analysis.timestamp)}</div>
        `;
        analysisContainer.appendChild(analysisDiv);
    });
}
