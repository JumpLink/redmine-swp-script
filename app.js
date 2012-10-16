#!/usr/bin/nodejs
/*
 * Autor: Pascal Garber
 * License: Do whatever you want, but please publish your changes under the same license.
 */

var Redmine    = require('redmine');                                          // Redmine-REST-API
var mysql      = require('mysql');                                            // MySQL-Zugriff
var exec       = require('child_process').exec;                               // Linux Befehle ausführen
var fs         = require('fs');                                               // Dateisystem-Zugriff
var moment     = require('moment-range');                                     // Tools für das Rechnen mit Zeiten
var option     = require(__dirname+'/option.js');                             // Ausgelagerte Option verarbeitung laden
var optimist   = option.optimist;                                             // Option-Tool
var argv       = option.argv;                                                 // Übergebene Option
var config     = option.config;                                               // Configurationsdateien
var json_file  = option.json_file;                                            // Json-Dateien laden

// Redmine mit entsprechender Config
var redmine = new Redmine({
  host: config.redmine.host,
  apiKey: config.redmine.apiKey
});

// mysql-Verbindung mit entsprechender Config
var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  debug: argv.debug
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
 * Bedingung: mysqldump muss instaliiert sein.
 */ 
function backup_database_mysql () {
  fs.exists('/usr/bin/mysqldump', function (exists) {
    if(exists) {
      var command = "/usr/bin/mysqldump -h "+config.mysql.host+" -u "+config.mysql.user+" -p"+config.mysql.password+" "+config.mysql.name+" | gzip > "+__dirname+argv.backpath+argv.output;
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
 * Erzeugt ein neues Projekt.
 *
 * @param name: Name des Projektes als String
 * @param description: Beschreibung des Projektes als String
 * @param identifier: URL-Teil
 * @param links: Links als Liste von Strings die in die Beschreibung mit übernommen werden.
 * @param parent: Elternprojekt
 * @param number: Zähler
 * @param cb: callback-Funktion
 */ 
function create_project_rest (name, description, identifier, links, parent, number, cb) {
  var project = {
    name: name,
    identifier: identifier,
  };
  if (description)
    project.description = description;

  if (parent && parent.project && parent.project.id)
    project.parent_id = parent.project.id;

  if (links) {
    project.description += "\n";
    for (var i in links)
      project.description += "\n"+links[i];
  }

  redmine.postProject(project, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb(data, number);
  });
}

/*
 * Projekte anhand eines template-json-strings laden.
 *
 * Verarbeitung asynchron daher Ausgabenreihenfolge unvorhersehbar.
 */ 
function create_projects (template) {
  // Erzeugt Hauptproject
  create_project_rest (template.project.name, template.project.description, get_semester()+"-main", template.project.links, null, 0, function(main_project){
    console.log("Hauptprojekt '"+main_project.project.name+"' mit ID "+main_project.project.id+" erfolgreich erstellt.");
    
    // Durchläut Teilprojekte
    for (var k in template.project.subprojects) {

      // Erstellt Teilprojekt
      create_project_rest (template.project.subprojects[k].name, template.project.subprojects[k].description, get_semester()+"-sub"+k, null, main_project, k, function(sub_project, number) {
        console.log("Unterprojekt '"+sub_project.project.name+"' mit ID "+sub_project.project.id+" erfolgreich erstellt.");

        // Durchläuft Teilprojektgruppen
        for (var n in template.project.subprojects[number].groups) {

          // Erstellt Teilprojektgrupp
          create_project_rest (template.project.subprojects[number].groups[n], null, get_semester()+"-"+template.project.subprojects[number].groups[n].toLowerCase().replace(" ", "-"), null, sub_project, n, function(group, number) {
            console.log("tGruppe '"+group.project.name+"' mit ID "+group.project.id+" erfolgreich erstellt.");
          });
        }
      });
    }
  });
}

/*
 * Alle Projekte im JSON-Format ausgeben.
 */ 
function get_projects_rest () {
  redmine.getProjects(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    console.log(data);
  });
}

/*
 * Alle Benutzer im JSON-Format ausgeben.
 */ 
function get_users_rest () {
  redmine.getUsers(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    console.log(data);
  });
}

/*
 * Template in Form einer Json-Datei laden und dadurch Projekte und Benutzer anlegen.
 *
 * @param filename: String des Dateinamens der Datei die aus ./templates/ geladen werden soll.
 */ 
function load_template (filename) {
  var template = json_file.open(argv.p+filename);
  create_projects (template);
}

/*
 * Anhand übergebene Option Skript ausführen
 */
function run() {

  // Hilfe ausgeben
  if(argv.help)
    optimist.showHelp ();

  // Projekte ausgeben
  if(argv.getprojects)
    get_projects_rest ();

  // Benutzer ausgeben
  if(argv.getusers)
    get_users_rest ();

  // Backup erstellen
  if(argv.backup)
    backup_database_mysql ();

  // User sperren
  if(argv.lock)
    lock_all_users_mysql ();

  // Projekte archivieren
  if(argv.archive)
    archive_all_projects_mysql ();

  // Semesterbezeichnung ausgeben
  if(argv.semester)
    console.log(get_semester ());

  // Template verarbeiten
  if(argv.template)
    load_template (argv.template);

  // Neues Projekt erstellen
  if(argv.project) {
    if(!argv.identifier) {
      optimist.showHelp();
      console.log("\nIdentifier nicht angegeben!");
    } else{
      var parent = {project:{id:argv.parentid}}
      create_project_rest (argv.project, argv.description, argv.identifier, null, parent, 0, function(data) {
        console.log(data);
      })
    }
  }
}
    
run();