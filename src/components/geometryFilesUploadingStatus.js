import React from 'react';
import { Button, Flex, Modal, Space, Typography, Spin } from 'antd';
const { Title } = Typography;

const GeometryFilesUploadingStatus = ({
  fileCreationStart,
  showProgressModal,
  progressStates,
}) => {
  const groupedByOriginalFile = {};

  // Group files by original file name
  Object.keys(progressStates).forEach((fileKey) => {
    const originalFileName = fileKey.replace(
      /_(geometry_data\.bin|bvh_data\.bin|breakline_edges\.bin|image_blob\.bin|⁠uv_data\.bin)$/i,
      ''
    );
    if (!groupedByOriginalFile[originalFileName]) {
      groupedByOriginalFile[originalFileName] = [];
    }
    groupedByOriginalFile[originalFileName].push({
      fileKey,
      ...progressStates[fileKey],
    });
  });
  const modalStyles = {
    content: {
      height: 'calc(80vh - 50px)',
      maxHeight: 'calc(80vh - 50px)',
      overflowY: 'auto',
      zIndex: 99999,
    },
    mask: { zIndex: 100 },
  };
  return (
    <Modal
      title={<Title level={2}>Uploading Files</Title>}
      open={showProgressModal}
      destroyOnClose
      width={'60%'}
      styles={modalStyles}
      footer={[]}
    >
      {fileCreationStart ? <Spin>Loading...</Spin> : null}
      {Object.entries(groupedByOriginalFile).map(
        ([originalFileName, files]) => (
          <div key={originalFileName} style={{ marginBottom: '20px' }}>
            <h3>{originalFileName}</h3>
            {files.map((file) => (
              <Flex
                vertical
                justify='center'
                align='start'
                key={file.fileKey}
                style={{ paddingLeft: '10px', marginBottom: '10px' }}
              >
                <div>
                  <strong>{file.fileKey.split('_')[1]}: </strong>
                </div>
                {file.creating < 100 && file.status !== 'error' && (
                  <div>
                    Creating file:
                    <progress
                      value={file.creating}
                      max='100'
                      style={{ width: '200px', marginLeft: '10px' }}
                    />
                    <span style={{ marginLeft: '5px' }}>{file.creating}%</span>
                  </div>
                )}
                {file.uploading < 100 && file.status !== 'error' && (
                  <div>
                    Uploading file:
                    <progress
                      value={file.uploading}
                      max='100'
                      style={{ width: '200px', marginLeft: '10px' }}
                    />
                    <span style={{ marginLeft: '5px' }}>{file.uploading}%</span>
                  </div>
                )}
                {file.uploading == 100 && (
                  <div>
                    {file.status === 'success'
                      ? 'Uploading Completed'
                      : 'Uploading Failed'}
                  </div>
                )}
              </Flex>
            ))}
          </div>
        )
      )}
    </Modal>
  );
};

export default GeometryFilesUploadingStatus;
