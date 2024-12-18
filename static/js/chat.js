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
const INITIAL_POLL_INTERVAL = 1000; // 1 second
const MAX_POLL_INTERVAL = 1000;     // Keep consistent at 1 second
const BATCH_SIZE = 20;
const RETRY_DELAY = 1000;

// File upload handling
let selectedFiles = new Set();

async function validateVideo(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src);
            resolve(video.duration);
        };

        video.onerror = function() {
            window.URL.revokeObjectURL(video.src);
            reject(new Error('Error loading video metadata'));
        };

        video.src = URL.createObjectURL(file);
    });
}

async function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    const uploadPreview = document.querySelector('.upload-preview') || createUploadPreview();
    const currentTokens = parseInt(document.getElementById('current-tokens').textContent);
    
    for (const file of files) {
        if (!file.type.startsWith('video/')) {
            utils.showError('Only video files are supported');
            continue;
        }

        try {
            const duration = await validateVideo(file);
            const requiredTokens = Math.ceil(duration);

            if (requiredTokens > currentTokens) {
                utils.showError(`Video duration (${Math.ceil(duration)}s) exceeds available tokens (${currentTokens}). Please upload a shorter video or get more tokens.`);
                continue;
            }

            if (!selectedFiles.has(file)) {
                selectedFiles.add(file);
                const fileItem = createFilePreviewItem(file);
                const durationSpan = document.createElement('span');
                durationSpan.className = 'file-duration';
                durationSpan.textContent = ` (${Math.ceil(duration)}s)`;
                fileItem.querySelector('.file-name').appendChild(durationSpan);
                uploadPreview.appendChild(fileItem);
            }
        } catch (error) {
            utils.showError('Error validating video: ' + error.message);
            continue;
        }
    }
    
    updateUploadStatus();
}

function createUploadPreview() {
    const uploadContainer = document.querySelector('.upload-container');
    const previewDiv = document.createElement('div');
    previewDiv.className = 'upload-preview';
    uploadContainer.appendChild(previewDiv);
    return previewDiv;
}

function createFilePreviewItem(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = () => removeFile(file, fileItem);
    
    fileItem.appendChild(fileName);
    fileItem.appendChild(removeBtn);
    return fileItem;
}

function removeFile(file, fileItem) {
    selectedFiles.delete(file);
    fileItem.remove();
    updateUploadStatus();
}

async function updateUploadStatus() {
    const uploadStatus = document.getElementById('upload-status');
    if (selectedFiles.size > 0) {
        let totalDuration = 0;
        for (const file of selectedFiles) {
            try {
                const duration = await validateVideo(file);
                totalDuration += Math.ceil(duration);
            } catch (error) {
                console.error('Error calculating duration:', error);
            }
        }
        const currentTokens = parseInt(document.getElementById('current-tokens').textContent);
        uploadStatus.textContent = `${selectedFiles.size} file(s) selected - Total duration: ${totalDuration}s (${totalDuration} tokens required, ${currentTokens} available)`;
        uploadStatus.className = 'upload-status';
    } else {
        uploadStatus.textContent = '';
    }
}

async function updateTokenInfo() {
    try {
        const response = await fetch('/user/tokens');
        const data = await response.json();
        
        document.getElementById('current-tokens').textContent = `${data.token_balance} tokens`;
        document.getElementById('current-plan').textContent = 
            `${data.subscription.subscription_tiers.tier_name} Plan - ${data.subscription.subscription_tiers.tokens} tokens`;
    } catch (error) {
        console.error('Error fetching token info:', error);
        document.getElementById('current-tokens').textContent = 'Error loading tokens';
        document.getElementById('current-plan').textContent = 'Error loading plan';
    }
}

async function initChat() {
    // Reset all chat state
    window.chatHistory = [];
    window.analysisHistory = [];
    window.conversations = [];
    window.currentConversationId = null;
    window.lastMessageTimestamp = null;
    window.retryCount = 0;
    
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const videoUpload = document.getElementById('video-upload');
    const uploadStatus = document.getElementById('upload-status');
    window.chatHistoryContainer = document.getElementById('chat-history');
    
    if (window.currentPollInterval) {
        clearInterval(window.currentPollInterval);
        window.currentPollInterval = null;
    }
    
    videoUpload.addEventListener('change', handleFileSelect);
    initializeMessageObserver();
    
    // Initialize token info
    await updateTokenInfo();

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

    document.getElementById('new-conversation-btn').addEventListener('click', createNewConversation);

    try {
        await Promise.all([
            loadConversations(),
            loadAnalysisHistory()
        ]);
    } catch (error) {
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Error loading initial data:', error);
        }
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = messageInput.value.trim();
        const videos = Array.from(selectedFiles);
        
        if (!message && !videos.length) {
            return;
        }

        if (!currentConversationId) {
            await createNewConversation();
        }

        try {
            messageInput.disabled = true;
            
            if (videos.length) {
                const uploadStatus = document.getElementById('upload-status');
                if (!uploadStatus) return;
                
                uploadStatus.innerHTML = ''; // Clear any existing content
                uploadStatus.style.display = 'block'; // Ensure visibility
                
                const progressContainer = document.createElement('div');
                progressContainer.className = 'progress-container';
                progressContainer.style.width = '100%';
                progressContainer.style.marginBottom = '15px';
                
                const progressText = document.createElement('div');
                progressText.className = 'progress-text';
                progressText.textContent = 'Uploading video...';
                progressText.style.marginBottom = '8px';
                progressText.style.fontWeight = '500';
                
                const progressBar = document.createElement('div');
                progressBar.className = 'upload-progress-bar';
                const progressFill = document.createElement('div');
                progressFill.className = 'progress-fill';
                
                progressBar.appendChild(progressFill);
                progressContainer.appendChild(progressText);
                progressContainer.appendChild(progressBar);
                uploadStatus.appendChild(progressContainer);
                
                // Start cosmetic loading animation
                const startTime = Date.now();
                const duration = 25000; // 25 seconds
                const animateProgress = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min((elapsed / duration) * 100, 98); // Max at 98% until complete
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = `Uploading video... ${Math.round(progress)}%`;
                    if (elapsed < duration) {
                        requestAnimationFrame(animateProgress);
                    }
                };
                requestAnimationFrame(animateProgress);
            }

            const response = await api.sendMessage(message, videos, currentConversationId);
            
            // Complete the progress bar immediately after response
            if (videos.length) {
                const progressFill = uploadStatus.querySelector('.progress-fill');
                if (progressFill) {
                    progressFill.style.width = '100%';
                    progressFill.style.transition = 'width 0.3s ease-out';
                    setTimeout(() => {
                        uploadStatus.textContent = '';
                    }, 500);
                }
            }
            
            messageInput.value = '';
            videoUpload.value = '';
            selectedFiles.clear();
            const uploadPreview = document.querySelector('.upload-preview');
            if (uploadPreview) {
                uploadPreview.innerHTML = '';
            }
            updateUploadStatus();
            uploadStatus.textContent = '';

            const timestamp = new Date().toISOString();
            const userMessage = {
                message: message,
                chat_type: 'user',
                TIMESTAMP: timestamp,
                conversation_id: currentConversationId,
                is_local: true
            };
            
            addMessageToHistory(userMessage);
            resetPolling();
            
            if (videos && videos.length > 0) {
                await loadAnalysisHistory();
            }
        } catch (error) {
            utils.showError('Failed to send message');
            const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
            if (isDevelopment) {
                console.error('Error sending message:', error);
            }
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
    if (currentPollInterval) {
        clearInterval(currentPollInterval);
    }
    
    let isPolling = false;
    let consecutiveEmptyResponses = chatHistory.length === 0 ? 5 : 0;  // Start higher for empty chats
    currentPollInterval = setInterval(async () => {
        if (isPolling || !currentConversationId) return;
        
        try {
            isPolling = true;
            const newMessages = await fetchNewMessages();
            
            if (newMessages?.length > 0) {
                consecutiveEmptyResponses = 0;
                const uniqueMessages = newMessages.filter(msg => 
                    !chatHistory.some(existing => 
                        existing.TIMESTAMP === msg.TIMESTAMP && 
                        existing.message === msg.message
                    )
                );
                
                if (uniqueMessages.length > 0) {
                    chatHistory = [...chatHistory, ...uniqueMessages];
                    lastMessageTimestamp = uniqueMessages[uniqueMessages.length - 1].TIMESTAMP;
                    renderChatHistory();
                }
            } else {
                consecutiveEmptyResponses++;
                // Increase polling interval after consecutive empty responses
                if (consecutiveEmptyResponses > 20) { // Increased threshold since we're polling more frequently
                    consecutiveEmptyResponses = 0;    // Reset counter but maintain polling rate
                }
            }
        } catch (error) {
            // Silently handle polling errors
            if (error.name === 'AbortError' || 
                error.message?.includes('No new messages') || 
                error.message?.includes('polling timeout') || 
                error.message?.includes('conversation not found') ||
                error.message?.includes('Network request failed')) {
                return;
            }
        } finally {
            isPolling = false;
        }
    }, interval);
}

async function fetchNewMessages() {
    const timestamp = lastMessageTimestamp || new Date(0).toISOString();
    try {
        const response = await api.getConversationMessages(currentConversationId);
        if (response && Array.isArray(response.messages)) {
            const newMessages = response.messages.filter(msg => {
                if (msg.chat_type === 'user') {
                    return !chatHistory.some(existing => 
                        (existing.is_local && existing.message === msg.message) || 
                        (existing.TIMESTAMP === msg.TIMESTAMP && existing.message === msg.message)
                    );
                }
                return !chatHistory.some(existing => 
                    existing.TIMESTAMP === msg.TIMESTAMP && 
                    existing.message === msg.message
                );
            });
            
            if (newMessages.length > 0) {
                lastMessageTimestamp = newMessages[newMessages.length - 1].TIMESTAMP;
            }
            return newMessages;
        }
        return [];
    } catch (error) {
        // Silent handling for expected polling scenarios
        if (error.message?.includes('No new messages') || 
            error.message?.includes('polling timeout') ||
            error.message?.includes('conversation not found') ||
            error.message?.includes('Network request failed') ||
            error.message?.includes('200 OK')) {
            return [];
        }
        // Only throw unexpected errors
        if (!error.message?.toLowerCase().includes('polling') && 
            !error.message?.toLowerCase().includes('timeout')) {
            throw error;
        }
        return [];
    }
}

function addMessageToHistory(message) {
    if (!message || !message.TIMESTAMP || !message.message) return;
    
    const isDuplicate = chatHistory.some(m => {
        if (message.is_local && m.is_local) {
            return m.message === message.message && m.chat_type === message.chat_type;
        }
        return m.TIMESTAMP === message.TIMESTAMP && 
               m.message === message.message && 
               m.chat_type === message.chat_type;
    });
    
    if (!isDuplicate) {
        chatHistory.push(message);
        const messageTimestamp = new Date(message.TIMESTAMP);
        if (!lastMessageTimestamp || messageTimestamp > new Date(lastMessageTimestamp)) {
            lastMessageTimestamp = message.TIMESTAMP;
        }
        renderChatHistory();
    }
}

function cleanupChat() {
    if (currentPollInterval) {
        clearInterval(currentPollInterval);
        currentPollInterval = null;
    }
    
    if (messageObserver) {
        messageObserver.disconnect();
    }
    
    chatHistory = [];
    lastMessageTimestamp = null;
    retryCount = 0;
    
    if (chatHistoryContainer) {
        chatHistoryContainer.innerHTML = '';
    }
}

async function switchConversation(conversationId) {
    try {
        cleanupChat();
        currentConversationId = conversationId;
        
        const conversationElements = document.querySelectorAll('.conversation-item');
        conversationElements.forEach(el => {
            el.classList.toggle('active', el.dataset.id === conversationId);
        });
        
        initializeMessageObserver();
        await loadConversationMessages(conversationId);
        
        // Start with a higher polling interval for new/empty conversations
        if (chatHistory.length === 0) {
            startPolling(MAX_POLL_INTERVAL);
        } else {
            resetPolling();
        }
        
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
        }
    } catch (error) {
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Conversation switch error:', error);
        }
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
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Error creating conversation:', error);
        }
        utils.showError('Failed to create conversation. Please try again.');
        return null;
    }
}

async function loadConversations() {
    try {
        const response = await api.getConversations();
        conversations = response?.conversations || [];
        renderConversations();
        
        if (conversations.length > 0 && !currentConversationId) {
            switchConversation(conversations[0].id);
        }
    } catch (error) {
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Failed to load conversations:', error);
        }
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
            
            if (chatHistoryContainer) {
                chatHistoryContainer.innerHTML = '';
            }
            
            await renderChatHistory();
        }
    } catch (error) {
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Failed to load conversation messages:', error);
        }
        chatHistory = [];
        renderChatHistory();
    }
}

function renderChatHistory() {
    if (!chatHistoryContainer) return;
    
    const wasScrolledToBottom = chatHistoryContainer.scrollHeight - chatHistoryContainer.scrollTop 
        <= chatHistoryContainer.clientHeight + 10;
    
    chatHistoryContainer.innerHTML = '';
    const sortedMessages = [...chatHistory].sort((a, b) => 
        new Date(a.TIMESTAMP) - new Date(b.TIMESTAMP)
    );
    
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
        
        if (messageObserver) {
            messageObserver.observe(messageDiv);
        }
    });
    
    chatHistoryContainer.appendChild(fragment);
    
    if (wasScrolledToBottom || sortedMessages[sortedMessages.length - 1]?.TIMESTAMP === lastMessageTimestamp) {
        requestAnimationFrame(() => {
            chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
        });
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
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Failed to load analysis history:', error);
        }
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
        if (!newTitle) return;

        if (!newTitle.trim()) {
            utils.showError('Title cannot be empty');
            return;
        }

        const response = await api.updateConversationTitle(conversationId, newTitle);
        if (response && response.conversation) {
            const index = conversations.findIndex(c => c.id === conversationId);
            if (index !== -1) {
                conversations[index] = response.conversation;
            }
            renderConversations();
        }
    } catch (error) {
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment) {
            console.error('Conversation rename error:', error);
        }
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
            conversations = conversations.filter(c => c.id !== conversationId);
            
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
        const isDevelopment = window.DEBUG === true || localStorage.getItem('DEBUG') === 'true';
        if (isDevelopment && error.message !== 'User cancelled deletion') {
            console.error('Error deleting conversation:', {
                conversationId,
                error: error.message || 'Unknown error'
            });
        }
        utils.showError(error.message || 'Failed to delete conversation. Please try again.');
        await loadConversations();
    }
}
