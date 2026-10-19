import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const BUILD_OUTPUT_DIRS = ["dist", "build", "out"];

function hasBuildScript(dir: string) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        return typeof pkg?.scripts?.build === "string";
    } catch {
        return false;
    }
}

// Breadth-first list of the repo's directories (root first), up to maxDepth levels deep
function listDirs(root: string, maxDepth = 3) {
    const dirs: string[] = [];
    let level = [root];
    for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
        dirs.push(...level);
        const next: string[] = [];
        for (const dir of level) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
                    next.push(path.join(dir, entry.name));
                }
            }
        }
        level = next;
    }
    return dirs;
}

// Finds the folder holding the frontend app. Handles repos where the app lives in a
// subfolder (e.g. frontend/ next to backend/). Prefers folders that also have index.html.
export function findAppDir(repoRoot: string) {
    const candidates = listDirs(repoRoot).filter(hasBuildScript);
    return candidates.find(dir => fs.existsSync(path.join(dir, "index.html")))
        ?? candidates[0];
}

// For repos without a build step: the shallowest folder containing index.html
export function findStaticDir(repoRoot: string) {
    return listDirs(repoRoot).find(dir => fs.existsSync(path.join(dir, "index.html")));
}

// Build tools differ in where they put output: Vite uses dist/, CRA build/, Next export out/
export function findBuildOutputDir(appDir: string) {
    return BUILD_OUTPUT_DIRS
        .map(name => path.join(appDir, name))
        .find(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
}

export function buildProject(projectDir: string, onLog: (log: string) => void) {
    return new Promise<void>((resolve, reject) => {
        const install = spawn('npm', ['install'], { cwd: projectDir, shell: true });

        install.stdout?.on('data', data => {
            console.log('npm install stdout: ' + data);
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) onLog(`[install] ${line.trim()}`);
            });
        });

        install.stderr?.on('data', data => {
            console.log('npm install stderr: ' + data);
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) onLog(`[install-err] ${line.trim()}`);
            });
        });

        install.on('error', reject);
        install.on('close', installCode => {
            if (installCode !== 0) {
                reject(new Error(`npm install failed with exit code ${installCode}`));
                return;
            }

            const build = spawn('npm', ['run', 'build'], { cwd: projectDir, shell: true });

            build.stdout?.on('data', data => {
                console.log('npm run build stdout: ' + data);
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) onLog(`[build] ${line.trim()}`);
                });
            });

            build.stderr?.on('data', data => {
                console.log('npm run build stderr: ' + data);
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) onLog(`[build-err] ${line.trim()}`);
                });
            });

            build.on('error', reject);
            build.on('close', buildCode => {
                if (buildCode !== 0) {
                    reject(new Error(`npm run build failed with exit code ${buildCode}`));
                    return;
                }

                resolve();
            });
        });
    });

}
