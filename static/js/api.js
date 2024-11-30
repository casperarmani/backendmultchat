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
            const data = await response.json();
            throw new Error(data.detail || 'Failed to create conversation');
        }
        return response.json();
    },

    async getConversations() {
        const response = await fetch('/conversations');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch conversations');
        }
        return response.json();
    },

    async getConversationMessages(conversationId) {
        try {
            const response = await fetch(`/conversations/${conversationId}/messages`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to fetch conversation messages');
            }
            return response.json();
        } catch (error) {
            // Only throw error for non-polling related issues
            if (!error.message?.includes('Failed to fetch') && 
                !error.message?.includes('conversation not found')) {
                throw error;
            }
            return { messages: [] };
        }
    },

    async sendMessage(message, videos = [], conversationId = null) {
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
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to send message');
        }

        return response.json();
    },

    async updateConversationTitle(conversationId, title) {
        try {
            if (!title || !title.trim()) {
                throw new Error('Title cannot be empty');
            }

            const formData = new FormData();
            formData.append('title', title.trim());
            const response = await fetch(`/conversations/${conversationId}`, {
                method: 'PUT',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.detail) {
                throw new Error(data.detail);
            }
            
            return data;
        } catch (error) {
            console.error('Error updating conversation title:', error);
            throw error;
        }
    },

    async deleteConversation(conversationId) {
        try {
            if (!conversationId) {
                throw new Error('Invalid conversation ID');
            }

            const response = await fetch(`/conversations/${conversationId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.detail) {
                throw new Error(data.detail);
            }
            
            return data;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw error;
        }
    },

    async getChatHistory() {
        const response = await fetch('/chat_history');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch chat history');
        }
        return response.json();
    },

    async getVideoAnalysisHistory() {
        const response = await fetch('/video_analysis_history');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch video analysis history');
        }
        return response.json();
    },

    async checkHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            return health.status === 'healthy';
        } catch (error) {
            // Only log health check errors in development mode
            if (window.DEBUG || localStorage.getItem('DEBUG') === 'true') {
                console.error('Health check failed:', error);
            }
            return false;
        }
    }
};
