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
cd redmine-swp-script/
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
dein-lieblings-editor mysql.json redmine.json svn.json
```
apiKey
------
In der redmine.json muss der apiKey eingetragen werden, welcher zuvor in Redmine anzulegen ist:
* Lock ich mit dem entsprechenden Admininstrator unter Redmine ein.
* Gehe auf deine.redmine.domain/settings oder Redmine Startseite->Administration->Konfiguration, klicke auf den Reiter Authentifizierung und mache einen Hacken bei "REST-Schnittstelle aktivieren" und speicher dies.
* Gehe auf deine.redgmine.domain/my/account oder Redmine-Startseite->Mein Konto und lege dir einen RSS-Zugriffsschlüssel an und/oder kopiere den vorhanden.
* Speichere diesen Key in der redmine.json für das apiKey-Attribute ab.

Zugriff von außen
-----------------
Wenn das Skript nicht auf dem selben Server ausgeführt werden soll - auf dem Redmine installiert ist - dann ist noch folgendes von nöten:

* bind-address innerhalb von /etc/mysql/my.cnf auskommentieren.
* mittels MySQL die Rechte der Datenbank anpassen:
```
grant all on database.* to 'user'@'%' IDENTIFIED BY 'passwort';
```

Hinweis: Backups funktionieren derzeit nur lokal

Anpassen
========
Das Skript kann durch Optionen beeinflusst werden, dafür einfach mal in die Hilfe schauen: ```./app.js --help```.

Sollen bestimmte Benutzer nicht automatisch vom Skript deaktivert werden (z.B. sollte sich der Admin nicht selbst aussperren), muss das Skript derzeit noch [manuell bearbeitet](https://github.com/JumpLink/redmine-swp-script/blob/master/app.js#L311) werden.

Bedienungsanleitung
===================
Vorbedingungen
-------------
* Es darf keine erforderlichen benutzerdefinierten Felder geben.
 * Die benutzerdefinierten Felder sind unter deine.redmine.domain/custom_fields oder unter Redmine-Startseite->Administration->Benutzerdefinierte Felder zu finden.
* Der anzulegende Benutzer-Anmeldename (= Matrikelnummer) / die anzulegende Projekt-Kennung (= Semesterbezeichnung + Projektkürzel) darf nicht bereits vergeben sein.
* Die LDAP-Authentifizierung muss bereits eingerichtet sein.
 * Einstellbar unter deine.redmine.domain/ldap_auth_sources oder Redmine-Startseite->Administration->LDAP-Authentifizierung
 * Zur Selbstkontrolle ist es möglich, sich die vorhanden Authentifizierungs-Arten ausgeben zu lassen: ```./app.js --getldap```.
 * Soll eine andere ID als 1 verwendet werden, kann sie mit der Option ```--auth_id #``` (# ersetzen mit der gewünschten ID) festgelegt werden.

Die empfohlene Vorgehensweise ist:
Vollautomatisch
-----------
```
./app.js --template lua.json.example --auto
```
* Hierbei wird geprüft ob das Template valide ist,
* Backups angefertigt,
* alle anderen Benutzer und Gruppen deaktiviert,
* dass Template eingepflegt (in diesem Fall lua.json.example)
* und ein Backup-Template erstellt.

Das Template muss vorher irgendwie generiert, unter templates/ abgelegt werden und dem [Beispiel-Template](https://github.com/JumpLink/redmine-swp-script/blob/master/templates/lua.json.example) entsprechen.

Nur Template überprüfen
-------------------
Ob das Template valide ist kann wie folgt überprüft werden:
```
./app.js --template lua.json.example --check
```

Nur Template einpflegen
-----------------------
Es ist auch möglich ein Template ein zu plegen ohne dabei Backups anzufertigen oder etwas zu deaktivieren:
```
./app.js --template lua.json.example
```
Erzeugt Benutzer, Gruppen und Rechte entsprechend der Template-Datei lua.json.example.
Es wird dabei eine backup_lua.json.example erstellt mit zusätzlichen Informationen wie der IDs in der Datenbank.


Template rückgängig machen
--------------------------
Mit Hilfe der Backup-Template-Datei (wird automatisch nach dem einpflegen einer Template angefertigt) kann der Vorgang wieder rückgänig gemacht werden:
```
./app.js --removetemp backup_lua.json.example
```

Nur ein Datenbankbackup anfertigen
----------------------------------
Ein Backup der Datenbank nach backup/db/ kann wie folgt angefertigt werden:
```
./app.js --backup 
```

Ein Datenbankbackup wiederhergestellen
--------------------------------------
Und auch wiederhergestellt werden:
```
./app.js --restoredb [Backupdateiname]
```

Debug-Modus
-----------
Für eine ausführlichere Ausgabe kann der Debug-Modus aktiviert werden:

```
./app.js --debug --template lua.json.example
./app.js --debug --removetemp backup_lua.json.example
./app.js --debug --backup
usw..
```

Weiteres
--------
Es gibt noch weitere Möglichkeiten, benutze dafür die Hilfe: ```./app.js --help```.

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

#### groups[#].name
* z.B. "swp01"

#### groups[#].users
* z.B. ["inf4444", "inf1111", "inf6666"]

#### groups[#].type
* "developer" oder "coordinator"

Siehe auch
--------
* https://github.com/GraemeF/redminer
* https://github.com/danwrong/restler
* http://www.redmine.org/projects/redmine/wiki/Rest_api
* https://github.com/felixge/node-mysql