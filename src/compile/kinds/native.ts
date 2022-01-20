import { spawn } from "child_process";
import fse from "fs-extra";
import { IncomingMessage } from "http";
import https from "https";
import os from "os";
import path from "path";
import { SolcInput } from "../input";
import { Compiler } from "./compiler";

export function getCompilerPrefixForOs(): string | undefined {
    const arch = os.arch();

    /**
     * Only 64 bit native compilers built
     */
    if (arch !== "x64" && arch !== "ia64") {
        return undefined;
    }

    const type = os.type();

    if (type === "Linux") {
        return "linux-amd64";
    }

    if (type === "Windows_NT") {
        return "windows-amd64";
    }

    if (type === "Darwin") {
        return "windows-amd64";
    }

    return undefined;
}

interface CompilerPlatformMetadata {
    builds: VersionListEntry[];
    releases: { [version: string]: string };
}

interface VersionListEntry {
    path: string;
    version: string;
    longVersion: string;
    keccak256: string;
    sha256: string;
    urls: string[];
}

class NativeCompiler extends Compiler {
    constructor(public readonly version: string, public readonly path: string) {
        super(version);
    }

    async compile(inputJson: SolcInput): Promise<any> {
        const child = spawn(this.path, ["--standard-json"], {});

        return new Promise((resolve, reject) => {
            child.stdin.write(JSON.stringify(inputJson), "utf-8");
            child.stdin.end();

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => {
                stdout += data;
            });

            child.stderr.on("data", (data) => {
                stderr += data;
            });

            child.on("close", (code) => {
                if (code !== 0) {
                    reject(`Compiler exited with code ${code}, stderr: ${stderr}`);
                    return;
                }

                if (stderr !== "") {
                    reject(`Compiler exited with non-empty stderr: ${stderr}`);
                    return;
                }

                let outJson: any;

                try {
                    outJson = JSON.parse(stdout);
                } catch (e) {
                    reject(e);
                    return;
                }

                resolve(outJson);
            });
        });
    }
}

// TODO: (dimo): This is causing test failures
// TODO: (pavel): We need a more general solution for picking CACHE_DIR
// TODO: The location of the CACHE_DIR should be documented
// TODO: The locaiton of the CACHE_DIR should be settable by the user
const CACHE_DIR = "./.native_compilers_cache/";
const BINARIES_URL = "https://binaries.soliditylang.org";

export async function httpsGet(url: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const callback = (msg: IncomingMessage) => {
            const chunks: Buffer[] = [];

            msg.on("data", (fragment) => {
                chunks.push(fragment);
            });

            msg.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            msg.on("error", (e) => reject(e));
        };

        https.get(url, callback);
    });
}

async function getCompilerMDForPlatform(prefix: string): Promise<CompilerPlatformMetadata> {
    const cachedListPath = path.join(CACHE_DIR, prefix, "list.json");

    if (fse.existsSync(cachedListPath)) {
        return fse.readJSONSync(cachedListPath) as CompilerPlatformMetadata;
    }

    const blob = await httpsGet(`${BINARIES_URL}/${prefix}/list.json`);
    const rawMetaData = blob.toString("utf-8");
    const parsedMetaData = JSON.parse(rawMetaData) as CompilerPlatformMetadata;

    fse.ensureDirSync(path.join(CACHE_DIR, prefix));
    fse.writeJSONSync(cachedListPath, parsedMetaData);

    return parsedMetaData;
}

export async function getNativeCompilerForVersion(
    version: string
): Promise<NativeCompiler | undefined> {
    const prefix = getCompilerPrefixForOs();

    if (prefix === undefined) {
        return undefined;
    }

    const md = await getCompilerMDForPlatform(prefix);

    if (version in md.releases) {
        const compilerFileName = md.releases[version];

        fse.ensureDirSync(path.join(CACHE_DIR, prefix));

        const compilerLocalPath = path.join(CACHE_DIR, prefix, compilerFileName);

        if (!fse.existsSync(compilerLocalPath)) {
            const compiler = await httpsGet(`${BINARIES_URL}/${prefix}/${compilerFileName}`);

            fse.writeFileSync(compilerLocalPath, compiler, { mode: 0o555 });
        }

        return new NativeCompiler(version, compilerLocalPath);
    }

    return undefined;
}
