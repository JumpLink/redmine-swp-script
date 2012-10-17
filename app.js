#!/usr/bin/nodejs
/*
 * Autor: Pascal Garber <pascal.garber@gmail.com>
 * License: Do whatever you want, but please publish your changes under the same license.
 */

var Redmine    = require('redmine');                                          // Redmine-REST-API
var mysql      = require('mysql');                                            // MySQL-Zugriff
var exec       = require('child_process').exec;                               // Linux Befehle ausführen
var fs         = require('fs');                                               // Dateisystem-Zugriff
var moment     = require('moment-range');                                     // Tools für das Rechnen mit Zeiten
var json_file  = require(__dirname+'/json.js');                               // Json-Dateien laden
var optimist   = require('optimist')                                          // option-tools
                  .usage('Aufruf: $0 [OPTION]... [DATEI]...')                 // Hilfe
                  .boolean(['b','h','s','d','l','a', 'G', 'g', 'j'])
                  .string(['c','m','r','t','p','N','D','I','B','o'])
                  .alias('h', 'help').describe('h', 'Zeigt diese Hilfe an')
                  .alias('j', 'json').default('j', false).describe('j', 'Ausgabe als JSON-String')
                  .alias('c', 'configpath').default('c', 'config/').describe('c', 'Alternatives Config-Verzeichnis verwenden')
                  .alias('m', 'mysqlconfig').default('m', 'mysql.json').describe('m', '\tAlternative MySQL-Config verwenden')
                  .alias('r', 'redmineconfig').default('r', 'redmine.json').describe('r', '\tAlternative Redmine-Config verwenden')
                  .alias('R', 'getroles').describe('R', 'Rollen ausgeben')
                  .alias('s', 'semester').describe('s', 'Aktuelle Semesterbezeichnung ausgeben')
                  .alias('a', 'archive').describe('a', 'Alle derzeit aktuellen Projekte Archivieren')
                  .alias('t', 'template').describe('t', 'Projekte und Benutzer anhand einer Template-Datei erstellen')
                  .alias('p', 'templatepath').default('p', 'templates/').describe('p', '\tAnderes Templateverzeichnis verwenden')
                  .alias('d', 'debug').default('d', false).describe('d', 'Debug-Modus aktivieren')
                  .alias('l', 'lock').describe('l', 'Alle aktiven Benutzer - bis auf ars, si und admin - sperren')
                  .alias('g', 'getusers').describe('g', 'Alle Benutzer ausgeben')
                  .alias('M', 'mail').default('M', 'fh-wedel.de').describe('M', '\tAlternative Benutzer-Email-Domain festlegen')
                  .alias('G', 'getprojects').describe('G', 'Alle Projekte ausgeben')
                  .alias('N', 'project').describe('N', 'Neues Projekt mit Projektname anlegen')
                  .alias('D', 'description').describe('D', '\tBeschreibung für neues Projekt')
                  .alias('I', 'identifier').describe('I', '\tID-URL für neues Projekt')
                  .alias('P', 'parentid').describe('P', '\tID des Elternprojektes für neues Projekt')
                  .alias('b', 'backup').describe('b', 'Backup der Redmine-Datenbank erstellen')
                  .alias('B', 'backuppath').default('B', '/backup/db/').describe('B', '\tAlternatives Backup-Verzeichnis verwenden')
                  .alias('o', 'output').default('o', '<table><date>.gz').describe('o', '\tBackup-Zieldateiname');

//Optionen laden
var argv       = optimist.argv;

// Configurationen laden
var config     =  {
                    mysql: json_file.open(argv.configpath+argv.mysqlconfig),
                    redmine: json_file.open(argv.configpath+argv.redmineconfig)
                  }

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
 * Counter für angelegte Gruppen
 */ 
var g_groups = 0;

/*
 * Counter für angelegte Benutzer
 */ 
var g_users = 0;

/*
 * Counter für angelegte Benutzer
 */ 
var g_roles = 0;

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
 * Bedingung: mysqldump muss installiert sein.
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
      throw new Error('data');
    }
    cb (data, number);
  });
}

/*
 * Alle Projekte an cb übergeben.
 */ 
function get_projects_rest (cb) {
  redmine.getProjects(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
  });
}

/*
 * Alle Projekte an cb übergeben.
 */
function create_user_rest (login, firstname, lastname, mail, number, cb) {
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
    cb (data, number);
  });
}

/*
 * Alle Benutzer an cb übergeben.
 */ 
function get_users_rest (cb) {
  redmine.getUsers(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
  });
}

/*
 * FIXME funktioniert nicht
 * Alle Rollen im JSON-Format an cb übergeben.
 * Siehe auch: get_roles_mysql
 */ 
function get_roles_rest (cb) {
  redmine.getRoles(function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
  });
}

/*
 * Alle Rollen als MySQL-Ausgabe ausgeben.
 * Siehe auch: get_roles_rest
 */ 
function get_roles_mysql (cb) {
  connection.query('select id,name from '+config.mysql.name+'.roles', function(err, rows, fields) {
   if (err) throw err;
   cb (rows, fields);
  });
  connection.end();
}

/*
 * FIXME funktioniert nicht
 * Alle Gruppen an Callback übergeben mittels Rest-API
 */ 
function get_groups_rest (cb) {
  redmine.getGroups({}, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
  });
};

/*
 * FIXME funktioniert nicht
 * Gruppe über die Rest-API erstellen
 */ 
function create_group_rest (name, user_ids, cb) {
  var group = {
    name: name,
    user_ids: user_ids
  };
  redmine.postGroup(group, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
  });
};

/*
 * FIXME funktioniert nicht
 * Siehe auch: create_membership_mysql
 */ 
function create_membership_rest (project_id, user_id, role_ids, number, cb) {
  var membership = {
    user_id: user_id,
    role_ids: role_ids
  };
  redmine.postProjectMembership(project_id, membership, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data, number);
  });
};

/*
 * Erstellt ein neues Projektmitglied mittels MySQL
 */
function create_member_mysql (project_id, user_id, cb) {
  var query = "INSERT INTO "+config.mysql.name+".members(user_id, project_id, created_on) VALUES ("+user_id+", "+project_id+", NOW() )";
  
  connection.query(query, function(err, result) {
    if (err) throw err;
    if (argv.debug)
      console.log("Member mit neuer ID "+result.insertId+" , der Benutzer-ID "+user_id+" und der Projekt-ID "+project_id+" angelegt.");
    cb(result);
  });
}

/*
 * Erstellt einem Projektmitglied Rechte mittels MySQL
 */
function create_role_mysql (member_id, role_id, cb) {
  var query = "INSERT INTO "+config.mysql.name+".member_roles(member_id, role_id) VALUES ("+member_id+", "+role_id+" )";

  connection.query(query, function(err, result) {
    if (err) throw err;
    if (argv.debug)
      console.log("Rolle mit neuer ID "+result.insertId+" , der Member-ID "+member_id+" und der Rollen-ID "+role_id+" angelegt.");
    cb(result);
  });
}

/*
 * Erstellt ein neues Projektmitglied und weist diesem Rechte zu mittes Rest-API
 * siehe auch: create_membership_rest
 */ 
function create_membership_mysql (project_id, user_id, role_id, number, cb) {

  create_member_mysql (project_id, user_id, function (member_result) {
    create_role_mysql (member_result.insertId, role_id, function (role_result) {
      cb (member_result, role_result, project_id, user_id, role_id, number);
    });
  });
};

/*
 * Erzeugt den identifier für eine Gruppe anhand des Semesters und des Gruppennamens.
 */ 
function generate_group_identifier (group_name) {
  return get_semester()+"-"+group_name.toLowerCase().replace(" ", "-");
};

/*
 * id 3 = Administrator
 * id 4 = Entwickler
 */
function create_fh_membership (template, cb) {
  template.memberships = [];
  for (var k in template.groups) {
    console.log("Erzeuge Membership für "+template.groups[k].name);
    for (var i in template.users) {
      var project_id = template.groups[k].id;
      var user_id = template.users[i].id;
      var role_id = 4;
      // Wenn Name in Gruppe enthalten dann Administratorrechte zuweisen
      for (var n in template.groups[k].users) {
        if (template.users[i].student_id == template.groups[k].users[n]) {
          role_id = 3;
        }
      }
      create_membership_mysql (project_id, user_id, role_id, k, function(member_result, role_result, project_id, user_id, role_id, number) {
        // Speichere neue IDs
        template.memberships[g_roles] = {
          member_id: member_result.insertId,
          id: role_result.insertId,
          role_id: role_id,
          project_id: project_id,
          user_id: user_id
        }
        g_roles++;
        if (template.groups.length*template.users.length == g_roles) {
          console.log("Alle Memberships angelegt.");
          cb (template);
        }
      });
    }
  }
};


/*
 * Benutzer anhand eines template-json-strings erstellen.
 */ 
function create_fh_users (template, cb) {
  // Durchläut Benutzer
  for (var i in template.users) {
    // Benutzer anlegen
    create_user_rest(template.users[i].student_id, template.users[i].firstname, template.users[i].lastname, template.users[i].student_id+"@"+argv.mail, i, function(data, number){
      
      g_users++;
      template.users[number].id = data.user.id;
      console.log("Benutzer '"+data.user.login+"' mit ID "+data.user.id+" erfolgreich angelegt.");

      if (g_users == template.users.length) {
        console.log("Alle Benutzer angelegt.");
        cb (template);
      }
    });
  }
};

/*
 * Projekte anhand eines template-json-strings laden.
 *
 * Verarbeitung asynchron daher Ausgabenreihenfolge unvorhersehbar.
 */ 
function create_fh_projects (template, cb) {
  // Erzeugt Hauptproject
  create_project_rest (template.project.name, template.project.description, get_semester()+"-main", template.project.links, null, 0, function(main_project){
    
    template.project.id = main_project.project.id
    console.log("Hauptprojekt '"+main_project.project.name+"' mit ID "+main_project.project.id+" erfolgreich erstellt.");
    
    // Durchläut Teilprojekte
    for (var k in template.project.subprojects) {

      // Erstellt Teilprojekt
      create_project_rest (template.project.subprojects[k].name, template.project.subprojects[k].description, get_semester()+"-sub"+k, null, main_project, k, function(sub_project, number) {
        
        template.project.subprojects[k].id = sub_project.project.id;
        console.log("Unterprojekt '"+sub_project.project.name+"' mit ID "+sub_project.project.id+" erfolgreich erstellt.");

        // Durchläuft Teilprojektgruppen
        for (var n in template.project.subprojects[number].groups) {

          // Erstellt Teilprojektgruppe
          create_project_rest (template.project.subprojects[number].groups[n], null, generate_group_identifier(template.project.subprojects[number].groups[n]), null, sub_project, n, function(group, number) {
            
            g_groups++
            // Neue ID speichern
            for (var x in template.groups)
              if (template.groups[x].name == group.project.name)
                template.groups[x].id = group.project.id;
            console.log("Gruppe '"+group.project.name+"' mit ID "+group.project.id+" erfolgreich erstellt.");

            // Da Ablauf asynchron hier ueberpruefung ob alle Unterprojekte erstellt wurden
            if(g_groups == template.groups.length) {
              console.log("Alle Gruppen erstellt.");
              cb (template);
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
  var template = json_file.open(argv.templatepath+filename);
  console.log("Erstelle Projekte");
  create_fh_projects (template, function(template) {
    console.log("Erstelle Benutzer");
    create_fh_users (template, function(template) {
      console.log("Erstelle Memberships");
      create_fh_membership (template, function(template) {
        cb(template);
      });
    });
  });
}

function save_template (template, filename, cb) {
  json_file.save(argv.templatepath+filename, template, function() {
    cb();
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
      if(argv.json)
        data = JSON.stringify(data);
      console.log(data);
    });

  // Benutzer ausgeben
  if(argv.getusers)
    get_users_rest (function(data){
      if(argv.json)
        data = JSON.stringify(data);
      console.log(data);
    });

  // Rollen ausgeben
  if(argv.getroles) {
    // get_roles_rest (function(data){ // FIXME
    //   console.log(data);
    // });
    get_roles_mysql (function(rows, fields){
      if(argv.json)
        rows = JSON.stringify(rows);
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
    load_template (argv.template, function (new_template) {
      save_template(new_template, "new_"+argv.template, function () {
        process.exit(0); // WORKAROUND
      });
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