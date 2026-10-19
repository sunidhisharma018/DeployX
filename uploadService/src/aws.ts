// filepath : /users/bharath/vercel/dist/output/12311/src/App.jsx
import {S3} from "aws-sdk";
import fs from "fs";
import 'dotenv/config'

const accessKeyId = process.env.ACCESS;
const secretAccessKey = process.env.SECRET;
const endpoint = process.env.ENDPOINT;
const bucket = process.env.BUCKET;

if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error("Missing required environment variables");
}

// path-style URLs (endpoint/bucket/key) work with local S3 servers as well as R2/AWS
const s3 = new S3({
    accessKeyId,
    secretAccessKey,
    endpoint,
    s3ForcePathStyle: true
})

export const uploadFile = async (fileName:string,localFilePath:string)=>{
    const fileContent = fs.readFileSync(localFilePath);
    const normalizedKey = fileName.replace(/\\/g, '/');
    const response = await s3.upload({
        Body:fileContent,
        Bucket:bucket,
        Key:normalizedKey,

    }).promise();

    console.log(response);

}