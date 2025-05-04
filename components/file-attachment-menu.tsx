'use client';

import { useState, useRef } from 'react';
import { 
  PaperclipIcon, 
  FileIcon, 
  UploadIcon, 
  CrossIcon,
  CrossSmallIcon 
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface FileAttachmentMenuProps {
  onFileSelect: (file: File | null) => void;
  onDriveSelect: () => void;
}

export function FileAttachmentMenu({ onFileSelect, onDriveSelect }: FileAttachmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size should not exceed 10MB');
        return;
      }
      
      onFileSelect(file);
      
      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDriveSelect = () => {
    onDriveSelect();
    setIsOpen(false);
  };
  
  return (
    <div className="relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
      />
      
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
          >
            <PaperclipIcon size={14} />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          className="w-60 bg-background border-zinc-300 dark:border-zinc-700 rounded-md p-0 overflow-hidden"
          align="start"
          side="top"
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Add file reference</h3>
              <Button
                variant="ghost"
                className="p-1 h-6 w-6 rounded-full"
                onClick={() => setIsOpen(false)}
              >
                <CrossSmallIcon size={12} />
              </Button>
            </div>
          </div>
          
          <div className="p-2">
            <DropdownMenuItem 
              className="flex items-center px-3 py-2 cursor-pointer" 
              onClick={handleDriveSelect}
            >
              <FileIcon size={16} className="mr-2 text-green-500" />
              <div className="flex flex-col">
                <span className="text-sm">Choose from NoCarbon Drive</span>
                <span className="text-xs text-muted-foreground">Select from your saved files</span>
              </div>
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              className="flex items-center px-3 py-2 cursor-pointer" 
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon size={16} className="mr-2 text-blue-500" />
              <div className="flex flex-col">
                <span className="text-sm">Add a temporary file</span>
                <span className="text-xs text-muted-foreground">Upload just for this conversation</span>
              </div>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
