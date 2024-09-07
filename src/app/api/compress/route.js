import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { tmpdir } from 'os';
import ffmpeg from 'fluent-ffmpeg';
import archiver from 'archiver';
import { NextResponse } from 'next/server';

const saveBufferToFile = (buffer, originalname) => {
    return new Promise((resolve, reject) => {
        const tempFilePath = path.join(tmpdir(), `${uuidv4()}-${originalname}`);
        fs.writeFile(tempFilePath, buffer, (err) => {
            if (err) return reject(err);
            resolve(tempFilePath);
        });
    });
};

const compressImage = (inputFilePath, outputFilePath, quality) => {
    console.log(quality)
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputFilePath)
            .output(outputFilePath)
            .outputOptions([
                '-c:v libwebp',
                `-qscale:v ${quality}`,
                '-preset picture',
                '-compression_level 6'
            ])
            .on('end', () => resolve(outputFilePath))
            .on('error', reject)
            .run();
    });
};

const getFileSize = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stats) => {
            if (err) return reject(err);
            resolve(stats.size);
        });
    });
};

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('images');
        const quality = formData.get('quality');

        if (files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
        }

        const outputDir = path.join(tmpdir(), 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        const compressedFiles = [];

        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const tempInputFilePath = await saveBufferToFile(Buffer.from(buffer), file.name);
            const originalFileName = path.parse(file.name).name;
            const outputFileName = `${originalFileName}.webp`;
            const outputFilePath = path.join(outputDir, outputFileName);

            await compressImage(tempInputFilePath, outputFilePath, quality);

            // Получаем размер сжатого файла
            const fileSize = await getFileSize(outputFilePath);

            compressedFiles.push({ path: outputFilePath, name: outputFileName, size: fileSize });

            fs.unlinkSync(tempInputFilePath);
        }

        const zipFileName = `${uuidv4()}.zip`;
        const zipFilePath = path.join(outputDir, zipFileName);
        const outputZip = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.pipe(outputZip);

        compressedFiles.forEach(file => {
            archive.file(file.path, { name: file.name });
        });

        const metadata = compressedFiles.map(file => ({
            name: file.name,
            size: file.size
        }));

        archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

        await new Promise((resolve, reject) => {
            archive.finalize();
            outputZip.on('close', resolve);
            outputZip.on('error', reject);
        });

        // После создания архива, отправляем его клиенту
        const zipStream = fs.createReadStream(zipFilePath);

        return new NextResponse(zipStream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${zipFileName}"`
            }
        });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
