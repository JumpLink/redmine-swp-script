#!/usr/bin/nodejs
// https://github.com/GraemeF/redminer
// https://github.com/danwrong/restler
// https://github.com/sotarok/node-redmine
// http://www.redmine.org/projects/redmine/wiki/Rest_api

var Redmine    = require('redmine');              // Redmine-REST-API
var sys        = require('util');
var json_file  = require(__dirname+'/json.js');   // Json-Dateien laden
var mysql      = require('mysql');                // MySQL-Zugriff
var exec       = require('child_process').exec;   // Linux Befehle ausführen
var fs         = require('fs');                   // Dateisystem-Zugriff
var moment     = require('moment-range');               // Tools für das Rechnen mit Zeiten

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
      return "ws"+Number(now.format("YY"))+"/"+(Number(now.format("YY"))+1);
    else
      return "ws"+(Number(now.format("YY"))-1)+"/"+Number(now.format("YY"));
}
  

function create_project_rest (name, description, links, type) {
  var project = {
    name: name,
    identifier: "test",
    description: description
  };
  redmine.postProject(project, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    console.log(data);
  });
}

/*
 * Template in Form einer Json-Datei laden und dadurch Projekte und Benutzer anlegen.
 */ 
function load_template (filename) {
  var template = json_file.open('templates/'+filename);
  console.log("Name");
  console.log(template.project.name);
  console.log("Description");
  console.log(template.project.description);
  console.log("Links");
  for (var i in template.project.links) 
    console.log(template.project.links[i]);
  console.log("SubProjects");
  for (var i in template.project.subprojects) 
    console.log(template.project.subprojects[i]);
}

//load_template ("lua.json");
console.log(get_semester());