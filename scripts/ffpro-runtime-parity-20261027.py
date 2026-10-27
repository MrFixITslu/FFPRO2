#!/usr/bin/env python3
"""Read-only FFPRO runtime/source comparison; never reads app data or environment values."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

EXPECTED_IMAGE = "sha256:3ad20da8499b48eaa31856c35c8c18770cc65aa03d70b3101da3de0102ad998a"
CANDIDATE = "096be5cbecc0a1808ac71b0ff3990d468b806c29"
EXPECTED = {"server.ts": "7d98adcab91b1d459eb12e9e0ba364b7f84551862c17b00584a0cab240d90f36", "server/accountLinkGuard.js": "0c5309e289472afcb6421dd705724ac79c614af2fab8daa41f789735443cace8", "server/calendarTime.js": "1c97cc0f2df0e322f1678b9329fb357ef2ffec0a076239feeaa07b716fdeb481", "server/config.js": "4e471b7dc7443036d96ffcbf426fe81b68f1e25109a198d6adf2609f069cf83c", "server/crypto.js": "300d7a95d96714d5f139c7c437e2ff67ae44c6f40b95d0f7cf3f0b76580b52d9", "server/db.js": "3b855f768f84e39c99da6d60cfc1f086da218feee87f9395c590cc4039fb6fd2", "server/fileAccess.js": "fdbb0c59c7e71a184a755438e8f5e82e7aafd13124c4b4fa5a166b776ac738d7", "server/filesDb.js": "2367cf092473bec98ec0275593edafe8c04fc57ed642895b0405865212abf47b", "server/gmailProcessedStore.js": "daeb3aa1f995900bb8d0c020670cd8de0afd15639d40b168529f935f7bbfd9d8", "server/googleTokens.js": "f70a02384a5c61433bdc729c2ad05a12e7e46d4501e1288f499ce3ceb74a2e64", "server/http.js": "3acf97ef93fbc76cf0c628d569f16573952e08e1eab30db1e0ddb48c2c1f0939", "server/hubAccess.js": "c5f47ad7614debeaa0d0b2f97b2a1722350a8140020a9a94d1bb47f1ce09c37b", "server/hubEntitlementRevalidation.js": "f6d4e14104dea268d55263c5d7f188c8f1cbaf687260231d1b8e866bd9025990", "server/hubManagedSessionPolicy.js": "e02ff82c00c161345bcfccdad42e2f84396b66841e915184b0036f6097333a1c", "server/hubSessionEnforcement.js": "9043aa91d11adf88f987388cf05582b5a0edb4790fb1d3bad9b6880c3af82cad", "server/jobs/fundingScheduler.js": "b15925f36463c7f7d5ec697de1c2cf0023afaf7e3ca9b9ccd2f81cb0e4557e5a", "server/mailer.js": "3ec0a9fb170c5a3715b9307ecec579b801b640d95a4ffe3397db8267da24ca6d", "server/middleware/allowedHost.js": "3b7fd6a3a4273b3de7b8a4a0ebdebc6c8c79280b34eb7250a5a81ce8fe29fac2", "server/middleware/requireAuth.js": "ff27aa2d2aea65fa628e6ef793eeefb0ae94590867cd20b7acdd7528576b7119", "server/middleware/sameOriginOnly.js": "d3f1fcbd4a77c8ba8f1a4adaca6819ed13c2368744af55d198ac8c05c8ca8d65", "server/middleware/uploadGate.js": "91a12b56c71be03d6a055bb2654d9c5351121747f720a7c6c80de3f3061d8d83", "server/passport.js": "168802b9c653d079b77fe651b50ea8c612783eaa56f99394ce313233e65f28c5", "server/platformEvents.js": "3e7db7a2e66254fd18abb4719f8f0235490bba9165721688e48e3da65924d1d0", "server/projectsDb.js": "628a05dc7a37c5a091b32cd156d8eeb11ae2582ea31a9572d7a5bc12255f3cbf", "server/push.js": "b7c555ea24e10af37a1326dedb7537203b39adff8d471c26e45c98572760e608", "server/realtime.js": "c638336a55901c3683a9fbf2713384294d60c7192f4f25e59dbd3b752a64f569", "server/routes/ai.js": "82b85d2d03bf99a127fdcef569f6813722c423c1657881c5d9362425bc7185d9", "server/routes/aiNews.js": "7a780383b482f841aa8f6f33012f0d6b451311514ee57bbff5723c44c354f35e", "server/routes/auth.js": "cbf0ffc69dbcc346ee129ae0626abd549791bdf6584700330121c6ba0a9c25dd", "server/routes/data.js": "85285387faf6646841bb2f73c5cd8afa0e68619e24007837d97c4025eff307d4", "server/routes/files.js": "af5958c219bd710505d30ea68275600a545091bb62aabf3c03ec71dc04025c73", "server/routes/funding.js": "7479e02a1f07c0ce32d0a67a1a7f6647fb15dd772e1ebc5698d1583e78007c60", "server/routes/gmail.js": "7a15454805da5b409a6ea9744faa695d0458e6e0df1408d3a8111b0ab7206e3d", "server/routes/googleCalendar.js": "8f62cbce32a08aa5296c1f078898782f4e462db6616aca6cc59b99b463cf2a87", "server/routes/invites.js": "2a4fd78ac20dd684dde2f20a4e0b9181a8b535a794ec5fae4dde95957e19b274", "server/routes/legal.js": "a984c61ce228b5fb086969b3c840dcbfa525e6fb2746262b0d78120faec23cd5", "server/routes/notifications.js": "bfd2c5aaa9e0f98f5281e86583992a19693a00a72ae65fe13e271f7ea63c53fd", "server/routes/platform.js": "b6e790382f3579dcb955617fb22fe53005e3ab451c635fcbb3571b364772e2e1", "server/routes/projects.js": "185ce32365e8d539f29e9247f1b3a32d8ddb6d0d1ed3cc070d04a4cb4205dcf9", "server/routes/realtime.js": "c0420eb6c43b1fe33885bd4fbf20086efa26b77f92934a2ae08ea703d47afed7", "server/routes/tiquetGateway.js": "3012399d80a7d88425f155c1abffe449b89154d53f4324edb0d5edd863d2c75e", "server/securityStore.js": "31c7ac8cf9a4a142ffd65ee2b1b7db00a0cd1649cb79cfa053a481830cedeefd", "server/services/aiNewsService.js": "ad361a5bfc9c2beb67a881e9d7ccbf3888e9d5f9395c553a345336be39ad010c", "server/services/businessCopilotService.js": "0d50f435e7a9e32457591b21a63a1610ff883e7bf08b36b062b689230318b1a0", "server/services/cardImageGenerator.js": "46113c71d2b7638149bf55f36dad10815465b0ee73a32d2ff989acb3f1f703c5", "server/services/contentSanitizer.js": "00251f2aa7e6065ea1cfef4b26d33c37e2d9ae73d517a770eb15e60c033cf2cf", "server/services/fundingDeterministic.js": "85cb931244e8bee197e399904389b9719bc171c7ccdcb79897a1ab1885b6d31f", "server/services/fundingResearch.js": "d5cae7224456b8a964095d6379c4d4fde821eb8a75db1aaf65f5cb85aeddaf68", "server/services/ollamaClient.js": "2778144d28f6d74ea50de93c3e7da747d82de0bc01ef16dbd2f4413b0885527a", "server/services/ollamaService.js": "aa1cebbdd48502ae1cc34f1bc538481d6dec93b215617a5435f0e2128e5512eb", "server/services/quoteParser.js": "599ddb14282a2807c80db4a0f8ba48eb7452eb510317334832b37540a04aefaf", "server/services/statementParser.js": "f5e66a1dd4a76c41269bb184779f0005c74fa65539cdc8e43473b54f439dbff2", "server/services/tavilySearch.js": "f018829631bb1e2020492f0a57d0dc8d761c84c1dbf2c446c5533f6fc2eeb87c", "server/utils/urlHelper.js": "1956794c55bd3f166a6515933eacbd6306bfca2511900327cab789fbe5aeaf82", "shared/appState.js": "7b2aa4658e6952d6beeff3f8bcc2cda61b4c520e8d963668b680fdecc51d88c7"}
ROOT = Path("/home/firelion/FFPRO2")


def compare(actual):
    return {"matched": sum(actual.get(k) == v for k, v in EXPECTED.items()),
            "expected": len(EXPECTED),
            "changed": sorted(k for k, v in EXPECTED.items() if k in actual and actual[k] != v),
            "missing": sorted(set(EXPECTED) - set(actual)),
            "additional": sorted(set(actual) - set(EXPECTED))}


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=45, **kwargs)


def main():
    if sys.argv[1:] == ["--self-check"]:
        assert compare(EXPECTED)["matched"] == len(EXPECTED)
        altered = dict(EXPECTED)
        altered["server.ts"] = "changed"
        assert compare(altered)["changed"] == ["server.ts"]
        assert compare({})["missing"] == sorted(EXPECTED)
        print("SELF_CHECK=PASS_COMPARISON_ONLY")
        return
    if sys.argv[1:]:
        raise RuntimeError("Unexpected arguments")
    r = run(["docker", "inspect", "fire-finance-app"])
    if r.returncode:
        raise RuntimeError("App inspection unavailable")
    app = json.loads(r.stdout)[0]
    if app["Image"] != EXPECTED_IMAGE or app["State"]["Status"] != "running":
        raise RuntimeError("Running image changed or app stopped; capture fresh inventory")
    print("CANDIDATE=" + CANDIDATE)
    print("RUNNING_IMAGE_LOCK=PASS")
    labels = app["Config"].get("Labels") or {}
    for f in ["docker-compose.yml", "docker-compose.override.yml", "Dockerfile", "package.json", "package-lock.json"]:
        p = ROOT / f
        print("HOST_FILE=" + json.dumps({"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None}))
    r = run(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
    print("HOST_GIT_HEAD=" + (r.stdout.strip() if r.returncode == 0 else "UNAVAILABLE"))
    actual = {}
    for name in EXPECTED:
        p = ROOT / name
        if p.is_file():
            actual[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    print("HOST_BACKEND_COMPARISON=" + json.dumps(compare(actual)))
    js = r"""
const fs=require('fs'),crypto=require('crypto');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const maps=['/app/build/server.cjs.map','/app/server.cjs.map'];
const p=maps.find(p=>fs.existsSync(p));
let sources=null;
if(p){
 const m=JSON.parse(fs.readFileSync(p,'utf8'));sources={};
 for(let i=0;i<m.sources.length;i++){
  const name=m.sources[i].replace(/^(\.\.\/)+/,'');
  if(typeof m.sourcesContent?.[i]==='string') sources[name]=hash(m.sourcesContent[i]);
 }
}
const files={};
for(const p of ['/app/build/server.cjs','/app/server.cjs','/app/package.json','/app/package-lock.json'])
 if(fs.existsSync(p))files[p]=hash(fs.readFileSync(p));
const versions={};
for(const name of ['body-parser','dompurify','ip-address','multer','nodemailer','qs']){
 const p='/app/node_modules/'+name+'/package.json';
 versions[name]=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')).version:null;
}
console.log(JSON.stringify({sources,files,versions,node:process.version}));
"""
    r = run(["docker", "exec", "-i", "fire-finance-app", "node", "-"], input=js)
    if r.returncode:
        print("RUNNING_BUNDLE_COMPARISON=UNAVAILABLE")
    else:
        result = json.loads(r.stdout)
        sources = result.pop("sources")
        print("RUNNING_BUNDLE_COMPARISON=" + (json.dumps(compare(sources)) if sources is not None else "SOURCEMAP_UNAVAILABLE"))
        print("RUNNING_BUILD=" + json.dumps(result))
    print("PRODUCTION_CHANGES=NONE")
    print("APP_DATA_AND_KEYS=NOT_READ")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("PARITY_CAPTURE=FAILED_" + type(exc).__name__)
        sys.exit(1)
