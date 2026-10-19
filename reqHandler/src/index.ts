import 'dotenv/config'
import {S3} from 'aws-sdk'
import express from "express";
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

const mimeTypes: { [key: string]: string } = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".map": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wasm": "application/wasm",
    ".pdf": "application/pdf"
};

const app = express();

app.get("*", async (req, res) => {
    const host = req.hostname;

    const id = host.split(".")[0];
    let filePath = req.path === "/"
        ? "/index.html"
        : req.path;

    const fetchFile = (p: string) => s3.getObject({
        Bucket: BUCKET,
        Key: `dist/${id}${p}`
    }).promise();

    try {
        let contents;
        try {
            contents = await fetchFile(filePath);
        } catch (err: any) {
            // Single-page apps: routes like /about have no file, serve index.html instead
            if (err.code === "NoSuchKey" && !path.extname(filePath)) {
                filePath = "/index.html";
                contents = await fetchFile(filePath);
            } else {
                throw err;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = mimeTypes[ext] || "application/octet-stream";
        res.set("Content-Type", type);

        res.send(contents.Body);
    } catch (err: any) {
        if (err.code === "NoSuchKey") {
            res.status(404).send("Not Found");
        } else {
            console.error(`Error fetching file dist/${id}${filePath}:`, err);
            res.status(500).send("Internal Server Error");
        }
    }
})

app.listen(3001);
