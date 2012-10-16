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
 * Speichert die angelegten Gruppen-IDs (bzw. Projekt-IDs auf niedrigster Ebene)
 * da diese später noch gebraucht werden.
 */ 
var groups = [];

/*
 * Speichert die angelegten Benutzer-IDs da diese später noch gebraucht werden.
 */ 
var users = [];

/*
 * Hilfsfunktionen zur Verwalltung von users und groups damit keine Verwechselungsgefahr besteht.
 */ 
function get_group (name) {
  get_data (groups);
}

function get_users (name) {
  get_data (users);
}

function get_data (data, name) {
  for (var i in data)
    if (data[i].name == name)
      return data[i];
    return null;
}

function add_group (name, id) {
  groups.push({name:name,id:id})
}

function get_group_length (name, id) {
  return groups.length;
}

function add_user (name, id) {
  users.push({name:name,id:id})
}

function get_user_length (name, id) {
  return users.length;
}


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
    cb (data, number);
  });
}

/*
 * Alle Projekte im JSON-Format ausgeben.
 */ 
function get_projects_rest (cb) {
  redmine.getProjects(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb (data);
  });
}

function create_user_rest (login, firstname, lastname, mail, cb) {
  var user = {
    login: login,
    firstname: firstname,
    lastname: lastname,
    mail: mail
  };
  redmine.postUser(user, function(data) {
    // FIXME
    // if (data instanceof Error) {
    //   console.log("Error: " + data);
    //   return;
    // }
    cb (data);
  });
}

/*
 * Alle Benutzer im JSON-Format an cb übergeben.
 */ 
function get_users_rest (cb) {
  redmine.getUsers(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb (data);
  });
}

/*
 * Alle Rollen im JSON-Format an cb übergeben. FIXME
 */ 
function get_roles_rest (cb) {
  redmine.getRoles(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb (data);
  });
}

/*
 * Alle Rollen als MySQL-Ausgabe ausgeben.
 */ 
function get_roles_mysql (cb) {
  connection.query('select id,name from '+config.mysql.name+'.roles', function(err, rows, fields) {
   if (err) throw err;
   cb (rows, fields);
  });
  connection.end();
}

/*
 * Alle Gruppen im JSON-Format ausgeben. FIXME
 */ 
function get_groups_rest (cb) {
  redmine.getGroups({}, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb (data);
  });
}

/*
 * Gruppe über die Rest-API erstellen FIXME
 */ 
function create_group_rest (name, user_ids, cb) {
  var group = {
    name: name,
    user_ids: user_ids
  };
  redmine.postGroup(group, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      return;
    }
    cb (data);
  });
}

/*
 * Benutzer anhand eines template-json-strings erstellen.
 */ 
function create_fh_users (template, cb) {
  // Durchläut Benutzer
  for (var i in template.users) {;
    // Benutzer anlegen
    create_user_rest(template.users[i].student_id, template.users[i].firstname, template.users[i].lastname, template.users[i].student_id+"@"+argv.mail, function(data){
      add_user(data.user.login, data.user.id);
      console.log("Benutzer '"+data.user.login+"' mit ID "+data.user.id+" erfolgreich angelegt.");
      if (get_user_length() == template.users.length) {
        console.log("Alle Benutzer angelegt.");
        cb (true);
      }
    });
  }
}

/*
 * Projekte anhand eines template-json-strings laden.
 *
 * Verarbeitung asynchron daher Ausgabenreihenfolge unvorhersehbar.
 */ 
function create_fh_projects (template, cb) {
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

          // Erstellt Teilprojektgruppe
          create_project_rest (template.project.subprojects[number].groups[n], null, get_semester()+"-"+template.project.subprojects[number].groups[n].toLowerCase().replace(" ", "-"), null, sub_project, n, function(group, number) {
            add_group(group.project.name, group.project.id);
            console.log("Gruppe '"+group.project.name+"' mit ID "+group.project.id+" erfolgreich erstellt.");

            // Da Ablauf asynchron hier ueberpruefung ob alle Unterprojekte erstellt wurden
            if(get_group_length() == template.groups.length) {
              console.log("Alle Gruppen erstellt.")
              cb (true);
            }
          });
        }
      });
    }
  });
}

/*
 * Template in Form einer Json-Datei laden und dadurch Projekte und Benutzer anlegen.
 *
 * @param filename: String des Dateinamens der Datei die aus ./templates/ geladen werden soll.
 */ 
function load_template (filename, cb) {
  var template = json_file.open(argv.p+filename);
  console.log("Erstelle Projekte");
  create_fh_projects (template, function() {
    console.log("Erstelle Benutzer");
    create_fh_users (template, function() {
      cb(true);
    });
  });
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
    get_projects_rest (function(data){
      console.log(data);
    });

  // Benutzer ausgeben
  if(argv.getusers)
    get_users_rest (function(data){
      console.log(data);
    });

  // Rollen ausgeben
  if(argv.getroles) {
    // get_roles_rest (function(data){ FIXME
    //   console.log(data);
    // });
    get_roles_mysql (function(rows, fields){
      console.log(rows);
    });
  }

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
    load_template (argv.template, function () {

    });

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

//var template = json_file.open(argv.p+"lua.json");
// create_fh_users (template);
//get_groups_rest();
// create_group_rest("test", [1,50], function (data) {
//   console.log(data);
// })