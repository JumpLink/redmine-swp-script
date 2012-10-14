// https://github.com/GraemeF/redminer
// https://github.com/danwrong/restler
// https://github.com/sotarok/node-redmine
// http://www.redmine.org/projects/redmine/wiki/Rest_api

var Redmine    = require('redmine');
var sys        = require('util');
var config     = require('./config/config.js');
var mysql      = require('mysql');

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