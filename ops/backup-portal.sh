#!/bin/sh
set -eu
docker exec artimex-portal-store python -c '
import sqlite3, pathlib, datetime
folder=pathlib.Path("/data/backups");folder.mkdir(exist_ok=True)
target=folder/(datetime.datetime.now(datetime.timezone.utc).strftime("portal-%Y-%m-%d")+".sqlite3")
source=sqlite3.connect("/data/portal.sqlite3");backup=sqlite3.connect(target)
source.backup(backup);backup.close();source.close()
for old in sorted(folder.glob("portal-*.sqlite3"))[:-14]: old.unlink()
'
