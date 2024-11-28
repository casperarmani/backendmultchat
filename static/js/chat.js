// Chat functionality
let chatHistory = [];
let analysisHistory = [];
let conversations = [];
let currentConversationId = null;

async function initChat() {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');
    const chatHistory = document.getElementById('chat-history');

    // Add conversation container to the chat interface
    const conversationsContainer = document.createElement('div');
    conversationsContainer.className = 'conversations-container';
    conversationsContainer.innerHTML = `
        <div class="conversations-header">
            <h3>Conversations</h3>
            <button id="new-conversation-btn">New Conversation</button>
        </div>
        <div id="conversations-list" class="conversations-list"></div>
    `;
    chatHistory.parentElement.insertBefore(conversationsContainer, chatHistory);

    // Setup event listeners
    document.getElementById('new-conversation-btn').addEventListener('click', createNewConversation);

    // Load initial data
    await Promise.all([
        loadConversations(),
        loadAnalysisHistory()
    ]);

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = messageInput.value.trim();
        const videos = Array.from(videoUpload.files);
        
        if (!message && !videos.length) {
            return;
        }

        if (!currentConversationId) {
            await createNewConversation();
        }

        try {
            messageInput.disabled = true;
            uploadStatus.textContent = videos.length ? 'Uploading...' : '';

            const response = await api.sendMessage(message, videos, currentConversationId);
            
            // Clear inputs
            messageInput.value = '';
            videoUpload.value = '';
            uploadStatus.textContent = '';

            // Reload conversation messages
            await loadConversationMessages(currentConversationId);
            await loadAnalysisHistory();
        } catch (error) {
            utils.showError('Failed to send message');
        } finally {
            messageInput.disabled = false;
        }
    });
}

async function createNewConversation() {
    try {
        const title = `Conversation ${new Date().toLocaleString()}`;
        const response = await api.createConversation(title);
        
        if (response && response.success && response.conversation) {
            await loadConversations();
            switchConversation(response.conversation.id);
            return response.conversation.id;
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error('Failed to create conversation:', error);
        utils.showError('Failed to create conversation. Please try again.');
        return null;
    }
}

async function loadConversations() {
    try {
        const response = await api.getConversations();
        if (response && response.conversations) {
            conversations = response.conversations;
            renderConversations();
            
            // If there are conversations but none is selected, select the most recent one
            if (conversations.length > 0 && !currentConversationId) {
                switchConversation(conversations[0].id);
            }
        } else {
            conversations = [];
            renderConversations();
        }
    } catch (error) {
        console.error('Failed to load conversations:', error);
        utils.showError('Unable to load conversations. Please refresh the page.');
        conversations = [];
        renderConversations();
    }
}

async function loadConversationMessages(conversationId) {
    try {
        if (!conversationId) return;
        const response = await api.getConversationMessages(conversationId);
        chatHistory = response.messages || [];
        renderChatHistory();
    } catch (error) {
        console.error('Failed to load conversation messages:', error);
    }
}

function switchConversation(conversationId) {
    currentConversationId = conversationId;
    // Update UI to show active conversation
    const conversationElements = document.querySelectorAll('.conversation-item');
    conversationElements.forEach(el => {
        el.classList.toggle('active', el.dataset.id === conversationId);
    });
    loadConversationMessages(conversationId);
}

function renderConversations() {
    const conversationsList = document.getElementById('conversations-list');
    conversationsList.innerHTML = '';

    conversations.forEach(conv => {
        const convDiv = document.createElement('div');
        convDiv.className = `conversation-item ${conv.id === currentConversationId ? 'active' : ''}`;
        convDiv.dataset.id = conv.id;
        convDiv.innerHTML = `
            <span class="conversation-title">${utils.sanitizeHTML(conv.title)}</span>
            <span class="conversation-date">${utils.formatDate(conv.created_at)}</span>
        `;
        convDiv.addEventListener('click', () => switchConversation(conv.id));
        conversationsList.appendChild(convDiv);
    });
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

    // Sort messages by timestamp
    const sortedMessages = [...chatHistory].sort((a, b) => {
        return new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP);
    });

    sortedMessages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.chat_type}`;
        const formattedDate = utils.formatDate(message.TIMESTAMP);
        
        messageDiv.innerHTML = `
            <div class="message-content">${utils.sanitizeHTML(message.message)}</div>
            <div class="message-timestamp" title="${formattedDate}">${formattedDate}</div>
        `;
        chatContainer.appendChild(messageDiv);
    });
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
