'use client';
import { useState } from 'react';
import { FileUploader } from 'react-drag-drop-files';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import convertSize from 'convert-size';
import Slider from "rc-slider";
import 'rc-slider/assets/index.css';

const fileTypes = ['WEBP', 'PNG', 'JPEG', 'JPG'];

function App() {
    const [files, setFiles] = useState([]);
    const [previewUrls, setPreviewUrls] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [quality, setQuality] = useState(75);

    const handleChange = (fileList) => {
        const fileArray = Array.from(fileList);
        setFiles(fileArray);

        const urls = fileArray.map(file => URL.createObjectURL(file));
        setPreviewUrls(urls);
    };

    const handleClick = async () => {
        if (!files || files.length === 0) return toast.error('Загрузите хотя бы один файл!');
        const formData = new FormData();

        if (Array.isArray(files)) {
            for (const file of files) {
                formData.append('images', file);
            }
            formData.append('quality', quality)

            try {
                const response = await fetch('/api/compress', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) throw new Error('Network response was not ok');

                // Получаем Blob-данные архива
                const zipBlob = await response.blob();

                // Разбираем архив с помощью JSZip
                const zip = await JSZip.loadAsync(zipBlob);

                // Ищем файл с метаданными
                const metadataFile = zip.file('metadata.json');
                if (metadataFile) {
                    const metadataBlob = await metadataFile.async('text');
                    const compressedFiles = JSON.parse(metadataBlob);

                    // Получаем URL для каждого нового сжатого файла
                    const newFilesWithUrls = await Promise.all(
                        compressedFiles.map(async (file) => {
                            const fileBlob = await zip.file(file.name).async('blob');
                            return {
                                ...file,
                                url: URL.createObjectURL(fileBlob)
                            };
                        })
                    );

                    setNewFiles(newFilesWithUrls);
                }

                // Создаем URL для скачивания архива
                setDownloadUrl(URL.createObjectURL(zipBlob));
            } catch (error) {
                console.error('There was a problem with the fetch operation:', error);
            }
        } else {
            console.error('Files is not an array:', files);
        }
    };

    const handleDownload = () => {
        if (downloadUrl) {
            saveAs(downloadUrl, 'compressed_images.zip');
        }
    };

    return (
        <div className="container">
            <FileUploader multiple={true} handleChange={handleChange} name="file" types={fileTypes} />
            <div className="quality-slider">
                <h3>Качество изображения: {quality}</h3>
                <Slider min={0} max={100} step={1} value={quality} onChange={(val) => setQuality(Number(val))} />
            </div>
            <div className="buttons-container">
                <button onClick={handleClick}>Сжать</button>
                {downloadUrl && <button onClick={handleDownload}>Скачать</button>}
            </div>
            <div className="preview-container">
                {previewUrls.map((url, index) => (
                    <div key={index} className="preview-item">
                        <p>{files[index].name}</p>
                        <div className="preview-item-inner">
                            <div className="item">
                                <img src={url} alt={files[index].name}/>
                                <p>{convertSize(files[index].size)}</p>
                            </div>
                            {newFiles.length > 0 && (
                                <div className="item">
                                    <img src={newFiles[index].url} alt={newFiles[index].name}/>
                                    <p>{convertSize(newFiles[index].size)}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default App;
