redmine-swp-script
==================

Skript für automatisches Anlegen von Benutzern und Projekten unter [Redmine](http://www.redmine.org/).
Das Skript ist ausgelegt für das Praktikum [Softwareprojekt](http://www.fh-wedel.de/~si/praktika/SoftwarePraktikum/index.html) der [Fachhochschule Wedel](http://www.fh-wedel.de/), diese Notwendigkeit bestand, da regelmäßig aufwändig neue Projekte und Benutzer angelegt werden müssen. 

Installation
============

Getestet mit 
* node.js Version v0.8.11 und v0.8.12
* Ubuntu in Version 10.04.4 LTS und 12.04.1 LTS
* Redmine in Version 1.2.3.stable.10619

```
sudo apt-add-repository ppa:chris-lea/node.js
sudo apt-get update
sudo apt-get install nodejs nodejs-dev npm git-core
git clone git://github.com/JumpLink/redmine-swp-script.git
npm install
```
Npm installiert dabei automatisch die Abhängigkeiten nach, dies sind:
* optimist in Version 0.3.5
* mysql in Version 2.0.0-alpha3
* moment-range in Version 0.1.1
* restler in Version 2.0.1 und
und meinen Fork von [node-redmine](https://github.com/JumpLink/node-redmine).

Anschließend die Dateien mysql.json.example, redmine.json.example und svn.json.example umbenennen und anpassen:
```
cd config/
mv mysql.json.example mysql.json
mv redmine.json.example redmine.json
mv svn.json.example svn.json
vim mysql.json redmine.json svn.json
```
Den apiKey in der redmine.json kann man für einen Benutzer mit Adminrechten innerhalb von Redmine einrichten.


Zugriff von außen
-----------------
Wenn das Skript nicht auf dem selben Server ausgeführt werden soll auf dem Redmine installiert ist, dann ist noch folgendes nötig:

* bind-address innerhalb von /etc/mysql/my.cnf auskommentieren.
* mittels MySQL die Rechte der Datenbank anpassen:
```
grant all on redmine.* to 'redmine'@'%' IDENTIFIED BY 'Equ7Aise';
```

Bedienungsanleitung
===================
```
./app.js --template lua.json.example
```
Erzeugt Benutzer, Gruppen und Rechte entsprechend der Template-Datei lua.json.example.
Es wird dabei eine backup_lua.json.example erstellt mit zusätzlichen Informationen wie der IDs in der Datenbank.


Mit Hilfe dieser Backup-Template-Datei kann der Vorgang wieder rückgänig gemacht werden:
```
./app.js --removetemp backup_lua.json.example
```

Ein Backup der Datenbank nach backup/db/ kann wie folgt angefertigt werden:
```
./app.js --backup 
```

Und auch wiederhergestellt werden:
```
./app.js --restoredb [Backupdateiname]
```

Für eine ausführlichere Ausgabe kann der Debug-Modus aktiviert werden:

```
./app.js --debug --template lua.json.example
./app.js --debug --removetemp backup_lua.json.example
./app.js --debug --backup
usw..
```

Technisches
===========

Templates
---------
Ein Template ist ein Json-Format und beinhaltet Projekt, Gruppen und Benutzerinformationen welche dann automatisiert in Redmine eingepflegt werden.

Das Template beinhaltet 3 Hauptattribute:
* project: {...}
* users: [...]
* groups: [...]

### project

Das project-Attribut beinhaltet an erster Stelle das Hauptprojekt, das Hauptprojekt ist das Hauptthema des Software-Projektes.
Das Hauptprojekt hat die folgenden Atribute:
* project.name: "..."
* project.description: "..."
* project.links: [...]
* project.subprojects: [...]

#### project.subprojects
Das subprojects-Attribut ist ein Array mit Unterprojekten und hat unter anderem das Attribut
* project.subprojects[#].groups: [...]

##### project.subprojects[#].groups
Diese Gruppen werden unter Redmine als Projekt behandelt, stellen im Software-Projekt aber die Programmiergruppen da.

### users
* users = [...]
* users[#].student_id: "..."
* users[#].lastname: "..."
* users[#].firstname: "..."

### groups
* groups = [...]
* groups[#].name: "..."
* groups[#].users: [...]
* groups[#].type: "..."

#### groups[#].users
* groups[#].users: [...]

### Valide

Das Attribut groups muss die gleiche Länge haben wie die Summe der groups-Längen innerhalb aller subproject-Attribute.

Die Länge dieses Arrays groups muss der Länge des Arrays aus groups innerhalb aller project.subprojects entsprechen.

Siehe auch
--------
* https://github.com/GraemeF/redminer
* https://github.com/danwrong/restler
* https://github.com/JumpLink/node-redmine
* http://www.redmine.org/projects/redmine/wiki/Rest_api