import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  email: string;
  id: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signup: (email: string, _password: string) => Promise<{ success: boolean; message?: string }>;
  login: (email: string, _password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/auth_status', {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok && data.authenticated && data.user) {
        setUser(data.user);
        // Start periodic checks 5 minutes before expiry
        setTimeout(checkAuthStatus, (3600 - 300) * 1000);
      } else if (response.status === 401 || data.code === 'PGRST301') {
        // Token expired - handle gracefully
        setUser(null);
        await logout();
        window.location.href = '/login?message=Your session has expired. Please log in again.';
      } else {
        setUser(null);
      }

      // If session is approaching expiry, refresh it
      if (data.sessionExpiresIn && data.sessionExpiresIn < 300) {
        const refreshResponse = await fetch('/refresh_session', {
          method: 'POST',
          credentials: 'include'
        });
        if (!refreshResponse.ok) {
          throw new Error('Session refresh failed');
        }
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setUser(null);
      if (error instanceof TypeError) {
        setTimeout(checkAuthStatus, 5000);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, _password: string) => {
    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', _password);

      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        await checkAuthStatus(); // Refresh user data after successful login
        return { success: true };
      }
      
      return { 
        success: false, 
        message: data.message || 'Login failed'
      };
    } catch (error) {
      return { 
        success: false, 
        message: 'Login failed. Please try again.'
      };
    }
  };

  const signup = async (email: string, _password: string) => {
    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', _password);

      const response = await fetch('/api/signup', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        return { success: true };
      }
      
      return { 
        success: false, 
        message: data.message || 'Signup failed'
      };
    } catch (error) {
      return { 
        success: false, 
        message: 'Signup failed. Please try again.'
      };
    }
  };

  const logout = async () => {
    try {
      await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
