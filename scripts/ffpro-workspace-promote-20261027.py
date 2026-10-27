#!/usr/bin/env python3
"""Promote the accepted FFPRO image, preserving effective runtime configuration."""
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path("/home/firelion/FFPRO2")
STAGE = Path("/home/firelion/v79-ffpro-workspace-stage.79xp4xdp")
MANIFEST_SHA = "809af2c47156f01224fd315d5624d820f9c61b78bc673055e182f1ad3c97ff5f"
NEW = "sha256:567284dcf6f6aaac68d7d2fc9ecca222ecf24362c605d14a9d4581370397d759"
OLD = "sha256:3ad20da8499b48eaa31856c35c8c18770cc65aa03d70b3101da3de0102ad998a"
REV = "096be5cbecc0a1808ac71b0ff3990d468b806c29"
SERVICE = "fire-finance"
APP = "fire-finance-app"
DB = "fire-finance-db"


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def run(args, *, timeout=60, stream=False):
    p = subprocess.run(args, cwd=ROOT, text=True, capture_output=not stream, timeout=timeout)
    if p.returncode:
        operation = next((v for v in args[2:] if v in {"config", "create", "up", "inspect", "exec", "rm"}), args[1])
        # Persist diagnostics privately; never print resolved environment values.
        if not stream and p.stderr:
            import tempfile
            fd, path = tempfile.mkstemp(prefix="command-error-", suffix=".log", dir=STAGE)
            with os.fdopen(fd, "w") as f:
                f.write(p.stderr)
            print("PRIVATE_COMMAND_ERROR_LOG=" + path, flush=True)
        raise RuntimeError("Command failed: " + args[0] + " " + args[1] + " (" + operation + ")")
    return p.stdout if not stream else ""


def inspect(name):
    return json.loads(run(["docker", "inspect", name]))[0]


def runtime_fingerprint(container):
    return sha(canonical({"Config": container["Config"], "HostConfig": container["HostConfig"],
                          "Mounts": container["Mounts"],
                          "Networks": sorted(container["NetworkSettings"]["Networks"])}))


def healthy(container):
    return container["State"]["Status"] == "running" and container["State"].get("Health", {}).get("Status") == "healthy"


def files_locked(manifest):
    for name, value in manifest["hostFiles"].items():
        require(name in {"docker-compose.yml", "docker-compose.override.yml", "Dockerfile", "package.json", "package-lock.json"}, "Unexpected host-file lock")
        require(sha((ROOT / name).read_bytes()) == value, "Host file changed: " + name)


def compose(project, files):
    args = ["docker", "compose", "--project-directory", str(ROOT), "-p", project]
    for path in files:
        args += ["-f", str(path)]
    return args


def config(project, files):
    return json.loads(run(compose(project, files) + ["config", "--format", "json"]))


def stopped_profile_command(project, profile_file):
    # `create` has no --no-deps option. The profile contains only the app service
    # and its depends_on entry has already been removed.
    return compose(project, [profile_file]) + ["create", "--no-build", "--pull", "never", SERVICE]


def literal(value):
    # Compose interpolates YAML and JSON values, including already-resolved secrets.
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [literal(v) for v in value]
    if isinstance(value, dict):
        return {k: literal(v) for k, v in value.items()}
    return value


def save(path, value, *, compose_file=False):
    with path.open("x") as f:
        os.chmod(path, 0o600)
        json.dump(literal(value) if compose_file else value, f, indent=2)
        f.flush()
        os.fsync(f.fileno())


def env_map(values):
    return dict(v.split("=", 1) for v in (values or []))


def compact(value):
    # Docker versions can express the same empty/default field as null, [] or {}.
    if isinstance(value, dict):
        return {k: compact(v) for k, v in value.items() if v not in (None, "", [], {}, False, 0)}
    if isinstance(value, list):
        return [compact(v) for v in value]
    return value


def runtime_view(container):
    cfg = copy.deepcopy(container["Config"])
    cfg.pop("Image", None)
    if cfg.get("Hostname") == container["Id"][:12]:
        cfg.pop("Hostname", None)
    cfg["Env"] = env_map(cfg.get("Env"))
    cfg["Labels"] = {k: v for k, v in (cfg.get("Labels") or {}).items()
                     if not k.startswith("com.docker.compose.")}
    host = copy.deepcopy(container["HostConfig"])
    for key in ["Binds", "CapAdd", "CapDrop", "SecurityOpt", "GroupAdd", "Dns", "DnsSearch", "ExtraHosts"]:
        if host.get(key):
            host[key] = sorted(host[key])
    mounts = sorted(({"Type": m["Type"], "Source": m["Source"], "Destination": m["Destination"],
                      "RW": m["RW"], "Propagation": m.get("Propagation")}
                     for m in container["Mounts"]), key=lambda m: m["Destination"])
    nets = {}
    for name, n in container["NetworkSettings"]["Networks"].items():
        aliases = sorted(a for a in (n.get("Aliases") or [])
                         if a not in {container["Name"].lstrip("/"), SERVICE, container["Id"][:12], container["Id"]})
        nets[name] = {"Aliases": aliases, "IPAMConfig": n.get("IPAMConfig"), "DriverOpts": n.get("DriverOpts"),
                      "Links": n.get("Links"), "GwPriority": n.get("GwPriority")}
    # Preserve environment keys (including empty values), exposed-port keys,
    # read-only mounts and network names exactly.
    return {"Config": cfg, "HostConfig": compact(host), "Mounts": mounts,
            "Networks": {name: compact(settings) for name, settings in nets.items()}}


def allow_image_defaults(before, after, old_image, new_image, service):
    """Only image-inherited env/labels may change; Compose-specified values stay exact."""
    result = copy.deepcopy(before)
    for field, explicit, convert in [
        ("Env", service.get("environment") or {}, env_map),
        ("Labels", service.get("labels") or {}, lambda x: x or {}),
    ]:
        old_defaults = convert(old_image["Config"].get(field))
        new_defaults = convert(new_image["Config"].get(field))
        expected = result.setdefault("Config", {}).setdefault(field, {})
        actual = after.get("Config", {}).get(field, {})
        for key in set(old_defaults) | set(new_defaults):
            if key in explicit or key.startswith("com.docker.compose."):
                continue
            if expected.get(key) == old_defaults.get(key) and actual.get(key) == new_defaults.get(key):
                if key in actual:
                    expected[key] = actual[key]
                else:
                    expected.pop(key, None)
    return result


def changed_sections(expected, actual):
    changes = []
    for key in sorted(set(expected) | set(actual)):
        if expected.get(key) == actual.get(key):
            continue
        a, b = expected.get(key), actual.get(key)
        if isinstance(a, dict) and isinstance(b, dict):
            changes.extend(key + "." + k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k))
        else:
            changes.append(key)
    return changes


SERVE_CHECK = r"""
const assert=require('assert/strict'),http=require('http'),crypto=require('crypto');
const port=Number(process.env.PORT||3010),host=new URL(process.env.FRONTEND_URL).host;
const get=path=>new Promise((resolve,reject)=>{
 const q=http.get({hostname:'127.0.0.1',port,path,headers:{Host:host}},r=>{
  const parts=[];r.on('data',x=>parts.push(x));r.on('end',()=>resolve({status:r.statusCode,body:Buffer.concat(parts)}));
 });q.on('error',reject);q.setTimeout(5000,()=>q.destroy(new Error('HTTP timeout')));
});
(async()=>{
 const health=await get('/api/health');assert.equal(health.status,200);
 const home=await get('/');assert.equal(home.status,200);const html=home.body.toString();
 assert.ok(html.includes('FFPRO | Vision79 Finance Workspace'));
 const asset=html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];assert.ok(asset);
 assert.equal((await get(asset)).status,200);
 const icon=await get('/ffpro-icon.svg');assert.equal(icon.status,200);
 assert.equal(crypto.createHash('sha256').update(icon.body).digest('hex'),
 '5b261d20b736594463dedd47b78c8c977db287df294072837fe480159f607897');
 console.log('LIVE_SERVING=PASS_HEALTH_WORKSPACE_ASSET_AND_DISTINCT_ICON');
})().catch(()=>{console.error('LIVE_SERVING=FAILED');process.exitCode=1;});
"""


def main():
    require(not sys.argv[1:], "No arguments expected")
    manifest_path = STAGE / "stage-manifest.json"
    require(sha(manifest_path.read_bytes()) == MANIFEST_SHA, "Stage manifest changed")
    manifest = json.loads(manifest_path.read_text())
    require(manifest["candidateImage"] == NEW and manifest["originalImage"] == OLD and
            manifest["candidateRevision"] == REV, "Release identity mismatch")
    require(not (STAGE / "promotion-receipt.json").exists(), "Promotion already recorded; do not repeat")
    project = manifest["project"]
    require(isinstance(project, str) and project, "Compose project missing")
    files_locked(manifest)
    original, database = inspect(APP), inspect(DB)
    require(original["Id"] == manifest["originalContainer"] and original["Image"] == OLD and healthy(original), "Original app changed or unhealthy")
    require(runtime_fingerprint(original) == manifest["runtimeFingerprint"], "Original runtime configuration changed")
    require(database["Id"] == manifest["databaseContainer"] and database["Image"] == manifest["databaseImage"] and healthy(database), "Database changed or unhealthy")
    old_image = json.loads(run(["docker", "image", "inspect", OLD]))[0]
    new_image = json.loads(run(["docker", "image", "inspect", NEW]))[0]
    require(new_image["Id"] == NEW and new_image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == REV, "Candidate image changed")
    source_files = [ROOT / "docker-compose.yml", ROOT / "docker-compose.override.yml"]
    base = config(project, source_files)
    require(base["services"][SERVICE].get("container_name") == APP, "Compose app identity changed")
    target = copy.deepcopy(base)
    target["services"][SERVICE]["image"] = NEW
    rollback = copy.deepcopy(base)
    rollback["services"][SERVICE]["image"] = OLD
    release_dir = STAGE / ("promotion-" + uuid.uuid4().hex[:12])
    release_dir.mkdir(mode=0o700)
    new_file, old_file = release_dir / "compose.candidate.json", release_dir / "compose.original.json"
    save(new_file, target, compose_file=True)
    save(old_file, rollback, compose_file=True)
    proposed = config(project, [new_file])
    frozen_old = config(project, [old_file])
    # Rendered snapshots must round-trip without changing even literal dollar signs.
    require(proposed == target and frozen_old == rollback, "Frozen Compose configuration did not round-trip exactly")
    compare = copy.deepcopy(proposed)
    if "image" in base["services"][SERVICE]:
        compare["services"][SERVICE]["image"] = base["services"][SERVICE]["image"]
    else:
        compare["services"][SERVICE].pop("image", None)
    require(compare == base, "Compose model changes more than the app image")
    # Create, but never start, a candidate profile on the existing network definitions.
    profile_project = "ffpro-profile-" + uuid.uuid4().hex[:12]
    profile_name = profile_project + "-app"
    profile = copy.deepcopy(proposed)
    profile.pop("name", None)
    service = profile["services"][SERVICE]
    profile["services"] = {SERVICE: service}
    service["container_name"] = profile_name
    for key in ["depends_on", "build", "profiles", "develop"]:
        service.pop(key, None)
    service["pull_policy"] = "never"
    for network in profile.get("networks", {}).values():
        network_name = network["name"]
        network.clear()
        network.update({"name": network_name, "external": True})
    for volume in profile.get("volumes", {}).values():
        volume_name = volume["name"]
        volume.clear()
        volume.update({"name": volume_name, "external": True})
    profile_file = release_dir / "compose.profile.json"
    save(profile_file, profile, compose_file=True)
    expected = None
    try:
        print("STOPPED_PROFILE=CREATING_APP_ONLY_CONFIGURATION", flush=True)
        run(stopped_profile_command(profile_project, profile_file), timeout=180)
        stopped = inspect(profile_name)
        require(stopped["State"]["Status"] == "created" and stopped["Image"] == NEW, "Candidate profile is not stopped on the pinned image")
        expected = runtime_view(stopped)
        old_view = runtime_view(original)
        permitted = allow_image_defaults(old_view, expected, old_image, new_image, base["services"][SERVICE])
        differences = changed_sections(permitted, expected)
        require(not differences, "Compose/runtime drift in: " + ",".join(differences))
        print("COMPOSE_MODEL=PASS_APP_IMAGE_ONLY", flush=True)
        print("STOPPED_PROFILE=PASS_ENVIRONMENT_MOUNTS_NETWORKS_AND_RUNTIME_SETTINGS", flush=True)
    finally:
        p = subprocess.run(["docker", "inspect", profile_name], capture_output=True, text=True, timeout=45)
        if p.returncode == 0:
            stopped = json.loads(p.stdout)[0]
            require(stopped["Name"] == "/" + profile_name and stopped["State"]["Status"] in {"created", "exited"}, "Refusing unexpected profile cleanup")
            run(["docker", "rm", stopped["Id"]], timeout=90)
    files_locked(manifest)
    require(config(project, source_files) == base, "Compose environment changed during preparation")
    locked, locked_db = inspect(APP), inspect(DB)
    require(locked["Id"] == original["Id"] and runtime_fingerprint(locked) == manifest["runtimeFingerprint"] and healthy(locked), "Live app changed during preparation")
    require(locked_db["Id"] == database["Id"] and healthy(locked_db), "Database changed during preparation")
    print("PREFLIGHT=PASS_ORIGINAL_RUNTIME_LOCKED", flush=True)
    print("BEGIN_APP_ONLY_IMAGE_SWITCH=YES", flush=True)
    try:
        run(compose(project, [new_file]) + ["up", "-d", "--no-build", "--no-deps", "--pull", "never", "--force-recreate", "--wait", "--wait-timeout", "180", SERVICE], timeout=300, stream=True)
        current, current_db = inspect(APP), inspect(DB)
        require(current["Image"] == NEW and healthy(current), "New app image/health mismatch")
        require(runtime_view(current) == expected, "New runtime differs from stopped profile")
        require(current_db["Id"] == database["Id"] and healthy(current_db), "Database identity/health changed")
        print(run(["docker", "exec", APP, "node", "-e", SERVE_CHECK], timeout=45).strip(), flush=True)
        receipt = {"createdAt": datetime.now(timezone.utc).isoformat(), "revision": REV,
                   "image": NEW, "appContainer": current["Id"], "databaseContainer": current_db["Id"],
                   "databaseUnchanged": True, "runtimeMatchesStoppedProfile": True,
                   "activeComposeFile": str(new_file), "originalComposeFile": str(old_file),
                   "configurationFingerprint": sha(canonical(expected))}
        save(STAGE / "promotion-receipt.json", receipt)
        print("CANDIDATE_IMAGE=" + NEW)
        print("CANDIDATE_REVISION=" + REV)
        print("DATABASE_CONTAINER=UNCHANGED_HEALTHY")
        print("DEPLOYMENT=PASS_FFPRO_WORKSPACE_DEPLOYED_HEALTHY")
        print("OWNER_CHECK=OPEN_FFPRO_FROM_HUB_AND_VERIFY_EXISTING_BALANCES")
    except Exception:
        print("SWITCH_CHECK=FAILED_RESTORING_ORIGINAL_APP_IMAGE", flush=True)
        try:
            run(compose(project, [old_file]) + ["up", "-d", "--no-build", "--no-deps", "--pull", "never", "--force-recreate", "--wait", "--wait-timeout", "180", SERVICE], timeout=300, stream=True)
            restored = inspect(APP)
            require(restored["Image"] == OLD and healthy(restored), "Original app did not recover")
            require(runtime_view(restored) == runtime_view(original), "Restored runtime differs from original")
            require(inspect(DB)["Id"] == database["Id"], "Database container changed")
            print("RECOVERY=PASS_ORIGINAL_APP_RESTORED_HEALTHY", flush=True)
        except Exception:
            print("RECOVERY=FAILED_NEEDS_ATTENTION", flush=True)
        raise RuntimeError("Promotion did not pass; see recovery status")


if __name__ == "__main__":
    try:
        main()
    except subprocess.TimeoutExpired:
        print("DEPLOYMENT=FAILED_COMMAND_TIMEOUT", flush=True)
        sys.exit(1)
    except Exception as error:
        print("DEPLOYMENT=FAILED: " + str(error), flush=True)
        sys.exit(1)
