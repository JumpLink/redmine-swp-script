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
                  .boolean(['b','h','s','d','l','a', 'G', 'g', 'j', 'R', 'start', 'stop', 'auto'])
                  .string(['c','m','r','t','p','N','D','I','B','o', 'S', 'M', 'T', 'k', 'K'])
                  .alias('h', 'help').describe('h', 'Zeigt diese Hilfe an')
                  .alias('j', 'json').default('j', true).describe('j', 'Ausgabe als JSON-String')
                  .alias('c', 'configpath').default('c', 'config/').describe('c', 'Alternatives Config-Verzeichnis verwenden')
                  .alias('m', 'mysqlconfig').default('m', 'mysql.json').describe('m', 'Alternative MySQL-Config verwenden')
                  .alias('r', 'redmineconfig').default('r', 'redmine.json').describe('r', 'Alternative Redmine-Config verwenden')
                  .alias('S', 'svnconfig').default('S', 'svn.json').describe('S', 'Alternative SVN-Config verwenden')
                  .alias('R', 'getroles').describe('R', 'Rollen ausgeben')
                  .alias('s', 'semester').describe('s', 'Aktuelle Semesterbezeichnung ausgeben')
                  .alias('a', 'archive').describe('a', 'Alle derzeit aktuellen Projekte Archivieren')
                  .alias('t', 'template').describe('t', 'Projekte und Benutzer anhand einer Template-Datei erstellen')
                  .alias('p', 'templatepath').default('p', 'templates/').describe('p', 'Anderes Templateverzeichnis verwenden')
                  .alias('T', 'removetemp').describe('T', 'Benutzer/Projekte mit Hilfe der Backup-Template-Datei löschen')
                  .alias('d', 'debug').default('d', false).describe('d', 'Debug-Modus aktivieren')
                  .alias('l', 'lock').describe('l', 'Alle aktiven Benutzer - bis auf ars, si und admin - sperren')
                  .alias('g', 'getusers').describe('g', 'Alle Benutzer ausgeben')
                  .alias('M', 'mail').default('M', 'fh-wedel.de').describe('M', 'Alternative Benutzer-Email-Domain festlegen')
                  .alias('G', 'getprojects').describe('G', 'Alle Projekte ausgeben')
                  .alias('N', 'project').describe('N', 'Neues Projekt mit Projektname anlegen')
                  .alias('D', 'description').describe('D', 'Beschreibung für neues Projekt')
                  .alias('I', 'identifier').describe('I', 'ID-URL für neues Projekt')
                  .alias('P', 'parentid').describe('P', 'ID des Elternprojektes für neues Projekt')
                  .alias('b', 'backup').describe('b', 'Backup der Redmine-Datenbank erstellen')
                  .alias('a', 'backupall').describe('a', 'Backup der Dateien und der Datenbank erstellen')
                  .alias('B', 'backuppath').default('B', '/backup/').describe('B', 'Alternatives Backup-Verzeichnis verwenden')
                  .alias('k', 'restoredb').describe('k', 'Datenbank wiederherstellen')
                  .alias('K', 'restorefiles').describe('K', 'Anhänge wiederherstellen')
                  .alias('o', 'backupname').default('o', '<table>_<date>.gz').describe('o', 'Backup-Zieldateiname')
                  .alias('Q', 'backupfiles').describe('Q', 'Backup der Dateianhänge erstellen')
                  .describe('start', 'Redmine starten')
                  .describe('stop', 'Redmine stoppen')
                  .describe('auto', 'Backups durchführen, Benutzer/Projekte deaktiveren, Template anwenden')
                  .describe('testconnect', 'Testet die Verbindung zu Redmine und MySQL');

//Optionen laden
var argv       = optimist.argv;

// Configurationen laden
var config     =  {
                    mysql: json_file.open(argv.configpath+argv.mysqlconfig),
                    redmine: json_file.open(argv.configpath+argv.redmineconfig),
                    svn: json_file.open(argv.configpath+argv.svnconfig)
                  }

// Hilfe ausgeben
if(argv.help) {
  optimist.showHelp ();
  process.exit(0);
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
 * Für geparste Template, wird bei der verarbeitung mit neuen Daten gefüllt und als Textdatei gespeichert. 
 */ 
var template;

/*
 * Redmine-Server starten
 *
 * --start
 */ 
function start_redmine(cb) {
  var http = "sudo ruby "+config.redmine.path+"/script/server -p 80 webrick -e production -d ;";
  var https = "sudo ruby "+config.redmine.path+"/script/ssl_server -p 443 webrick -e production -d ;";
  var command = http+" "+https;
  if(argv.debug) console.log(command);
  exec(command, function (error, stdout, stderr) {
    if (argv.debug) { console.log(stdout); if(stderr) console.log(stderr); if(error) console.log(error); }
    cb ();
  });
}

/*
 * Redmine-Server stoppen TODO eleganter
 *
 * --stop
 */ 
function stop_redmine (cb) {
  exec("sudo killall ruby -9", function (error, stdout, stderr) {
    console.log(stdout);
    if (argv.debug) { if(stderr) console.log(stderr); if(error) console.log(error); }
    cb ();
  });
}

/*
 * Backup der Redmine-Datenbank erstellen
 * Bedingung: mysqldump muss installiert sein.
 */ 
function backup_database_mysql (cb) {
  fs.exists('/usr/bin/mysqldump', function (exists) {
    if(exists) {
      var mkdir = "mkdir -p "+__dirname+argv.backuppath+"db/ ;";
      var backup = "/usr/bin/mysqldump -h "+config.mysql.host+" -u "+config.mysql.user+" -p"+config.mysql.password+" "+config.mysql.name+" | gzip > "+__dirname+argv.backuppath+"db/"+argv.backupname.replace("<table>", config.mysql.name).replace("<date>","`date +%F_%T`");
      var command = mkdir+" "+backup+" ;";
      if(argv.debug) console.log(command);
      exec(command, function (error, stdout, stderr) { 
        console.log(stdout);
        if (argv.debug) { if(stderr) console.log(stderr); if(error) console.log(error); }
        cb(error, stdout, stderr);
      });
    } else {
      console.log("Fehler: /usr/bin/mysqldump nicht gefunden!\nBitte mysql-server installieren oder dieses direkt Skript auf dem Server ausführen.");
    }
  });
}

/*
 * Backup der Redmine-Datenbank wiederherstellen.
 * --restoredb
 */ 
function restore_database_mysql (filename) {
  var command = "gzip -c -d "+__dirname+argv.backuppath+"db/"+filename+" | mysql -h "+config.mysql.host+" -u "+config.mysql.user+" -p"+config.mysql.password+" "+config.mysql.name;
  if(argv.debug) console.log(command);
  exec(command, function (error, stdout, stderr) { 
    console.log(stdout);
    if (argv.debug) { if(stderr) console.log(stderr); if(error) console.log(error); }
  });
}

/*
 * Backup der Attachments erstellen.
 * --backupfiles
 */
function backup_attachments (cb) {
  var mkdir = "mkdir -p "+__dirname+argv.backuppath+"files/ ;";
  var backup = "sudo tar zcPfv "+__dirname+argv.backuppath+"files/redmine_attachments_`date +%F_%T`.tar.gz "+config.redmine.path+"/files ;";
  var command = mkdir+" "+backup;
  console.log ("Dateizugriff auf "+config.redmine.path+"/files  benötigt sudo:");
  if(argv.debug) console.log(command);
  exec(command, function (error, stdout, stderr) {
    console.log(stdout);
    if (argv.debug) { if(stderr) console.log(stderr); if(error) console.log(error); }
    cb(error, stdout, stderr);
  });
}

/*
 * Backup der Attachments wiederherstellen.
 *
 * --restorefiles
 */
function restore_attachments () {
  var command = "sudo tar xvPf "+__dirname+argv.backuppath+"files/"+argv.restorefiles;
  if(argv.debug)console.log(command);
  console.log ("Dateizugriff benötigt sudo:");
  exec(command, function (error, stdout, stderr) {
    console.log(stdout);
    if (argv.debug) { if(stderr) console.log(stderr); if(error) console.log(error); }
  });
}

/*
 * Alle Projekte mittels mysql Archivieren (bzw. deaktivieren)
 * status: 9 = archiviert; 1 = aktiviert
 *
 * --archive
 */ 
function archive_all_projects_mysql (cb) {
  connection.query('update '+config.mysql.name+'.projects set status=9 where status=1', function(err, rows, fields) {
   if (err) throw err;
   // connection.end();
   cb ();
  });
}

/*
 * Alle Benutzer - bis auf ars, si und admin - mittels mysql sperren
 * status: 1 = entsperrt; 3 = gesperrt
 *
 * --lock
 */ 
function lock_all_users_mysql (cb) {
  connection.query('update '+config.mysql.name+'.users set status=3 where status=1 and login!="ars" and login!="si" and login!="admin"', function(err, rows, fields) {
   if (err) throw err;
   // connection.end();
   cb ();
  });
}

/*
 * Berechnet die aktuelle Semesterbezeichnung und gibt sie als String zurück.
 * Evtl muss auf dem Rechner vorher Uhr synchronisiert werden: sudo ntpdate ptbtime1.ptb.de
 *
 * --semester
 */ 
function get_semester () {
  var now = moment();

  // Wintersemester vor Silvester
  var ws_before = {
    start : moment().month(9).date(1).hours(0).minutes(0).seconds(0).milliseconds(0),      // 1. Oktober
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
  if(argv.debug)
    console.log("create_project_rest ("+name+", "+description+", "+identifier+", "+links+", "+parent+", "+number+", ..)");
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
      throw new Error('Konnte Projekt nicht anlegen.');
    }
    cb (data, number);
  });
}

/*
 * Projekt mit ID löschen
 */ 
function remove_project_rest (product_id, cb) {
  redmine.deleteProject(product_id, function(data) {
    // if (data instanceof Error) {
    //   sys.inspect("Error: "+data); // FIXME
    //   return;
    // }
    cb(data);
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
 * Einen Benutzer anlegen
 */
function create_user_rest (login, firstname, lastname, mail, auth_source_id, number, cb) {
  var user = {
    login: login,
    firstname: firstname,
    lastname: lastname,
    mail: mail,
    auth_source_id: auth_source_id
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
 * Einen Benutzer löschen
 */
function remove_user_rest (user_id, number, cb) {
  redmine.deleteUser(user_id, function(data) {
    // if (data instanceof Error) {
    //   console.log("Error: " + data); // FIXME
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
      throw new Error("Kann Benutzer nicht auslesen.");
    }
    cb (data);
  });
}

/*
 * FIXME funktioniert nicht mit verwendeter aktueller Redmine-Version
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
   // connection.end();
   cb (rows, fields);
  });
}

/*
 * Gibt die LDAP-Einstellungen an Callback weiter
 */ 
function get_ldap_mysql (cb) {
  connection.query('select * from '+config.mysql.name+'.auth_sources', function(err, rows, fields) {
   if (err) throw err;
   cb (rows, fields);
  });
}

/*
 * FIXME funktioniert nicht mit verwendeter Redmine-Version
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
 * FIXME funktioniert nicht mit verwendeter Redmine-Version
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
 * FIXME funktioniert nicht mit verwendeter Redmine-Version
 * Siehe auch: create_membership_mysql
 */ 
function create_membership_rest (project_id, user_id, role_ids, cb) {
  var membership = {
    user_id: user_id,
    role_ids: role_ids
  };
  redmine.postProjectMembership(project_id, membership, function(data) {
     if (data instanceof Error) {
      console.log("Error: "+data);
      throw new Error('data');
    }
    cb (data);
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
    // connection.end();
    cb(result);
  });
}

/*
 * Erteilt einem Projektmitglied Rechte mittels MySQL
 */
function create_role_mysql (member_id, role_id, cb) {
  var query = "INSERT INTO "+config.mysql.name+".member_roles(member_id, role_id) VALUES ("+member_id+", "+role_id+" )";

  connection.query(query, function(err, result) {
    if (err) throw err;
    if (argv.debug)
      console.log("Rolle mit neuer ID "+result.insertId+" , der Member-ID "+member_id+" und der Rollen-ID "+role_id+" angelegt.");
    // connection.end();
    cb(result);
  });
}

/*
 * Erstellt ein neues Projektmitglied und weist diesem Rechte mittes Rest-API zu.
 * siehe auch: create_membership_rest
 */ 
function create_membership_mysql (project_id, user_id, role_id, cb) {

  create_member_mysql (project_id, user_id, function (member_result) {
    create_role_mysql (member_result.insertId, role_id, function (role_result) {
      cb (member_result, role_result, project_id, user_id, role_id);
    });
  });
};

/*
 * Erstellt ein neues Projektmitglied und weist diesem Rechte zu mittes Rest-API
 * siehe auch: create_membership_rest
 */ 
function add_repository_mysql (project_id, url, login, password, root_url, type, cb) {
  var insert = "INSERT INTO "+config.mysql.name+".repositories(project_id, url, login, password, root_url, type)";
  var values = "VALUES ("+project_id+", '"+url+"', '"+login+"', '"+password+"', '"+root_url+"', '"+type+"')";
  var query = insert+" "+values;
  if (argv.debug)
    console.log (query);
  connection.query(query, function(err, result) {
    if (err) throw err;
    console.log("Repository mit ID "+result.insertId+" für Projekt-ID "+project_id+" hinzugefügt.");
    // connection.end();
    cb(result);
  });
}

/*
 * Übergibt die Gruppe (Template) an Callback in der der Benutzer ist.
 */ 
function get_user_group_template (user_name, cb) {
  if(argv.debug)
    console.log("get_user_group_template ("+user_name+", ...)");
  if (!template)
    throw new Error("Template nicht geladen!");
  for (var i in template.groups) {
    for (var k in template.groups[i].users) {
      if(user_name == template.groups[i].users[k]) {
        cb(template.groups[i]);
        return; // Hier kann abgebrochen werden da für gewöhnlich ein Student nur in einer Gruppe ist.
      }
    }
  }
}

/*
 * Übergibt den Gruppentyp (Template) an Callback in der der Benutzer ist.
 */ 
function get_user_type_template (user_name, number, cb) {
  get_user_group_template (user_name, function(group) {
    cb(group.type, number);
  })
}

/*
 * Speichert den Gruppentyp des Benutzers zum Benutzer in die Template
 */ 
function save_user_types_template (cb) {
  for (var i in template.users) {
    get_user_type_template(template.users[i].student_id, i, function (type, number) {
      template.users[number].type = type;
      if (number == template.users.length-1) {
        console.log("Alle Benutzertypen eingetragen.");
        cb();
        return;
      }
    });
  }
}

/*
 * Erzeugt den identifier für eine Gruppe anhand des Semesters und des Gruppennamens.
 */ 
function generate_group_identifier (group_name) {
  return get_semester()+"-"+group_name.toLowerCase().replace(" ", "-");
};

/*
 * Erzeugt Memberships für alle neuen Benutzer aber nur für das übergebene Projekt
 * id 3 = Administrator
 * id 4 = Entwickler
 */
function create_fh_membership_for_projects (projects, owner_role_id, others_role_id, cb) {
  if(argv.debug)
    console.log("create_fh_membership_for_projects");
  for (var m in projects) {
    console.log("Erzeuge Membership für "+projects[m].name);
    template.memberships[projects[m].id] = [];
    var roles = 0; // Anzahl der Rollen für neuen Eintrag in der Template (als Index)
    // Jedem Benutzer eine Rolle zu diesem Projekt zuweisen
    for (var i in template.users) {
      var project_id = projects[m].id;
      var user_id = template.users[i].id;
      var role_id = others_role_id; // Standard-Rolle für Nicht-Eigentümer
      
      // Wenn User Koordinator ist, dann ist er besitzer egal ob er zur Gruppe gehört oder nicht
      if (template.users[i].type == "coordinator")
        role_id = owner_role_id;
      // Zweite möglichkeit: User gehört tatsächlich zur Gruppe 
      else {
        // Wenn Name in Gruppe enthalten dann owner_role_id Rechte zuweisen
        if (projects[m].users)
          for (var n in projects[m].users) {
            if (template.users[i].student_id == projects[m].users[n]) {
              role_id = owner_role_id;
            }
          }
      }

      create_membership_mysql (project_id, user_id, role_id, function(member_result, role_result, project_id, user_id, role_id) {
        // Speichere neue IDs
        template.memberships[project_id][roles] = {
          member_id: member_result.insertId,
          id: role_result.insertId,
          role_id: role_id,
          user_id: user_id
        }
        roles++;
        if (projects.length*template.users.length == roles) {
          console.log("Alle Memberships angelegt.");
          cb (true);
        }
      });
    }
  }
};

/*
 * Erzeugt Memberships für jeden neuen Benutzer und jedes neue Projekt
 */
function create_fh_membership (cb) {
  if(argv.debug)
    console.log("create_fh_membership");
  template.memberships = {};
  // Rechte für alle Gruppen erzeugen
  create_fh_membership_for_projects(template.groups, 3, 4, function (result) {
    // Rechte für alle Unterprojekte erzeugen
    create_fh_membership_for_projects(template.project.subprojects, 3, 4, function (result) {
      // Rechte für das Hauptprojekt erzeugen
      create_fh_membership_for_projects([template.project], 3, 4, function (result) {
        cb (result);
      });
    });
  });
};

/*
 * Benutzer anhand eines template-json-strings erstellen.
 */ 
function create_fh_users (cb) {
  // Durchläut Benutzer
  for (var i in template.users) {
    var auth_source_id = 1; //  LDAP-Replica-Stud
    // Benutzer anlegen
    create_user_rest(template.users[i].student_id, template.users[i].firstname, template.users[i].lastname, template.users[i].student_id+"@"+argv.mail, auth_source_id, i, function(data, number){
      
      g_users++;
      template.users[number].id = data.user.id;
      console.log("Benutzer '"+data.user.login+"' mit ID "+data.user.id+" erfolgreich angelegt.");

      if (g_users == template.users.length) {
        console.log("Alle Benutzer angelegt.");
        cb ();
      }
    });
  }
};

/*
 * Projekte anhand eines template-json-strings laden.
 *
 * Hinweis: Verarbeitung asynchron daher Ausgabenreihenfolge unvorhersehbar.
 */ 
function create_fh_projects (cb) {
  // Erzeugt Hauptproject
  create_project_rest (template.project.name, template.project.description, get_semester()+"-main", template.project.links, null, 0, function(main_project){
    if(argv.debug)
      console.log(main_project);
    // Neue ID speichern
    template.project.id = main_project.project.id
    console.log("Hauptprojekt '"+main_project.project.name+"' mit ID "+main_project.project.id+" erfolgreich erstellt.");
    
    // Durchläut Teilprojekte
    for (var k in template.project.subprojects) {

      // Erstellt Teilprojekt
      create_project_rest (template.project.subprojects[k].name, template.project.subprojects[k].description, get_semester()+"-sub"+k, null, main_project, k, function(sub_project, number) {
        
        // Neue ID speichern
        template.project.subprojects[number].id = sub_project.project.id;

        console.log("Unterprojekt '"+sub_project.project.name+"' mit ID "+sub_project.project.id+" erfolgreich erstellt.");

        // Durchläuft Teilprojektgruppen
        for (var n in template.project.subprojects[number].groups) {

          // Erstellt Teilprojektgruppe
          create_project_rest (template.project.subprojects[number].groups[n], null, generate_group_identifier(template.project.subprojects[number].groups[n]), null, sub_project, n, function(group, number) {
            
            add_repository_mysql (group.project.id, config.svn.url+group.project.name, config.svn.user, config.svn.password, config.svn.url+group.project.name, "Subversion", function() {

              g_groups++
              // Neue ID speichern
              for (var x in template.groups)
                if (template.groups[x].name == group.project.name)
                  template.groups[x].id = group.project.id;
              console.log("Gruppe '"+group.project.name+"' mit ID "+group.project.id+" erfolgreich erstellt.");

              // Da Ablauf asynchron hier ueberpruefung ob alle Unterprojekte erstellt wurden
              if(g_groups == template.groups.length) {
                console.log("Alle Gruppen erstellt.");
                cb ();
              }

            })
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
  template = json_file.open(argv.templatepath+filename);
  console.log("Ermittle Benutzertypen");
  save_user_types_template (function () {
    console.log("Erstelle Projekte");
    create_fh_projects (function() {
      console.log("Erstelle Benutzer");
      create_fh_users (function() {
        console.log("Erstelle Memberships");
        create_fh_membership (function(result) {
          cb(result);
        });
      });
    });
  });
}

/*
 * Löscht Benutzer und Gruppen aus einer Backup-Template
 */ 
function remove_from_template (filename, cb) {
  template = json_file.open(argv.templatepath+filename);

  // Lösche Hauptprojekt, unterprojekte werden automatisch gelöscht
  remove_project_rest (template.project.id, function (data) {
    // Lösche User
    for (var i in template.users) {
      remove_user_rest (template.users[i].id, i, function (data, number) {
        if (number == template.users.length-1) {
          console.log("Benutzer und Projekte gelöscht.");
          cb();
        }
      });
    }
  });
}

/*
 * Speichert ein neues Template als Datei.
 */
function save_template (filename, cb) {
  json_file.save(argv.templatepath+filename, template, function() {
    cb();
  });
}

/*
 * Datenbank und Dateianhänge sichern
 *
 * --backupall
 */
function backup_all (cb) {
  console.log("Backup für Datenbank");
  backup_database_mysql (function (error, stdout, stderr) {
    console.log("Backup für Dateianhänge");
    backup_attachments (function (error, stdout, stderr) {
      cb();
    });
  });
}

/*
 * Backup erstellen, Benutzer/Gruppen deaktiveren, Template anwenden, neues Template speichern.
 *
 * --template [Dateiname] --auto
 */
function auto (cb) {
  connection.connect();
  console.log("Teste Verbindung");
  test_connection (function () {
    console.log("Erstelle Backups");
    backup_all (function () {
      console.log("Deaktiviere alte Benutzer und Projekte");
      archive_all_projects_mysql (function () {
        lock_all_users_mysql ( function () {
          console.log("Wende das Template an");
          load_template (argv.template, function () {
            console.log("Speichere neues Template");
            save_template("backup_"+argv.template, function () {
              connection.end();
              cb ();
            });
          });
        });
      });
    });
  });
}

/*
 * Testet ob eine Verbindung zu Redmine und MySQL hergestellt werden kann.
 *
 * --testconnect
 */
function test_connection (cb) {
  var mysql_test = false;
  var redmine_test = false;
  get_roles_mysql (function (roles) {
    if(roles[0].id) {
      mysql_test = true;
      console.log ("Verbindung zu MySQL funktioniert.");
      if (redmine_test)
        cb (true);
    } else {
      throw new Error("Verbindung zu MySQL kann nicht hergestellt werden.");
      cb ();
    }
  });
  get_users_rest (function (users) {
    if(users.limit) {
      redmine_test = true;
      console.log ("Verbindung zu Redmine funktioniert.");
      if (mysql_test)
        cb (true);
    } else {
      throw new Error("Verbindung zu Redmine kann nicht hergestellt werden.");
      cb ();
    }
  });
}

/*
 * Skript nhand übergebene Option ausführen.
 */
function run() {

  if(argv.testconnect) {
    connection.connect();
    test_connection (function() {
      connection.end();
    });
  }

  // Projekte ausgeben
  if (argv.getprojects)
    get_projects_rest (function(data){
      if(argv.json)
        data = JSON.stringify(data, null, 2);
      console.log(data);
    });

  // Benutzer ausgeben
  if (argv.getusers)
    get_users_rest (function(data){
      if(argv.json)
        data = JSON.stringify(data, null, 2);
      console.log(data);
    });

  // Rollen ausgeben
  if (argv.getroles) {
    connection.connect();
    get_roles_mysql (function(rows, fields){
      connection.end();
      if(argv.json)
        rows = JSON.stringify(rows, null, 2);
      console.log(rows);
    });
  }

  // Backup erstellen
  if (argv.backup)
    backup_database_mysql (function (error, stdout, stderr) {

    });

  // User sperren
  if (argv.lock) {
    connection.connect();
    lock_all_users_mysql (function () {
      connection.end();
    });
  }

  // Projekte archivieren
  if (argv.archive) {
    connection.connect();
    archive_all_projects_mysql ( function () {
      connection.end();
    });
  }

  // Semesterbezeichnung ausgeben
  if (argv.semester)
    console.log(get_semester ());

  // Template verarbeiten
  if (argv.template && !argv.auto) {
    test_connection (function () {
      connection.connect();
      load_template (argv.template, function () {
        save_template("backup_"+argv.template, function () {
          connection.end();
          process.exit(0); // WORKAROUND
        });
      });
    });
  }

  if (argv.template && argv.auto)
    auto (function () {
      console.log("done");
    });

  // Neues Projekt erstellen
  if (argv.project) {
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

  // Projekte und Benutzer löschen
  if (argv.removetemp)
    remove_from_template (argv.removetemp, function() {

    })

  // Datenbank wiederherstellen
  if (argv.restoredb)
    restore_database_mysql(argv.restoredb);

  // Dateianhänge sichern
  if (argv.backupfiles)
    backup_attachments (function (error, stdout, stderr) {

    });

  // Dateianhänge wiederherstellen
  if (argv.restorefiles)
    restore_attachments ();

  // Redmine starten
  if (argv.start)
    start_redmine ();

  // Redmine stoppen
  if (argv.stop)
    stop_redmine ();

  // Dateianhänge und Datenbank sichern
  if (argv.backupall)
    stop_redmine ();
}
    
run();