#!/usr/bin/env python3
"""Point manifest.json at the artifact the release workflow just built.

Jellyfin verifies a version's checksum before installing it, so a manifest entry
that does not match the published zip makes that version un-installable. Keeping
the entry in step by hand turned out not to work: re-running a release rebuilds
the zip, the checksum changes, and nobody notices until someone tries to install.
So the workflow that produces the artifact writes the entry itself.

Re-runs are the point: an existing entry is updated in place (URL, checksum,
timestamp), which is exactly the case that used to silently rot. The changelog is
editorial and is never overwritten once written; a brand-new entry takes its text
from build.yaml, falling back to "Release <version>".

Inputs come from the environment:
  EP_VERSION    version as it appears in the tag, e.g. "0.0.8"
  EP_MD5        md5 of the published zip
  EP_URL        download URL of the published zip
  EP_TIMESTAMP  ISO-8601 UTC timestamp for the entry

Prints what it did and exits non-zero if the manifest could not be updated.
"""

import json
import os
import re
import sys

MANIFEST = "manifest.json"
BUILD_YAML = "Jellyfin.Plugin.EasyPlugin/build.yaml"


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def require(name):
    value = os.environ.get(name, "").strip()
    if not value:
        fail(f"{name} is empty")
    return value


def normalise(version):
    """Tags carry three-part versions, manifest entries four-part ones."""
    parts = version.lstrip("v").split(".")
    while len(parts) < 4:
        parts.append("0")
    return ".".join(parts[:4])


def sort_key(entry):
    out = []
    for part in str(entry.get("version", "0")).split("."):
        out.append(int(part) if part.isdigit() else 0)
    while len(out) < 4:
        out.append(0)
    return out


def changelog_from_build_yaml(version):
    """Pull this version's paragraph out of build.yaml's folded changelog block."""
    try:
        text = open(BUILD_YAML, encoding="utf-8").read()
    except OSError:
        return None

    block = re.search(r"^changelog:[ \t]*>[ \t]*\n(.*?)(?=^\S|\Z)", text, re.M | re.S)
    if not block:
        return None

    for paragraph in re.split(r"\n[ \t]*\n", block.group(1)):
        joined = " ".join(line.strip() for line in paragraph.strip().splitlines())
        if joined.startswith(version):
            return re.sub(r"^" + re.escape(version) + r"\s*-\s*", "", joined).strip()
    return None


def main():
    version = normalise(require("EP_VERSION"))
    checksum = require("EP_MD5")
    url = require("EP_URL")
    timestamp = require("EP_TIMESTAMP")

    if not re.fullmatch(r"[0-9a-f]{32}", checksum):
        fail(f"EP_MD5 does not look like an md5: {checksum!r}")

    try:
        data = json.load(open(MANIFEST, encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"could not read {MANIFEST}: {exc}")

    if not isinstance(data, list) or not data or "versions" not in data[0]:
        fail(f"{MANIFEST} is not in the expected shape")

    versions = data[0]["versions"]
    existing = next((v for v in versions if str(v.get("version")) == version), None)

    if existing:
        was = existing.get("checksum")
        existing["sourceUrl"] = url
        existing["checksum"] = checksum
        existing["timestamp"] = timestamp
        action = "unchanged" if was == checksum else f"updated (was {was})"
        print(f"{version}: {action}")
    else:
        changelog = changelog_from_build_yaml(version) or f"Release {version}"
        versions.append(
            {
                "version": version,
                "changelog": changelog,
                "targetAbi": "10.11.0.0",
                "sourceUrl": url,
                "checksum": checksum,
                "timestamp": timestamp,
            }
        )
        print(f"{version}: added")

    versions.sort(key=sort_key, reverse=True)

    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


if __name__ == "__main__":
    main()
