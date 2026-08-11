// FileUploader.jsx
import React, { useState } from 'react';
import { parseLargeFileInWorker } from '../utils/workerParseHelper';

const FileUploader = ({
  setTotalFilesLength,
  setFilesData,
  clearFull,
  setIsLoading,
}) => {
  const [progress, setProgress] = useState(0);

  const handleFileChange = (event) => {
    const { files } = event.target;
    if (!files || !files.length) return;

    clearFull();
    setProgress(0);
    setIsLoading(true);
    Array.from(files).forEach(async (file) => {
      const extension = file.name.split('.').pop().toLowerCase();
      const fileType = extension === 'xml' ? 'xml' : 'dxf';
      try {
        // Now pass an onProgress callback:
        const rawParsedData = await parseLargeFileInWorker({
          fileType,
          file,
          onProgress: (val) => {
            setProgress(val);
          },
        });
        // Once done, we can store the final data
        setFilesData((prev) => [
          ...prev,
          { content: rawParsedData, name: file.name },
        ]);
      } catch (err) {
        setIsLoading(false);
        console.error('Worker parse error:', err);
      }
    });
    setTotalFilesLength(files.length);
  };

  return (
    <div>
      <label>
        <strong>File Uploader</strong>
        <input
          type='file'
          multiple
          accept='.xml,.dxf'
          onChange={handleFileChange}
          className='block mb-[10px]'
        />
      </label>

      {/* Simple progress display */}
      {progress > 0 && progress < 100 && (
        <div>
          <p>Parsing... {progress}%</p>
          {/* Or a real progress bar */}
          <progress value={progress} max='100'>
            {progress}%
          </progress>
        </div>
      )}
    </div>
  );
};

export { FileUploader };
