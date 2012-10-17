redmine-swp-script
==================

Skript für automatisches Anlegen von Benutzern und Projekten.
Das Skript ist ausgelegt für das Praktikum [Softwareprojekt](http://www.fh-wedel.de/~si/praktika/SoftwarePraktikum/index.html) der [Fachhochschule Wedel](http://www.fh-wedel.de/), diese Notwendigkeit bestand, da regelmäßig aufwändig neue Projekte und Benutzer angelegt werden wüssen. 

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
-----------
Das subprojects-Attribut ist ein Array mit Unterprojekten und hat unter anderem das Attribut
* project.subprojects[#].groups: [...]

##### project.subprojects[#].groups
---------------------
Diese Gruppen werden unter Redmine als Projekt behandelt, stellen im Software-Projekt aber die Programmiergruppen da.

### users

### groups

### Valide

Das Attribut groups muss die gleiche Länge haben wie die Summe der groups-Längen innerhalb aller subproject-Attribute.

Die Länge dieses Arrays groups muss der Länge des Arrays aus groups innerhalb aller project.subprojects entsprechen.

Siehe auch
--------
* https://github.com/GraemeF/redminer
* https://github.com/danwrong/restler
* https://github.com/JumpLink/node-redmine
* http://www.redmine.org/projects/redmine/wiki/Rest_api