#!/usr/bin/nodejs
// https://github.com/GraemeF/redminer
// https://github.com/danwrong/restler
// https://github.com/sotarok/node-redmine
// http://www.redmine.org/projects/redmine/wiki/Rest_api
/*
 * Autor: Pascal Garber
 * License: Do whatever you want, but please publish your changes.
 */

var Redmine    = require('redmine');              // Redmine-REST-API
var json_file  = require(__dirname+'/json.js');   // Json-Dateien laden
var mysql      = require('mysql');                // MySQL-Zugriff
var exec       = require('child_process').exec;   // Linux Befehle ausführen
var fs         = require('fs');                   // Dateisystem-Zugriff
var moment     = require('moment-range');         // Tools für das Rechnen mit Zeiten

// Beinhaltet die Configurationen aus dem config-Verzeichnis
var config     = {
  mysql: json_file.open('config/mysql.json'),
  redmine: json_file.open('config/redmine.json')
}

// Redmine mit entsprechenden Einstellungen aus der config/redmine.json
var redmine = new Redmine({
  host: config.redmine.host,
  apiKey: config.redmine.apiKey
});

// mysql-Verbindung mit entsprechenden Einstellungen aus der config/mysql.json
var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  debug: false
});

/*
 * Alle Projekte mittels mysql Archivieren (bzw. deaktivieren)
 * status: 9 = archiviert; 1 = aktiviert
 */ 
function archive_all_projects_mysql () {
  connection.query('update '+config.mysql.name+'.projects set status=9 where status=1', function(err, rows, fields) {
   if (err) throw err;
  });

  connection.end();
}

/*
 * Alle Benutzer - bis auf ars, si und admin - mittels mysql sperren
 * status: 1 = entsperrt; 3 = gesperrt
 */ 
function lock_all_users_mysql () {
  connection.query('update '+config.mysql.name+'.users set status=3 where status=1 and login!=ars and login!=si and login!=admin', function(err, rows, fields) {
   if (err) throw err;
  });

  connection.end();
}

/*
 * Backup der Redmine-Datenbank erstellen
 * Bedinung: mysqldump muss instaliiert sein.
 */ 
function backup_database_mysql () {
  fs.exists('/usr/bin/mysqldump', function (exists) {
    if(exists) {
      var command = "/usr/bin/mysqldump -h "+config.mysql.host+" -u "+config.mysql.user+" -p"+config.mysql.password+" "+config.mysql.name+" | gzip > "+__dirname+"/backup/db/"+config.mysql.name+"_`date +%F_%T`.gz";
      exec(command, function (error, stdout, stderr) { 
        console.log(stdout);
      });
    } else {
      console.log("Fehler: /usr/bin/mysqldump nicht gefunden!\nBitte mysql-server installieren oder dieses direkt Skript auf dem Server ausführen.");
    }
  });
}

/*
 * Berechnet die aktuelle Semesterbezeichnung und gibt sie als String zurück
 */ 
function get_semester () {
  var now = moment();

  // Wintersemester vor Silvester
  var ws_before = {
    start : moment().month(9).date(1).hours(0).minutes(0).seconds(0).milliseconds(0),                        // 1. Oktober
    end : moment().month(11).date(31).hours(23).minutes(59).seconds(59).milliseconds(999)  // 31. Dezember
  }

  // Wintersemester nach Silvester (Nicht verwendet)
  var ws_after = {
    start : moment().month(0).date(1).hours(0).minutes(0).seconds(0).milliseconds(0),                        // 1. Januar
    end : moment().year(now.year()+1).month(2).date(31).hours(23).minutes(59).seconds(59).milliseconds(999)  // 31. März
  }

  // Sommersemester
  var ss = {
    start :  moment().month(3).date(1).hours(0).minutes(0).seconds(0).milliseconds(0),    // 1. April
    end : moment().month(8).date(30).hours(23).minutes(59).seconds(59).milliseconds(999)  // 30. September  
  }
  // Aktuelle Zeit innerhalb des Sommersemesters?
  if ( now.within(moment().range(ss.start, ss.end)) )
    return "ss"+now.year();
  else
    // Aktuelle Zeit innerhalb des Wintersemesters vor Silvester?
    if( now.within(moment().range(ws_before.start, ws_before.end)) )
      return "ws"+Number(now.format("YY"))+"-"+(Number(now.format("YY"))+1);
    else
      return "ws"+(Number(now.format("YY"))-1)+"-"+Number(now.format("YY"));
}
  
/*
 * Erzeugt ein neues Hauptprojekt.
 *
 * @param name: Name des Projektes als String.
 * @param description: Beschreibung des Projektes als String.
 * @param links: Links als Liste von Strings die in die Beschreibung mit übernommen werden.
 * @param cb: callback-Funktion
 */ 
function create_main_project_rest (name, description, links, cb) {
  var project = {
    name: name,
    identifier: get_semester()+"-main",
    description: description + "\n"
  };
  for (var i in links)
     project.description += "\n"+links[i];

  redmine.postProject(project, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb(data);
  });
}

/*
 * Erzeugt ein neues Unterprojekt.
 *
 * @param name: Name des Projektes als String.
 * @param description: Beschreibung des Projektes als String.
 * @param parent: Elternprojekt
 * @param number: Zähler
 * @param cb: callback-Funktion
 */ 
function create_sub_project_rest (name, description, parent, number, cb) {
  var project = {
    name: name,
    identifier: get_semester()+"-sub"+number,
    description: description,
    parent_id: parent.project.id
  };

  redmine.postProject(project, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb(data, number);
  });
}

/*
 * Erzeugt ein weiteres Unterprojekt genannt Gruppe,
 * Gruppe da passendere Bezeichnung für Sinn und Zweck dieses Unterprojektes.
 *
 * @param name: Name des Projektes als String.
 * @param parent: Elternprojekt
 * @param cb: callback-Funktion
 */ 
function create_sub_project_group_rest (name, parent, cb) {
  var project = {
    name: name,
    identifier: get_semester()+"-"+name.toLowerCase().replace(" ", "-"),
    parent_id: parent.project.id
  };
  console.log(project);
  redmine.postProject(project, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb(data);
  });
}

/*
 * Template in Form einer Json-Datei laden und dadurch Projekte und Benutzer anlegen.
 * Die Verarbeitung läuft asynchron, daher Ausgabe ebenfalls asynchron und
 * augenscheinlich in falscher Reihenfolge.
 */ 
function load_template (filename) {

  // Ladet das Template
  var template = json_file.open('templates/'+filename);
  
  // Erzeugt Hauptproject
  create_main_project_rest(template.project.name, template.project.description, template.project.links, function(main_project){
    console.log("Hauptprojekt '"+main_project.project.name+"' mit ID "+main_project.project.id+" erfolgreich erstellt.");
    
    // Durchläut Teilprojekte
    for (var k in template.project.subprojects) {

      // Erstellt Teilprojekt
      create_sub_project_rest (template.project.subprojects[k].name, template.project.subprojects[k].description, main_project, k, function(sub_project, number) {
        console.log("Unterprojekt '"+sub_project.project.name+"' mit ID "+sub_project.project.id+" erfolgreich erstellt.");

        // Durchläuft Teilprojektgruppen
        for (var n in template.project.subprojects[number].groups) {

          // Erstellt Teilprojektgruppe
          create_sub_project_group_rest (template.project.subprojects[number].groups[n], sub_project, function(group) {
            console.log("tGruppe '"+group.project.name+"' mit ID "+group.project.id+" erfolgreich erstellt.");
          });
        }
      });
    }
  });
}

//load_template ("lua.json");

