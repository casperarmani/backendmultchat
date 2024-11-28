// API service for handling backend communications
const api = {
    async checkAuth() {
        try {
            const response = await fetch('/auth_status');
            const data = await response.json();
            return data.authenticated;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    },

    async login(email, password) {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const response = await fetch('/login', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        return response.json();
    },

    async signup(email, password) {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const response = await fetch('/signup', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Signup failed');
        }

        return response.json();
    },

    async logout() {
        const response = await fetch('/logout', {
            method: 'POST'
        });
        return response.ok;
    },

    async createConversation(title) {
        const formData = new FormData();
        formData.append('title', title);
        const response = await fetch('/conversations', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error('Failed to create conversation');
        }
        return response.json();
    },

    async getConversations() {
        const response = await fetch('/conversations');
        if (!response.ok) {
            throw new Error('Failed to fetch conversations');
        }
        return response.json();
    },

    async getConversationMessages(conversationId) {
        const response = await fetch(`/conversations/${conversationId}/messages`);
        if (!response.ok) {
            throw new Error('Failed to fetch conversation messages');
        }
        return response.json();
    },

    // Store active requests
    _activeRequests: new Map(),

    // Cancel previous request if it exists
    _cancelPreviousRequest(requestKey) {
        if (this._activeRequests.has(requestKey)) {
            this._activeRequests.get(requestKey).abort();
            this._activeRequests.delete(requestKey);
        }
    },

    async sendMessage(message, videos = [], conversationId = null) {
        const requestKey = `sendMessage_${conversationId}`;
        this._cancelPreviousRequest(requestKey);

        const controller = new AbortController();
        this._activeRequests.set(requestKey, controller);

        try {
            const formData = new FormData();
            formData.append('message', message);
            if (conversationId) {
                formData.append('conversation_id', conversationId);
            }
            
            videos.forEach(video => {
                formData.append('videos', video);
            });

            const response = await fetch('/send_message', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            return response.json();
        } finally {
            this._activeRequests.delete(requestKey);
        }
    },

    async updateConversationTitle(conversationId, title) {
        const formData = new FormData();
        formData.append('title', title);
        const response = await fetch(`/conversations/${conversationId}`, {
            method: 'PUT',
            body: formData
        });
        if (!response.ok) {
            throw new Error('Failed to update conversation title');
        }
        return response.json();
    },

    async getChatHistory() {
        const response = await fetch('/chat_history');
        if (!response.ok) {
            throw new Error('Failed to fetch chat history');
        }
        return response.json();
    },

    async getVideoAnalysisHistory() {
        const response = await fetch('/video_analysis_history');
        if (!response.ok) {
            throw new Error('Failed to fetch video analysis history');
        }
        return response.json();
    },

    async checkHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            return health.status === 'healthy';
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
};
