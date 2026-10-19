import 'dotenv/config'
import {S3} from "aws-sdk";
import fs from 'fs';

import path from "path";

const accessKeyId = process.env.ACCESS;
const secretAccessKey = process.env.SECRET;
const endpoint = process.env.ENDPOINT;
const bucket = process.env.BUCKET;

if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error("Missing required environment variables");
}

const BUCKET: string = bucket;

// path-style URLs (endpoint/bucket/key) work with local S3 servers as well as R2/AWS
const s3 = new S3({accessKeyId,secretAccessKey,endpoint,s3ForcePathStyle: true})

// output/asdasd
export async function downloadS3Folder(prefix: string) {
    // listObjectsV2 returns at most 1000 keys per call, so page through everything
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await s3.listObjectsV2({
            Bucket: BUCKET,
            Prefix: prefix,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {})
        }).promise();
        page.Contents?.forEach(({ Key }) => {
            if (Key) keys.push(Key);
        });
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`awaiting ${keys.length} files`);

    await Promise.all(keys.map(Key => new Promise<void>((resolve, reject) => {
        const finalOutputPath = path.join(__dirname, Key);
        // the directory must exist before the write stream is opened
        fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
        const outputFile = fs.createWriteStream(finalOutputPath);
        s3.getObject({
            Bucket: BUCKET,
            Key
        }).createReadStream()
            .on("error", reject)
            .pipe(outputFile)
            .on("error", reject)
            .on("finish", () => resolve());
    })));
    console.log("Downloaded all files");
}

// Uploads every file under localFolder to dist/<id>/ in the bucket
export async function uploadFolder(id: string, localFolder: string) {
    const allFiles = getAllFiles(localFolder);

    const uploadPromises = allFiles.map(async (file) => {
        const relativePath = path
            .relative(localFolder, file)
            .replace(/\\/g, "/");

        await uploadFile(
            `dist/${id}/${relativePath}`,
            file
        );
    });

    await Promise.all(uploadPromises);
}

const getAllFiles = (folderPath: string) => {
    let response: string[] = [];

    const allFilesAndFolders = fs.readdirSync(folderPath);
    allFilesAndFolders.forEach(file => {
        const fullFilePath = path.join(folderPath, file);
        if (fs.statSync(fullFilePath).isDirectory()) {
            response = response.concat(getAllFiles(fullFilePath))
        } else {
            response.push(fullFilePath);
        }
    });
    return response;
}

const uploadFile = async (fileName: string, localFilePath: string) => {
    const fileContent = fs.readFileSync(localFilePath);
    const response = await s3.upload({
        Body: fileContent,
        Bucket: BUCKET,
        Key: fileName,
    }).promise();
    console.log(response);
}
