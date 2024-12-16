import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GlassCard } from './GlassCard';
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <GlassCard className="px-6 py-4 rounded-none border-t-0 border-x-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 mr-8">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link to="#features" className="text-gray-600 hover:text-gray-800 transition-colors">Features</Link>
              <Link to="#solutions" className="text-gray-600 hover:text-gray-800 transition-colors">Solutions</Link>
              <Link to="#pricing" className="text-gray-600 hover:text-gray-800 transition-colors">Pricing</Link>
              <Link to="#about" className="text-gray-600 hover:text-gray-800 transition-colors">About</Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
          {user ? (
            <Button onClick={handleLogout} variant="ghost" className="text-gray-600 hover:text-gray-800 hover:bg-gray-100">
              Log out
            </Button>
          ) : (
            <Link to="/login">
              <Button variant="ghost" className="text-gray-600 hover:text-gray-800 hover:bg-gray-100">
                Log in
              </Button>
            </Link>
          )}
            
            <Link to="/app">
              <Button className="bg-gray-800 hover:bg-gray-900 text-white">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </GlassCard>
    </nav>
  );
}