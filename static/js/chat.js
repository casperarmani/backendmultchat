// Chat functionality
window.chatHistory = [];
window.analysisHistory = [];
window.conversations = [];
window.currentConversationId = null;
window.chatHistoryContainer = null;
window.currentPollInterval = null;
window.messageObserver = null;
window.lastMessageTimestamp = null;
window.retryCount = 0;
const MAX_RETRIES = 3;
const INITIAL_POLL_INTERVAL = 1000;
const MAX_POLL_INTERVAL = 10000;
const BATCH_SIZE = 20;
const RETRY_DELAY = 1000;

async function initChat() {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');
    window.chatHistoryContainer = document.getElementById('chat-history');

    // Initialize IntersectionObserver for lazy loading
    initializeMessageObserver();

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
    chatHistoryContainer.parentElement.insertBefore(conversationsContainer, chatHistoryContainer);

    // Setup event listeners
    document.getElementById('new-conversation-btn').addEventListener('click', createNewConversation);

    // Load initial data
    try {
        await Promise.all([
            loadConversations(),
            loadAnalysisHistory()
        ]);
    } catch (error) {
        console.error('Error loading initial data:', error);
    }

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

            // Add user message to UI immediately
            const timestamp = new Date().toISOString();
            const userMessage = {
                message: message,
                chat_type: 'user',
                TIMESTAMP: timestamp,
                conversation_id: currentConversationId
            };
            
            // Add to chat history and render
            addMessageToHistory(userMessage);
            
            // Reset polling interval and start immediate polling
            resetPolling();
            
            // Only reload analysis history if videos were uploaded
            if (videos && videos.length > 0) {
                await loadAnalysisHistory();
            }
        } catch (error) {
            utils.showError('Failed to send message');
            console.error('Error sending message:', error);
        } finally {
            messageInput.disabled = false;
        }
    });
}

function initializeMessageObserver() {
    if (messageObserver) {
        messageObserver.disconnect();
    }
    
    messageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                messageObserver.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.1
    });
}

function resetPolling() {
    if (currentPollInterval) {
        clearInterval(currentPollInterval);
    }
    startPolling(INITIAL_POLL_INTERVAL);
}

function startPolling(interval) {
    let currentInterval = interval;
    let consecutiveEmptyResponses = 0;
    
    currentPollInterval = setInterval(async () => {
        try {
            const messages = await fetchNewMessages();
            
            if (messages && messages.length > 0) {
                messages.forEach(msg => addMessageToHistory(msg));
                consecutiveEmptyResponses = 0;
                currentInterval = INITIAL_POLL_INTERVAL;
            } else {
                consecutiveEmptyResponses++;
                if (consecutiveEmptyResponses >= 2) {
                    currentInterval = Math.min(currentInterval * 2, MAX_POLL_INTERVAL);
                    resetPolling();
                }
            }
        } catch (error) {
            console.error('Error polling for messages:', error);
            retryCount++;
            if (retryCount >= MAX_RETRIES) {
                clearInterval(currentPollInterval);
                utils.showError('Failed to fetch messages. Please refresh the page.');
            }
        }
    }, currentInterval);
}

async function fetchNewMessages() {
    const timestamp = lastMessageTimestamp || new Date(0).toISOString();
    try {
        const response = await api.getConversationMessages(
            currentConversationId,
            { since: timestamp }
        );
        
        if (response && Array.isArray(response.messages)) {
            const newMessages = response.messages.filter(msg => 
                !chatHistory.some(existing => existing.TIMESTAMP === msg.TIMESTAMP)
            );
            
            if (newMessages.length > 0) {
                lastMessageTimestamp = newMessages[newMessages.length - 1].TIMESTAMP;
            }
            
            return newMessages;
        }
        return [];
    } catch (error) {
        throw error;
    }
}

function addMessageToHistory(message) {
    // Only add to history if message doesn't already exist
    if (!chatHistory.some(m => m.TIMESTAMP === message.TIMESTAMP)) {
        chatHistory.push(message);
        
        // Update last message timestamp
        const messageTimestamp = new Date(message.TIMESTAMP);
        if (!lastMessageTimestamp || messageTimestamp > new Date(lastMessageTimestamp)) {
            lastMessageTimestamp = message.TIMESTAMP;
        }
        
        // Trigger a single render
        renderChatHistory();
    }
}

function cleanupChat() {
    // Clear existing intervals
    if (currentPollInterval) {
        clearInterval(currentPollInterval);
        currentPollInterval = null;
    }
    
    // Clear message observer
    if (messageObserver) {
        messageObserver.disconnect();
    }
    
    // Clear chat history and reset timestamps
    chatHistory = [];
    lastMessageTimestamp = null;
    retryCount = 0;
    
    // Clear DOM
    if (chatHistoryContainer) {
        chatHistoryContainer.innerHTML = '';
    }
}

async function switchConversation(conversationId) {
    try {
        // Cleanup current chat state
        cleanupChat();
        
        currentConversationId = conversationId;
        // Update UI to show active conversation
        const conversationElements = document.querySelectorAll('.conversation-item');
        conversationElements.forEach(el => {
            el.classList.toggle('active', el.dataset.id === conversationId);
        });
        
        // Initialize new chat state
        initializeMessageObserver();
        await loadConversationMessages(conversationId);
        resetPolling();
        
        // Clear chat input
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
        }
    } catch (error) {
        console.error('Error switching conversation:', error);
        utils.showError('Failed to switch conversation. Please try again.');
    }
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
        conversations = response?.conversations || [];
        renderConversations();
        
        // If there are conversations but none is selected, select the most recent one
        if (conversations.length > 0 && !currentConversationId) {
            switchConversation(conversations[0].id);
        }
    } catch (error) {
        console.error('Failed to load conversations:', error);
        conversations = [];
        renderConversations();
    }
}

async function loadConversationMessages(conversationId) {
    try {
        if (!conversationId) return;
        const response = await api.getConversationMessages(conversationId);
        if (response && Array.isArray(response.messages)) {
            chatHistory = response.messages;
            lastMessageTimestamp = chatHistory.length > 0 
                ? chatHistory[chatHistory.length - 1].TIMESTAMP 
                : new Date(0).toISOString();
            
            // Ensure the chat container is cleared before rendering
            if (chatHistoryContainer) {
                chatHistoryContainer.innerHTML = '';
            }
            
            // Force immediate render
            await renderChatHistory();
        }
    } catch (error) {
        console.error('Failed to load conversation messages:', error);
        chatHistory = [];
        renderChatHistory();
    }
}

function renderChatHistory() {
    if (!chatHistoryContainer) return;
    chatHistoryContainer.innerHTML = '';
    
    const sortedMessages = [...chatHistory].sort((a, b) => 
        new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP)
    );
    
    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    sortedMessages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.chat_type}`;
        const formattedDate = utils.formatDate(message.TIMESTAMP);
        
        messageDiv.innerHTML = `
            <div class="message-content">${utils.sanitizeHTML(message.message)}</div>
            <div class="message-timestamp" data-timestamp="${message.TIMESTAMP}" title="${formattedDate}">${formattedDate}</div>
        `;
        
        fragment.appendChild(messageDiv);
        
        // Observe after adding to fragment
        if (messageObserver) {
            messageObserver.observe(messageDiv);
        }
    });
    
    // Append all messages at once
    requestAnimationFrame(() => {
        chatHistoryContainer.appendChild(fragment);
        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    });
}

function renderConversations() {
    const conversationsList = document.getElementById('conversations-list');
    conversationsList.innerHTML = '';

    conversations.forEach(conv => {
        const convDiv = document.createElement('div');
        convDiv.className = `conversation-item ${conv.id === currentConversationId ? 'active' : ''}`;
        convDiv.dataset.id = conv.id;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'conversation-content';
        contentDiv.innerHTML = `
            <span class="conversation-title">${utils.sanitizeHTML(conv.title)}</span>
            <span class="conversation-date">${utils.formatDate(conv.created_at)}</span>
        `;
        contentDiv.addEventListener('click', () => switchConversation(conv.id));
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'conversation-actions';
        
        const renameButton = document.createElement('button');
        renameButton.className = 'conversation-rename-btn';
        renameButton.innerHTML = '✏️';
        renameButton.title = 'Rename conversation';
        renameButton.onclick = (e) => {
            e.stopPropagation();
            renameConversation(conv.id);
        };
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'conversation-delete-btn';
        deleteButton.innerHTML = '🗑️';
        deleteButton.title = 'Delete conversation';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            deleteConversation(conv.id);
        };
        
        actionsDiv.appendChild(renameButton);
        actionsDiv.appendChild(deleteButton);
        
        convDiv.appendChild(contentDiv);
        convDiv.appendChild(actionsDiv);
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

async function renameConversation(conversationId) {
    try {
        const conversation = conversations.find(c => c.id === conversationId);
        if (!conversation) {
            utils.showError('Conversation not found');
            return;
        }

        const newTitle = prompt('Enter new conversation title:', conversation.title);
        if (!newTitle) {
            return; // User cancelled
        }

        if (!newTitle.trim()) {
            utils.showError('Title cannot be empty');
            return;
        }

        const response = await api.updateConversationTitle(conversationId, newTitle);
        if (response && response.conversation) {
            // Update local state with the response data
            const index = conversations.findIndex(c => c.id === conversationId);
            if (index !== -1) {
                conversations[index] = response.conversation;
            }
            renderConversations();
        }
    } catch (error) {
        console.error('Failed to rename conversation:', error);
        utils.showError(error.message || 'Failed to rename conversation. Please try again.');
    }
}

async function deleteConversation(conversationId) {
    try {
        const conversation = conversations.find(c => c.id === conversationId);
        if (!conversation) {
            utils.showError('Conversation not found');
            return;
        }

        if (!confirm(`Are you sure you want to delete "${conversation.title}"? This action cannot be undone.`)) {
            return;
        }

        const response = await api.deleteConversation(conversationId);
        if (response && response.success === true) {
            // Remove from local state
            conversations = conversations.filter(c => c.id !== conversationId);
            
            // If the deleted conversation was current, switch to the most recent one
            if (currentConversationId === conversationId) {
                currentConversationId = conversations.length > 0 ? conversations[0].id : null;
                if (currentConversationId) {
                    await loadConversationMessages(currentConversationId);
                } else {
                    chatHistory = [];
                    renderChatHistory();
                }
            }
            
            renderConversations();
        }
    } catch (error) {
        console.error('Failed to delete conversation:', error);
        utils.showError(error.message || 'Failed to delete conversation. Please try again.');
        
        // Refresh conversations list to ensure consistency
        await loadConversations();
    }
}