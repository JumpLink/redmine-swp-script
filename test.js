#!/usr/bin/nodejs
// https://github.com/GraemeF/redminer
// https://github.com/danwrong/restler
// https://github.com/sotarok/node-redmine
// http://www.redmine.org/projects/redmine/wiki/Rest_api

var Redmine    = require('redmine');
var sys        = require('util');
var config     = require('./config/config.js');
var mysql      = require('mysql');
var exec       = require('child_process').exec;

// Redmine mit entsprechenden Einstellungen aus der config/redmine,json
var redmine = new Redmine({
  host: config.redmine.host,
  apiKey: config.redmine.apiKey
});

// mysql-Verbindung mit entsprechenden Einstellungen aus der config/mysql,json
var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  debug: false
});

/*
 * alle Projekte mittels mysql Archivieren (bzw. deaktivieren)
 * status: 9 = archiviert; 1 = aktiviert
 */ 
function archive_all_projects_mysql () {
  connection.query('update '+config.mysql.name+'.projects set status=9 where status=1', function(err, rows, fields) {
   if (err) throw err;
  });

  connection.end();
}

/*
 * alle Benutzer - bis auf die Administratoren - mittels mysql sperren
 * status: 1 = entsperrt; 3 = gesperrt
 */ 
function lock_all_users_mysql () {
  connection.query('update '+config.mysql.name+'.users set status=3 where status=1 and login!=ars and login!=si and login!=admin', function(err, rows, fields) {
   if (err) throw err;
  });

  connection.end();
}

function backup_database_mysql () {
  if (config.mysql.host == "localhost" || config.mysql.host == "127.0.0.1") {
    var command = "/usr/bin/mysqldump -u "+config.mysql.user+" -p"+config.mysql.password+" "+config.mysql.name+" | gzip > "+__dirname+"/backup/db/"+config.mysql.name+"_`date +%F_%T`.gz";
    console.log(command);
    exec(command, function (error, stdout, stderr) { 
      console.log(stdout);
    });
  } else {
    console.log("Nicht möglich, da sich der MySQL-Server nicht auf diesem Rechner befindet.");
  }
}

var projects = config.open("../templates/project.json");