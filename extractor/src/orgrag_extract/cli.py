"""CLI: orgrag-extract ingest <file> --workspace <ws> | cleanup --workspace <ws>"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from dotenv import load_dotenv

from orgrag_extract.staging import cleanup_workspace, ingest_file


def main() -> int:
    load_dotenv()  # repo root .env when run from repo root
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(prog="orgrag-extract")
    sub = parser.add_subparsers(dest="command", required=True)

    ingest = sub.add_parser("ingest", help="run LightRAG ainsert on one file into a staging workspace")
    ingest.add_argument("file", help="path to md/txt/csv file")
    ingest.add_argument("--workspace", required=True, help="staging workspace name, e.g. staging_<doc_id>")
    ingest.add_argument("--cleanup-after", action="store_true", help="drop the staging workspace after ingestion")

    clean = sub.add_parser("cleanup", help="drop a staging workspace (idempotent)")
    clean.add_argument("--workspace", required=True, help="staging workspace name")

    args = parser.parse_args()

    try:
        if args.command == "ingest":
            result = asyncio.run(ingest_file(args.workspace, args.file))
            print(
                f"ingest ok: workspace={result.workspace} file={result.file} "
                f"chunks={result.chunks} entities={result.entities} relations={result.relations}"
            )
            if args.cleanup_after:
                asyncio.run(cleanup_workspace(args.workspace))
        else:
            asyncio.run(cleanup_workspace(args.workspace))
            print(f"cleanup ok: workspace={args.workspace}")
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        logging.error("extract failed: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
