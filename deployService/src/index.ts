import 'dotenv/config';
import { createClient } from 'redis';
import { downloadS3Folder, uploadFolder } from './aws';
import { buildProject, findAppDir, findBuildOutputDir, findStaticDir } from './utils';
import path from 'path';

const redURL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const subscriber = createClient({ url: redURL });
const publisher = createClient({ url: redURL });

async function main(){
    await subscriber.connect();
    await publisher.connect();
    while (true){
        const response = await subscriber.brPop('build-queue', 0);
        console.log(response);
        
        //@ts-ignore
        const id = response.element

        try {
            await publisher.rPush(`logs:${id}`, "✦ Downloading source code from storage...");
            // trailing slash so id "abc" doesn't also match "abcde"
            await downloadS3Folder(`output/${id}/`);
            await publisher.rPush(`logs:${id}`, "✦ Source code downloaded.");

            const repoRoot = path.join(__dirname, `output/${id}`);
            const appDir = findAppDir(repoRoot);

            if (appDir) {
                const relativeAppDir = path.relative(repoRoot, appDir) || ".";
                await publisher.rPush(`logs:${id}`, `✦ Found app in ./${relativeAppDir.replace(/\\/g, "/")}`);
                await publisher.rPush(`logs:${id}`, "✦ Starting build pipeline (npm install & build)...");
                await buildProject(appDir, async (log) => {
                    await publisher.rPush(`logs:${id}`, log);
                });
                await publisher.rPush(`logs:${id}`, "✦ Build completed successfully.");

                const outputDir = findBuildOutputDir(appDir);
                if (!outputDir) {
                    throw new Error("Build finished but no dist/, build/ or out/ folder was produced");
                }
                await publisher.rPush(`logs:${id}`, "✦ Copying build artifacts to production storage...");
                await uploadFolder(id, outputDir);
            } else {
                const staticDir = findStaticDir(repoRoot);
                if (!staticDir) {
                    throw new Error("No package.json with a build script and no index.html found in the repository");
                }
                await publisher.rPush(`logs:${id}`, "✦ No build script found. Deploying as a static site...");
                await publisher.rPush(`logs:${id}`, "✦ Copying static files to production storage...");
                await uploadFolder(id, staticDir);
            }

            await publisher.rPush(`logs:${id}`, "✦ Artifacts uploaded. Deployment live!");
            
            await publisher.hSet("status", id, "deployed");
        } catch (error: any) {
            console.error(`Build failed for id: ${id}`, error);
            await publisher.rPush(`logs:${id}`, `✖ Deployment failed: ${error.message || error}`);
            await publisher.hSet("status", id, "failed");
        } finally {
            // Set 1 hour expiration for the log list to save memory
            await publisher.expire(`logs:${id}`, 3600);
        }
    }
    
}

main().catch(console.error);