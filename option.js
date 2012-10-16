var json_file  = require(__dirname+'/json.js');                               // Json-Dateien laden
var optimist   = require('optimist')                                          // option-tools
                  .usage('Aufruf: $0 [OPTION]... [DATEI]...')                 // Hilfe
                  .boolean(['b','h','s','d','l','a', 'G', 'g'])
                  .string(['c','m','r','t','p','N','D','I','B','o'])
                  .alias('h', 'help').describe('h', 'Zeigt diese Hilfe an')
                  .alias('c', 'configpath').default('c', 'config/').describe('c', 'Alternatives Config-Verzeichnis verwenden')
                  .alias('m', 'mysqlconfig').default('m', 'mysql.json').describe('m', '\tAlternative MySQL-Config verwenden')
                  .alias('r', 'redmineconfig').default('r', 'redmine.json').describe('r', '\tAlternative Redmine-Config verwenden')
                  .alias('s', 'semester').describe('s', 'Aktuelle Semesterbezeichnung ausgeben')
                  .alias('a', 'archive').describe('a', 'Alle derzeit aktuellen Projekte Archivieren')
                  .alias('t', 'template').describe('t', 'Projekte und Benutzer anhand einer Template-Datei erstellen')
                  .alias('p', 'templatepath').default('p', 'templates/').describe('p', '\tAnderes Templateverzeichnis verwenden')
                  .alias('d', 'debug').default('d', false).describe('d', 'Debug-Modus aktivieren')
                  .alias('l', 'lock').describe('l', 'Alle aktiven Benutzer - bis auf ars, si und admin - sperren')
                  .alias('g', 'getusers').describe('g', 'Alle Benutzer im JSON-Format ausgeben')
                  .alias('G', 'getprojects').describe('G', 'Alle Projekte im JSON-Format ausgeben')
                  .alias('N', 'project').describe('N', 'Neues Projekt mit Projektname anlegen')
                  .alias('D', 'description').describe('D', '\tBeschreibung für neues Projekt')
                  .alias('I', 'identifier').describe('I', '\tID-URL für neues Projekt')
                  .alias('P', 'parentid').describe('P', '\tID des Elternprojektes für neues Projekt')
                  .alias('b', 'backup').describe('b', 'Backup der Redmine-Datenbank erstellen')
                  .alias('B', 'backuppath').default('B', '/backup/db/').describe('B', '\tAlternatives Backup-Verzeichnis verwenden')

//Optionen laden
var argv       = optimist.argv;

// Configurationen laden
var config     =  {
                    mysql: json_file.open(argv.configpath+argv.mysqlconfig),
                    redmine: json_file.open(argv.configpath+argv.redmineconfig)
                  }

// Weitere Config-Abhängige Optionen                
optimist.alias('o', 'output').default('o', config.mysql.name+"_`date +%F_%T`.gz").describe('o', '\tBackup-Zieldateiname');

module.exports.optimist = optimist;
module.exports.argv = optimist.argv;
module.exports.config = config;
module.exports.json_file = json_file;