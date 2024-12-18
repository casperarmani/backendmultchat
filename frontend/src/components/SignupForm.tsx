import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';

const SignupForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const validateForm = (): boolean => {
    if(password != confirmPassword) {
      setError('Password and Confirm Password do not match. Please try again.');
      return false;
    }
    if (!email || !password) {
      setError('Email and password are required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await signup(email, password);
      if (result.success) {
        // Get the redirect path from location state, default to '/app'
        const { state } = location;
        const from = state?.from || '/app';
        navigate(from, { replace: true });
      } else {
        setError(result.message || 'Invalid email or password');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Sign up your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3">
                <div className="text-sm text-destructive">{error}</div>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm your Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
              
            <p className="text-xs">
            If you already have an account,{" "}
              <Link to="/login" className="text-blue-500 underline hover:text-blue-700">
                log in
              </Link>{" "}
              here to access your account!
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing up...' : 'Sign up'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignupForm;