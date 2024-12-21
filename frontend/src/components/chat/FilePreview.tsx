
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const [duration, setDuration] = useState(0);
  
  useEffect(() => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = URL.createObjectURL(file);
    videoElement.onloadedmetadata = () => {
      const calculatedDuration = Math.ceil(videoElement.duration);
      URL.revokeObjectURL(videoElement.src);
      setDuration(calculatedDuration);
    };
  }, [file]);

  return (
    <div className="flex items-center justify-between bg-white/5 rounded-lg p-2">
      <div className="flex items-center text-white/80">
        <span className="text-sm truncate">{file.name}</span>
        <span className="text-xs text-white/40 ml-2">
          ({(file.size / (1024 * 1024)).toFixed(2)} MB) • {duration} tokens
        </span>
      </div>
      <button
        onClick={onRemove}
        className="text-white/40 hover:text-white/80 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
