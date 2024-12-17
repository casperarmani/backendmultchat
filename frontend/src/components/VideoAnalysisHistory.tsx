
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';

interface VideoHistory {
  TIMESTAMP: string;
  upload_file_name: string;
  analysis: string;
}

interface VideoAnalysisHistoryProps {
  videoHistory: VideoHistory[];
}

function VideoAnalysisHistory({ videoHistory }: VideoAnalysisHistoryProps) {
  return (
    <Card className="h-[800px] w-[400px] rounded-3xl bg-black/10 backdrop-blur-xl border border-white/10">
      <CardHeader>
        <CardTitle>Video Analysis History</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[700px] w-full rounded-md pr-4">
          {videoHistory.length > 0 ? (
            <div className="space-y-4">
              {videoHistory.map((analysis, index) => (
                <div key={index} className="rounded-lg bg-white/5 p-4">
                  <div className="text-xs text-white/60">
                    {new Date(analysis.TIMESTAMP).toLocaleString()}
                  </div>
                  <div className="mt-2 font-medium text-white/80">
                    File: {analysis.upload_file_name}
                  </div>
                  <div className="mt-1 text-sm text-white/70">{analysis.analysis}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60 text-center pt-4">
              No video analysis history available
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default VideoAnalysisHistory;
