#!/usr/bin/env python3
import sqlite3
from pathlib import Path
p=Path('frontend/preview-seed.db')
if p.exists():p.unlink()
db=sqlite3.connect(p)
db.executescript('''
PRAGMA foreign_keys=ON;
CREATE TABLE app_meta(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);
CREATE TABLE profile(id TEXT PRIMARY KEY NOT NULL CHECK(id='singleton'),name TEXT NOT NULL DEFAULT '',default_house_id TEXT,alarm_lead_minutes INTEGER NOT NULL DEFAULT 150,pay_period_type TEXT NOT NULL DEFAULT 'week',pay_week_start_dow INTEGER NOT NULL DEFAULT 1,pay_fortnight_anchor TEXT,default_hourly_rate REAL NOT NULL DEFAULT 0);
CREATE TABLE houses(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',is_default INTEGER NOT NULL DEFAULT 0,hourly_rate REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE roster_scans(id TEXT PRIMARY KEY NOT NULL,captured_at TEXT NOT NULL,original_uri TEXT,image_sha256 TEXT,ocr_engine TEXT NOT NULL,parser_version INTEGER NOT NULL,overall_confidence REAL,status TEXT NOT NULL,raw_ocr_json TEXT);
CREATE TABLE shifts(id TEXT PRIMARY KEY NOT NULL,date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,house_id TEXT,house_name TEXT NOT NULL DEFAULT '',alarm_enabled INTEGER NOT NULL DEFAULT 1,notes TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',roster_scan_id TEXT,confidence REAL,confirmation_status TEXT NOT NULL DEFAULT 'confirmed',original_date TEXT NOT NULL,original_start_time TEXT NOT NULL,original_end_time TEXT NOT NULL,original_house_id TEXT,original_house_name TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,is_deleted INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE SET NULL,FOREIGN KEY(roster_scan_id) REFERENCES roster_scans(id) ON DELETE SET NULL);
CREATE TABLE shift_changes(id TEXT PRIMARY KEY NOT NULL,shift_id TEXT NOT NULL,changed_at TEXT NOT NULL,change_type TEXT NOT NULL,phase TEXT NOT NULL,previous_json TEXT NOT NULL,new_json TEXT NOT NULL,previous_start TEXT NOT NULL,previous_end TEXT NOT NULL,new_start TEXT NOT NULL,new_end TEXT NOT NULL,hours_delta REAL NOT NULL,FOREIGN KEY(shift_id) REFERENCES shifts(id) ON DELETE RESTRICT);
CREATE INDEX idx_shifts_date ON shifts(date);CREATE INDEX idx_shift_changes_shift ON shift_changes(shift_id,changed_at);
''')
now='2026-09-14T00:00:00.000Z'
db.execute("INSERT INTO app_meta VALUES('schema_version','4')")
db.execute("INSERT INTO profile VALUES('singleton','Preview','h1',150,'fortnight',1,'2026-09-07',40.0)")
db.executemany('INSERT INTO houses VALUES(?,?,?,?,?,?,?)',[('h1','House A','',1,40.0,now,now),('h2','House B','',0,42.0,now,now)])
rows=[('s1','2026-09-14','07:00','19:00','h1','House A',0,'Residential care','manual',None,None,'confirmed','2026-09-14','08:00','19:00','h1','House A',now,now,0),('s2','2026-09-15','07:00','19:00','h1','House A',0,'Residential care','manual',None,None,'confirmed','2026-09-15','07:00','19:00','h1','House A',now,now,0),('s3','2026-09-16','19:00','07:00','h2','House B',0,'Residential care','manual',None,None,'confirmed','2026-09-16','19:00','07:00','h2','House B',now,now,0),('s4','2026-09-17','19:00','07:00','h2','House B',0,'Residential care','manual',None,None,'confirmed','2026-09-17','19:00','07:00','h2','House B',now,now,0),('s5','2026-09-18','07:00','15:00','h1','House A',0,'Residential care','manual',None,None,'confirmed','2026-09-18','07:00','15:00','h1','House A',now,now,0),('s6','2026-09-19','19:00','07:00','h2','House B',0,'Residential care','manual',None,None,'confirmed','2026-09-19','19:00','07:00','h2','House B',now,now,0)]
db.executemany('INSERT INTO shifts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
db.execute('INSERT INTO shift_changes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',('c1','s1','2026-09-14T00:00:00.000Z','update','before','{"start_time":"08:00","end_time":"19:00"}','{"start_time":"07:00","end_time":"19:00"}','08:00','19:00','07:00','19:00',1.0))
db.commit();db.close()
