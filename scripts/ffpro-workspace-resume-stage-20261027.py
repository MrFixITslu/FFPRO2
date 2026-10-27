#!/usr/bin/env python3
"""Resume the unfinished isolated content check of an already-built FFPRO image."""
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


STAGE = Path("/home/firelion/v79-ffpro-workspace-stage.79xp4xdp")
BUILT_REFERENCE = "sha256:567284dcf6f6aaac68d7d2fc9ecca222ecf24362c605d14a9d4581370397d759"
# The build emitted an index, a platform manifest and an image configuration.
# Docker's resolved Id is not necessarily the configuration digest.
BUILD_DIGESTS = {
    BUILT_REFERENCE,
    "sha256:020f879c8a929692f54a213691688cea486403f749d00580d9bdfae207553065",
    "sha256:51b81877a9c622d9d4312c347aa5e93f013100b9fef48935d600d5e075c3456b",
}


def main():
    require(not sys.argv[1:], "No arguments expected")
    require(STAGE.is_dir(), "Expected staging directory missing")
    require(not (STAGE / "stage-manifest.json").exists(), "Stage already completed; use its existing manifest")
    require((STAGE / "candidate-image.id").read_text().strip() == BUILT_REFERENCE,
            "Built image reference changed")
    source = STAGE / "source"
    require(run(["git", "rev-parse", "HEAD"], cwd=source).strip() == REVISION, "Source revision changed")
    require(run(["git", "rev-parse", "HEAD^{tree}"], cwd=source).strip() == TREE, "Source tree changed")
    require(not run(["git", "status", "--porcelain"], cwd=source).strip(), "Source tree dirty")
    file_locks()
    app, db = runtime_locks()
    original_fingerprint = fingerprint(app)
    metadata = json.loads(run(["docker", "image", "inspect", BUILT_REFERENCE], timeout=180))[0]
    image = metadata["Id"]
    require(image in BUILD_DIGESTS, "Resolved image does not match any pinned build digest")
    require(metadata["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == REVISION,
            "Image revision mismatch")
    require(metadata["Config"].get("User") == "node", "Image user changed")
    print("EXISTING_BUILD=PASS_REUSED_WITHOUT_REBUILD", flush=True)
    print("ISOLATED_CHECK=CREATING_NO_PRODUCTION_MOUNTS_OR_NETWORK", flush=True)
    import uuid
    name = "ffpro-workspace-content-" + uuid.uuid4().hex[:12]
    container = None
    try:
        container = run(["docker", "create", "--name", name, "--network", "none", "--read-only",
                         "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                         "--label", "vision79.scope=ffpro-workspace-content-check",
                         "--entrypoint", "node", BUILT_REFERENCE, "-e", IMAGE_JS, ICON, LOCK], timeout=180).strip()
        require(len(container) == 64 and all(c in "0123456789abcdef" for c in container), "Invalid isolated container ID")
        print("ISOLATED_CHECK=STARTING", flush=True)
        run(["docker", "start", container], timeout=180)
        print("ISOLATED_CHECK=WAITING_FOR_CONTENT_RESULT", flush=True)
        exit_code = run(["docker", "wait", container], timeout=180).strip()
        logs = run(["docker", "logs", container], timeout=45)
        # This container has only image defaults: no credentials, app data or live configuration.
        print(logs[-6000:].strip(), flush=True)
        if exit_code != "0":
            diagnostic = subprocess.run(["docker", "logs", "--tail", "30", container],
                                        text=True, capture_output=True, timeout=45)
            print(diagnostic.stderr[-4000:].strip(), flush=True)
        require(exit_code == "0", "Isolated image content check failed")
        require(logs.splitlines()[0] == BACKEND, "Candidate backend differs from reviewed source")
        require("IMAGE_CONTENT=PASS_NONROOT_BACKEND_FRONTEND_AND_PATCHED_DEPENDENCIES" in logs,
                "Image content completion marker missing")
    finally:
        if container:
            try:
                run(["docker", "rm", "-f", container], timeout=90)
                print("ISOLATED_CHECK_CONTAINER=REMOVED", flush=True)
            except Exception:
                print("ISOLATED_CHECK_CLEANUP=NEEDS_ATTENTION " + name, flush=True)
    file_locks()
    after, db_after = runtime_locks()
    require(after["Id"] == app["Id"] and fingerprint(after) == original_fingerprint,
            "Live app identity/configuration changed during content check")
    require(db_after["Id"] == db["Id"], "Database container changed during content check")
    manifest = {"schema": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
                "candidateRevision": REVISION, "candidateTree": TREE, "candidateImage": image,
                "candidateBuildReference": BUILT_REFERENCE,
                "originalImage": OLD_IMAGE, "originalContainer": app["Id"],
                "runtimeFingerprint": original_fingerprint, "databaseImage": DB_IMAGE,
                "databaseContainer": db["Id"], "hostFiles": FILES,
                "stageDirectory": str(STAGE), "backendFingerprint": BACKEND,
                "project": app["Config"]["Labels"].get("com.docker.compose.project")}
    output = STAGE / "stage-manifest.json"
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
    except subprocess.TimeoutExpired:
        print("STAGE_RESULT=FAILED_DOCKER_OPERATION_TIMEOUT_NO_PRODUCTION_SWITCH", flush=True)
        sys.exit(1)
    except Exception as error:
        print("STAGE_RESULT=FAILED: " + str(error), flush=True)
        sys.exit(1)
