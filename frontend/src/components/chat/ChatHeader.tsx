
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function ChatHeader() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/');
  };

  return (
    <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
      <div className="flex space-x-2">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
        />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
      </div>
      <div className="flex space-x-8 text-white/60 text-sm font-light transition-opacity duration-500">
        <span className="text-white transition-opacity duration-500">1. Data Pipeline</span>
        <span className="transition-opacity duration-500">2. Collect Data</span>
        <span className="transition-opacity duration-500">3. Train Model</span>
      </div>
    </div>
  );
}
