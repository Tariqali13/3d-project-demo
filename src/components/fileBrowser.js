'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Button,
  Divider,
  Flex,
  Modal,
  Spin,
  List,
  Card,
  Checkbox,
  Breadcrumb,
} from 'antd';
import axios from 'axios';
import { parseLargeFileInWorker } from '../utils/workerParseHelper';
import { primaryColor } from '../constants/theme';
import { unzipLargeFileInWorker } from '../utils/unzipWorkerHelper';

async function fetchWithProgress(url, type = '', onProgress) {
  const response = await axios.get(url, {
    responseType: type === 'pslz' ? 'arraybuffer' : 'blob',
    onDownloadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percentCompleted);
      }
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percentCompleted);
      }
    },
  });
  return response;
}

const FileBrowser = ({
  showBrowserFiles,
  setShowBrowserFiles,
  setFilesData,
  setTotalFilesLength,
  clearFull,
  authState,
  setZipFilesData,
  selectedFiles,
  setSelectedFiles,
  setSelectedFilesToUpload,
  setProjectId,
  setFilesDataSaved,
  filesDataSaved,
}) => {
  let org_id = authState?.user?.org_id;
  if (authState?.user?.role == 66) org_id = authState?.user?.id;
  const referrerDomain = document.referrer
    ? new URL(document.referrer).origin
    : `https://vsptracker.nz`;
  const baseUrl = ({ prefix = '', selectedSiteId = '' }) => {
    return `${referrerDomain}/api/v1/mvporgsprojects/show?id=${selectedSiteId.id}&type=1&prefix=${prefix}&role=${authState.user.role}&isAdminLoggedIn=${authState.isAdminLoggedIn}&token=${token}`;
  };
  const allowTypes = ['xml', 'dxf', 'pslz'];
  const [progress, setProgress] = useState(0);

  const [currentAWSData, setCurrentAWSData] = useState([]);
  const [itemsData, setItemsData] = useState([]);
  const [previousFolder, setPreviousFolder] = useState(['Sites']);
  const [breadcrumbItems, setBreadcrumbItems] = useState([]);
  const [isLoading, setIsLoading] = useState([]);
  const [awsSignedUrls, setAwsSignedUrls] = useState([]);
  const [allFilesData, setAllFilesData] = useState([]);
  const [apiProgress, setApiProgress] = useState(0);
  const [zipProgress, setZipProgress] = useState(0);
  const [sitesList, setSitesList] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [selectedPrefix, setSelectedPrefix] = useState(null);
  const fetchedUrls = useRef(new Set());

  const queryParameters = new URLSearchParams(window.location.search);
  const token = queryParameters.get('token');
  const closeBrowserFileModal = (e) => {
    e.stopPropagation();
    setShowBrowserFiles(!showBrowserFiles);
  };

  const fetchAwsFileStructure = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(baseUrl({ selectedSiteId }));
      const filesData = response.data.data.files;
      const filterFiles = filesData.filter((fil) => {
        const type = fil.relative_path.split('.').pop().toLowerCase();
        if (allowTypes.includes(type) || fil.fileFolder.isFolder) {
          return fil;
        }
      });
      if (filterFiles.length) {
        setCurrentAWSData(filterFiles);
      } else {
        setCurrentAWSData([]);
      }
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);

      console.error('Error fetching AWS file structure:', error);
    }
  };
  const modalStyles = {
    top: '25px',
    body: {
      height: '540px',
      overflowY: 'scroll',
    },
    content: {
      height: 'calc(100vh - 40px)',
      maxHeight: 'calc(100vh - 40px)',
      overflowY: 'auto',
      zIndex: 99999,
    },
    mask: { zIndex: 100 },
  };
  const fetchSites = async () => {
    try {
      setIsLoading(true);

      const response = await axios.get(
        `${referrerDomain}/api/v1/mvporgsprojects/list?showInactive=0&org_id=${org_id}&token=${token}`
        // { headers: headers }
      );
      if (response.data.success) {
        setSitesList(response.data.data || []);
        setIsLoading(false);
      }
    } catch (err) {
      setIsLoading(false);
      console.error('Failed to fetch sites:', err);
    }
  };
  useEffect(() => {
    fetchSites();
  }, []);
  useEffect(() => {
    if (currentAWSData.length) {
      const itemsData = currentAWSData.map((item, i) => {
        const isFolder = item.fileFolder.isFolder;
        const fileType = item.relative_path.split('.').pop().toLowerCase();
        return {
          id: item.id,
          aws_path: item.aws_path,
          fileFolder: item.fileFolder,
          db_type: item.db_type,
          relative_path: item.relative_path,
          size: item.size,
          isFolder,
          fileType: !isFolder ? fileType : 'Folder',
        };
      });
      setItemsData(itemsData);
    } else {
      setItemsData([]);
    }
  }, [currentAWSData]);

  useEffect(() => {
    if (showBrowserFiles && selectedSiteId) {
      setSelectedFiles([]);
      fetchAwsFileStructure();
    }
  }, [showBrowserFiles, selectedSiteId]);

  const onSelectFile = (item) => {
    const findItem = selectedFiles?.find((ite) => ite.id == item.id);
    if (!findItem) {
      setSelectedFiles([...selectedFiles, item]);
    } else {
      const filterItems = selectedFiles.filter((ite) => ite.id != item.id);
      setSelectedFiles(filterItems);
    }
  };
  const handleSelectFolder = async (item) => {
    const folderName = item.fileFolder.name;
    const folderArr = previousFolder;
    const prefix = folderArr.slice(2);
    let joinPrefix = '';
    if (prefix.includes(folderName)) {
      joinPrefix = prefix.slice(0, -1).join('');
    } else {
      joinPrefix = prefix.join('') + folderName;
    }
    const lastFolder = previousFolder[previousFolder.length - 1];
    if (lastFolder !== folderName) {
      setIsLoading(true);
      try {
        //   setSelectedFolder(folderId);
        const response = await axios.get(
          baseUrl({ prefix: joinPrefix, selectedSiteId })
        );
        const filesData = response.data.data.files;
        const filterFiles = filesData.filter((fil) => {
          const type = fil.relative_path.split('.').pop().toLowerCase();
          if (allowTypes.includes(type) || fil.fileFolder.isFolder) {
            return fil;
          }
        });
        if (filterFiles.length) {
          setCurrentAWSData(filterFiles);
        } else {
          setCurrentAWSData([]);
        }
        const folderExist = previousFolder.includes(folderName);
        if (folderName && !folderExist) {
          setPreviousFolder([...previousFolder, folderName]);
        }
        setIsLoading(false);

        //   setSelectedFiles(response.data);
      } catch (error) {
        setIsLoading(false);
        console.error('Error fetching folder files:', error);
      }
    }
  };

  const handleSelectBreadCrumbs = (item) => {
    const index = previousFolder.findIndex((it) => it == item);
    const sliced = previousFolder.slice(0, index + 1);
    if (item == 'Sites') {
      setSelectedSiteId(null);
      setProjectId(null);
      setCurrentAWSData([]);
      fetchSites();
    } else if (item == selectedSiteId.name) {
      fetchAwsFileStructure();
    } else {
      handleSelectFolder({ fileFolder: { name: item } });
    }
    setPreviousFolder(sliced);
  };
  useEffect(() => {
    if (previousFolder.length) {
      // let crumbs = [...previousFolder]
      const bcitems = previousFolder.map((it) => {
        return {
          title: (
            <span
              className='text-primary cursor-pointer'
              onClick={() => handleSelectBreadCrumbs(it)}
            >
              {it.replace(/\/$/, '')}{' '}
            </span>
          ),
        };
      });
      setBreadcrumbItems(bcitems);
    }
  }, [previousFolder]);

  const fileTypesToLoad = [
    'geometry_data.bin',
    'bvh_data.bin',
    'breakline_edges.bin',
  ];

  const handleSelectFinalFiles = async () => {
    clearFull();
    setIsLoading(true);
    setPreviousFolder(['Sites']);
    setSelectedFilesToUpload(selectedFiles);
    setProjectId(selectedSiteId.id);

    const filesDataSavedLocal = [];
    const newAllFilesData = [];
    const zipFilesData = [];

    // 1) Attempt geometry preloading
    try {
      // For each file => call show_3d_files => if success, fetch geometry data
      for (const file of selectedFiles) {
        const fileName = file.fileFolder.name;
        const fileType = fileName.split('.').pop().toLowerCase();
        const { geometryFetched, geometryBlob } =
          await tryLoadPreCreatedGeometry(file);

        if (geometryFetched) {
          // If geometry data is found, store it
          filesDataSavedLocal.push({
            fileName,
            fileType,
            geometryFetched,
          });
          newAllFilesData.push({
            geometrySavedData: true,
            file: geometryBlob,
          });
        } else {
          // If not found => fallback to PSLZ or normal raw file approach
          const fallbackResult = await fetchOrUnzipFile(file, zipFilesData);
          filesDataSavedLocal.push({
            fileName,
            fileType,
            geometryFetched: false,
          });
          // fallbackResult might push an item to newAllFilesData
          if (fallbackResult?.newAllFilesData) {
            newAllFilesData.push(...fallbackResult.newAllFilesData);
          }
        }
      }

      // Now finalize all newAllFilesData => parse them
      for (const fileObj of newAllFilesData) {
        // PSLZ or geometry data or raw
        if (fileObj.geometrySavedData) {
          // If it’s geometry .bin => store directly
          setFilesData((prev) => [
            ...prev,
            {
              geometrySavedData: true,
              file: fileObj.file, // it's a Blob
            },
          ]);
        } else if (fileObj.parsedData) {
          // PSLZ unzipped data
          setFilesData((prev) => [
            ...prev,
            {
              content: fileObj.parsedData,
              name: fileObj.name,
              mainZipFileName: fileObj.mainZipFileName,
            },
          ]);
        } else if (fileObj.file) {
          // e.g. a real Blob => parse in worker
          const name = fileObj.name;
          const fileType = fileObj.fileType;
          const parsed = await parseLargeFileInWorker({
            fileType,
            file: { name, file: fileObj.file },
            onProgress: (val) => setProgress(val),
          });
          setFilesData((prev) => [...prev, { content: parsed, name }]);
        }
      }

      setTotalFilesLength(newAllFilesData.length);
      setZipFilesData(zipFilesData);
      setFilesDataSaved(filesDataSavedLocal);
    } catch (err) {
      console.error('Error in handleSelectFinalFiles pipeline:', err);
    } finally {
      setIsLoading(false);
      setShowBrowserFiles(false);
    }
  };
  async function tryLoadPreCreatedGeometry(file) {
    let geometryFetched = false;
    let geometryBlob = null;

    try {
      // 1) Construct the awsPathWithoutExt
      const awsPathWithoutExt = file.aws_path
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '');
      // e.g. we always pick [0]-th fileTypesToLoad => geometry_data.bin, or something
      const urlFor3D = `${referrerDomain}/api/demo/files/show-3d?path=${awsPathWithoutExt}_geometry_data.bin&userId=${authState.user.id}&download=true&token=${token}`;

      // 2) Attempt to fetch the 3D file's path
      const res = await axios.get(urlFor3D);
      const typeFileGet = res.data.data || {};
      const directAwsPath = typeFileGet.aws_path;
      if (!directAwsPath) {
        // Means no geometry data found => skip
        geometryFetched = false;
      } else {
        // We do fetchWithProgress from that direct path
        const fetchResponse = await fetchWithProgress(
          directAwsPath,
          '', // or 'bin'
          (pct) => setApiProgress(pct)
        );
        geometryBlob = new Blob([fetchResponse.data]);
        geometryFetched = true;
      }
    } catch (error) {
      geometryFetched = false; // fallback
    }

    return { geometryFetched, geometryBlob };
  }
  async function fetchOrUnzipFile(file, zipFilesData) {
    // 1) first get presigned link
    const url = `${referrerDomain}/api/demo/files/show?id=${file.id}&userId=${authState.user.id}&download=true&token=${token}`;
    const result = { newAllFilesData: [] };
    try {
      const signResp = await axios.get(url);
      const awsPath = signResp.data?.data?.aws_path;
      if (!awsPath) return result; // skip
      const fileName = file.fileFolder.name;
      const fileType = fileName.split('.').pop().toLowerCase();
      // 2) fetch with progress
      setApiProgress(0);
      setZipProgress(0);
      const fetchResponse = await fetchWithProgress(awsPath, fileType, (pct) =>
        setApiProgress(pct)
      );

      // 3) PSLZ or normal

      if (fileType === 'pslz') {
        // do unzip
        const unzipResult = await unzipLargeFileInWorker({
          fileData: fetchResponse.data,
          zipfileName: fileName,
          onProgress: (p) => setZipProgress(p),
          unzipContent: true,
        });
        if (unzipResult && unzipResult.length) {
          // store as needed, push to zipFilesData, etc.
          // For example, if you have main.xmlContent or main.dxfContent
          // push them into newAllFilesData
          const main = unzipResult[0];
          let objectToSave = {
            fileName: main.fileName,
            jgwValues: main.jgwValues,
            jpgFile: main.jpgFile,
            mainZipFileName: main.fileName,
          };
          let alterFileObj = {
            ...file,
          };
          if (main?.xmlContent) {
            objectToSave = {
              ...objectToSave,
              xmlFileName: main.xmlContent.fileName,
            };
            alterFileObj = {
              ...alterFileObj,
              xmlFileName: main.xmlContent.fileName,
            };
            result.newAllFilesData.push({
              name: main.xmlContent.fileName,
              fileType: 'xml',
              mainZipFileName: main.fileName,
              parsedData: main.xmlContent.data,
            });
          }
          if (main?.dxfContent) {
            objectToSave = {
              ...objectToSave,
              dxfFileName: main.dxfContent.fileName,
            };
            alterFileObj = {
              ...alterFileObj,
              dxfFileName: main.dxfContent.fileName,
            };
            result.newAllFilesData.push({
              name: main.dxfContent.fileName,
              fileType: 'dxf',
              mainZipFileName: main.fileName,
              parsedData: main.dxfContent.data,
            });
          }
          zipFilesData.push(objectToSave);
          const findOriginalFileIndex = selectedFiles.findIndex(
            (fil) => fil.id === file.id
          );
          selectedFiles.splice(findOriginalFileIndex, 1, alterFileObj);
        }
      } else {
        // normal file
        result.newAllFilesData.push({
          name: fileName,
          fileType,
          file: new Blob([fetchResponse.data]),
        });
      }
    } catch (error) {
      console.error('Error in fetchOrUnzipFile fallback pipeline:', error);
    }
    return result;
  }

  const footerButtons = () => {
    const btns = [];
    if (currentAWSData.length || selectedFiles.length) {
      btns.push(
        <Button
          disabled={isLoading}
          key='close'
          onClick={closeBrowserFileModal}
        >
          Close
        </Button>
      );
      if (selectedFiles.length) {
        btns.push(
          <Button
            disabled={isLoading}
            onClick={handleSelectFinalFiles}
            type='primary'
          >
            Load Files
          </Button>
        );
      }
    } else {
      btns.push(
        <Button
          disabled={isLoading}
          key='oK'
          onClick={() => {
            if (selectedSiteId) {
              fetchAwsFileStructure();
            } else {
              fetchSites();
            }
          }}
          type='primary'
        >
          Reload
        </Button>
      );
    }
    return btns;
  };

  return (
    <>
      {progress > 0 && progress < 100 && (
        <div>
          <p>Parsing File ... {progress}%</p>
          {/* Or a real progress bar */}
          <progress value={progress} max='100'>
            {progress}%
          </progress>
        </div>
      )}
      {showBrowserFiles && (
        <Modal
          title={`Browse Files & Folders`}
          open={showBrowserFiles}
          onCancel={!isLoading ? closeBrowserFileModal : () => {}}
          destroyOnClose={!isLoading}
          width={'100%'}
          styles={modalStyles}
          footer={footerButtons()}
        >
          <Breadcrumb items={breadcrumbItems} />
          <Divider />

          {isLoading ? (
            <Flex justify='center' align='center' vertical>
              {apiProgress > 0 && apiProgress < 100 && (
                <div>
                  <p>Fetching File Data... {apiProgress}%</p>
                  {/* Or a real progress bar */}
                  <progress value={apiProgress} max='100'>
                    {apiProgress}%
                  </progress>
                </div>
              )}
              {zipProgress > 0 && zipProgress < 100 && (
                <div>
                  <p>Processing File... {zipProgress}%</p>
                  {/* Or a real progress bar */}
                  <progress value={zipProgress} max='100'>
                    {zipProgress}%
                  </progress>
                </div>
              )}
              <Spin>Loading...</Spin>
            </Flex>
          ) : (
            <>
              {/* <Select
                style={{ width: 200 }}
                placeholder='Select site'
                value={selectedSiteId}
                onChange={(value) => setSelectedSiteId(value)}
              >
                {sitesList.map((site) => (
                  <Select.Option key={site.id} value={site.id}>
                    {site.name}
                  </Select.Option>
                ))}
              </Select> */}
              {!selectedSiteId && (
                <List
                  grid={{ gutter: 16, column: 1 }}
                  dataSource={sitesList}
                  renderItem={(site) => {
                    return (
                      <List.Item key={site.id}>
                        <Button
                          onClick={() => {
                            setPreviousFolder(['Sites', site.name]);
                            setSelectedSiteId(site);
                          }}
                        >
                          {site.name}
                        </Button>
                      </List.Item>
                    );
                  }}
                />
              )}
              {selectedSiteId && (
                <List
                  grid={{ gutter: 16, column: 1 }}
                  dataSource={itemsData}
                  renderItem={(item) => {
                    const isItemSelected = selectedFiles.find(
                      (i) => i.id == item.id
                    );
                    return (
                      <List.Item>
                        {!item.isFolder ? (
                          <Card
                            style={{
                              borderColor: primaryColor,
                            }}
                            className='cursor-pointer'
                            styles={{
                              body: {
                                padding: '12px',
                                color: primaryColor,
                              },
                            }}
                            onClick={() => onSelectFile(item)}
                          >
                            <Flex justify='start' align='center'>
                              <Checkbox checked={isItemSelected ? true : false}>
                                {item.fileFolder.name}
                              </Checkbox>
                            </Flex>
                          </Card>
                        ) : (
                          <Button onClick={() => handleSelectFolder(item)}>
                            {item.fileFolder.name.replace(/\/$/, '')}
                          </Button>
                        )}
                      </List.Item>
                    );
                  }}
                />
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
};

export { FileBrowser };
