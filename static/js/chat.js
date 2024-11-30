// Chat functionality
window.chatHistory = [];
window.analysisHistory = [];
window.conversations = [];
window.currentConversationId = null;
window.chatHistoryContainer = null;

async function initChat() {
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');
    window.chatHistoryContainer = document.getElementById('chat-history');

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
        // Continue execution even if initial load fails
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
            chatHistory.push(userMessage);
            renderChatHistory();
            
            // Start polling for bot response
            let pollAttempts = 0;
            const maxAttempts = 30; // 30 seconds with 1-second intervals
            
            const pollInterval = setInterval(async () => {
                try {
                    pollAttempts++;
                    const messages = await api.getConversationMessages(currentConversationId);
                    const botMessages = messages.messages.filter(msg => 
                        msg.chat_type === 'bot' && 
                        new Date(msg.TIMESTAMP) > new Date(timestamp)
                    );
                    
                    if (botMessages.length > 0) {
                        const latestBotMessage = botMessages.sort((a, b) => 
                            new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP)
                        )[0];
                        
                        // Check if this bot message is already in our chat history
                        if (!chatHistory.some(msg => 
                            msg.chat_type === 'bot' && 
                            msg.TIMESTAMP === latestBotMessage.TIMESTAMP)) {
                            clearInterval(pollInterval);
                            chatHistory.push(latestBotMessage);
                            renderChatHistory();
                        }
                    }
                    
                    // Stop polling after max attempts
                    if (pollAttempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        console.log('Stopped polling for bot response after timeout');
                    }
                } catch (error) {
                    console.error('Error polling for bot response:', error);
                    clearInterval(pollInterval);
                }
            }, 1000);
            
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
        } else {
            chatHistory = [];
        }
        renderChatHistory();
    } catch (error) {
        console.error('Failed to load conversation messages:', error);
        chatHistory = [];
        renderChatHistory();
    }
}

async function switchConversation(conversationId) {
    try {
        currentConversationId = conversationId;
        // Update UI to show active conversation
        const conversationElements = document.querySelectorAll('.conversation-item');
        conversationElements.forEach(el => {
            el.classList.toggle('active', el.dataset.id === conversationId);
        });
        await loadConversationMessages(conversationId);
        
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

function renderChatHistory() {
    chatHistoryContainer.innerHTML = '';

    // Sort messages by timestamp in descending order for newest first
    const sortedMessages = [...chatHistory].sort((a, b) => {
        return new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP);
    });

    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    sortedMessages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.chat_type}`;
        const formattedDate = utils.formatDate(message.TIMESTAMP);
        
        messageDiv.innerHTML = `
            <div class="message-content">${utils.sanitizeHTML(message.message)}</div>
            <div class="message-timestamp" title="${formattedDate}">${formattedDate}</div>
        `;
        fragment.appendChild(messageDiv);
    });
    
    // Clear and append all messages at once
    chatHistoryContainer.innerHTML = '';
    chatHistoryContainer.appendChild(fragment);
    
    // Smooth scroll to bottom with animation
    requestAnimationFrame(() => {
        chatHistoryContainer.scrollTo({
            top: chatHistoryContainer.scrollHeight,
            behavior: 'smooth'
        });
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
