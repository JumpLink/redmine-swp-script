redmine-swp-script
==================

Templates
---------
Ein Template ist ein Json-Format und beinhaltet Projekt, Gruppen und Benutzerinformationen welche dann automatisiert in Redmine eingepflegt werden.

Das Template beinhaltet 3 Hauptattribute:
* project: {...}
* users: [...]
* groups: [...]

### project

Das project-Attribute beinhaltet an erster Stelle das Hauptprojekt, das Hauptprojekt ist das Hauptthema des Software-Projektes.
Das Hauptprojekt hat die folgenden Atribute:
* project.name: "..."
* project.description: "..."
* project.links: [...]
* project.subprojects: [...]

#### project.subprojects
-----------
Das subprojects-Attribute ist ein Array mit Unterprojekten und hat unter anderem das Attribute
* project.subprojects[#].groups: [...]

##### project.subprojects[#].groups
---------------------
Diese Gruppen werden unter Redmine als Projekt behandelt, stellen im Software-Projekt aber die Programmiergruppen da.

Achtung: Die Länge dieses Arrays project.subprojects[#].groups muss der Länge des Arrays von groups entsprechen.

### users

### groups

Achtung: Die Länge dieses Arrays groups muss der Länge des Arrays von project.subprojects[#].groups entsprechen.

Siehe auch
--------
* https://github.com/GraemeF/redminer
* https://github.com/danwrong/restler
* https://github.com/JumpLink/node-redmine
* http://www.redmine.org/projects/redmine/wiki/Rest_api