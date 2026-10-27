#!/usr/bin/env python3
"""Build a pinned FFPRO candidate in isolation; never replace a live container."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

REVISION = "096be5cbecc0a1808ac71b0ff3990d468b806c29"
TREE = "082c932356bc658ee14c1de6b2506ad1dae520e2"
OLD_IMAGE = "sha256:3ad20da8499b48eaa31856c35c8c18770cc65aa03d70b3101da3de0102ad998a"
DB_IMAGE = "sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685"
BACKEND = "e08af6477b16f68efc0470a4b7b8f612f9dcbb98cb34213e71a76ca57da7fbee"
ICON = "5b261d20b736594463dedd47b78c8c977db287df294072837fe480159f607897"
LOCK = "2bec142ceb7c61f69c31531108e4c1735a0c1b0d1ba8a53bd7df7241e0e853c6"
ROOT = Path("/home/firelion/FFPRO2")
FILES = {
    "docker-compose.yml": "dd9e6e17f040e3bc62fe08eeedb60af9785f360dfeb7aa8425a14886afea3ce0",
    "docker-compose.override.yml": "6923511b6d65c5e189e5d55b2533dff68f173a01dc3800bdcf50d1f3de2c89a0",
    "Dockerfile": "8030072d4b030aeeaffcc71dd55ac9bad1d3014012bd698a9b65b27dac3551f8",
    "package.json": "8cf421c4ebd5e93d8724cab9ee7f849854c2e583b75755c1f62faa3debf495a7",
    "package-lock.json": "d80b1b5137c9980e98f13cc2d6d124b98b1e26ee568e4d02cd9a2ab9dc60a18e",
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, *, cwd=None, stream=False, timeout=60):
    p = subprocess.run(args, cwd=cwd, text=True, capture_output=not stream,
                       timeout=timeout, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    require(p.returncode == 0, "Command failed: " + args[0])
    return p.stdout if not stream else ""


def inspect(name):
    return json.loads(run(["docker", "inspect", name]))[0]


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fingerprint(container):
    # Kept only as a digest. No environment values are printed or written.
    model = {"Config": container["Config"], "HostConfig": container["HostConfig"],
             "Mounts": container["Mounts"],
             "Networks": sorted(container["NetworkSettings"]["Networks"])}
    return digest(json.dumps(model, sort_keys=True, separators=(",", ":")).encode())


def file_locks():
    for name, expected in FILES.items():
        require(digest((ROOT / name).read_bytes()) == expected,
                "Host file changed: " + name)


def runtime_locks():
    app, db = inspect("fire-finance-app"), inspect("fire-finance-db")
    for item, image in [(app, OLD_IMAGE), (db, DB_IMAGE)]:
        require(item["Image"] == image, "Running image changed")
        require(item["State"]["Status"] == "running", "Container not running")
        require(item["State"].get("Health", {}).get("Status") == "healthy",
                "Container not healthy")
    labels = app["Config"].get("Labels") or {}
    require(labels.get("com.docker.compose.service") == "fire-finance", "Service changed")
    require(labels.get("com.docker.compose.project.config_files") ==
            str(ROOT / "docker-compose.yml") + "," + str(ROOT / "docker-compose.override.yml"),
            "Compose file set changed")
    require([m["Destination"] for m in app["Mounts"]] == ["/app/data"], "App mounts changed")
    return app, db


BACKEND_JS = r"""
const fs=require('fs'),c=require('crypto');
const hash=x=>c.createHash('sha256').update(x).digest('hex');
const m=JSON.parse(fs.readFileSync('/app/build/server.cjs.map','utf8'));
const entries=m.sources.map((name,i)=>[name.replace(/^(\.\.\/)+/,''),hash(m.sourcesContent[i])])
 .sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
console.log(hash(JSON.stringify(entries)));
"""

IMAGE_JS = BACKEND_JS + r"""
const assert=require('assert/strict');
assert.equal(typeof process.getuid==='function' ? process.getuid() : -1,1000);
assert.ok(fs.readFileSync('/app/dist/index.html','utf8').includes('FFPRO | Vision79 Finance Workspace'));
assert.equal(hash(fs.readFileSync('/app/dist/ffpro-icon.svg')),process.argv[1]);
assert.equal(hash(fs.readFileSync('/app/package-lock.json')),process.argv[2]);
for(const [name,version] of Object.entries({'body-parser':'1.20.9','dompurify':'3.4.17',
 'ip-address':'10.7.5','multer':'2.5.0','nodemailer':'10.2.1','qs':'6.16.2'})){
 assert.equal(JSON.parse(fs.readFileSync('/app/node_modules/'+name+'/package.json','utf8')).version,version);
}
const html=fs.readFileSync('/app/dist/index.html','utf8');
for(const [,asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)[^"]*"/g))
 assert.ok(fs.statSync('/app/dist'+asset).isFile());
console.log('IMAGE_CONTENT=PASS_NONROOT_BACKEND_FRONTEND_AND_PATCHED_DEPENDENCIES');
"""


def main():
    require(not sys.argv[1:], "No arguments expected; this tool only stages")
    file_locks()
    app, db = runtime_locks()
    old_fingerprint = fingerprint(app)
    backend = run(["docker", "exec", "fire-finance-app", "node", "-e", BACKEND_JS]).strip()
    require(backend == BACKEND, "Running backend no longer matches reviewed source")
    require(shutil.disk_usage(ROOT).free >= 3 * 1024 ** 3, "Less than 3 GiB disk free")
    stage = Path(tempfile.mkdtemp(prefix="v79-ffpro-workspace-stage.", dir="/home/firelion"))
    os.chmod(stage, 0o700)
    source = stage / "source"
    print("STAGE_DIRECTORY=" + str(stage), flush=True)
    run(["git", "init", "--quiet", str(source)])
    run(["git", "fetch", "--quiet", "--depth=1", "https://github.com/MrFixITslu/FFPRO2.git", REVISION], cwd=source, timeout=180)
    run(["git", "checkout", "--quiet", "--detach", "FETCH_HEAD"], cwd=source)
    require(run(["git", "rev-parse", "HEAD"], cwd=source).strip() == REVISION, "Source revision mismatch")
    require(run(["git", "rev-parse", "HEAD^{tree}"], cwd=source).strip() == TREE, "Source tree mismatch")
    require(not run(["git", "status", "--porcelain"], cwd=source).strip(), "Source tree dirty")
    tag = "vision79-ffpro-workspace:" + REVISION[:12]
    iid = stage / "candidate-image.id"
    print("BUILD=PINNED_SOURCE_NO_PRODUCTION_CONFIGURATION", flush=True)
    run(["docker", "build", "--iidfile", str(iid), "--label", "org.opencontainers.image.revision=" + REVISION,
         "--label", "org.opencontainers.image.source=https://github.com/MrFixITslu/FFPRO2",
         "-t", tag, str(source)], stream=True, timeout=1800)
    image = iid.read_text().strip()
    require(image.startswith("sha256:") and len(image) == 71, "Invalid image ID")
    check = run(["docker", "run", "--rm", "--network", "none", "--read-only",
                 "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                 "--entrypoint", "node", image, "-e", IMAGE_JS, ICON, LOCK])
    require(check.splitlines()[0] == BACKEND, "Candidate backend differs from reviewed source")
    print(check.strip(), flush=True)
    file_locks()
    after, db_after = runtime_locks()
    require(after["Id"] == app["Id"] and fingerprint(after) == old_fingerprint,
            "Live app identity/configuration changed during staging")
    require(db_after["Id"] == db["Id"], "Database container changed during staging")
    manifest = {"schema": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
                "candidateRevision": REVISION, "candidateTree": TREE, "candidateImage": image,
                "originalImage": OLD_IMAGE, "originalContainer": app["Id"],
                "runtimeFingerprint": old_fingerprint, "databaseImage": DB_IMAGE,
                "databaseContainer": db["Id"], "hostFiles": FILES,
                "stageDirectory": str(stage), "backendFingerprint": BACKEND,
                "project": app["Config"]["Labels"].get("com.docker.compose.project")}
    output = stage / "stage-manifest.json"
    with output.open("x") as f:
        os.chmod(output, 0o600)
        json.dump(manifest, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    print("CANDIDATE_IMAGE=" + image)
    print("CANDIDATE_REVISION=" + REVISION)
    print("STAGE_MANIFEST=" + str(output))
    print("STAGE_MANIFEST_SHA256=" + digest(output.read_bytes()))
    print("STAGE_RESULT=PASS_READY_FOR_APP_ONLY_PROMOTION")
    print("PRODUCTION_CONTAINERS_CHANGED=NONE")
    print("APP_DATA_AND_KEYS=NOT_READ")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("STAGE_RESULT=FAILED: " + str(error), flush=True)
        sys.exit(1)
