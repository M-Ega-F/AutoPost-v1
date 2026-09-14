"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaUploader } from "./media-uploader";
import { MediaUrlInput } from "./media-url-input";
import { MediaLibraryPicker } from "./media-library-picker";
import type { ComposerMedia } from "./media-selection";

export function MediaTabs({
  onFile,
  onUrl,
  onLibrary,
  error,
  disabled = false,
}: {
  onFile: (file: File) => void;
  onUrl: (url: string) => Promise<string | null>;
  onLibrary: (media: ComposerMedia) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <Tabs defaultValue="upload" className="gap-4">
      <TabsList className="w-full sm:w-auto group-data-[orientation=horizontal]/tabs:h-11 sm:group-data-[orientation=horizontal]/tabs:h-9">
        <TabsTrigger value="upload" className="flex-1 px-4 sm:flex-none">
          Upload file
        </TabsTrigger>
        <TabsTrigger value="url" className="flex-1 px-4 sm:flex-none">
          Paste URL
        </TabsTrigger>
        <TabsTrigger value="library" className="flex-1 px-4 sm:flex-none">
          Library
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload">
        <MediaUploader onSelect={onFile} error={error} disabled={disabled} />
      </TabsContent>

      <TabsContent value="url">
        <MediaUrlInput onAdd={onUrl} disabled={disabled} />
      </TabsContent>
      <TabsContent value="library">
        <MediaLibraryPicker onSelect={onLibrary} disabled={disabled} />
      </TabsContent>
    </Tabs>
  );
}
